import { env } from "cloudflare:workers";
import { frame, sseResponse } from "../../_lib/hyperknow/sse";
import { requireMember } from "../../_lib/access-control";
import { jsonError } from "../../_lib/errors";
import { COURSE_STAGE1_BUDGET_MS, COURSE_STAGE2_BUDGET_MS, CREDIT_LEASE_MARGIN_MS, resolveCourseGenBudgetMs } from "../../_lib/hyperknow/budgets";
import { assertSameOrigin } from "../../_lib/request-origin";
import { enforceRateLimit, rateLimitKey } from "../../_lib/rate-limit";
import { generateCourseBlueprint, generateUnitDetails, repairUnit, CHAT_MODEL_MAP, resolveChatModel } from "../../_lib/hyperknow/agents";
import { resolveConfigOrThrow } from "../../_lib/hyperknow/config";
import { finalizeCourseDependencies } from "../../_lib/hyperknow/dag-finalizer";
import {
  acquireCourseTaskLease,
  createCourseTask,
  getCourse,
  getCourseTask,
  markCourseTaskStatus,
  releaseCourseTaskLease,
  saveCourse,
  saveCourseTaskUnitCheckpoint,
  updateCourseTaskBlueprint,
  updateCourseTaskResearch,
} from "../../_lib/hyperknow/store";
import {
  researchQueriesFor,
  resolveSearchConfig,
  searchWithOutcome,
  type WebSearchHit,
  type SearchOutcome,
  type SearchOutcomeStatus,
} from "../../_lib/hyperknow/websearch";
import { chat as llmChat, HyperknowNotConfiguredError, HyperknowUpstreamError } from "../../_lib/hyperknow/llm";
import {
  consumeCreditsIdempotent,
  currentCredits,
  dailyCreditsFor,
  markCreditChargeCompleted,
  refundCreditCharge,
} from "../../_lib/hyperknow/credits";
import {
  validateUnitStructure,
  type CourseBrief,
} from "../../_lib/hyperknow/protocol";
import type { CourseBlueprint, CourseUnit } from "../../_lib/hyperknow/prompts";

export const dynamic = "force-dynamic";

// H2 扣费前探活的超时:只判"上游是否活着",10s 足够;超时按上游不可用处理。
const UPSTREAM_PROBE_TIMEOUT_MS = 10_000;

// A client retry key always names the same server-owned task UUID for this member.
async function taskUuidForKey(userEmail: string, key: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(`${userEmail.toLowerCase()}\0${key}`),
  )).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80; // RFC 9562 UUIDv8 (application-defined hash)
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}


/** 已完成课程的直接回放(2026-10 审计重构 #3):三个恢复分支(确认流/任务恢复/
 * 幂等键重放)共用同一对帧——started + structure_ready(resumed)。 */
function replayCompletedCourse(courseUuid: string, course: unknown): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(frame({ type: "course_generation_started", course_uuid: courseUuid, resumed: true }));
      controller.enqueue(frame({ type: "course_structure_ready", course_uuid: courseUuid, course, resumed: true }));
      controller.close();
    },
  });
  return sseResponse(stream);
}

