// Stampante termica del dispositivo: WebUSB (cavo) oppure rete tramite printer-relay.js.
// Le impostazioni sono per dispositivo (localStorage): ogni tablet ha la sua stampante.

export interface PrinterSettings {
  mode: 'off' | 'usb' | 'network'
  relayUrl: string
  columns: 48 | 32
  autoPrintKitchen: boolean
  autoPrintTakeaway: boolean
}

const KEY = 'minthi-printer'
const DEFAULTS: PrinterSettings = { mode: 'off', relayUrl: 'ws://localhost:8765', columns: 48, autoPrintKitchen: false, autoPrintTakeaway: false }

/* eslint-disable @typescript-eslint/no-explicit-any */
type USBDeviceLike = any

class PrinterService {
  settings: PrinterSettings = DEFAULTS
  private device: USBDeviceLike = null
  private endpoint = 1
  private ws: WebSocket | null = null
  private listeners = new Set<() => void>()

  constructor() {
    try {
      this.settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
    } catch { /* default */ }
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  private notify() {
    this.listeners.forEach((fn) => fn())
  }

  get usbSupported() {
    return typeof navigator !== 'undefined' && 'usb' in navigator
  }
  get connected() {
    if (this.settings.mode === 'usb') return !!this.device?.opened
    if (this.settings.mode === 'network') return this.ws?.readyState === WebSocket.OPEN
    return false
  }

  update(patch: Partial<PrinterSettings>) {
    this.settings = { ...this.settings, ...patch }
    try {
      localStorage.setItem(KEY, JSON.stringify(this.settings))
    } catch { /* ignora */ }
    this.notify()
  }

  async connect(interactive = true): Promise<boolean> {
    if (this.settings.mode === 'usb') return this.connectUsb(interactive)
    if (this.settings.mode === 'network') return this.connectWs()
    return false
  }

  private async connectUsb(interactive: boolean) {
    const usb = (navigator as any).usb
    if (!usb) return false
    try {
      let device = this.device
      if (!device) {
        const known = await usb.getDevices()
        device = known[0] ?? (interactive ? await usb.requestDevice({ filters: [{ vendorId: 0x04b8 }, { vendorId: 0x0dd4 }, { vendorId: 0x0519 }, { vendorId: 0x0fe6 }, { vendorId: 0x20d1 }, { classCode: 7 }] }) : null)
      }
      if (!device) return false
      if (!device.opened) await device.open()
      if (device.configuration === null) await device.selectConfiguration(1)
      for (const iface of device.configuration.interfaces) {
        for (const alt of iface.alternates) {
          const ep = alt.endpoints.find((e: any) => e.direction === 'out' && e.type === 'bulk')
          if (ep) {
            await device.claimInterface(iface.interfaceNumber)
            this.endpoint = ep.endpointNumber
            this.device = device
            usb.addEventListener('disconnect', (e: any) => { if (e.device === this.device) { this.device = null; this.notify() } })
            this.notify()
            return true
          }
        }
      }
      throw new Error('Stampante USB non compatibile')
    } catch (e: any) {
      if (e?.name !== 'NotFoundError') console.error('[printer] usb', e)
      return false
    }
  }

  private connectWs(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        this.ws?.close()
        const ws = new WebSocket(this.settings.relayUrl)
        ws.binaryType = 'arraybuffer'
        const timer = setTimeout(() => { ws.close(); resolve(false) }, 4000)
        ws.onopen = () => { clearTimeout(timer); this.ws = ws; this.notify(); resolve(true) }
        ws.onclose = () => { this.ws = null; this.notify() }
        ws.onerror = () => { clearTimeout(timer); resolve(false) }
      } catch {
        resolve(false)
      }
    })
  }

  async print(data: Uint8Array): Promise<void> {
    if (this.settings.mode === 'off') throw new Error('Nessuna stampante configurata su questo dispositivo.')
    if (!this.connected && !(await this.connect(false))) throw new Error('Stampante non raggiungibile: controlla che sia accesa e collegata.')
    if (this.settings.mode === 'usb') {
      for (let i = 0; i < data.length; i += 4096) await this.device.transferOut(this.endpoint, data.slice(i, i + 4096))
    } else {
      this.ws!.send(data)
    }
  }
}

export const printer = new PrinterService()
