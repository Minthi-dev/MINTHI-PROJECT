import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from "react-error-boundary";
import { BrowserRouter } from 'react-router-dom';
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { Keyboard } from '@capacitor/keyboard'

// Polyfill per browser che non supportano crypto.randomUUID
if (typeof crypto !== 'undefined' && !crypto.randomUUID) {
  (crypto as any).randomUUID = () => {
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c: any) =>
      (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
    );
  };
}

import App from './App.tsx'
import { ErrorFallback } from './ErrorFallback.tsx'
import { ThemeProvider } from "./components/theme-provider.tsx"

import "./main.css"
import "./styles/theme.css"
import "./index.css"

// Initialize Capacitor plugins when running as native app
if (Capacitor.isNativePlatform()) {
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
  StatusBar.setBackgroundColor({ color: '#000000' }).catch(() => {})

  // Handle keyboard on iOS
  Keyboard.setAccessoryBarVisible({ isVisible: true }).catch(() => {})
  Keyboard.setScroll({ isDisabled: false }).catch(() => {})
}

// Global keyboard handler: scroll focused inputs into view on ALL platforms (especially iOS)
// This ensures that when the keyboard opens, the input field is always visible above it
document.addEventListener('focusin', (e) => {
  const target = e.target as HTMLElement
  if (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  ) {
    // Small delay to let the keyboard animate open
    setTimeout(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    }, 300)
  }
})

// On iOS, window.visualViewport resize can help detect keyboard open/close
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    const activeEl = document.activeElement as HTMLElement | null
    if (
      activeEl &&
      (activeEl.tagName === 'INPUT' ||
       activeEl.tagName === 'TEXTAREA' ||
       activeEl.tagName === 'SELECT' ||
       activeEl.isContentEditable)
    ) {
      setTimeout(() => {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
      }, 100)
    }
  })
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary FallbackComponent={ErrorFallback}>
    <ThemeProvider storageKey="minthi-theme">
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </ErrorBoundary>
)
