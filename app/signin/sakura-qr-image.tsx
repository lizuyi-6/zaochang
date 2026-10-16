"use client";

import type { CSSProperties } from "react";
import QRCode from "qrcode";
import { SAKURA_QR_ERROR_CORRECTION, renderSakuraQrSvg, sakuraQrPetals, type SakuraPetal } from "../lib/sakura-qr";

// 登录二维码(正向桌面面板 + 反向邀请面板)共用:本地生成模块矩阵 → 樱花树 SVG,
// token 不经过任何第三方图床。
export type SakuraQrArt = { svg: string; petals: SakuraPetal[] };

export function sakuraQrArt(url: string): SakuraQrArt {
  const { modules } = QRCode.create(url, { errorCorrectionLevel: SAKURA_QR_ERROR_CORRECTION });
  return { svg: renderSakuraQrSvg(modules), petals: sakuraQrPetals(modules.size) };
}

// SVG 静态只画一次;落花是独立的 HTML 元素,动画只走 transform/opacity(合成层),
// 不触发带滤镜的大 SVG 重绘。
export function SakuraQrImage({ art }: { art: SakuraQrArt }) {
  return (
    <div className="auth-qr-image sakura-qr">
      <div className="sakura-qr-art" dangerouslySetInnerHTML={{ __html: art.svg }} />
      {art.petals.map((petal, index) => (
        <i
          key={index}
          aria-hidden
          className={`sakura-qr-petal is-tone-${petal.tone}`}
          style={{
            animationDelay: `${petal.delay.toFixed(2)}s`,
            animationDuration: `${petal.duration.toFixed(2)}s`,
            left: `${petal.left.toFixed(2)}%`,
            top: `${petal.top.toFixed(2)}%`,
            "--drift": `${petal.drift.toFixed(2)}cqw`,
            "--fall": `${petal.fall.toFixed(2)}cqw`,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}
