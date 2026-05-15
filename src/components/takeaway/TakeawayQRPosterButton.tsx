import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FilePdf } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { createQrDataUrl } from '@/lib/qrCode'
import { drawQrPosterPdf } from '@/utils/qrPosterPdf'
import { generateTakeawayMenuUrl } from '@/utils/qrUtils'

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
    subtext = 'SCANSIONA E PAGA QUI',
    variant = 'outline',
    className,
    size = 'sm',
}: Props) {
    const [busy, setBusy] = useState(false)

    const download = async () => {
        if (busy) return
        setBusy(true)
        try {
            const url = generateTakeawayMenuUrl(restaurantId)
            const qrDataUrl = await createQrDataUrl(url, 1400)
            const { jsPDF } = await import('jspdf')
            const pdf = drawQrPosterPdf(
                new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' }),
                { qrDataUrl, headline, scanText: subtext }
            )

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
