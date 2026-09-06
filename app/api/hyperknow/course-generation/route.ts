import { requireMember } from "../../_lib/access-control";
import { jsonError } from "../../_lib/errors";
import { assertSameOrigin } from "../../_lib/request-origin";
import { enforceRateLimit, rateLimitKey } from "../../_lib/rate-limit";
import { generateCourse } from "../../_lib/hyperknow/agents";
import { resolveConfigOrThrow } from "../../_lib/hyperknow/config";
import { saveCourse } from "../../_lib/hyperknow/store";

export const dynamic = "force-dynamic";

// 全自动课程蓝图生成端点(原 ws/courseGenWs.js 的 SSE 化)。事件序列与原 WS 逐帧
// 一致:boot loading → course_generation_started → researching_the_web loading
// → progress(round 1/3,装饰性研学节奏) → researching_the_web completed
// → generating_initial_syllabus loading →(课程树生成落库)→ completed
// → course_structure_ready。原版的 1.2s/1s sleep 原样保留(wall-clock 等待在
// Workers 无碍,且是官方流水线的节奏的一部分)。
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

            push({
              type: "course_generation_step",
              step_id: "researching_the_web",
              status: "loading",
              title: "Researching the web",
              placeholder: "Scouring the web for syllabus material...",
              course_uuid: courseUuid,
            });
            await sleep(1200);
            push({
              type: "course_generation_progress",
              message: "Researching the web (round 1/3)",
              data: { round: 1, keywords: [`${query} curriculum`, `${query} core foundations`] },
              course_uuid: courseUuid,
            });
            await sleep(1000);
            push({ type: "course_generation_step", step_id: "researching_the_web", status: "completed", course_uuid: courseUuid });

            push({
              type: "course_generation_step",
              step_id: "generating_initial_syllabus",
              status: "loading",
              title: "Generating structured syllabus",
              placeholder: "Cooking the big picture...",
              course_uuid: courseUuid,
            });

            const course = await generateCourse(query, signal);
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
