import { useQuery } from '@tanstack/react-query'
import { QrCode } from 'lucide-react'
import { Navigate, useParams } from 'react-router-dom'
import { PublicMessage } from '@/features/customer/PublicLayout'
import { rpc } from '@/shared/lib/api'
import { Spinner } from '@/shared/ui/display'

export function QrRedirectPage() {
  const { code = '' } = useParams()
  const q = useQuery({ queryKey: ['qr', code], queryFn: async () => (await rpc('resolve_qr_code', { p_code: code })) as string | null })
  if (q.isLoading) return <Spinner className="min-h-dvh" />
  if (!q.data) return <PublicMessage icon={<QrCode className="size-6 text-muted-foreground" />} title="QR non attivo">Questo codice non è ancora collegato a nessun locale.</PublicMessage>
  return <Navigate to={`/asporto/${q.data}`} replace />
}
