'use client';

// 首页 hero 的指针视差层(myui 设计规范「用户驱动」动效层;库内卡片级视差组件
// 不适用于舞台容器,故此薄实现)。容器把指针位置归一化为 --stage-x/--stage-y
// (-1..1),子元素标记 data-depth 并用 --depth 声明 px 振幅,由 globals.css 的
// 独立 translate 属性完成位移——与既有 floatingWork/orbitSpin 的 transform
// 动画按 CSS Transforms L2 规则合成,互不覆盖。
// 触屏(hover:none)、prefers-reduced-motion、JS 失败三种情况都零位移,
// 页面完整回到静态构图。
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
export function StageParallax({
  children,
  className,
  style,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  'aria-label'?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    let frame = 0;
    let latest: { x: number; y: number } | null = null;
    const apply = () => {
      frame = 0;
      if (!latest) return;
      el.style.setProperty('--stage-x', latest.x.toFixed(4));
      el.style.setProperty('--stage-y', latest.y.toFixed(4));
    };
    const onMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      latest = {
        x: ((event.clientX - rect.left) / rect.width - 0.5) * 2,
        y: ((event.clientY - rect.top) / rect.height - 0.5) * 2,
      };
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      latest = { x: 0, y: 0 };
      if (!frame) frame = requestAnimationFrame(apply);
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return (
    <div ref={ref} className={className} style={style} {...rest}>
      {children}
    </div>
  );
}
