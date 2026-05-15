import type { jsPDF as JsPDF } from 'jspdf'

const PAGE_MARGIN = 14
const AMBER = [245, 158, 11] as const
const GREEN = [16, 185, 129] as const
const BLACK = [8, 8, 8] as const
const SOFT_BLACK = [30, 30, 30] as const
const PAPER = [255, 252, 246] as const

export const QR_POSTER_PROMO_LINE = 'Vuoi far saltare la coda anche ai tuoi clienti?'
export const QR_POSTER_CONTACT_LINE = 'Info eventi: 351 757 0155'
export const QR_POSTER_WEBSITE_LINE = 'minthi.it/info'

interface DrawTextOptions {
    size: number
    minSize?: number
    maxWidth: number
    color?: readonly [number, number, number]
    style?: 'normal' | 'bold'
}

interface QrPosterPdfOptions {
    qrDataUrl: string
    headline?: string
    scanText?: string
    pickupText?: string
    promoLine?: string
    contactLine?: string
    websiteLine?: string
}

function setColor(pdf: JsPDF, color: readonly [number, number, number]) {
    pdf.setTextColor(color[0], color[1], color[2])
}

function setFill(pdf: JsPDF, color: readonly [number, number, number]) {
    pdf.setFillColor(color[0], color[1], color[2])
}

function drawCenteredFitText(pdf: JsPDF, text: string, x: number, y: number, opts: DrawTextOptions) {
    const minSize = opts.minSize || Math.max(8, opts.size - 10)
    let fontSize = opts.size

    pdf.setFont('helvetica', opts.style || 'bold')
    pdf.setFontSize(fontSize)
    while (fontSize > minSize && pdf.getTextWidth(text) > opts.maxWidth) {
        fontSize -= 1
        pdf.setFontSize(fontSize)
    }

    setColor(pdf, opts.color || BLACK)
    pdf.text(text, x, y, { align: 'center', maxWidth: opts.maxWidth })
}

export function drawQrPosterPdf(pdf: JsPDF, {
    qrDataUrl,
    headline = 'SALTA LA CODA',
    scanText = 'SCANSIONA E PAGA QUI',
    pickupText = 'RITIRA AL BANCO',
    promoLine = QR_POSTER_PROMO_LINE,
    contactLine = QR_POSTER_CONTACT_LINE,
    websiteLine = QR_POSTER_WEBSITE_LINE,
}: QrPosterPdfOptions) {
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const centerX = pageW / 2

    setFill(pdf, PAPER)
    pdf.rect(0, 0, pageW, pageH, 'F')

    setFill(pdf, AMBER)
    pdf.rect(0, 0, pageW, 7, 'F')
    setFill(pdf, GREEN)
    pdf.rect(0, 7, pageW, 2, 'F')

    pdf.setDrawColor(245, 158, 11)
    pdf.setLineWidth(0.7)
    pdf.roundedRect(PAGE_MARGIN, 17, pageW - PAGE_MARGIN * 2, pageH - 34, 4, 4)

    drawCenteredFitText(pdf, headline.toUpperCase(), centerX, 42, {
        size: 55,
        minSize: 42,
        maxWidth: pageW - 24,
        color: BLACK,
    })

    const ctaX = 16
    const ctaY = 53
    const ctaW = pageW - ctaX * 2
    const ctaH = 20
    setFill(pdf, AMBER)
    pdf.roundedRect(ctaX, ctaY, ctaW, ctaH, 4, 4, 'F')
    drawCenteredFitText(pdf, scanText.toUpperCase(), centerX, ctaY + 13.8, {
        size: 29,
        minSize: 21,
        maxWidth: ctaW - 12,
        color: BLACK,
    })

    const qrSize = 148
    const qrX = (pageW - qrSize) / 2
    const qrY = 84
    setFill(pdf, [255, 255, 255])
    pdf.setDrawColor(8, 8, 8)
    pdf.setLineWidth(0.35)
    pdf.roundedRect(qrX - 6, qrY - 6, qrSize + 12, qrSize + 12, 3, 3, 'FD')
    pdf.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize, undefined, 'FAST')

    drawCenteredFitText(pdf, pickupText.toUpperCase(), centerX, qrY + qrSize + 24, {
        size: 31,
        minSize: 24,
        maxWidth: pageW - 30,
        color: BLACK,
    })

    drawCenteredFitText(pdf, promoLine, centerX, pageH - 35, {
        size: 13.5,
        minSize: 11,
        maxWidth: pageW - 34,
        color: SOFT_BLACK,
    })

    drawCenteredFitText(pdf, `${contactLine} | ${websiteLine}`, centerX, pageH - 23, {
        size: 12.5,
        minSize: 10,
        maxWidth: pageW - 34,
        color: SOFT_BLACK,
    })

    return pdf
}
