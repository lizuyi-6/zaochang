import { env } from "cloudflare:workers";
import { resolveHyperknowAiConfig, HyperknowNotConfiguredError } from "./config";
import { resolveStepfunImagesUrl, inspectBase64Image } from "./protocol";
import { storeScannedUpload } from "../upload-core";
import { database } from "../community";
import { enforceRateLimit, rateLimitKey } from "../rate-limit";
import { beijingToday, parseTimestampMs } from "./credits";

export const HK_MAX_DAILY_IMAGES = 10;
const IMAGE_PARAMS_SIGNATURE = "n1_1024x1024_b64json";
const IMAGE_CACHE_VERSION = "v1";

export interface GenerateImageResult {
  url: string;
  caption?: string;
  width: number;
  height: number;
  cached?: boolean;
}

/**
 * 确保图像会话缓存与跨实例排他租约表存在
 */
async function ensureImageCacheTable(): Promise<void> {
  try {
    await database()
      .prepare(
        `CREATE TABLE IF NOT EXISTS hk_lecture_images (
          cache_key TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          user_email TEXT NOT NULL,
          model TEXT NOT NULL,
          params TEXT NOT NULL,
          version TEXT NOT NULL,
          url TEXT NOT NULL DEFAULT '',
          caption TEXT,
          prompt TEXT,
          status TEXT NOT NULL DEFAULT 'completed',
          lease_token TEXT,
          lease_expires_at TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
      )
      .run();
  } catch (err) {
    console.warn("[hyperknow-image] cache table creation warning:", err);
  }
}

/**
 * 阶跃星辰图像生成 API 接入：
 * - 总开关控制: HK_IMAGE_ENABLED / HYPERKNOW_IMAGE_ENABLED (默认 true)
 * - 复用 resolveHyperknowAiConfig 的自定义 URL / API Key，不擅自回退官方地址
 * - HK_IMAGE_MODEL 默认 step-image-edit-2
 * - 参数: n: 1, size: "1024x1024", response_format: "b64_json", prompt <= 512
 * - 跨 Worker 实例排他 DB 租约去重锁：同一课节同一时刻并发仅一次上游调用，支持超时过期接管恢复
 * - 严格安全检查大小、1024x1024 像素、魔数、拒 SVG/HTML
 * - 复用隔离 ClamAV 扫描 fail-closed
 * - 存入 R2 并建立资产所有权记录 (visibility: private)
 * - 缓存 key 包含模型、参数、版本、课节、用户，单节最多 1 图去重，每日配额控制
 */
export async function generateLectureImage(args: {
  prompt: string;
  caption?: string;
  userEmail: string;
  sessionId?: string;
  signal?: AbortSignal;
}): Promise<GenerateImageResult> {
  const { prompt, caption, userEmail, sessionId, signal } = args;

  // 0. 总开关检查
  const values = env as unknown as Record<string, string | undefined>;
  const enabledVal = (values.HK_IMAGE_ENABLED ?? values.HYPERKNOW_IMAGE_ENABLED ?? "true").trim().toLowerCase();
  if (enabledVal === "false" || enabledVal === "0" || enabledVal === "off") {
    throw new Error("image_generation_disabled");
  }

  const cleanPrompt = prompt.trim().slice(0, 512);
  if (!cleanPrompt) {
    throw new Error("prompt_required");
  }

  const imageModel = values.HK_IMAGE_MODEL?.trim() || values.HYPERKNOW_IMAGE_MODEL?.trim() || "step-image-edit-2";
  const sessionKey = sessionId?.trim() || "global";
  const cacheKey = `${userEmail}:${sessionKey}:${imageModel}:${IMAGE_PARAMS_SIGNATURE}:${IMAGE_CACHE_VERSION}`;

  await ensureImageCacheTable();

  // 1. 缓存与每节最多 1 图去重检查
  try {
    const cached = await database()
      .prepare(
        `SELECT url, caption, status FROM hk_lecture_images
         WHERE (cache_key = ? OR (session_id = ? AND user_email = ?)) AND status = 'completed' AND url != ''`,
      )
      .bind(cacheKey, sessionKey, userEmail)
      .first<{ url: string; caption: string | null; status: string }>();

    if (cached && cached.url) {
      return {
        url: cached.url,
        caption: cached.caption ?? caption,
        width: 340,
        height: 240,
        cached: true,
      };
    }
  } catch {}

  // 2. 跨实例 DB 排他租约竞争 (并发仅一调用、过期恢复)
  const leaseToken = crypto.randomUUID();
  const leaseDurationMs = 45_000;
  const leaseExpiresAt = new Date(Date.now() + leaseDurationMs).toISOString();

  let hasLease = false;

  // 尝试插入 pending 租约占位
  try {
    await database()
      .prepare(
        `INSERT INTO hk_lecture_images (cache_key, session_id, user_email, model, params, version, url, caption, prompt, status, lease_token, lease_expires_at)
         VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, 'pending', ?, ?)`,
      )
      .bind(
        cacheKey,
        sessionKey,
        userEmail,
        imageModel,
        IMAGE_PARAMS_SIGNATURE,
        IMAGE_CACHE_VERSION,
        caption ?? cleanPrompt,
        cleanPrompt,
        leaseToken,
        leaseExpiresAt,
      )
      .run();
    hasLease = true;
  } catch {
    // 主键冲突: 说明已有实例抢占或已有记录
    hasLease = false;
  }

  if (!hasLease) {
    // 检查冲突行的状态
    const existing = await database()
      .prepare(`SELECT url, caption, status, lease_token, lease_expires_at FROM hk_lecture_images WHERE cache_key = ?`)
      .bind(cacheKey)
      .first<{ url: string; caption: string | null; status: string; lease_token: string | null; lease_expires_at: string | null }>();

    if (existing && existing.status === "completed" && existing.url) {
      return {
        url: existing.url,
        caption: existing.caption ?? caption,
        width: 340,
        height: 240,
        cached: true,
      };
    }

    if (existing && existing.status === "pending") {
      const expires = parseTimestampMs(existing.lease_expires_at);
      if (expires > Date.now()) {
        // 另一实例正在执行，轮询等待其落库 (最多等待 15s)
        const startWait = Date.now();
        while (Date.now() - startWait < 15_000) {
          if (signal?.aborted) throw new Error("aborted");
          await new Promise((r) => setTimeout(r, 300));
          const check = await database()
            .prepare(`SELECT url, caption, status, lease_expires_at FROM hk_lecture_images WHERE cache_key = ?`)
            .bind(cacheKey)
            .first<{ url: string; caption: string | null; status: string; lease_expires_at: string | null }>();

          if (check && check.status === "completed" && check.url) {
            return {
              url: check.url,
              caption: check.caption ?? caption,
              width: 340,
              height: 240,
              cached: true,
            };
          }

          if (!check || check.status === "failed" || parseTimestampMs(check.lease_expires_at) <= Date.now()) {
            break;
          }
        }
      }

      // 租约已过期（或轮询后原实例超时崩溃）：尝试原子接管过期租约
      const updateRes = await database()
        .prepare(
          `UPDATE hk_lecture_images
           SET status = 'pending', lease_token = ?, lease_expires_at = ?, updated_at = CURRENT_TIMESTAMP
           WHERE cache_key = ? AND (lease_expires_at <= ? OR status != 'completed')`,
        )
        .bind(leaseToken, leaseExpiresAt, cacheKey, new Date().toISOString())
        .run();

      if (Number(updateRes.meta.changes ?? 0) > 0) {
        hasLease = true;
      } else {
        // 接管失败（被另一实例接管或已完成），再次读取缓存
        const checkAfter = await database()
          .prepare(`SELECT url, caption, status FROM hk_lecture_images WHERE cache_key = ?`)
          .bind(cacheKey)
          .first<{ url: string; caption: string | null; status: string }>();
        if (checkAfter && checkAfter.status === "completed" && checkAfter.url) {
          return {
            url: checkAfter.url,
            caption: checkAfter.caption ?? caption,
            width: 340,
            height: 240,
            cached: true,
          };
        }
      }
    }
  }

  // 3. 执行上游生图与安全管线
  try {
    // 每日配额检查 (HK_MAX_DAILY_IMAGES = 10)
    const quotaKey = await rateLimitKey("hk-image-daily", `${userEmail}:${beijingToday()}`);
    await enforceRateLimit(quotaKey, HK_MAX_DAILY_IMAGES, 24 * 60 * 60);

    // 上游 AI 配置解析
    const aiConfig = resolveHyperknowAiConfig();
    if (!aiConfig) throw new HyperknowNotConfiguredError();

    const imagesUrl = resolveStepfunImagesUrl(aiConfig.baseUrl);

    // 调用 StepFun 生图 (同步官方接口规范: n: 1, 1024x1024, b64_json, prompt <= 512)
    const requestTimeout = AbortSignal.timeout(30_000);
    const combinedSignal = signal ? AbortSignal.any([signal, requestTimeout]) : requestTimeout;

    const response = await fetch(imagesUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aiConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: imageModel,
        prompt: cleanPrompt,
        n: 1,
        size: "1024x1024",
        response_format: "b64_json",
      }),
      signal: combinedSignal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`upstream_image_error_${response.status}: ${errorText.slice(0, 150)}`);
    }

    const payload = (await response.json()) as {
      data?: Array<{
        b64_json?: string;
        finish_reason?: string;
        url?: string;
      }>;
    };

    const item = payload.data?.[0];
    if (!item || !item.b64_json) {
      throw new Error("missing_image_payload");
    }

    if (item.finish_reason && item.finish_reason !== "success") {
      throw new Error(`image_finish_reason_${item.finish_reason}`);
    }

    // 解码并执行严格安全检查 (大小/1024x1024/魔数/拒SVG HTML)
    const inspected = inspectBase64Image(item.b64_json);

    // 构造 File 并通过 ClamAV 扫描隔离管道入库 (fail-closed, visibility: private)
    const file = new File([inspected.bytes as unknown as BlobPart], "illustration.png", { type: inspected.mediaType });
    const stored = await storeScannedUpload({
      file,
      ownerEmail: userEmail,
      visibility: "private",
      purpose: "general",
    });

    const url = `/api/uploads/${encodeURIComponent(stored.key)}`;

    // 成功落库缓存并释放租约锁
    await database()
      .prepare(
        `UPDATE hk_lecture_images
         SET status = 'completed', url = ?, caption = ?, lease_token = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE cache_key = ?`,
      )
      .bind(url, caption ?? cleanPrompt, cacheKey)
      .run();

    return {
      url,
      caption: caption ?? cleanPrompt,
      width: 340,
      height: 240,
      cached: false,
    };
  } catch (err) {
    // 发生异常时，如果持有租约，清理 pending 状态防止卡死
    try {
      await database()
        .prepare(
          `UPDATE hk_lecture_images
           SET status = 'failed', lease_token = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE cache_key = ? AND lease_token = ?`,
        )
        .bind(cacheKey, leaseToken)
        .run();
    } catch {}
    throw err;
  }
}
