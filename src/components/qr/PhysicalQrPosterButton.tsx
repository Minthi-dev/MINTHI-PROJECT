import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FilePdf } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { createQrDataUrl } from '@/lib/qrCode'
import { drawQrPosterPdf, QR_POSTER_CONTACT_LINE } from '@/utils/qrPosterPdf'
import { generatePhysicalQrUrl } from '@/utils/qrUtils'

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
const DEFAULT_CONTACT_LINE = QR_POSTER_CONTACT_LINE

/**
 * Printable A4 poster for a REUSABLE physical QR code. Encodes minthi.it/qr/{code}.
 * The same physical poster can be re-pointed to a different restaurant from
 * the admin panel — no reprint needed.
 *
 * Layout (top → bottom):
 *   - Huge headline
 *   - Massive QR centered in a clean print-safe frame
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
            const targetUrl = generatePhysicalQrUrl(code)
            const qrDataUrl = await createQrDataUrl(targetUrl, 1400)
            const { jsPDF } = await import('jspdf')
            const pdf = drawQrPosterPdf(
                new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' }),
                { qrDataUrl, headline, contactLine }
            )

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
