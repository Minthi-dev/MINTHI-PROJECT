import { useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/AuthProvider'
import { errorMessage } from '@/shared/lib/errors'
import { printer } from './printer'
import { billTicket, kitchenTicket, takeawayTicket, testTicket, type TicketItem } from './templates'

export function usePrinter() {
  const { current } = useAuth()
  const version = useSyncExternalStore(
    (cb) => printer.subscribe(cb),
    () => `${printer.settings.mode}|${printer.connected}|${JSON.stringify(printer.settings)}`,
  )
  const cols = printer.settings.columns
  const run = async (data: Uint8Array, ok = 'Inviato alla stampante') => {
    try {
      await printer.print(data)
      toast.success(ok)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  return {
    version,
    settings: printer.settings,
    configured: printer.settings.mode !== 'off',
    connected: printer.connected,
    usbSupported: printer.usbSupported,
    update: (p: Partial<typeof printer.settings>) => printer.update(p),
    connect: () => printer.connect(true),
    test: () => run(testTicket(cols)),
    printBill: (b: { lines: { label: string; quantity: number; total: number; includedInAyce?: boolean }[]; total: number; paid: number; due: number; guests: number }, title: string) =>
      run(billTicket({ restaurant: current?.restaurantName ?? '', title, lines: b.lines.filter((l) => !l.includedInAyce), total: b.total, paid: b.paid, due: b.due, guests: b.guests }, cols)),
    printKitchen: (title: string, items: TicketItem[], subtitle?: string) => run(kitchenTicket({ title, items, subtitle }, cols), 'Comanda stampata'),
    printTakeaway: (o: Omit<Parameters<typeof takeawayTicket>[0], 'restaurant'>) => run(takeawayTicket({ ...o, restaurant: current?.restaurantName ?? '' }, cols)),
  }
}
