import * as QRCode from 'qrcode'

export async function createQrDataUrl(value: string, width = 1200): Promise<string> {
    return QRCode.toDataURL(value, {
        width,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: {
            dark: '#000000',
            light: '#FFFFFF',
        },
    })
}
