// 无 'use client' 指令:服务端组件(page.tsx)也要直接调用它生成视差振幅。
// 不能放进 stage-parallax.tsx——客户端模块的导出在服务端只是引用代理,调用会抛错。
import type { CSSProperties } from 'react';

/** 声明某元素的视差振幅(配合 globals.css 的 [data-depth] 规则与 StageParallax 容器)。 */
export function depthStyle(px: number): CSSProperties {
  return { '--depth': `${px}px` } as CSSProperties;
}
