import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 挂载于造场 /lattice/ 子路径:base 决定 index.html 资产链接与打包产物地址;
// 源码中的 public 资产字符串引用统一走 src/services/baseUrl.ts 的 ASSET_BASE。
// 构建产物直接输出到主站 public/lattice/(与 product-apps 一样"预构建产物入库")。
export default defineConfig({
  base: '/lattice/',
  plugins: [react()],
  build: {
    outDir: '../public/lattice',
    emptyOutDir: true,
  },
})
