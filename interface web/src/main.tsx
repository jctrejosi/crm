import ReactDOM from 'react-dom/client'
import App from './App'
import { ThemeProvider } from './theme'
import './index.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

// Título de la pestaña: "<nombre de tienda> analytics | DSI".
function setAppTitle(appLabel: string) {
  fetch(`${API_URL}/admin/settings/public-info`)
    .then((r) => (r.ok ? r.json() : {}))
    .then((d: { tradeName?: string }) => {
      const storeName = (d?.tradeName || 'Mercaldas').trim()
      document.title = `${storeName} ${appLabel} | DSI`
    })
    .catch(() => {
      document.title = `Mercaldas ${appLabel} | DSI`
    })
}
setAppTitle('analytics')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
)
