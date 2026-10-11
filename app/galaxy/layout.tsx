// /galaxy/* 的中文衬线 400/500 字面(见 galaxy-fonts.css 注释)。`?url` 让 Vite 产出独立、
// 内容哈希的 CSS 资产,不并入全站共享样式;React 以 precedence 把 <link> 提升进 <head>。
import galaxyFontsHref from "./galaxy-fonts.css?url";

export default function GalaxyLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>
    <link rel="stylesheet" href={galaxyFontsHref} precedence="default" />
    {children}
  </>;
}
