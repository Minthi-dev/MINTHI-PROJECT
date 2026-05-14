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

const DEFAULT_HEADLINE = 'SCANSIONA, ORDINA E PAGA'
const DEFAULT_SUBHEADLINE = 'SALTA LA CODA'
const DEFAULT_CONTACT_LINE = 'Vuoi attivare il salta coda in altri eventi? Contatta 351 757 0155'

/**
 * Printable A4 poster for a REUSABLE physical QR code. Encodes minthi.it/qr/{code}.
 * The same physical poster can be re-pointed to a different restaurant from
 * the admin panel — no reprint needed.
 *
 * Layout (top → bottom):
 *   - Big bold promise: pay here and skip the queue
 *   - Massive QR centered, no decorative frame
 *   - Short pickup instruction and visible promo footer
 */
export default function PhysicalQrPosterButton({
    code,
    restaurantName,
    label,
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

            pdf.setFillColor(255, 255, 255)
            pdf.rect(0, 0, pageW, pageH, 'F')

            if (restaurantName || label) {
                pdf.setTextColor(112, 112, 112)
                pdf.setFont('helvetica', 'bold')
                pdf.setFontSize(10)
                const top = [restaurantName, label].filter(Boolean).join(' / ').toUpperCase()
                pdf.text(top, pageW / 2, 19, { align: 'center', maxWidth: pageW - 30 })
            }

            pdf.setTextColor(245, 158, 11)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(14)
            pdf.text(headline.toUpperCase(), pageW / 2, 39, { align: 'center', maxWidth: pageW - 34 })

            pdf.setTextColor(8, 8, 8)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(50)
            pdf.text(DEFAULT_SUBHEADLINE, pageW / 2, 63, { align: 'center', maxWidth: pageW - 22 })

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
            pdf.text("Apri la fotocamera, inquadra il QR e completa l'ordine dal telefono.", pageW / 2, 92, {
                align: 'center',
                maxWidth: pageW - 34,
            })

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
            pdf.text(contactLine, pageW / 2, pageH - 20, { align: 'center', maxWidth: pageW - 30 })

            pdf.setTextColor(170, 170, 170)
            pdf.setFont('helvetica', 'normal')
            pdf.setFontSize(10)
            pdf.text('powered by minthi', pageW / 2, pageH - 9, { align: 'center' })

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
