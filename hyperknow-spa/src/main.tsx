import { createRoot } from 'react-dom/client'
import './styles/variables.css'
import './styles/fonts.css'
import './index.css'
import App from './App.tsx'
import { prepareI18n } from './lattice/i18n'

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
