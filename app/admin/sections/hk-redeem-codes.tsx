"use client";

import { Copy, Gift, TicketX } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { adminErrorMessage, adminRequest } from "../admin-api";

export type HkRedeemCode = {
  id: string; label: string; tier: "PRO" | "MAX";
  durationDays: number | null; maxUses: number; usesCount: number;
  expiresAt: string; revokedAt: string | null;
  createdBy: string; createdAt: string; lastUsedAt: string | null;
};

type CreatedCode = HkRedeemCode & { code: string };

// 与服务端同款 UTC 台账比较(expires_at 是 "YYYY-MM-DD HH:MM:SS" 零填充格式)。
function isExpired(code: HkRedeemCode): boolean {
  return code.expiresAt <= new Date().toISOString().slice(0, 19).replace("T", " ");
}

function redeemCodeStatus(code: HkRedeemCode): string {
  if (code.revokedAt) return "已撤销";
  if (code.usesCount >= code.maxUses) return "已用完";
  if (isExpired(code)) return "已过期";
  return "有效";
}

// 见界会员兑换码:发放(HK- 明文只显示一次)+ 记录/撤销。
// 撤码只拦未消耗的兑换,已发出去的会员授权不回收——列表语义与服务端一致。
export function HkRedeemCodesSection({ refreshKey, busy, onStatus }: {
  refreshKey: number;
  busy: boolean;
  onStatus: (message: string, kind: "success" | "error") => void;
}) {
  const [codes, setCodes] = useState<HkRedeemCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingKey, setPendingKey] = useState("");
  const busyLocal = busy || Boolean(pendingKey);

  const [draft, setDraft] = useState({ label: "", tier: "PRO", durationDays: "", maxUses: 1, expiresDays: 30, count: 1 });
  const [created, setCreated] = useState<CreatedCode[]>([]);
  const [confirmRevokeId, setConfirmRevokeId] = useState("");
  const [revokeReason, setRevokeReason] = useState("不再发放");

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminRequest<{ codes: HkRedeemCode[] }>("/api/admin/hk-redeem-codes", { cache: "no-store" });
      setCodes(result.codes);
    } catch (error) {
      onStatus(adminErrorMessage("读取兑换码", error), "error");
    } finally {
      setLoading(false);
    }
  }, [onStatus]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadAll(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshKey, loadAll]);

  const createCodes = useCallback(async () => {
    setPendingKey("create");
    try {
      const result = await adminRequest<{ codes: CreatedCode[] }>("/api/admin/hk-redeem-codes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label: draft.label,
          tier: draft.tier,
          durationDays: draft.durationDays === "" ? null : Number(draft.durationDays),
          maxUses: Number(draft.maxUses),
          expiresDays: Number(draft.expiresDays),
          count: Number(draft.count),
        }),
      });
      setCreated(result.codes);
      await loadAll();
      onStatus(`已生成 ${result.codes.length} 张兑换码,明文只在下面显示这一次,请立即复制保存。`, "success");
    } catch (error) {
      onStatus(adminErrorMessage("生成兑换码", error), "error");
    } finally {
      setPendingKey("");
    }
  }, [draft, loadAll, onStatus]);

  const revokeCode = useCallback(async (code: HkRedeemCode) => {
    setPendingKey(`revoke-${code.id}`);
    try {
      await adminRequest("/api/admin/hk-redeem-codes", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: code.id, action: "revoke", reason: revokeReason }),
      });
      setConfirmRevokeId("");
      await loadAll();
      onStatus("兑换码已撤销:未消耗的兑换被拦下,已发出的会员授权保留。", "success");
    } catch (error) {
      onStatus(adminErrorMessage("撤销兑换码", error), "error");
    } finally {
      setPendingKey("");
    }
  }, [loadAll, onStatus, revokeReason]);

  const copyCreated = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(created.map((code) => code.code).join("\n"));
      onStatus("兑换码已复制到剪贴板。", "success");
    } catch {
      onStatus("浏览器未允许自动复制,请手动选择复制。", "error");
    }
  }, [created, onStatus]);

  const canCreate = Boolean(
    !busyLocal
    && (draft.durationDays === "" || (Number(draft.durationDays) >= 1 && Number(draft.durationDays) <= 3650))
    && Number(draft.maxUses) >= 1 && Number(draft.maxUses) <= 100
    && Number(draft.expiresDays) >= 1 && Number(draft.expiresDays) <= 365
    && Number(draft.count) >= 1 && Number(draft.count) <= 20,
  );

  return <div className="admin-section-stack">
    <section className="admin-panel">
      <header className="admin-section-heading"><div><p className="admin-eyebrow">HK REDEEM CODES</p><h2>见界会员兑换码</h2><p>会员在见界 设置 → 优惠券 输入 HK- 开头的码即开通对应套餐;新码只在创建时显示一次,请立即复制保存。</p></div></header>
      <div className="admin-invitation-form">
        <label>用途<input value={draft.label} maxLength={80} placeholder="如:创赛入围奖励" onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))} /></label>
        <label>套餐
          <select aria-label="套餐档位" value={draft.tier} onChange={(event) => setDraft((current) => ({ ...current, tier: event.target.value }))}>
            <option value="PRO">PRO(每日 100 积分)</option>
            <option value="MAX">MAX(每日 500 积分)</option>
          </select>
        </label>
        <label>时长天数<input type="number" min={1} max={3650} placeholder="留空 = 永久" value={draft.durationDays} onChange={(event) => setDraft((current) => ({ ...current, durationDays: event.target.value }))} /></label>
        <label>每码可用次数<input type="number" min={1} max={100} value={draft.maxUses} onChange={(event) => setDraft((current) => ({ ...current, maxUses: Number(event.target.value) }))} /></label>
        <label>码有效天数<input type="number" min={1} max={365} value={draft.expiresDays} onChange={(event) => setDraft((current) => ({ ...current, expiresDays: Number(event.target.value) }))} /></label>
        <label>生成张数<input type="number" min={1} max={20} value={draft.count} onChange={(event) => setDraft((current) => ({ ...current, count: Number(event.target.value) }))} /></label>
        <button type="button" disabled={!canCreate} onClick={() => void createCodes()}><Gift size={15} /> 生成兑换码</button>
      </div>
      {created.length > 0 && <div className="admin-invitation-code" role="status">
        {created.map((code) => <div key={code.id}><code>{code.code}</code> <small>{code.tier}{code.durationDays === null ? " · 永久" : ` · ${code.durationDays} 天`} · 每码 {code.maxUses} 次</small></div>)}
        <button type="button" onClick={() => void copyCreated()}><Copy size={14} /> 全部复制</button>
        <small>离开或刷新后不再显示明文</small>
      </div>}
    </section>
    <section className="admin-panel">
      <header className="admin-section-heading"><div><h2>兑换码记录</h2><p>有效、已用完、已过期和已撤销记录;撤销不回收已发出的会员授权。</p></div></header>
      {loading && !codes.length ? <p className="admin-muted">正在读取兑换码…</p>
        : codes.length ? <div className="admin-record-list">{codes.map((code) => {
          const status = redeemCodeStatus(code);
          return <article key={code.id}>
            <div>
              <strong>{code.label || "(无用途备注)"} · {code.tier}{code.durationDays === null ? " · 永久" : ` · ${code.durationDays} 天`}</strong>
              <small>{code.usesCount}/{code.maxUses} 次 · 码到期 {code.expiresAt}{code.lastUsedAt ? ` · 最近兑换 ${code.lastUsedAt}` : ""} · {status}</small>
            </div>
            {status === "有效" && (confirmRevokeId === code.id
              ? <span className="admin-member-actions">
                  <input value={revokeReason} maxLength={500} aria-label="撤销原因" onChange={(event) => setRevokeReason(event.target.value)} />
                  <button type="button" className="admin-danger-outline" disabled={busyLocal || revokeReason.trim().length < 4} onClick={() => void revokeCode(code)}><TicketX size={14} /> 确认撤销</button>
                  <button type="button" onClick={() => setConfirmRevokeId("")}>取消</button>
                </span>
              : <button type="button" className="admin-danger-outline" disabled={busyLocal} onClick={() => { setConfirmRevokeId(code.id); setRevokeReason("不再发放"); }}><TicketX size={14} /> 撤销</button>)}
          </article>;
        })}</div>
        : <p className="admin-empty-state">还没有兑换码,先在上面生成。</p>}
    </section>
  </div>;
}
