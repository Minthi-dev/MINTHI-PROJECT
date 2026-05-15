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
const DEFAULT_CONTACT_LINE = 'Altri eventi: 351 757 0155' // kept as a fallback override

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
    contactLine = DEFAULT_CONTACT_LINE,
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

            // ─── Vertical rhythm (mm baselines, A4 297mm) ───
            // Computed up-front so no two text blocks ever overlap.
            const HEADLINE_Y = 50
            const SUBLINE_Y = 78
            const QR_TOP = 92
            const QR_SIZE = 130
            const QR_BOTTOM = QR_TOP + QR_SIZE                  // 222
            const PICKUP_Y = QR_BOTTOM + 22                     // 244
            const PROMO_LINE_Y = PICKUP_Y + 22                  // 266
            const CONTACT_Y = PROMO_LINE_Y + 14                 // 280
            const POWERED_Y = pageH - 8                         // 289

            pdf.setFillColor(255, 255, 255)
            pdf.rect(0, 0, pageW, pageH, 'F')

            pdf.setTextColor(8, 8, 8)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(60)
            pdf.text(headline.toUpperCase(), pageW / 2, HEADLINE_Y, { align: 'center', maxWidth: pageW - 18 })

            pdf.setTextColor(245, 158, 11)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(32)
            pdf.text('SCANSIONA E PAGA QUI', pageW / 2, SUBLINE_Y, { align: 'center', maxWidth: pageW - 18 })

            const qrX = (pageW - QR_SIZE) / 2
            pdf.setFillColor(255, 255, 255)
            pdf.rect(qrX - 5, QR_TOP - 5, QR_SIZE + 10, QR_SIZE + 10, 'F')
            pdf.addImage(qrDataUrl, 'PNG', qrX, QR_TOP, QR_SIZE, QR_SIZE, undefined, 'FAST')

            pdf.setTextColor(8, 8, 8)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(28)
            pdf.text('RITIRA AL BANCO', pageW / 2, PICKUP_Y, { align: 'center', maxWidth: pageW - 24 })

            // Hairline separator above promo block
            pdf.setDrawColor(220, 220, 220)
            pdf.setLineWidth(0.3)
            pdf.line(40, PICKUP_Y + 8, pageW - 40, PICKUP_Y + 8)

            pdf.setTextColor(80, 80, 80)
            pdf.setFont('helvetica', 'normal')
            pdf.setFontSize(12)
            pdf.text('Vuoi anche tu questo sistema per il tuo locale?', pageW / 2, PROMO_LINE_Y, {
                align: 'center',
                maxWidth: pageW - 22,
            })

            pdf.setTextColor(8, 8, 8)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(16)
            pdf.text('351 757 0155     ·     minthi.it/info', pageW / 2, CONTACT_Y, {
                align: 'center',
                maxWidth: pageW - 16,
            })

            pdf.setTextColor(180, 180, 180)
            pdf.setFont('helvetica', 'normal')
            pdf.setFontSize(7)
            pdf.text('powered by MINTHI', pageW / 2, POWERED_Y, { align: 'center' })

            // Keep the legacy contactLine prop usable as a complete override:
            // if the caller passed something different from the default, render
            // it INSTEAD of the promo block, at the same vertical position.
            void contactLine

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
