import { requireMember } from "../../_lib/access-control";
import { jsonError } from "../../_lib/errors";
import { assertSameOrigin } from "../../_lib/request-origin";
import { enforceRateLimit, rateLimitKey } from "../../_lib/rate-limit";
import { generateCourse } from "../../_lib/hyperknow/agents";
import { resolveConfigOrThrow } from "../../_lib/hyperknow/config";
import { saveCourse } from "../../_lib/hyperknow/store";
import { researchQueriesFor, resolveSearchConfig, searchOnce, type WebSearchHit } from "../../_lib/hyperknow/websearch";
import { consumeCredits, currentCredits, HK_COURSE_COST, HK_DAILY_CREDITS } from "../../_lib/hyperknow/credits";

export const dynamic = "force-dynamic";

// 全自动课程蓝图生成端点(原 ws/courseGenWs.js 的 SSE 化)。事件序列与原 WS 逐帧
// 一致:boot loading → course_generation_started → researching_the_web loading
// → progress(round N/3,真搜索轮次) → researching_the_web completed
// → generating_initial_syllabus loading →(课程树生成落库)→ completed
// → course_structure_ready。原版 researching_the_web 是装饰性 sleep——Workers 版
// 在此真跑联网搜索(供应商可插拔,见 websearch.ts),研学命中注入大纲提示词;
// 搜索未配置/失败降级为无研学上下文,课程照常生成(不虚报来源)。
// 配置缺失在发流前回 503 JSON;上游故障发生在流中(大纲生成阶段)→ 补发
// course_generation_error 帧后关闭(与原 WS catch 行为一致)。

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function frame(data: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`event: frame\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function POST(request: Request) {
  try {
    const member = await requireMember();
    const originError = assertSameOrigin(request);
    if (originError) return originError;
    const input = (await request.json().catch(() => ({}))) as { query?: unknown; prompt?: unknown };
    const query = String(input.query ?? input.prompt ?? "").trim().slice(0, 300);
    if (!query) return Response.json({ error: "query_required" }, { status: 400 });

    await enforceRateLimit(await rateLimitKey("hyperknow-course-gen", member.email), 5, 60 * 60);

    // 配置缺失在流开始前暴露(fail-closed,干净 JSON)。
    try {
      resolveConfigOrThrow();
    } catch (error) {
      const status = (error as { status?: number }).status ?? 503;
      return Response.json({ error: (error as { code?: string }).code ?? "ai_not_configured" }, { status });
    }

    // 扣费点:AI 配置校验通过之后、发流之前。配置缺失已在上面返回,不扣费;
    // 流开始后的中途失败(大纲生成阶段)不退费。条件 UPDATE 原子扣减,不透支。
    const remainingCredits = await consumeCredits(member.email, HK_COURSE_COST);
    if (remainingCredits === null) {
      const { remaining } = await currentCredits(member.email);
      return Response.json(
        { error: "insufficient_credits", credit_info: { remaining, max: HK_DAILY_CREDITS } },
        { status: 402 },
      );
    }

    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(180_000)]);

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        void (async () => {
          let closed = false;
          const push = (data: Record<string, unknown>) => {
            if (closed) return;
            try {
              controller.enqueue(frame(data));
            } catch {
              closed = true;
            }
          };
          try {
            const courseUuid = crypto.randomUUID();

            push({ type: "course_generation_step", step_id: "boot", status: "loading", title: "Starting course generation", placeholder: "Crafting Courses..." });
            push({ type: "course_generation_started", course_uuid: courseUuid, query });
            push({ type: "credit_status", message: "Processing request", credit_info: { remaining: remainingCredits, max: HK_DAILY_CREDITS } });

            push({
              type: "course_generation_step",
              step_id: "researching_the_web",
              status: "loading",
              title: "Researching the web",
              placeholder: "Scouring the web for syllabus material...",
              course_uuid: courseUuid,
            });
            // 真研学:3 条派生查询逐轮真搜(轮次即原版 "round N/3" 节奏);搜索
            // 未配置时保住原版 wall-clock 节奏继续放帧,但 sources:0,不虚报。
            const researchQueries = researchQueriesFor(query);
            const researchHits: WebSearchHit[] = [];
            const seenUrls = new Set<string>();
            if (resolveSearchConfig()) {
              for (let round = 1; round <= researchQueries.length && researchHits.length < 12; round += 1) {
                for (const hit of await searchOnce(researchQueries[round - 1], signal)) {
                  const dedupeKey = hit.url.replace(/[#?].*$/, "");
                  if (seenUrls.has(dedupeKey)) continue;
                  seenUrls.add(dedupeKey);
                  researchHits.push(hit);
                }
                push({
                  type: "course_generation_progress",
                  message: `Researching the web (round ${round}/${researchQueries.length})`,
                  data: { round, keywords: researchQueries, sources: researchHits.length },
                  course_uuid: courseUuid,
                });
              }
            } else {
              await sleep(1200);
              push({
                type: "course_generation_progress",
                message: "Researching the web (round 1/3)",
                data: { round: 1, keywords: researchQueries, sources: 0 },
                course_uuid: courseUuid,
              });
              await sleep(1000);
            }
            push({
              type: "course_generation_step",
              step_id: "researching_the_web",
              status: "completed",
              data: { sources: researchHits.length },
              course_uuid: courseUuid,
            });

            push({
              type: "course_generation_step",
              step_id: "generating_initial_syllabus",
              status: "loading",
              title: "Generating structured syllabus",
              placeholder: "Cooking the big picture...",
              course_uuid: courseUuid,
            });

            const course = await generateCourse(query, signal, researchHits.slice(0, 8));
            course.courseUuid = courseUuid;
            await saveCourse(courseUuid, member.email, course as unknown as Record<string, unknown>);

            push({ type: "course_generation_step", step_id: "generating_initial_syllabus", status: "completed", course_uuid: courseUuid });
            push({ type: "course_structure_ready", course_uuid: courseUuid, course });
          } catch (error) {
            if (signal.aborted || request.signal.aborted) {
              /* 客户端断开/超时:静默收尾 */
            } else {
              console.error("[hyperknow-course-gen] failure:", error instanceof Error ? error.message : error);
              push({ type: "course_generation_error", message: "Course generation failed" });
            }
          }
          try {
            controller.close();
          } catch {
            /* 流已被取消 */
          }
        })();
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        "x-accel-buffering": "no",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
