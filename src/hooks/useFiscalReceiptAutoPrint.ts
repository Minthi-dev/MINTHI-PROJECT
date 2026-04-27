/**
 * useFiscalReceiptAutoPrint
 *
 * Polling-based auto-print: ogni ~15s chiediamo gli ultimi scontrini fiscali
 * del ristorante via edge function (service-role, RLS-safe). Quando vediamo
 * un nuovo scontrino in stato 'ready' che non abbiamo ancora stampato, lo
 * stampiamo sulla stampante termica collegata (se autoPrint è attivo).
 *
 * Questo permette al cassiere di lasciare la dashboard aperta in cassa e
 * vedere lo scontrino fiscale stampato pochi secondi dopo che il cliente
 * ha pagato con Stripe — esattamente come succederebbe con un registratore
 * telematico tradizionale.
 */
import { useEffect, useRef } from 'react'
import { thermalPrinter } from '@/services/ThermalPrinterService'
import { DatabaseService } from '@/services/DatabaseService'

const POLL_INTERVAL_MS = 15_000
// On first mount we ignore receipts older than this — we don't want to
// reprint historical ones the cashier has already handled.
const STARTUP_GRACE_MS = 90_000

export function useFiscalReceiptAutoPrint(
  restaurantId: string | null | undefined,
  restaurantName: string
) {
  const printedIds = useRef<Set<string>>(new Set())
  const startupAt = useRef<number>(Date.now())

  useEffect(() => {
    if (!restaurantId) return
    let cancelled = false
    startupAt.current = Date.now()

    const poll = async () => {
      if (cancelled) return
      // Skip when printer not connected or autoPrint off — saves bandwidth.
      if (!thermalPrinter.connected || !thermalPrinter.settings.autoPrint) return
      try {
        const receipts = await DatabaseService.getFiscalReceipts(restaurantId, 25)
        for (const r of receipts) {
          if (!r.id || r.openapi_status !== 'ready') continue
          if (printedIds.current.has(r.id)) continue
          // Initial pass: only consider receipts newer than the moment we
          // mounted, with a small grace window to account for clock skew.
          const readyAt = r.ready_at ? new Date(r.ready_at).getTime() : Date.now()
          if (readyAt + STARTUP_GRACE_MS < startupAt.current) {
            printedIds.current.add(r.id)
            continue
          }
          printedIds.current.add(r.id)
          try {
            await thermalPrinter.printFiscalReceipt({
              items: Array.isArray(r.items) ? r.items : [],
              cashAmount: Number(r.cash_payment_amount) || 0,
              electronicAmount: Number(r.electronic_payment_amount) || 0,
              ticketRestaurantAmount: Number(r.ticket_restaurant_amount) || 0,
              discountAmount: Number(r.discount_amount) || 0,
              totalAmount: Number(r.total_amount) || 0,
              documentNumber: (r.openapi_response as any)?.document_number
                || (r.openapi_response as any)?.data?.document_number,
              fiscalSerial: (r.openapi_response as any)?.fiscal_serial
                || (r.openapi_response as any)?.data?.fiscal_serial,
              issuedAt: r.ready_at || (r.openapi_response as any)?.issued_at,
              restaurantName,
              customerEmail: r.customer_email || undefined,
              customerLotteryCode: r.customer_lottery_code || undefined,
            })
          } catch (printErr) {
            console.error('[fiscal-auto-print] print error:', printErr)
            printedIds.current.delete(r.id) // allow retry next cycle
          }
        }
      } catch (err) {
        console.warn('[fiscal-auto-print] poll error:', err)
      }
    }

    poll()
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(interval) }
  }, [restaurantId, restaurantName])
}
