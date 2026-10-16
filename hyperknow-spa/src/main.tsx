import { createRoot } from 'react-dom/client'
import './styles/variables.css'
import './styles/fonts.css'
import './index.css'
import App from './App.tsx'
import './lattice/mobile.css'
import { prepareI18n } from './lattice/i18n'

// 发版后旧标签页切页面:懒加载的旧分包已被新构建替换(文件名带内容哈希),动态导入
// 404 → 渲染期抛错 → 整个应用白屏。Vite 对动态导入失败派发 vite:preloadError:自动
// 刷新一次拿新 index.html;30s 内已刷新过则不再刷(防真断网时死循环),交回原错误。
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem('hk_chunk_reload_at') ?? 0)
    if (Date.now() - last < 30_000) return
    sessionStorage.setItem('hk_chunk_reload_at', String(Date.now()))
  } catch {
    return // 存储不可用就无法防循环:不自动刷新,交回原错误
  }
  event.preventDefault()
  window.location.reload()
})

// NOTE: no StrictMode — its dev-only double effect mount would break the
// scripted whiteboard player's cancellation model; production is unaffected.
// 渲染前等当前语言字典 chunk 就绪(t() 是同步 API);语言包是本地静态资源,LAN 下毫秒级。
// prepareI18n 自带 3s 硬上限:加载失败或挂起(极端断网/CDN 异常)仍渲染——translate 对
// 缺失字典回退英文再回退键名,迟到加载的字典会自然生效,好过白屏(qa-runs P-003)。
prepareI18n()
  .catch(() => undefined)
  .finally(() => {
    createRoot(document.getElementById('root')!).render(<App />)
  })