export async function POST(request: Request) {
  try {
    const member = await requireMember();
    const originError = assertSameOrigin(request);
    if (originError) return originError;

    const input = (await request.json().catch(() => ({}))) as {
      query?: unknown;
      prompt?: unknown;
      brief?: CourseBrief;
      resumeUuid?: unknown;
      courseUuid?: unknown;
      idempotencyKey?: unknown;
      action?: unknown;
      selectedUnits?: unknown;
      requireConfirmation?: unknown;
      model?: unknown;
    };

    const query = String(input.query ?? input.prompt ?? "").trim().slice(0, 300);
    const resumeUuid = typeof input.resumeUuid === "string" && input.resumeUuid.trim()
      ? input.resumeUuid.trim()
      : typeof input.courseUuid === "string" && input.courseUuid.trim()
        ? input.courseUuid.trim()
        : null;
    const brief = input.brief && typeof input.brief === "object" ? input.brief : undefined;
    const explicitKey = typeof input.idempotencyKey === "string" && input.idempotencyKey.trim()
      ? input.idempotencyKey.trim().slice(0, 128)
      : null;
    const idempotencyKey = explicitKey
      ? explicitKey
      : (resumeUuid ?? undefined);
    const action = typeof input.action === "string" ? input.action.trim() : undefined;
    const requireConfirmation = Boolean(input.requireConfirmation);
    const selectedUnits = Array.isArray(input.selectedUnits) ? input.selectedUnits.map(String) : undefined;
    // 见界双模型:Pro=step-5-preview / Flash=step-3.7-flash(默认);白名单外回落 Flash
    const chatModel = CHAT_MODEL_MAP[resolveChatModel(input.model)];

    if (!query && !resumeUuid) {
      return Response.json({ error: "query_required" }, { status: 400 });
    }

    // ── H5:限流只拦"新工作"。回放已完成课程/恢复蓝图不计数(读自家数据不是
    // 生成配额的消耗);蓝图确认(Stage2)单独计数,不与新建课抢同一个 5/小时桶。
    const enforceCourseGenQuota = async () => {
      await enforceRateLimit(await rateLimitKey("hyperknow-course-gen", member.email), 5, 60 * 60);
    };

    // ── 分支 1: 蓝图确认与生成具体课节 (Stage 2: 独立有界单元真实生成与检查点) ──────────
    if (action === "confirm_blueprint" && resumeUuid) {
      await enforceRateLimit(await rateLimitKey("hyperknow-course-confirm", member.email), 5, 60 * 60);
      const task = await getCourseTask(resumeUuid, member.email);
      if (!task) {
        // 任务不存在或越权
        return Response.json({ error: "course_task_not_found" }, { status: 404 });
      }

      // 如果已存在且已完成落库，直接恢复返回
      const existingCourse = await getCourse(resumeUuid, member.email);
      if (existingCourse) return replayCompletedCourse(resumeUuid, existingCourse.course);

      // 解析蓝图
      let blueprint: CourseBlueprint;
      try {
        blueprint = JSON.parse(task.blueprintJson || "{}");
      } catch {
        return Response.json({ error: "invalid_task_blueprint" }, { status: 500 });
      }
      if (!Array.isArray(blueprint.units) || blueprint.units.length === 0) {
        return Response.json({ error: "invalid_task_blueprint" }, { status: 500 });
      }

      let storedSelection: string[] | null = null;
      if (task.selectedUnitsJson) {
        try {
          const parsed = JSON.parse(task.selectedUnitsJson) as unknown;
          if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === "string")) throw new Error("invalid selection");
          storedSelection = parsed;
        } catch {
          return Response.json({ error: "invalid_task_selection" }, { status: 500 });
        }
      }
      if (selectedUnits && selectedUnits.length === 0) {
        return Response.json({ error: "selected_units_required" }, { status: 400 });
      }
      const requestedSelection = selectedUnits ?? storedSelection ?? blueprint.units.map((unit) => unit.unitId);
      const selectedSet = new Set(requestedSelection);
      const canonicalSelection = blueprint.units.filter((unit) => selectedSet.has(unit.unitId)).map((unit) => unit.unitId);
      if (canonicalSelection.length === 0 || canonicalSelection.length !== selectedSet.size) {
        return Response.json({ error: "invalid_selected_units" }, { status: 400 });
      }
      if (storedSelection && JSON.stringify(canonicalSelection) !== JSON.stringify(storedSelection)) {
        return Response.json({ error: "selected_units_conflict" }, { status: 409 });
      }
      const taskLeaseToken = crypto.randomUUID();
      if (!await acquireCourseTaskLease(
        resumeUuid, member.email, JSON.stringify(canonicalSelection), taskLeaseToken,
      )) {
        return Response.json({ error: "concurrent_operation_in_progress" }, { status: 409 });
      }
      const targetBlueprintUnits = blueprint.units.filter((unit) => selectedSet.has(unit.unitId));

      /* Stage2 逐单元真实生成:每单元一次 LLM 调用(~30-60s),8+ 单元课程系统性超过
       * 300s 通用上限,会被服务端截断逼用户手动恢复——单元检查点已让恢复廉价,
       * 上限放宽到 15 分钟,让正常规模课程一次跑完;期间进度帧持续流出,流不会闲置。 */
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(COURSE_STAGE2_BUDGET_MS)]);
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
              push({ type: "course_generation_started", course_uuid: resumeUuid, query: task.query, resumed: true });

              let completedUnits: CourseUnit[] = [];
              try {
                completedUnits = JSON.parse(task.unitsJson || "[]");
                if (!Array.isArray(completedUnits)) completedUnits = [];
              } catch {
                completedUnits = [];
              }

              const totalUnits = targetBlueprintUnits.length;
              // ── H1:brief 一律以任务行落库的为准(briefJson),请求体携带的 brief
              // 可能与任务不一致,且会被持久化进讲师 prompt 与课程记录。
              let taskBrief: CourseBrief | undefined;
              try {
                taskBrief = task.briefJson ? (JSON.parse(task.briefJson) as CourseBrief) : undefined;
              } catch {
                taskBrief = undefined;
              }
              const taskLanguage = blueprint.language || taskBrief?.language || "zh-CN";

              let taskResearchHits: WebSearchHit[] = [];
              try {
                if (task.researchHitsJson) taskResearchHits = JSON.parse(task.researchHitsJson);
              } catch {}

              // 独立有界单元请求真实调用 LLM 每单元保存检查点
              for (let i = 0; i < totalUnits; i++) {
                if (request.signal.aborted) return;
                if (signal.aborted) throw new Error("course_generation_timeout");
                const blueprintUnit = targetBlueprintUnits[i];

                // 检查点恢复: 如果该单元在断点前已生成完成，直接复用
                const cached = completedUnits.find((u) => u && u.unitId === blueprintUnit.unitId);
                if (cached && validateUnitStructure(cached).valid) {
                  push({
                    type: "course_unit_progress",
                    message: `Restored unit ${i + 1}/${totalUnits}: ${cached.title}`,
                    data: {
                      unit_index: i + 1,
                      total_units: totalUnits,
                      unit_id: cached.unitId,
                      title: cached.title,
                      cached: true,
                    },
                    course_uuid: resumeUuid,
                  });
                  continue;
                }

                push({
                  type: "course_unit_progress",
                  message: `Refining unit ${i + 1}/${totalUnits}: ${blueprintUnit.title}`,
                  data: {
                    unit_index: i + 1,
                    total_units: totalUnits,
                    unit_id: blueprintUnit.unitId,
                    title: blueprintUnit.title,
                    loading: true,
                  },
                  course_uuid: resumeUuid,
                });

                // H3:Stage2 同样可见降级(不静默换模型)
                const pushStage2ModelDegraded = (fromModel: string, toModel: string) => {
                  push({
                    type: "model_degraded",
                    message: `Requested model ${fromModel} is unavailable; continuing with ${toModel}`,
                    data: { from_model: fromModel, to_model: toModel },
                    course_uuid: resumeUuid,
                  });
                };

                // 真实调用 LLM (无模板假数据，失败显式报错)
                const unit = await generateUnitDetails(
                  blueprint.courseTitle,
                  blueprintUnit,
                  completedUnits,
                  signal,
                  i,
                  taskResearchHits,
                  taskLanguage,
                  chatModel,
                  pushStage2ModelDegraded,
                );

                completedUnits[i] = unit;
                // 保存检查点
                await saveCourseTaskUnitCheckpoint(resumeUuid, member.email, unit, i, totalUnits, taskLeaseToken);

                push({
                  type: "course_unit_progress",
                  message: `Completed unit ${i + 1}/${totalUnits}: ${unit.title}`,
                  data: {
                    unit_index: i + 1,
                    total_units: totalUnits,
                    unit_id: unit.unitId,
                    title: unit.title,
                    completed: true,
                  },
                  course_uuid: resumeUuid,
                });
              }

              await finalizeCourseDependencies(completedUnits,
                (unit, errors) => repairUnit(unit, errors, blueprint.courseTitle, signal, taskLanguage, undefined, chatModel), signal);

              const completeCourse = {
                courseUuid: resumeUuid,
                courseTitle: blueprint.courseTitle,
                courseDescription: blueprint.courseDescription,
                targetLearner: blueprint.targetLearner,
                tags: blueprint.tags,
                units: completedUnits,
                // brief 随课程持久化:白板讲师据此做深度校准与个性化举例(H1:取任务行)
                ...(taskBrief ? { brief: taskBrief } : {}),
              };

              // 落库持久化完整课程
              await saveCourse(resumeUuid, member.email, completeCourse as unknown as Record<string, unknown>, taskLeaseToken);
              await markCourseTaskStatus(resumeUuid, member.email, "completed", undefined, taskLeaseToken);
              await markCreditChargeCompleted(task.creditKey ?? resumeUuid, member.email);

              push({ type: "course_structure_ready", course_uuid: resumeUuid, course: completeCourse });
            } catch (error) {
              if (request.signal.aborted) {
                /* 仅客户端断开静默;服务端超时显式报错(Stage2 不扣费,无需退费) */
              } else {
                console.error("[hyperknow-course-gen] stage 2 unit generation failure:", error);
                try {
                  await markCourseTaskStatus(resumeUuid, member.email, "failed",
                    error instanceof Error ? error.message : String(error), taskLeaseToken);
                } catch (leaseError) {
                  console.error("[hyperknow-course-gen] failed to record stage 2 error:", leaseError);
                }
                push({ type: "course_generation_error", message: "Unit generation failed" });
              }
            }
            try {
              await releaseCourseTaskLease(resumeUuid, member.email, taskLeaseToken);
            } catch (leaseError) {
              console.error("[hyperknow-course-gen] failed to release stage 2 lease:", leaseError);
            }
            try {
              controller.close();
            } catch {}
          })();
        },
      });

      return sseResponse(stream);
    }

    // ── 分支 2: 任务恢复检查 (已有完整课程或已有未完成任务) ──────────────────────
    if (resumeUuid) {
      const existingCourse = await getCourse(resumeUuid, member.email);
      if (existingCourse) return replayCompletedCourse(resumeUuid, existingCourse.course);

      const existingTask = await getCourseTask(resumeUuid, member.email);
      if (!existingTask) {
        // A supplied UUID is strictly a resume request, never a new-task identifier.
        return Response.json({ error: "course_task_not_found" }, { status: 404 });
      }
      if (existingTask.leaseToken && existingTask.leaseExpiresAt
        && Date.parse(existingTask.leaseExpiresAt) > Date.now()) {
        return Response.json({ error: "concurrent_operation_in_progress" }, { status: 409 });
      }
      if (existingTask.blueprintJson
        && ["blueprint_ready", "failed", "generating_units"].includes(existingTask.status)) {
        // 蓝图已就绪，等待确认(库里 JSON 损坏时不裸抛 500:任务标记失败,给干净错误)
        let blueprint: unknown;
        try {
          blueprint = JSON.parse(existingTask.blueprintJson);
        } catch {
          await markCourseTaskStatus(resumeUuid, member.email, "failed", "blueprint_json_corrupted");
          return Response.json({ error: "course_task_corrupted" }, { status: 500 });
        }
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(frame({ type: "course_generation_started", course_uuid: resumeUuid, resumed: true }));
            controller.enqueue(frame({
              type: "blueprint_ready",
              course_uuid: resumeUuid,
              blueprint,
              requires_confirmation: true,
            }));
            controller.close();
          },
        });
        return sseResponse(stream);
      }
    }

    const courseUuid = resumeUuid || (explicitKey
      ? await taskUuidForKey(member.email, explicitKey)
      : crypto.randomUUID());
    if (!resumeUuid && explicitKey) {
      const task = await getCourseTask(courseUuid, member.email);
      if (task) {
        if (task.query !== query || task.briefJson !== (brief ? JSON.stringify(brief) : null)) {
          return Response.json({ error: "idempotency_key_reused" }, { status: 409 });
        }
        const course = await getCourse(courseUuid, member.email);
        if (course) return replayCompletedCourse(courseUuid, course.course);
        if (task.leaseToken && task.leaseExpiresAt && Date.parse(task.leaseExpiresAt) > Date.now()) {
          return Response.json({ error: "concurrent_operation_in_progress" }, { status: 409 });
        }
        if (task.blueprintJson && ["blueprint_ready", "failed", "generating_units"].includes(task.status)) {
          let resumedBlueprint: unknown;
          try {
            resumedBlueprint = JSON.parse(task.blueprintJson);
          } catch {
            await markCourseTaskStatus(courseUuid, member.email, "failed", "blueprint_json_corrupted");
            return Response.json({ error: "course_task_corrupted" }, { status: 500 });
          }
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(frame({ type: "course_generation_started", course_uuid: courseUuid, resumed: true }));
              controller.enqueue(frame({ type: "blueprint_ready", course_uuid: courseUuid,
                blueprint: resumedBlueprint, requires_confirmation: true }));
              controller.close();
            },
          });
          return sseResponse(stream);
        }
      }
    }

    // ── 分支 3: 新建课程任务 (Stage 1: 蓝图生成与可选自动级联) ───────────────────
    // 配置缺失在流开始前暴露(fail-closed,干净 JSON)。
    try {
      resolveConfigOrThrow();
    } catch (error) {
      const status = (error as { status?: number }).status ?? 503;
      return Response.json({ error: (error as { code?: string }).code ?? "ai_not_configured" }, { status });
    }

    // 新建课配额(回放/恢复在上方分支已提前返回,不会走到这里)。
    await enforceCourseGenQuota();

    // ── H2:扣费前轻量探活。上游整体不可用时在扣费前显式 503,用户不经历
    // "扣了又退"的账目往返(失败退费由 C1 超时/失败路径兜底,这里是前置防线)。
    try {
      await llmChat(
        [
          { role: "system", content: "You are a health probe. Reply with exactly one word: ok" },
          { role: "user", content: "ping" },
        ],
        { maxTokens: 512, signal: AbortSignal.timeout(UPSTREAM_PROBE_TIMEOUT_MS) },
      );
    } catch (error) {
      if (error instanceof HyperknowUpstreamError || error instanceof HyperknowNotConfiguredError) {
        return Response.json({ error: error.code }, { status: 503 });
      }
      throw error;
    }

    // 服务端总预算走 budgets 模块;HK_COURSE_GEN_TIMEOUT_MS 覆盖仅在 APP_ENV=test 生效
    // (集成测试压缩 Stage1 预算触发真实超时路径,线上误配不得缩短预算)。
    const envValues = env as unknown as Record<string, string | undefined>;
    const stage1BudgetMs = resolveCourseGenBudgetMs(envValues.APP_ENV, envValues.HK_COURSE_GEN_TIMEOUT_MS, COURSE_STAGE1_BUDGET_MS);

    // DB 原子幂等扣费与任务租约冲突拦截 (409 不放行，故障恢复不重复扣款，D1 batch 一致)。
    // 计费租约必须罩住整个 Stage1 预算(2026-10 审计 C2):原 60s 默认短于蓝图生成耗时,
    // 同 key 重发会在旧流仍在跑时免费接管、再启一路 Stage1(双倍上游调用);租约到期点
    // 晚于超时点后,超时路径退费、完成路径 markCompleted 都会显式清掉租约。
    const { remaining: remainingCredits, conflict, charged } = await consumeCreditsIdempotent(
      member.email,
      idempotencyKey,
      stage1BudgetMs + CREDIT_LEASE_MARGIN_MS,
    );

    if (conflict) {
      return Response.json({ error: "concurrent_operation_in_progress" }, { status: 409 });
    }

    if (!resumeUuid && explicitKey && !charged) {
      // Legacy completed keys lack a task binding; do not give them fresh free work.
      const task = await getCourseTask(courseUuid, member.email);
      if (!task || task.query !== query || task.briefJson !== (brief ? JSON.stringify(brief) : null)) {
        return Response.json({ error: "idempotency_key_reused" }, { status: 409 });
      }
    }

    if (remainingCredits === null) {
      const { remaining, max } = await currentCredits(member.email);
      return Response.json(
        { error: "insufficient_credits", credit_info: { remaining, max } },
        { status: 402 },
      );
    }

    // 持久化任务表初始状态
    await createCourseTask({
      id: courseUuid,
      userEmail: member.email,
      query,
      creditKey: explicitKey,
      briefJson: brief ? JSON.stringify(brief) : null,
      status: "pending",
    });

    // 服务端总预算走 budgets 模块;HK_COURSE_GEN_TIMEOUT_MS 覆盖仅在 APP_ENV=test 生效
    // (集成测试压缩 Stage1 预算触发真实超时路径,线上误配不得缩短预算)。
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(stage1BudgetMs)]);

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        void (async () => {
          let closed = false;
          let autoLeaseToken: string | null = null;
          const push = (data: Record<string, unknown>) => {
            if (closed) return;
            try {
              controller.enqueue(frame(data));
            } catch {
              closed = true;
            }
          };

          try {
            push({ type: "course_generation_step", step_id: "boot", status: "loading", title: "Starting course generation", placeholder: "Crafting Courses..." });
            push({ type: "course_generation_started", course_uuid: courseUuid, query });
            push({ type: "credit_status", message: "Processing request", credit_info: { remaining: remainingCredits, max: dailyCreditsFor(member.email) } });

            push({
              type: "course_generation_step",
              step_id: "researching_the_web",
              status: "loading",
              title: "Researching the web",
              placeholder: "Scouring the web for syllabus material...",
              course_uuid: courseUuid,
            });

            const providerOverride = (request.headers.get("x-hk-web-search-provider") || "").trim().toLowerCase();
            const searchConfig = resolveSearchConfig(providerOverride || undefined);
            const researchHits: WebSearchHit[] = [];
            const seenUrls = new Set<string>();

            if (!searchConfig) {
              push({
                type: "course_generation_progress",
                message: "Web search skipped (not configured)",
                data: {
                  round: 0,
                  total_rounds: 0,
                  sources: 0,
                  status: "disabled",
                  provider: "none",
                  reason: "Web search is disabled or not configured",
                  titles: [],
                  links: [],
                },
                course_uuid: courseUuid,
              });
              push({
                type: "course_generation_step",
                step_id: "researching_the_web",
                status: "completed",
                data: { sources: 0, status: "disabled", provider: "none" },
                course_uuid: courseUuid,
              });
            } else if (searchConfig.provider === "stepfun") {
              let outcome: SearchOutcome;
              try {
                outcome = await searchWithOutcome(query, signal, searchConfig.provider);
              } catch (err) {
                if (signal.aborted || request.signal.aborted) throw err;
                // ── H4:上游错误原文(可含内部 URL/细节)只进日志;客户端拿到固定文案。
                console.warn("[hyperknow-course-gen] stepfun search failed:", err instanceof Error ? err.message : err);
                outcome = {
                  status: "upstream_error",
                  hits: [],
                  provider: "stepfun",
                  reason: "search_upstream_failed",
                };
              }

              for (const hit of outcome.hits) {
                const dedupeKey = hit.url.replace(/[#?].*$/, "");
                if (seenUrls.has(dedupeKey)) continue;
                seenUrls.add(dedupeKey);
                researchHits.push(hit);
              }

              const status = outcome.status;
              // H4:客户端只认稳定令牌;上游错误细节(即使 websearch 层的固定串)不透传。
              const reason = status === "upstream_error" ? "search_upstream_failed"
                : status !== "success" ? (outcome.reason || "Degraded without search context")
                : undefined;

              push({
                type: "course_generation_progress",
                message: status === "success"
                  ? "Researching the web (round 1/1)"
                  : `Researching the web degraded (${reason ?? status})`,
                data: {
                  round: 1,
                  total_rounds: 1,
                  keywords: [query],
                  sources: researchHits.length,
                  status,
                  provider: "stepfun",
                  titles: researchHits.map((h) => h.title),
                  links: researchHits.map((h) => h.url),
                  ...(reason ? { reason } : {}),
                },
                course_uuid: courseUuid,
              });
              push({
                type: "course_generation_step",
                step_id: "researching_the_web",
                status: "completed",
                data: {
                  sources: researchHits.length,
                  status,
                  provider: "stepfun",
                  titles: researchHits.map((h) => h.title),
                  links: researchHits.map((h) => h.url),
                  ...(reason ? { reason } : {}),
                },
                course_uuid: courseUuid,
              });
            } else {
              const researchQueries = researchQueriesFor(query);
              let lastOutcomeStatus: SearchOutcomeStatus = "success";
              let lastReason: string | undefined = undefined;

              for (let round = 1; round <= researchQueries.length && researchHits.length < 12; round += 1) {
                let outcome: SearchOutcome;
                try {
                  outcome = await searchWithOutcome(researchQueries[round - 1], signal, searchConfig.provider);
                } catch (err) {
                  if (signal.aborted || request.signal.aborted) throw err;
                  // ── H4:同上,错误细节只留日志,客户端固定文案。
                  console.warn("[hyperknow-course-gen] research search failed:", err instanceof Error ? err.message : err);
                  outcome = {
                    status: "upstream_error",
                    hits: [],
                    provider: searchConfig.provider,
                    reason: "search_upstream_failed",
                  };
                }

                lastOutcomeStatus = outcome.status;
                if (outcome.status === "upstream_error") {
                  lastReason = "search_upstream_failed";
                } else if (outcome.status !== "success") {
                  lastReason = outcome.reason;
                }

                for (const hit of outcome.hits) {
                  const dedupeKey = hit.url.replace(/[#?].*$/, "");
                  if (seenUrls.has(dedupeKey)) continue;
                  seenUrls.add(dedupeKey);
                  researchHits.push(hit);
                }

                push({
                  type: "course_generation_progress",
                  message: `Researching the web (round ${round}/${researchQueries.length})`,
                  data: {
                    round,
                    total_rounds: researchQueries.length,
                    keywords: researchQueries,
                    sources: researchHits.length,
                    status: outcome.status,
                    provider: searchConfig.provider,
                    titles: researchHits.map((h) => h.title),
                    links: researchHits.map((h) => h.url),
                    ...(outcome.reason ? { reason: outcome.reason } : {}),
                  },
                  course_uuid: courseUuid,
                });
              }

              const finalStatus = researchHits.length > 0 ? "success" : lastOutcomeStatus;
              push({
                type: "course_generation_step",
                step_id: "researching_the_web",
                status: "completed",
                data: {
                  sources: researchHits.length,
                  status: finalStatus,
                  provider: searchConfig.provider,
                  titles: researchHits.map((h) => h.title),
                  links: researchHits.map((h) => h.url),
                  ...(lastReason && researchHits.length === 0 ? { reason: lastReason } : {}),
                },
                course_uuid: courseUuid,
              });
            }

            // 检索命中随任务落库(2026-10 审计 P1-R):确认流的 Stage2 只从任务行读
            // researchHitsJson,不落库则蓝图确认后的单元生成永远没有检索上下文。
            // 截断:最多 12 条(snippet 已各自截 320),JSON 总长上限 32KB,超出丢尾部条目。
            if (researchHits.length > 0) {
              const cappedResearchHits = researchHits.slice(0, 12);
              let researchJson = JSON.stringify(cappedResearchHits);
              while (researchJson.length > 32_768 && cappedResearchHits.length > 0) {
                cappedResearchHits.pop();
                researchJson = JSON.stringify(cappedResearchHits);
              }
              if (cappedResearchHits.length > 0) {
                await updateCourseTaskResearch(courseUuid, member.email, researchJson);
              }
            }

            push({
              type: "course_generation_step",
              step_id: "generating_initial_syllabus",
              status: "loading",
              title: "Generating structured syllabus",
              placeholder: "Cooking the big picture...",
              course_uuid: courseUuid,
            });

            // H3:主模型 404 降级必须让用户看见(Pro→Flash),不再静默换模型。
            const pushModelDegraded = (fromModel: string, toModel: string) => {
              push({
                type: "model_degraded",
                message: `Requested model ${fromModel} is unavailable; continuing with ${toModel}`,
                data: { from_model: fromModel, to_model: toModel },
                course_uuid: courseUuid,
              });
            };

            // 真实蓝图生成
            const blueprint = await generateCourseBlueprint(query, signal, researchHits.slice(0, 8), brief, chatModel, pushModelDegraded);

            // 更新任务状态与蓝图落库
            await updateCourseTaskBlueprint(
              courseUuid,
              member.email,
              JSON.stringify(blueprint),
              blueprint.units.length,
              "blueprint_ready",
            );
            if (!requireConfirmation) {
              autoLeaseToken = crypto.randomUUID();
              if (!await acquireCourseTaskLease(courseUuid, member.email,
                JSON.stringify(blueprint.units.map((unit) => unit.unitId)), autoLeaseToken, 360_000)) {
                throw new Error("course_task_lease_conflict");
              }
            }

            // 下发真实蓝图供用户审查与确认
            push({
              type: "blueprint_ready",
              course_uuid: courseUuid,
              blueprint: {
                courseTitle: blueprint.courseTitle,
                courseDescription: blueprint.courseDescription,
                targetLearner: blueprint.targetLearner,
                tags: blueprint.tags,
                targetDepth: blueprint.targetDepth,
                language: blueprint.language,
                units: blueprint.units.map((u) => ({
                  unitId: u.unitId,
                  title: u.title,
                  prerequisites: u.prerequisites ?? [],
                  objectives: u.objectives ?? [],
                  completionCriteria: u.completionCriteria ?? [],
                  lectureCount: u.lectureCount ?? 2,
                  plannedSessionCount: u.plannedSessionCount ?? (u.lectureCount ? u.lectureCount * 2 : 4),
                  estimatedDurationMinutes: u.estimatedDurationMinutes ?? 120,
                })),
              },
              requires_confirmation: requireConfirmation,
            });

            push({
              type: "course_generation_step",
              step_id: "generating_initial_syllabus",
              status: "completed",
              course_uuid: courseUuid,
            });

            // 真实蓝图阶段完成：若前端开启了确认流，暂停流等待前端确认请求，不假装生成
            if (requireConfirmation) {
              try {
                controller.close();
              } catch {}
              return;
            }

            // 旧 API / 自动级联兼容路径：不假成功，逐单元真实调用 LLM 并保存检查点
            const generatedUnits: CourseUnit[] = [];
            const blueprintLanguage = blueprint.language || "zh-CN";
            for (let i = 0; i < blueprint.units.length; i++) {
              // 客户端断开:静默收尾(任务可恢复)。服务端自身超时:抛出走失败路径——
              // 退费 + course_generation_error,不能让用户被扣费却只看到流断开。
              if (request.signal.aborted) return;
              if (signal.aborted) throw new Error("course_generation_timeout");
              const u = blueprint.units[i];

              push({
                type: "course_unit_progress",
                message: `Refining unit ${i + 1}/${blueprint.units.length}: ${u.title}`,
                data: {
                  unit_index: i + 1,
                  total_units: blueprint.units.length,
                  unit_id: u.unitId,
                  title: u.title,
                  loading: true,
                },
                course_uuid: courseUuid,
              });

              // 真实 LLM 调用细化单元课节
              const concreteUnit = await generateUnitDetails(
                blueprint.courseTitle,
                u,
                generatedUnits,
                signal,
                i,
                researchHits.slice(0, 8),
                blueprintLanguage,
                chatModel,
                pushModelDegraded,
              );
              generatedUnits.push(concreteUnit);

              // 检查点落库
              await saveCourseTaskUnitCheckpoint(courseUuid, member.email, concreteUnit, i,
                blueprint.units.length, autoLeaseToken!);

              push({
                type: "course_unit_progress",
                message: `Completed unit ${i + 1}/${blueprint.units.length}: ${concreteUnit.title}`,
                data: {
                  unit_index: i + 1,
                  total_units: blueprint.units.length,
                  unit_id: concreteUnit.unitId,
                  title: concreteUnit.title,
                  completed: true,
                },
                course_uuid: courseUuid,
              });
            }

            await finalizeCourseDependencies(generatedUnits,
              (unit, errors) => repairUnit(unit, errors, blueprint.courseTitle, signal, blueprintLanguage, undefined, chatModel), signal);

            const course = {
              courseUuid,
              courseTitle: blueprint.courseTitle,
              courseDescription: blueprint.courseDescription,
              targetLearner: blueprint.targetLearner,
              tags: blueprint.tags,
              units: generatedUnits,
              // brief 随课程持久化:白板讲师据此做深度校准与个性化举例
              ...(brief ? { brief } : {}),
            };

            await saveCourse(courseUuid, member.email, course as unknown as Record<string, unknown>, autoLeaseToken!);
            await markCourseTaskStatus(courseUuid, member.email, "completed", undefined, autoLeaseToken!);
            await markCreditChargeCompleted(idempotencyKey ?? courseUuid, member.email);

            push({ type: "course_structure_ready", course_uuid: courseUuid, course });
          } catch (error) {
            if (request.signal.aborted) {
              /* 仅客户端断开静默;服务端 300s 超时(signal 由 timeout 触发)按失败处理,
               * 走下方退费 + 错误帧(原实现把两者合并,超时白扣 10 积分)。 */
            } else {
              console.error("[hyperknow-course-gen] failure:", error instanceof Error ? error.message : error);
              if (autoLeaseToken) {
                try {
                  await markCourseTaskStatus(courseUuid, member.email, "failed",
                    error instanceof Error ? error.message : String(error), autoLeaseToken);
                } catch (leaseError) {
                  console.error("[hyperknow-course-gen] failed to record auto-generation error:", leaseError);
                }
              }
              /* 失败退费:只退本次真正扣过费(charged)的请求;接管/恢复重跑(charged=false)
               * 不退——钱属于最初那次扣费,由它自己的失败路径退。 */
              if (charged) {
                await refundCreditCharge(idempotencyKey ?? null, member.email);
              }
              push({ type: "course_generation_error", message: "Course generation failed" });
            }
          } finally {
            if (autoLeaseToken) {
              try {
                await releaseCourseTaskLease(courseUuid, member.email, autoLeaseToken);
              } catch (leaseError) {
                console.error("[hyperknow-course-gen] failed to release auto-generation lease:", leaseError);
              }
            }
            try {
              controller.close();
            } catch {}
          }
        })();
      },
    });

    return sseResponse(stream);
  } catch (error) {
    return jsonError(error);
  }
}
