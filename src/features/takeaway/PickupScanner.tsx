import { Camera, ScanLine } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Dialog, DialogContent } from '@/shared/ui/overlay'
import { useFindPickup } from './queries'

/** Ritiro: scansione QR del cliente o inserimento codice/numero. */
export function PickupScanner({ open, onClose, onFound }: { open: boolean; onClose: () => void; onFound: (orderId: string) => void }) {
  const [code, setCode] = useState('')
  const [camera, setCamera] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const find = useFindPickup()

  const lookup = async (value: string) => {
    setNotFound(false)
    const res = await find.mutateAsync(value)
    if (res?.id) {
      setCamera(false)
      setCode('')
      onFound(res.id)
    } else setNotFound(true)
  }

  useEffect(() => {
    if (!open || !camera || !video.current) return
    let stop: (() => void) | undefined
    let cancelled = false
    import('@zxing/browser').then(async ({ BrowserQRCodeReader }) => {
      const reader = new BrowserQRCodeReader()
      const controls = await reader.decodeFromVideoDevice(undefined, video.current!, (result) => {
        if (result && !cancelled) {
          cancelled = true
          controls.stop()
          void lookup(result.getText())
        }
      })
      stop = () => controls.stop()
      if (cancelled) stop()
    }).catch(() => setCamera(false))
    return () => { cancelled = true; stop?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, camera])

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setCamera(false); onClose() } }}>
      <DialogContent title="Ritiro ordine" description="Inquadra il QR del cliente oppure inserisci codice o numero." size="sm">
        <div className="grid gap-4">
          {camera ? (
            <div className="relative overflow-hidden rounded-xl bg-black">
              <video ref={video} className="aspect-square w-full object-cover" muted playsInline />
              <ScanLine className="absolute inset-0 m-auto size-40 text-white/70" strokeWidth={1} />
            </div>
          ) : (
            <Button variant="outline" size="lg" onClick={() => setCamera(true)}><Camera />Usa la fotocamera</Button>
          )}
          <form onSubmit={(e) => { e.preventDefault(); if (code.trim()) void lookup(code.trim()) }} className="flex gap-2">
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Codice o numero (es. K7P3QA o 12)" autoFocus={!camera} />
            <Button type="submit" loading={find.isPending}>Cerca</Button>
          </form>
          {notFound && <p className="text-sm text-danger">Nessun ordine trovato con questo codice.</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
