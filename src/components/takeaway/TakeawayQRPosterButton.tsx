import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FilePdf } from '@phosphor-icons/react'
import jsPDF from 'jspdf'
import { toast } from 'sonner'

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
 * The QR image is fetched from api.qrserver.com as a PNG data URL so it
 * embeds cleanly in the PDF (no blurry pixelation).
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

            // Fetch a high-resolution QR (1200x1200) for crisp A4 printing.
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=1200x1200&margin=0&format=png&data=${encodeURIComponent(url)}`
            const qrDataUrl = await fetchAsDataUrl(qrUrl)

            const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
            const pageW = pdf.internal.pageSize.getWidth()   // 210mm
            const pageH = pdf.internal.pageSize.getHeight()  // 297mm

            // --- Thick black border frame (easy to cut/mount) ---
            pdf.setDrawColor(15, 15, 15)
            pdf.setLineWidth(1.6)
            pdf.rect(8, 8, pageW - 16, pageH - 16)

            // --- Top label: restaurant name, small & understated ---
            pdf.setTextColor(90, 90, 90)
            pdf.setFont('helvetica', 'normal')
            pdf.setFontSize(14)
            pdf.text(restaurantName.toUpperCase(), pageW / 2, 26, { align: 'center' })

            // --- Headline: the big call-to-action ---
            pdf.setTextColor(10, 10, 10)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(56)
            pdf.text(headline, pageW / 2, 56, { align: 'center' })

            // --- Thin amber divider under headline ---
            pdf.setDrawColor(245, 158, 11)
            pdf.setLineWidth(1.4)
            pdf.line(pageW / 2 - 35, 64, pageW / 2 + 35, 64)

            // --- Big QR block centered ---
            const qrSize = 135 // mm — huge, visible from far
            const qrX = (pageW - qrSize) / 2
            const qrY = 80
            // Soft white backing (in case printer substitutes color)
            pdf.setFillColor(255, 255, 255)
            pdf.rect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8, 'F')
            pdf.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize, undefined, 'FAST')

            // --- Bottom line: instruction ---
            pdf.setTextColor(10, 10, 10)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(30)
            pdf.text('INQUADRA  •  ORDINA  •  RITIRA', pageW / 2, qrY + qrSize + 22, { align: 'center' })

            pdf.setTextColor(110, 110, 110)
            pdf.setFont('helvetica', 'normal')
            pdf.setFontSize(13)
            const sub = subtext || 'Apri la fotocamera e inquadra il codice. Il menu si apre da solo.'
            pdf.text(sub, pageW / 2, qrY + qrSize + 33, { align: 'center', maxWidth: pageW - 40 })

            // --- Footer: tiny branding with the URL for manual typing ---
            pdf.setTextColor(160, 160, 160)
            pdf.setFont('helvetica', 'normal')
            pdf.setFontSize(9)
            pdf.text(url, pageW / 2, pageH - 14, { align: 'center' })

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
