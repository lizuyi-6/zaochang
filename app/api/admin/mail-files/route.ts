// 见界结果邮件的 PDF 回执挂载端点(admin/agent 专用)。
// 运营把评审回执等 PDF 挂到线上,把返回的 /api/uploads/<uuid>.pdf 链接塞进邮件
// (tmp/mail/mount.mjs 上传,tmp/mail/send.mjs --attach-url 注入下载按钮)。
// 读侧完全复用既有公开上传通道,本路由只新增"挂载"写入口:
//   - key = uuid.pdf,不可枚举(能力 URL,与既有 public 上传同语义);
//   - GET /api/uploads/<key> 对 public 可见性匿名可读,PDF 自动 attachment 下载头;
//   - ClamAV 扫描 + sha256 双重复核全部继承(storeScannedUpload)。
// purpose 取 'general' 而非新值:uploaded_files 的 purpose CHECK 约束动一次就是
// 整表重建迁移,回执与常规公开上传在可见性/清理语义上无差别,不值得;挂载动作
// 写 admin_audit_events(action=mail_file.mount)留回溯线索。
import { guardWrite } from "../../_lib/route-guards";
import { storeScannedUpload } from "../../_lib/upload-core";
import { auditAdminAction } from "../../_lib/admin";
import { jsonError } from "../../_lib/community";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const guarded = await guardWrite(request, {
      member: "adminOrAgent",
      sameOrigin: true,
      rate: { bucket: "mail-file-mount", limit: 60, windowSeconds: 60 * 60 },
    });
    if (guarded instanceof Response) return guarded;
    const actor = guarded.member;
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "invalid_upload" }, { status: 400 });
    }
    if (file.type !== "application/pdf") {
      return Response.json({ error: "mail_file_must_be_pdf" }, { status: 400 });
    }
    const stored = await storeScannedUpload({
      file,
      ownerEmail: actor.email,
      visibility: "public",
      purpose: "general",
    });
    await auditAdminAction(actor.email, "mail_file.mount", "upload", stored.key, stored.name);
    const origin = new URL(request.url).origin;
    return Response.json({
      key: stored.key,
      name: stored.name,
      type: stored.type,
      size: stored.size,
      url: stored.url,
      absoluteUrl: `${origin}${stored.url}`,
    }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
