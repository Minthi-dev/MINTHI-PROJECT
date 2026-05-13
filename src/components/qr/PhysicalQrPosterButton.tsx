import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FilePdf } from '@phosphor-icons/react'
import jsPDF from 'jspdf'
import { toast } from 'sonner'

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
const DEFAULT_SUBHEADLINE = 'salta la coda'
const DEFAULT_CONTACT_LINE = 'Vuoi questo sistema al tuo evento? Contatta 351 757 0155'

/**
 * Printable A4 poster for a REUSABLE physical QR code. Encodes minthi.it/qr/{code}.
 * The same physical poster can be re-pointed to a different restaurant from
 * the admin panel — no reprint needed.
 *
 * Layout (top → bottom):
 *   • Big bold headline: "Scansiona, ordina e paga" + "salta la coda"
 *   • Massive QR centered with amber accent frame
 *   • Tagline: "INQUADRA • ORDINA • RITIRA"
 *   • Subtle minthi branding
 *   • Tiny contact footer (with the configurable phone CTA)
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

            // High-res QR for crisp print
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=1200x1200&margin=0&format=png&data=${encodeURIComponent(targetUrl)}`
            const qrDataUrl = await fetchAsDataUrl(qrUrl)

            const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
            const pageW = pdf.internal.pageSize.getWidth()   // 210mm
            const pageH = pdf.internal.pageSize.getHeight()  // 297mm

            // --- Outer frame ---
            pdf.setDrawColor(15, 15, 15)
            pdf.setLineWidth(1.6)
            pdf.rect(8, 8, pageW - 16, pageH - 16)

            // --- Optional restaurant hint at top (tiny / muted) ---
            if (restaurantName || label) {
                pdf.setTextColor(120, 120, 120)
                pdf.setFont('helvetica', 'normal')
                pdf.setFontSize(11)
                const top = [restaurantName, label].filter(Boolean).join('  •  ')
                pdf.text(top, pageW / 2, 24, { align: 'center' })
            }

            // --- Big headline (split in 2 lines for impact) ---
            pdf.setTextColor(10, 10, 10)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(38)
            pdf.text(headline, pageW / 2, 50, { align: 'center', maxWidth: pageW - 30 })

            pdf.setTextColor(245, 158, 11)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(52)
            pdf.text(DEFAULT_SUBHEADLINE.toUpperCase(), pageW / 2, 76, { align: 'center' })

            // --- Amber divider ---
            pdf.setDrawColor(245, 158, 11)
            pdf.setLineWidth(1.6)
            pdf.line(pageW / 2 - 40, 84, pageW / 2 + 40, 84)

            // --- QR centered, large, with double frame ---
            const qrSize = 125 // mm
            const qrX = (pageW - qrSize) / 2
            const qrY = 100
            // amber outer accent
            pdf.setDrawColor(245, 158, 11)
            pdf.setLineWidth(2.0)
            pdf.rect(qrX - 6, qrY - 6, qrSize + 12, qrSize + 12)
            // white inner backing
            pdf.setFillColor(255, 255, 255)
            pdf.rect(qrX - 3, qrY - 3, qrSize + 6, qrSize + 6, 'F')
            pdf.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize, undefined, 'FAST')

            // --- Tagline under QR ---
            pdf.setTextColor(10, 10, 10)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(26)
            pdf.text('INQUADRA  •  ORDINA  •  RITIRA', pageW / 2, qrY + qrSize + 22, { align: 'center' })

            // --- Hint: how to scan ---
            pdf.setTextColor(110, 110, 110)
            pdf.setFont('helvetica', 'normal')
            pdf.setFontSize(12)
            pdf.text(
                'Apri la fotocamera del telefono e inquadra il codice. Il menu si apre da solo.',
                pageW / 2, qrY + qrSize + 32, { align: 'center', maxWidth: pageW - 40 }
            )

            // --- minthi branding (subtle, above contact CTA) ---
            pdf.setTextColor(180, 180, 180)
            pdf.setFont('helvetica', 'normal')
            pdf.setFontSize(10)
            pdf.text('powered by  minthi', pageW / 2, pageH - 28, { align: 'center' })

            // --- Contact CTA at bottom (small but readable) ---
            pdf.setTextColor(80, 80, 80)
            pdf.setFont('helvetica', 'italic')
            pdf.setFontSize(11)
            pdf.text(contactLine, pageW / 2, pageH - 18, { align: 'center', maxWidth: pageW - 30 })

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

async function fetchAsDataUrl(url: string): Promise<string> {
    const res = await fetch(url, { cache: 'force-cache' })
    if (!res.ok) throw new Error(`QR fetch fallito (${res.status})`)
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
    })
}
