/**
 * Indirizzo pubblico dell'app per QR e link da condividere.
 * Nell'app iOS (Capacitor) l'origine è capacitor://localhost: si usa VITE_APP_URL.
 */
export function publicOrigin(): string {
  const origin = window.location.origin
  const configured = (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, '')
  if (!origin.startsWith('http') || origin.includes('capacitor')) return configured || 'https://minthi.it'
  return origin
}

export const publicUrl = (path: string) => `${publicOrigin()}${path.startsWith('/') ? path : `/${path}`}`
