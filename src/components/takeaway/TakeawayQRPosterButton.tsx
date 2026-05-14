import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FilePdf } from '@phosphor-icons/react'
import jsPDF from 'jspdf'
import { toast } from 'sonner'
import { createQrDataUrl } from '@/lib/qrCode'

interface Props {
    restaurantId: string
    restaurantName: string
    /** Optional override text. Defaults to "ORDINA DA QUI". */
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
    headline = 'ORDINA DA QUI',
    subtext,
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

            pdf.setTextColor(90, 90, 90)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(10)
            pdf.text(restaurantName.toUpperCase(), pageW / 2, 19, { align: 'center', maxWidth: pageW - 30 })

            pdf.setTextColor(245, 158, 11)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(14)
            pdf.text(headline.toUpperCase(), pageW / 2, 39, { align: 'center', maxWidth: pageW - 34 })

            pdf.setTextColor(8, 8, 8)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(50)
            pdf.text('SALTA LA CODA', pageW / 2, 63, { align: 'center', maxWidth: pageW - 22 })

            pdf.setTextColor(18, 18, 18)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(20)
            pdf.text('PAGA DA QUI. RITIRI APPENA PRONTO.', pageW / 2, 82, {
                align: 'center',
                maxWidth: pageW - 26,
            })

            pdf.setTextColor(96, 96, 96)
            pdf.setFont('helvetica', 'normal')
            pdf.setFontSize(12)
            const sub = subtext || "Apri la fotocamera, inquadra il QR e completa l'ordine dal telefono."
            pdf.text(sub, pageW / 2, 92, { align: 'center', maxWidth: pageW - 34 })

            const qrSize = 124
            const qrX = (pageW - qrSize) / 2
            const qrY = 102
            pdf.setFillColor(255, 255, 255)
            pdf.rect(qrX - 5, qrY - 5, qrSize + 10, qrSize + 10, 'F')
            pdf.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize, undefined, 'FAST')

            pdf.setTextColor(8, 8, 8)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(23)
            pdf.text('INQUADRA  -  ORDINA  -  PAGA  -  RITIRA', pageW / 2, qrY + qrSize + 19, {
                align: 'center',
                maxWidth: pageW - 20,
            })

            pdf.setTextColor(95, 95, 95)
            pdf.setFont('helvetica', 'normal')
            pdf.setFontSize(12)
            pdf.text('Niente cassa: paghi online e passi solo per il ritiro.', pageW / 2, qrY + qrSize + 31, {
                align: 'center',
                maxWidth: pageW - 34,
            })

            pdf.setTextColor(30, 30, 30)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(12)
            pdf.text('Vuoi attivare il salta coda in altri eventi? Contatta 351 757 0155', pageW / 2, pageH - 20, {
                align: 'center',
                maxWidth: pageW - 30,
            })

            pdf.setTextColor(170, 170, 170)
            pdf.setFont('helvetica', 'normal')
            pdf.setFontSize(10)
            pdf.text('powered by minthi', pageW / 2, pageH - 9, { align: 'center' })

            const safeName = restaurantName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'minthi'
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
