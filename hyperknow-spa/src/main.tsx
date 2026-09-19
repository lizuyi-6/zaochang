import { createRoot } from 'react-dom/client'
import './styles/variables.css'
import './styles/fonts.css'
import './index.css'
import App from './App.tsx'
import { prepareI18n } from './replica/i18n'

// NOTE: no StrictMode — its dev-only double effect mount would break the
// scripted whiteboard player's cancellation model; production is unaffected.
// 渲染前等当前语言字典 chunk 就绪(t() 是同步 API);语言包是本地静态资源,LAN 下毫秒级。
// 加载失败(极端断网/文件缺失)仍渲染:translate 对缺失字典回退返回键名,好过白屏。
prepareI18n()
  .catch(() => undefined)
  .finally(() => {
    createRoot(document.getElementById('root')!).render(<App />)
  })
