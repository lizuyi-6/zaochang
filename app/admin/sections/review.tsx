"use client";

import { Check, Copy, ExternalLink, X } from "lucide-react";
import { hostingFailureMessage } from "../../hosting/hosting-copy";
import { approvalBlockReason, formatHostingBytes, hostingStateLabel, pricingModelLabel, type Client, type ProductReview } from "../admin-api";

export function ReviewSection({ products, clients, notes, setNotes, busy, pendingAction, onProductAction, onClientAction, onCopyHash }: {
  products: ProductReview[];
  clients: Client[];
  notes: Record<number, string>;
  setNotes: (update: (current: Record<number, string>) => Record<number, string>) => void;
  busy: boolean;
  pendingAction: string;
  onProductAction: (action: "approve_product" | "reject_product" | "remove_hosting", product: ProductReview, reason: string) => void;
  onClientAction: (action: "approve_client" | "reject_client", client: Client) => void;
  onCopyHash: (value: string) => void;
}) {
  return <div className="admin-section-stack">
    <section className="admin-panel">
      <header className="admin-section-heading"><div><p className="admin-eyebrow">PRODUCT REVIEW</p><h2>作品预审</h2><p>批准只接受不可被原地替换的体验地址和站内扫描封面。</p></div></header>
      {products.length ? <div className="admin-record-list">{products.map((product) => {
        const hasExternalDemo = Boolean(product.demoUrl);
        const hasExternalImage = Boolean(product.imageUrl && !product.imageUrl.startsWith("/api/uploads/"));
        const hostingReason = approvalBlockReason(product.hosting);
        const noteTooShort = (notes[product.id]?.trim().length ?? 0) < 4;
        const actionBusy = pendingAction === `approve_product:${product.id}` || pendingAction === `reject_product:${product.id}` || pendingAction === `remove_hosting:${product.id}`;
        return <article className="admin-product-review" key={product.id}>
          <div className="admin-product-copy">
            <strong>{product.title}</strong>
            <small>{product.ownerName} · {product.ownerEmail} · V{product.reviewVersion} · {product.submittedAt}</small>
            <p>{product.description}</p>
            <p>{product.category} · {pricingModelLabel(product.pricingModel, product.price)}</p>
            {product.demoUrl && <><a href={product.demoUrl} target="_blank" rel="noreferrer noopener">检查体验地址 <ExternalLink size={12} /></a><p role="alert">外部链接可被原地替换，当前版本只能驳回并要求改为站内原型。</p></>}
            {product.imageUrl && <a href={product.imageUrl} target="_blank" rel="noreferrer noopener">检查商品封面 <ExternalLink size={12} /></a>}
            {hasExternalImage && <p role="alert">封面为外部图床链接，过审后可被原地替换；请驳回并要求改为站内上传。</p>}
          </div>
          {product.hosting && <div className="admin-product-hosting">
            <header><strong>静态托管 · {hostingStateLabel(product.hosting.state)}</strong><small>托管版本 V{product.hosting.reviewVersion} · 已批准 V{product.hosting.approvedVersion}</small></header>
            <dl>
              <div><dt>文件数</dt><dd>{product.hosting.bundleFileCount}</dd></div>
              <div><dt>未压缩体积</dt><dd>{formatHostingBytes(product.hosting.bundleUncompressedBytes)}</dd></div>
              <div><dt>SHA-256</dt><dd><code>{product.hosting.bundleSha256.slice(0, 12)}</code><button type="button" onClick={() => onCopyHash(product.hosting!.bundleSha256)} aria-label="复制完整 SHA-256"><Copy size={13} /> 复制全文</button></dd></div>
            </dl>
            {product.hosting.previewUrl && <a href={product.hosting.previewUrl} target="_blank" rel="noreferrer noopener">打开审核预览 <ExternalLink size={12} /></a>}
            {product.hosting.previewExpiresAt && <small>预览过期时间：{product.hosting.previewExpiresAt}</small>}
            {product.hosting.failureCode && <p className="admin-hosting-failure">{hostingFailureMessage(product.hosting.failureCode)} <small>错误码：{product.hosting.failureCode}</small></p>}
            {hostingReason && <small className="admin-review-block-reason">{hostingReason}</small>}
            <button type="button" className="admin-danger-outline" disabled={actionBusy || busy} onClick={() => onProductAction("remove_hosting", product, notes[product.id] ?? "")}>{pendingAction === `remove_hosting:${product.id}` ? "正在提交…" : "移除托管"}</button>
          </div>}
          <label className="admin-review-note">审核意见<textarea value={notes[product.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [product.id]: event.target.value }))} maxLength={500} placeholder="至少 4 个字，说明通过依据或驳回原因" /></label>
          <div className="admin-review-actions">
            <button type="button" disabled={hasExternalDemo || hasExternalImage || Boolean(hostingReason) || noteTooShort || actionBusy || busy} onClick={() => onProductAction("approve_product", product, notes[product.id] ?? "")}><Check size={14} /> {pendingAction === `approve_product:${product.id}` ? "正在提交…" : hasExternalDemo || hasExternalImage ? "外链不可批准" : hostingReason || "批准上线"}</button>
            <button type="button" className="admin-danger-outline" disabled={noteTooShort || actionBusy || busy} onClick={() => onProductAction("reject_product", product, notes[product.id] ?? "")}><X size={14} /> 驳回</button>
          </div>
        </article>;
      })}</div> : <p className="admin-empty-state">没有待预审商品</p>}
    </section>
    <section className="admin-panel">
      <header className="admin-section-heading"><div><p className="admin-eyebrow">THIRD-PARTY APPS</p><h2>第三方应用审核</h2><p>检查登记来源、站点与申请的权限范围。</p></div></header>
      {clients.length ? <div className="admin-record-list">{clients.map((client) => <article key={client.clientId}>
        <div><strong>{client.name}</strong><small>{client.ownerEmail ? `${client.ownerEmail} · ` : ""}{new URL(client.websiteUrl).hostname}</small><p>{client.allowedScopes}</p></div>
        <button type="button" disabled={busy} onClick={() => onClientAction("approve_client", client)}><Check size={14} /> 验证并批准</button>
        <button type="button" className="admin-danger-outline" disabled={busy} onClick={() => onClientAction("reject_client", client)}><X size={14} /> 拒绝</button>
      </article>)}</div> : <p className="admin-empty-state">没有待审核应用</p>}
    </section>
  </div>;
}
