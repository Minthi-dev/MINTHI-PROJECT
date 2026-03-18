export const getAppBaseUrl = () => {
    // If VITE_APP_URL is set (required for Capacitor/native apps), use it
    // Otherwise use window.location.origin (works on web/Vercel)
    const envUrl = import.meta.env.VITE_APP_URL
    if (envUrl) return envUrl.replace(/\/$/, '') // remove trailing slash
    return typeof window !== 'undefined' ? window.location.origin : ''
}

export const generateQrCode = (tableId: string) => {
    const baseUrl = getAppBaseUrl()
    return `${baseUrl}/client/table/${tableId}`
}
