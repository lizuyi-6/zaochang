import { requireMember } from "../../_lib/access-control";
import { jsonError } from "../../_lib/errors";
import { assertSameOrigin } from "../../_lib/request-origin";
import { enforceRateLimit, rateLimitKey } from "../../_lib/rate-limit";
import { generateCourseBlueprint, generateUnitDetails, repairUnit } from "../../_lib/hyperknow/agents";
import { resolveConfigOrThrow } from "../../_lib/hyperknow/config";
import {
  createCourseTask,
  getCourse,
  getCourseTask,
  markCourseTaskStatus,
  saveCourse,
  saveCourseTaskUnitCheckpoint,
  updateCourseTaskBlueprint,
} from "../../_lib/hyperknow/store";
import {
  researchQueriesFor,
  resolveSearchConfig,
  searchWithOutcome,
  type WebSearchHit,
  type SearchOutcome,
  type SearchOutcomeStatus,
} from "../../_lib/hyperknow/websearch";
import {
  consumeCreditsIdempotent,
  currentCredits,
  markCreditChargeCompleted,
  HK_COURSE_COST,
  HK_DAILY_CREDITS,
} from "../../_lib/hyperknow/credits";
import {
  checkPrerequisitesAcyclic,
  validateUnitStructure,
  type CourseBrief,
} from "../../_lib/hyperknow/protocol";
import type { CourseBlueprint, CourseBlueprintUnit, CourseUnit } from "../../_lib/hyperknow/prompts";

export const dynamic = "force-dynamic";

