import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { bootTheme } from './lib/theme'
import './index.css'
import App from './App.jsx'

bootTheme()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
