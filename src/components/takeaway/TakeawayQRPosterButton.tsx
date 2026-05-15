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

            pdf.setFillColor(255, 255, 255)
            pdf.rect(0, 0, pageW, pageH, 'F')

            pdf.setTextColor(8, 8, 8)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(60)
            pdf.text(headline.toUpperCase(), pageW / 2, 48, { align: 'center', maxWidth: pageW - 18 })

            pdf.setTextColor(245, 158, 11)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(27)
            pdf.text('SCANSIONA E PAGA QUI', pageW / 2, 70, { align: 'center', maxWidth: pageW - 22 })

            const qrSize = 146
            const qrX = (pageW - qrSize) / 2
            const qrY = 86
            pdf.setFillColor(255, 255, 255)
            pdf.rect(qrX - 5, qrY - 5, qrSize + 10, qrSize + 10, 'F')
            pdf.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize, undefined, 'FAST')

            pdf.setTextColor(8, 8, 8)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(32)
            pdf.text('RITIRA AL BANCO', pageW / 2, qrY + qrSize + 25, { align: 'center', maxWidth: pageW - 24 })

            pdf.setTextColor(30, 30, 30)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(13)
            pdf.text('Altri eventi: 351 757 0155', pageW / 2, pageH - 17, { align: 'center', maxWidth: pageW - 28 })

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
