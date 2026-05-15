export const PUBLIC_MINTHI_BASE_URL = 'https://minthi.it'

export const getCanonicalPublicBaseUrl = () => {
    const envUrl = import.meta.env.VITE_PRINTED_QR_BASE_URL
    return (envUrl || PUBLIC_MINTHI_BASE_URL).replace(/\/$/, '')
}

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

export const generateTakeawayMenuUrl = (restaurantId: string) => {
    return `${getCanonicalPublicBaseUrl()}/client/takeaway/${restaurantId}`
}

export const generatePhysicalQrUrl = (code: string) => {
    return `${getCanonicalPublicBaseUrl()}/qr/${code}`
}
