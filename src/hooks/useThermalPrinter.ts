import { useState, useEffect, useCallback } from 'react'
import { thermalPrinter, type PrinterSettings } from '../services/ThermalPrinterService'
import type { Order } from '../services/types'

export function useThermalPrinter() {
  const [connected, setConnected] = useState(thermalPrinter.connected)
  const [settings, setSettings] = useState<PrinterSettings>(thermalPrinter.settings)

  // Sync React state with the singleton service
  useEffect(() => {
    const handler = () => {
      setConnected(thermalPrinter.connected)
      setSettings(thermalPrinter.settings)
    }
    thermalPrinter.addEventListener('change', handler)

    // Try to reconnect to a previously paired device on mount
    if (thermalPrinter.settings.enabled && !thermalPrinter.connected) {
      thermalPrinter.reconnect()
    }

    return () => thermalPrinter.removeEventListener('change', handler)
  }, [])

  const connect = useCallback(async () => {
    const ok = await thermalPrinter.connect()
    if (ok) thermalPrinter.updateSettings({ enabled: true })
    return ok
  }, [])

  const disconnect = useCallback(async () => {
    await thermalPrinter.disconnect()
    thermalPrinter.updateSettings({ enabled: false })
  }, [])

  const updateSettings = useCallback((patch: Partial<PrinterSettings>) => {
    thermalPrinter.updateSettings(patch)
  }, [])

  const printOrder = useCallback(async (
    order: Order,
    tableLabel: string,
    waiterName?: string
  ) => {
    await thermalPrinter.printKitchenOrder({ order, tableLabel, waiterName })
  }, [])

  const printTakeawayReceipt = useCallback(async (order: Order, restaurantName?: string) => {
    await thermalPrinter.printTakeawayReceipt({ order, restaurantName })
  }, [])

  const printTestPage = useCallback(async () => {
    await thermalPrinter.printTestPage()
  }, [])

  const printFiscalReceipt = useCallback(async (params: Parameters<typeof thermalPrinter.printFiscalReceipt>[0]) => {
    await thermalPrinter.printFiscalReceipt(params)
  }, [])

  return {
    isSupported: thermalPrinter.isSupported,
    connected,
    settings,
    connect,
    disconnect,
    updateSettings,
    printOrder,
    printTakeawayReceipt,
    printTestPage,
    printFiscalReceipt,
  }
}