function frame(data: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`event: frame\ndata: ${JSON.stringify(data)}\n\n`);
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
    };

    const query = String(input.query ?? input.prompt ?? "").trim().slice(0, 300);
    const resumeUuid = typeof input.resumeUuid === "string" && input.resumeUuid.trim()
      ? input.resumeUuid.trim()
      : typeof input.courseUuid === "string" && input.courseUuid.trim()
        ? input.courseUuid.trim()
        : null;
    const brief = input.brief && typeof input.brief === "object" ? input.brief : undefined;
    const idempotencyKey = typeof input.idempotencyKey === "string" && input.idempotencyKey.trim()
      ? input.idempotencyKey.trim()
      : (resumeUuid ?? undefined);
    const action = typeof input.action === "string" ? input.action.trim() : undefined;
    const requireConfirmation = Boolean(input.requireConfirmation);
    const selectedUnits = Array.isArray(input.selectedUnits) ? input.selectedUnits.map(String) : undefined;

    if (!query && !resumeUuid) {
      return Response.json({ error: "query_required" }, { status: 400 });
    }

    await enforceRateLimit(await rateLimitKey("hyperknow-course-gen", member.email), 5, 60 * 60);

    // ── 分支 1: 蓝图确认与生成具体课节 (Stage 2: 独立有界单元真实生成与检查点) ──────────
    if (action === "confirm_blueprint" && resumeUuid) {
      const task = await getCourseTask(resumeUuid, member.email);
      if (!task) {
        // 任务不存在或越权
        return Response.json({ error: "course_task_not_found" }, { status: 404 });
      }

      // 如果已存在且已完成落库，直接恢复返回
      const existingCourse = await getCourse(resumeUuid, member.email);
      if (existingCourse) {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(frame({ type: "course_generation_started", course_uuid: resumeUuid, resumed: true }));
            controller.enqueue(frame({ type: "course_structure_ready", course_uuid: resumeUuid, course: existingCourse.course, resumed: true }));
            controller.close();
          },
        });
        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-store",
            "x-accel-buffering": "no",
          },
        });
      }

      // 解析蓝图
      let blueprint: CourseBlueprint;
      try {
        blueprint = JSON.parse(task.blueprintJson || "{}");
      } catch {
        return Response.json({ error: "invalid_task_blueprint" }, { status: 500 });
      }

      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(300_000)]);
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

              // 过滤保留审查选中的单元
              const targetBlueprintUnits = selectedUnits && selectedUnits.length > 0
                ? blueprint.units.filter((u) => selectedUnits.includes(u.unitId))
                : blueprint.units;

              const totalUnits = targetBlueprintUnits.length;
              const taskLanguage = blueprint.language || (brief?.language ? String(brief.language) : "zh-CN");

              let taskResearchHits: WebSearchHit[] = [];
              try {
                if (task.researchHitsJson) taskResearchHits = JSON.parse(task.researchHitsJson);
              } catch {}

              // 独立有界单元请求真实调用 LLM 每单元保存检查点
              for (let i = 0; i < totalUnits; i++) {
                if (signal.aborted || request.signal.aborted) return;
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

                // 真实调用 LLM (无模板假数据，失败显式报错)
                const unit = await generateUnitDetails(
                  blueprint.courseTitle,
                  blueprintUnit,
                  completedUnits,
                  signal,
                  i,
                  taskResearchHits,
                  taskLanguage,
                );

                completedUnits[i] = unit;
                // 保存检查点
                await saveCourseTaskUnitCheckpoint(resumeUuid, member.email, unit, i, totalUnits);

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

              // DAG 拓扑检查与质量兜底
              const dagCheck = checkPrerequisitesAcyclic(completedUnits);
              if (!dagCheck.isAcyclic) {
                console.warn(`[hyperknow-course-gen] cyclic prerequisites detected: ${dagCheck.cycle?.join(" -> ")}`);
                // 修复受影响单元
                for (let i = 0; i < completedUnits.length; i++) {
                  const repaired = await repairUnit(completedUnits[i], [`Cyclic dependency: ${dagCheck.cycle?.join(" -> ")}`], blueprint.courseTitle, signal, taskLanguage);
                  if (repaired) completedUnits[i] = repaired;
                }
              }

              const completeCourse = {
                courseUuid: resumeUuid,
                courseTitle: blueprint.courseTitle,
                courseDescription: blueprint.courseDescription,
                targetLearner: blueprint.targetLearner,
                tags: blueprint.tags,
                units: completedUnits,
              };

              // 落库持久化完整课程
              await saveCourse(resumeUuid, member.email, completeCourse as unknown as Record<string, unknown>);
              await markCourseTaskStatus(resumeUuid, member.email, "completed");
              await markCreditChargeCompleted(idempotencyKey ?? resumeUuid, member.email);

              push({ type: "course_structure_ready", course_uuid: resumeUuid, course: completeCourse });
            } catch (error) {
              if (signal.aborted || request.signal.aborted) {
                /* 客户端断开/超时 */
              } else {
                console.error("[hyperknow-course-gen] stage 2 unit generation failure:", error);
                await markCourseTaskStatus(resumeUuid, member.email, "failed", error instanceof Error ? error.message : String(error));
                push({ type: "course_generation_error", message: "Unit generation failed" });
              }
            }
            try {
              controller.close();
            } catch {}
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
    }

    // ── 分支 2: 任务恢复检查 (已有完整课程或已有未完成任务) ──────────────────────
    if (resumeUuid) {
      const existingCourse = await getCourse(resumeUuid, member.email);
      if (existingCourse) {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(frame({ type: "course_generation_started", course_uuid: resumeUuid, resumed: true }));
            controller.enqueue(frame({ type: "course_structure_ready", course_uuid: resumeUuid, course: existingCourse.course, resumed: true }));
            controller.close();
          },
        });
        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-store",
            "x-accel-buffering": "no",
          },
        });
      }

      const existingTask = await getCourseTask(resumeUuid, member.email);
      if (existingTask && existingTask.status === "blueprint_ready" && existingTask.blueprintJson) {
        // 蓝图已就绪，等待确认
        const blueprint = JSON.parse(existingTask.blueprintJson);
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
        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-store",
            "x-accel-buffering": "no",
          },
        });
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

    // DB 原子幂等扣费与任务租约冲突拦截 (409 不放行，故障恢复不重复扣款，D1 batch 一致)
    const { remaining: remainingCredits, conflict } = await consumeCreditsIdempotent(
      member.email,
      HK_COURSE_COST,
      idempotencyKey,
    );

    if (conflict) {
      return Response.json({ error: "concurrent_operation_in_progress" }, { status: 409 });
    }

    if (remainingCredits === null) {
      const { remaining } = await currentCredits(member.email);
      return Response.json(
        { error: "insufficient_credits", credit_info: { remaining, max: HK_DAILY_CREDITS } },
        { status: 402 },
      );
    }

    const courseUuid = resumeUuid || crypto.randomUUID();

    // 持久化任务表初始状态
    await createCourseTask({
      id: courseUuid,
      userEmail: member.email,
      query,
      briefJson: brief ? JSON.stringify(brief) : null,
      status: "pending",
    });

    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(300_000)]);

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
                outcome = {
                  status: "upstream_error",
                  hits: [],
                  provider: "stepfun",
                  reason: err instanceof Error ? err.message : "Search error",
                };
              }

              for (const hit of outcome.hits) {
                const dedupeKey = hit.url.replace(/[#?].*$/, "");
                if (seenUrls.has(dedupeKey)) continue;
                seenUrls.add(dedupeKey);
                researchHits.push(hit);
              }

              const status = outcome.status;
              const reason = status !== "success" ? (outcome.reason || "Degraded without search context") : undefined;

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
                  outcome = {
                    status: "upstream_error",
                    hits: [],
                    provider: searchConfig.provider,
                    reason: err instanceof Error ? err.message : "Search error",
                  };
                }

                lastOutcomeStatus = outcome.status;
                if (outcome.status !== "success") {
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

            push({
              type: "course_generation_step",
              step_id: "generating_initial_syllabus",
              status: "loading",
              title: "Generating structured syllabus",
              placeholder: "Cooking the big picture...",
              course_uuid: courseUuid,
            });

            // 真实蓝图生成
            const blueprint = await generateCourseBlueprint(query, signal, researchHits.slice(0, 8), brief);

            // 更新任务状态与蓝图落库
            await updateCourseTaskBlueprint(
              courseUuid,
              member.email,
              JSON.stringify(blueprint),
              blueprint.units.length,
              "blueprint_ready",
            );

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
              if (signal.aborted || request.signal.aborted) return;
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
              );
              generatedUnits.push(concreteUnit);

              // 检查点落库
              await saveCourseTaskUnitCheckpoint(courseUuid, member.email, concreteUnit, i, blueprint.units.length);

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

            // DAG 先修依赖校验
            const dagCheck = checkPrerequisitesAcyclic(generatedUnits);
            if (!dagCheck.isAcyclic) {
              console.warn(`[hyperknow-course-gen] cyclic prerequisites detected: ${dagCheck.cycle?.join(" -> ")}`);
              for (let i = 0; i < generatedUnits.length; i++) {
                const repaired = await repairUnit(
                  generatedUnits[i],
                  [`Cyclic dependency: ${dagCheck.cycle?.join(" -> ")}`],
                  blueprint.courseTitle,
                  signal,
                  blueprintLanguage,
                );
                if (repaired) generatedUnits[i] = repaired;
              }
            }

            const course = {
              courseUuid,
              courseTitle: blueprint.courseTitle,
              courseDescription: blueprint.courseDescription,
              targetLearner: blueprint.targetLearner,
              tags: blueprint.tags,
              units: generatedUnits,
            };

            await saveCourse(courseUuid, member.email, course as unknown as Record<string, unknown>);
            await markCourseTaskStatus(courseUuid, member.email, "completed");
            await markCreditChargeCompleted(idempotencyKey ?? courseUuid, member.email);

            push({ type: "course_structure_ready", course_uuid: courseUuid, course });
          } catch (error) {
            if (signal.aborted || request.signal.aborted) {
              /* 客户端断开/超时 */
            } else {
              console.error("[hyperknow-course-gen] failure:", error instanceof Error ? error.message : error);
              push({ type: "course_generation_error", message: "Course generation failed" });
            }
          }
          try {
            controller.close();
          } catch {}
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
