import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FilePdf } from '@phosphor-icons/react'
import jsPDF from 'jspdf'
import { toast } from 'sonner'
import { createQrDataUrl } from '@/lib/qrCode'

interface Props {
    /** Slug encoded in the QR (e.g. "abc123"). The QR will encode minthi.it/qr/{code}. */
    code: string
    /** Optional restaurant name (just for filename / on-poster hint). */
    restaurantName?: string | null
    /** Optional small label set in admin (e.g. "Tavolo 3 Roma"). */
    label?: string | null
    variant?: 'outline' | 'default' | 'ghost'
    className?: string
    size?: 'sm' | 'default' | 'lg'
    /** Override the call-to-action above the QR. */
    headline?: string
    /** Override the small contact line below the QR. */
    contactLine?: string
}

const DEFAULT_HEADLINE = 'SALTA LA CODA'
const DEFAULT_PROMO_HEADLINE = 'Vuoi anche tu questo sistema per il tuo locale?'
const DEFAULT_PHONE = '351 757 0155'
const DEFAULT_WEBSITE = 'minthi.it/info'

/**
 * Printable A4 poster for a REUSABLE physical QR code. Encodes minthi.it/qr/{code}.
 * The same physical poster can be re-pointed to a different restaurant from
 * the admin panel — no reprint needed.
 *
 * Layout (top → bottom):
 *   - Huge headline
 *   - Massive QR centered, no decorative frame
 *   - One pickup line and one compact promo footer
 */
export default function PhysicalQrPosterButton({
    code,
    restaurantName,
    variant = 'outline',
    className,
    size = 'sm',
    headline = DEFAULT_HEADLINE,
}: Props) {
    const [busy, setBusy] = useState(false)

    const download = async () => {
        if (busy) return
        setBusy(true)
        try {
            const baseUrl = (typeof window !== 'undefined' && window.location?.origin) || 'https://minthi.it'
            const targetUrl = `${baseUrl}/qr/${code}`
            const qrDataUrl = await createQrDataUrl(targetUrl, 1400)

            const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
            const pageW = pdf.internal.pageSize.getWidth()   // 210mm
            const pageH = pdf.internal.pageSize.getHeight()  // 297mm

            // White background
            pdf.setFillColor(255, 255, 255)
            pdf.rect(0, 0, pageW, pageH, 'F')

            // Top headline
            pdf.setTextColor(8, 8, 8)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(64)
            pdf.text(headline.toUpperCase(), pageW / 2, 50, { align: 'center', maxWidth: pageW - 18 })

            // "SCANSIONA E PAGA QUI" — bigger and bolder per user request
            pdf.setTextColor(245, 158, 11)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(36)
            pdf.text('SCANSIONA E PAGA QUI', pageW / 2, 78, { align: 'center', maxWidth: pageW - 18 })

            // QR — slightly larger, centered
            const qrSize = 150
            const qrX = (pageW - qrSize) / 2
            const qrY = 96
            pdf.setFillColor(255, 255, 255)
            pdf.rect(qrX - 5, qrY - 5, qrSize + 10, qrSize + 10, 'F')
            pdf.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize, undefined, 'FAST')

            // Below QR: pickup hint
            pdf.setTextColor(8, 8, 8)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(28)
            pdf.text('RITIRA AL BANCO', pageW / 2, qrY + qrSize + 20, { align: 'center', maxWidth: pageW - 24 })

            // Promo block at the bottom
            const promoY = pageH - 38

            pdf.setTextColor(60, 60, 60)
            pdf.setFont('helvetica', 'normal')
            pdf.setFontSize(11)
            pdf.text(DEFAULT_PROMO_HEADLINE, pageW / 2, promoY, { align: 'center', maxWidth: pageW - 24 })

            // Phone + website on the same row
            pdf.setTextColor(8, 8, 8)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(14)
            pdf.text(`${DEFAULT_PHONE}   ·   ${DEFAULT_WEBSITE}`, pageW / 2, promoY + 9, {
                align: 'center',
                maxWidth: pageW - 20,
            })

            // Very small footer
            pdf.setTextColor(160, 160, 160)
            pdf.setFont('helvetica', 'normal')
            pdf.setFontSize(8)
            pdf.text('powered by MINTHI', pageW / 2, pageH - 8, { align: 'center' })

            const safeName = (restaurantName || code).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'minthi'
            pdf.save(`qr-minthi-${safeName}-${code}.pdf`)
            toast.success('PDF del QR code scaricato')
        } catch (e: any) {
            console.error('[Physical QR poster PDF] error', e)
            toast.error(e?.message || 'Impossibile generare il PDF')
        } finally {
            setBusy(false)
        }
    }

    return (
        <Button
            onClick={download}
            disabled={busy}
            variant={variant}
            size={size}
            className={className}
        >
            <FilePdf size={14} className="mr-1" />
            {busy ? 'Generazione...' : 'Stampa QR'}
        </Button>
    )
}
