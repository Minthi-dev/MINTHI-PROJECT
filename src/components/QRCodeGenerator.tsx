import { useEffect, useState } from 'react'
import { createQrDataUrl } from '@/lib/qrCode'

interface QRCodeGeneratorProps {
  value: string
  size?: number
  className?: string
}

export default function QRCodeGenerator({ value, size = 256, className }: QRCodeGeneratorProps) {
  const [qrDataUrl, setQrDataUrl] = useState('')

  useEffect(() => {
    let mounted = true
    setQrDataUrl('')

    createQrDataUrl(value, Math.max(size * 3, 512))
      .then(dataUrl => {
        if (mounted) setQrDataUrl(dataUrl)
      })
      .catch(error => {
        console.error('[QRCodeGenerator] generation error:', error)
        if (mounted) setQrDataUrl('')
      })

    return () => {
      mounted = false
    }
  }, [value, size])

  if (!qrDataUrl) {
    return (
      <div
        aria-label="QR Code in generazione"
        className={`rounded-lg bg-white ${className || ''}`}
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <img
      src={qrDataUrl}
      alt="QR Code"
      width={size}
      height={size}
      className={`rounded-lg ${className || ''}`}
    />
  )
}
