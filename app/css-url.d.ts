// Vite `?url` 导入(返回构建后内容哈希资产的 URL)。仅声明本仓库实际使用的 CSS 形态:
// app/bookshelf/[...slug]/page.tsx 与 app/galaxy/layout.tsx 用它挂按路由分发的字体样式表。
declare module "*.css?url" {
  const href: string;
  export default href;
}
