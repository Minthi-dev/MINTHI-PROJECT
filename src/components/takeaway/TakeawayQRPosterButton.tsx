import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FilePdf } from '@phosphor-icons/react'
import jsPDF from 'jspdf'
import { toast } from 'sonner'
import { createQrDataUrl } from '@/lib/qrCode'

interface Props {
    restaurantId: string
    restaurantName: string
    /** Optional override text. Defaults to "SALTA LA CODA". */
    headline?: string
    /** Optional override subtext. Defaults to helpful scan instructions. */
    subtext?: string
    variant?: 'outline' | 'default' | 'ghost'
    className?: string
    size?: 'sm' | 'default' | 'lg'
}

/**
 * One-click printable A4 poster with a huge QR code pointing to the public
 * takeaway menu. Designed to be readable from across the room — minimal text,
 * massive QR, high contrast.
 *
 * The QR image is generated locally in the browser so the poster can be
 * created reliably without sending the URL to an external QR service.
 */
export default function TakeawayQRPosterButton({
    restaurantId,
    restaurantName,
    headline = 'SALTA LA CODA',
    variant = 'outline',
    className,
    size = 'sm',
}: Props) {
    const [busy, setBusy] = useState(false)

    const download = async () => {
        if (busy) return
        setBusy(true)
        try {
            const url = `${window.location.origin}/client/takeaway/${restaurantId}`
            const qrDataUrl = await createQrDataUrl(url, 1400)

            const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
            const pageW = pdf.internal.pageSize.getWidth()   // 210mm
            const pageH = pdf.internal.pageSize.getHeight()  // 297mm

            // ─── Vertical rhythm ───
            // Computed up-front so we can guarantee no overlap. Every text
            // block reserves its own band of mm based on font size.
            const HEADLINE_Y = 50         // 60pt headline baseline
            const SUBLINE_Y = 78          // 32pt "SCANSIONA E PAGA QUI" baseline
            const QR_TOP = 92             // QR top
            const QR_SIZE = 130           // QR side (smaller than before → leaves room for footer)
            const QR_BOTTOM = QR_TOP + QR_SIZE                  // 222
            const PICKUP_Y = QR_BOTTOM + 22                     // 244 — 28pt "RITIRA AL BANCO"
            const PROMO_LINE_Y = PICKUP_Y + 22                  // 266 — 12pt promo question
            const CONTACT_Y = PROMO_LINE_Y + 14                 // 280 — 16pt phone + site
            const POWERED_Y = pageH - 8                         // 289 — 7pt hairline

            pdf.setFillColor(255, 255, 255)
            pdf.rect(0, 0, pageW, pageH, 'F')

            // Headline
            pdf.setTextColor(8, 8, 8)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(60)
            pdf.text(headline.toUpperCase(), pageW / 2, HEADLINE_Y, { align: 'center', maxWidth: pageW - 18 })

            // "Scansiona e paga qui" — bigger and bolder
            pdf.setTextColor(245, 158, 11)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(32)
            pdf.text('SCANSIONA E PAGA QUI', pageW / 2, SUBLINE_Y, { align: 'center', maxWidth: pageW - 18 })

            // QR
            const qrX = (pageW - QR_SIZE) / 2
            pdf.setFillColor(255, 255, 255)
            pdf.rect(qrX - 5, QR_TOP - 5, QR_SIZE + 10, QR_SIZE + 10, 'F')
            pdf.addImage(qrDataUrl, 'PNG', qrX, QR_TOP, QR_SIZE, QR_SIZE, undefined, 'FAST')

            // Pickup hint
            pdf.setTextColor(8, 8, 8)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(28)
            pdf.text('RITIRA AL BANCO', pageW / 2, PICKUP_Y, { align: 'center', maxWidth: pageW - 24 })

            // Thin separator line between content and promo footer
            pdf.setDrawColor(220, 220, 220)
            pdf.setLineWidth(0.3)
            pdf.line(40, PICKUP_Y + 8, pageW - 40, PICKUP_Y + 8)

            // Promo question — slightly more readable, still soft enough to
            // sit behind the phone+website (which stay the primary contact).
            // italic + medium grey + 13pt = legible from arm's length but
            // visually subordinate to the bold black contact row below.
            pdf.setTextColor(55, 55, 55)
            pdf.setFont('helvetica', 'italic')
            pdf.setFontSize(13)
            pdf.text('Vuoi anche tu questo sistema per il tuo locale?', pageW / 2, PROMO_LINE_Y, {
                align: 'center',
                maxWidth: pageW - 22,
            })

            // Phone + website on one line, well spaced
            pdf.setTextColor(8, 8, 8)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(16)
            pdf.text('351 757 0155     ·     minthi.it/info', pageW / 2, CONTACT_Y, {
                align: 'center',
                maxWidth: pageW - 16,
            })

            // Tiny hairline footer
            pdf.setTextColor(180, 180, 180)
            pdf.setFont('helvetica', 'normal')
            pdf.setFontSize(7)
            pdf.text('powered by MINTHI', pageW / 2, POWERED_Y, { align: 'center' })

            const safeName = (restaurantName || restaurantId).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'minthi'
            pdf.save(`qr-asporto-${safeName}.pdf`)
            toast.success('PDF del QR code scaricato')
        } catch (e: any) {
            console.error('[QR poster PDF] error', e)
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
            {busy ? 'Generazione...' : 'Scarica PDF'}
        </Button>
    )
}
