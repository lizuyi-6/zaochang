// 挂载基路径助手:本 SPA 以预构建产物挂载在造场的 /lattice/ 子路径下
// (vite.config.ts base='/lattice/'),Vite 只会重写 index.html 与打包产物里的
// 资产地址;源码中以字符串字面量引用的 public 静态资产(官方镜像 SVG/视频等)
// 必须统一带上 BASE_URL 前缀,否则会打到站点根路径 404。
export const ASSET_BASE: string = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;
