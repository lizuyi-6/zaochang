import { createRoot } from 'react-dom/client'
import './styles/variables.css'
import './styles/fonts.css'
import './index.css'
import App from './App.tsx'

// NOTE: no StrictMode — its dev-only double effect mount would break the
// scripted whiteboard player's cancellation model; production is unaffected.
createRoot(document.getElementById('root')!).render(<App />)
