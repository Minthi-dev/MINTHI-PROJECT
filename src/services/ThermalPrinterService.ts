/**
 * ThermalPrinterService — Epson TM-T20III, Custom and compatible printers
 * Supports two connection modes:
 *   - 'usb'     : WebUSB (stampante collegata via cavo USB al PC)
 *   - 'network' : WebSocket → printer-relay.js → TCP 9100 (stampante WiFi/LAN)
 */

import type { Order } from './types'

// --- ESC/POS / CUSTOM Constants ---
const ESC = 0x1B
const GS  = 0x1D
const LF  = 0x0A

const CMD = {
  RESET:        [ESC, 0x40],
  CODEPAGE_858: [ESC, 0x74, 19],               // CP858: Italian + €
  BOLD_ON:      [ESC, 0x45, 1],
  BOLD_OFF:     [ESC, 0x45, 0],
  ALIGN_LEFT:   [ESC, 0x61, 0],
  ALIGN_CENTER: [ESC, 0x61, 1],
  SIZE_NORMAL:  [GS, 0x21, 0x00],
  SIZE_DOUBLE:  [GS, 0x21, 0x11],
  SIZE_WIDE:    [GS, 0x21, 0x10],
  SIZE_TALL:    [GS, 0x21, 0x01],
  FEED_CUT:     [GS, 0x56, 66, 3],
  CUSTOM_CUT:   [GS, 0x56, 0],
  FEED_LINES:   (n: number) => [ESC, 0x64, n],
}

// CP858: Italian/European characters
const CP858: Record<string, number> = {
  'à': 0x85, 'è': 0x8A, 'é': 0x82, 'ì': 0x8D, 'ò': 0x95, 'ù': 0x97,
  'á': 0xA0, 'í': 0xA1, 'ó': 0xA2, 'ú': 0xA3,
  'À': 0xB7, 'È': 0xD4, 'É': 0x90, 'Ì': 0xDE, 'Ò': 0xE3, 'Ù': 0xEB,
  'Á': 0xB5, 'ñ': 0xA4, 'Ñ': 0xA5,
  '€': 0xD5, '°': 0xF8, '£': 0x9C, '©': 0xB8,
}

const COLS = 48 // Characters per line on 80mm paper (Font A)

// --- Types ---
export type PrinterMode = 'usb' | 'network'
export type PrinterProtocol = 'escpos' | 'custom'

export interface PrinterSettings {
  enabled: boolean
  mode: PrinterMode
  protocol: PrinterProtocol
  networkRelayUrl: string  // es. "ws://localhost:8765"
  autoPrint: boolean
  autoCut: boolean
  courseSeparate: boolean
}

const DEFAULT_SETTINGS: PrinterSettings = {
  enabled: false,
  mode: 'usb',
  protocol: 'escpos',
  networkRelayUrl: 'ws://localhost:8765',
  autoPrint: true,
  autoCut: true,
  courseSeparate: false,
}

const STORAGE_KEY = 'minthi_printer_settings'

// WebUSB type declarations
declare global {
  interface Navigator { usb: USB }
  interface USB {
    requestDevice(options: { filters: any[] }): Promise<any>
    getDevices(): Promise<any[]>
    addEventListener(type: string, listener: (e: any) => void): void
    removeEventListener(type: string, listener: (e: any) => void): void
  }
}

// --- Service ---
class ThermalPrinterService extends EventTarget {
  // USB state
  private usbDevice: any = null
  private usbEndpoint: number = 1
  private usbInterfaceNumber: number = 0
  private usbDisconnectHandler: ((e: any) => void) | null = null

  // Network (WebSocket relay) state
  private ws: WebSocket | null = null
  private wsConnected = false
  private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null

  // Shared
  private printQueue: (() => Promise<void>)[] = []
  private printing = false
  private _settings: PrinterSettings

  constructor() {
    super()
    this._settings = this._loadSettings()
  }

  // ========== Public API ==========

  get isSupported(): boolean {
    if (this._settings.mode === 'network') return typeof WebSocket !== 'undefined'
    return typeof navigator !== 'undefined' && !!navigator.usb
  }

  get connected(): boolean {
    if (this._settings.mode === 'network') return this.wsConnected
    return !!this.usbDevice?.opened
  }

  get settings(): PrinterSettings {
    return { ...this._settings }
  }

  updateSettings(patch: Partial<PrinterSettings>): void {
    const prev = this._settings
    this._settings = { ...prev, ...patch }
    this._saveSettings()

    // If mode changed, disconnect old connection
    if (patch.mode && patch.mode !== prev.mode) {
      if (prev.mode === 'usb') this._usbDisconnect()
      if (prev.mode === 'network') this._wsDisconnect()
    }

    // If relay URL changed, reconnect
    if (patch.networkRelayUrl && patch.networkRelayUrl !== prev.networkRelayUrl && this._settings.mode === 'network') {
      this._wsDisconnect()
      if (this._settings.enabled) this._wsConnect()
    }

    this._notify()
  }

  /** Connect (requires user gesture for USB mode) */
  async connect(): Promise<boolean> {
    if (this._settings.mode === 'network') {
      return this._wsConnect()
    }
    return this._usbConnect()
  }

  /** Try to reconnect without user gesture */
  async reconnect(): Promise<boolean> {
    if (this._settings.mode === 'network') {
      if (this.wsConnected) return true
      return this._wsConnect()
    }
    return this._usbReconnect()
  }

  async disconnect(): Promise<void> {
    if (this._settings.mode === 'network') {
      this._wsDisconnect()
    } else {
      await this._usbDisconnect()
    }
    this._notify()
  }

  async printKitchenOrder(params: { order: Order; tableLabel: string; waiterName?: string }): Promise<void> {
    await this._enqueue(() => this._printKitchenOrder(params))
  }

  async printTakeawayReceipt(params: { order: Order; restaurantName?: string }): Promise<void> {
    await this._enqueue(() => this._printTakeawayReceipt(params))
  }

  async printTestPage(): Promise<void> {
    await this._enqueue(() => this._printTestPage())
  }

  // ========== USB Implementation ==========

  private async _usbConnect(): Promise<boolean> {
    if (!navigator.usb) return false
    try {
      const device = await navigator.usb.requestDevice({
        filters: [
          { vendorId: 0x04B8 }, // Epson
          { vendorId: 0x0519 }, // Star Micronics
          { vendorId: 0x0DD4 }, // Custom
          { vendorId: 0x0FE6 }, // ICS / POS-X
          { vendorId: 0x20D1 }, // MUNBYN / generic POS
          { vendorId: 0x0483 }, // STMicroelectronics
          { classCode: 7 },     // USB Printer class (any brand)
        ]
      })
      await this._usbOpenDevice(device)
      return true
    } catch (e: any) {
      if (e.name !== 'NotFoundError') console.error('USB connect error:', e)
      return false
    }
  }

  private async _usbReconnect(): Promise<boolean> {
    if (!navigator.usb || this.usbDevice?.opened) return !!this.usbDevice?.opened
    try {
      const devices = await navigator.usb.getDevices()
      if (devices.length > 0) {
        await this._usbOpenDevice(devices[0])
        return true
      }
    } catch (e) {
      console.warn('USB reconnect failed:', e)
    }
    return false
  }

  private async _usbDisconnect(): Promise<void> {
    this._usbRemoveDisconnectListener()
    if (this.usbDevice?.opened) {
      try { await this.usbDevice.close() } catch { /* ignore */ }
    }
    this.usbDevice = null
  }

  private _usbRemoveDisconnectListener(): void {
    if (this.usbDisconnectHandler && navigator.usb) {
      navigator.usb.removeEventListener('disconnect', this.usbDisconnectHandler)
      this.usbDisconnectHandler = null
    }
  }

  private async _usbOpenDevice(device: any): Promise<void> {
    await device.open()
    if (device.configuration === null) await device.selectConfiguration(1)

    let chosen: { interfaceNumber: number; alternateSetting: number; endpointNumber: number } | null = null
    for (const iface of device.configuration!.interfaces || []) {
      for (const alt of iface.alternates || []) {
        const ep = (alt.endpoints || []).find((e: any) => e.direction === 'out' && e.type === 'bulk')
        if (ep) {
          chosen = {
            interfaceNumber: iface.interfaceNumber,
            alternateSetting: alt.alternateSetting ?? 0,
            endpointNumber: ep.endpointNumber,
          }
          break
        }
      }
      if (chosen) break
    }

    if (!chosen) throw new Error('Endpoint USB bulk OUT non trovato')

    await device.claimInterface(chosen.interfaceNumber)
    if (chosen.alternateSetting && typeof device.selectAlternateInterface === 'function') {
      await device.selectAlternateInterface(chosen.interfaceNumber, chosen.alternateSetting)
    }

    this.usbInterfaceNumber = chosen.interfaceNumber
    this.usbEndpoint = chosen.endpointNumber
    this.usbDevice = device

    this._usbRemoveDisconnectListener()
    this.usbDisconnectHandler = (e: any) => {
      if (e.device === this.usbDevice) {
        this.usbDevice = null
        this.usbDisconnectHandler = null
        this._notify()
      }
    }
    navigator.usb.addEventListener('disconnect', this.usbDisconnectHandler)
    this._notify()
  }

  // ========== Network (WebSocket relay) Implementation ==========

  private _wsConnect(): Promise<boolean> {
    return new Promise((resolve) => {
      // Clear any pending reconnect
      if (this.wsReconnectTimer) {
        clearTimeout(this.wsReconnectTimer)
        this.wsReconnectTimer = null
      }

      // Close existing socket
      if (this.ws) {
        try { this.ws.close() } catch { /* ignore */ }
        this.ws = null
      }

      const url = this._settings.networkRelayUrl || 'ws://localhost:8765'
      let resolved = false

      try {
        const ws = new WebSocket(url)
        ws.binaryType = 'arraybuffer'

        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true
            ws.close()
            resolve(false)
          }
        }, 5000)

        ws.onopen = () => {
          clearTimeout(timeout)
          this.ws = ws
          this.wsConnected = true
          this._notify()
          if (!resolved) { resolved = true; resolve(true) }
        }

        ws.onclose = () => {
          this.wsConnected = false
          this.ws = null
          this._notify()
          if (!resolved) { resolved = true; resolve(false) }
          // Auto-reconnect after 3s if enabled
          if (this._settings.enabled && this._settings.mode === 'network') {
            this.wsReconnectTimer = setTimeout(() => this._wsConnect(), 3000)
          }
        }

        ws.onerror = () => {
          clearTimeout(timeout)
          this.wsConnected = false
          if (!resolved) { resolved = true; resolve(false) }
        }
      } catch (e) {
        resolve(false)
      }
    })
  }

  private _wsDisconnect(): void {
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer)
      this.wsReconnectTimer = null
    }
    if (this.ws) {
      // Null out handlers BEFORE close to prevent onclose from scheduling auto-reconnect
      this.ws.onopen = null
      this.ws.onclose = null
      this.ws.onerror = null
      try { this.ws.close() } catch { /* ignore */ }
      this.ws = null
    }
    this.wsConnected = false
  }

  // ========== ESC/POS Print Logic ==========

  private async _printKitchenOrder({ order, tableLabel, waiterName }: {
    order: Order; tableLabel: string; waiterName?: string
  }): Promise<void> {
    const items = order.items || []
    const time = new Date(order.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    const buf: number[] = []

    buf.push(...CMD.RESET, ...CMD.CODEPAGE_858)

    // Header
    buf.push(...CMD.ALIGN_CENTER, ...CMD.SIZE_DOUBLE, ...CMD.BOLD_ON)
    buf.push(...this._text('COMANDA'))
    buf.push(...CMD.SIZE_NORMAL, ...CMD.BOLD_OFF)
    buf.push(...this._text(this._line('=')))

    // Table + time
    buf.push(...CMD.ALIGN_LEFT, ...CMD.SIZE_WIDE, ...CMD.BOLD_ON)
    buf.push(...this._text(`TAV. ${tableLabel}`))
    buf.push(...CMD.SIZE_NORMAL, ...CMD.BOLD_OFF)
    buf.push(...this._text(`Ore: ${time}`))
    if (waiterName) buf.push(...this._text(`Cam: ${waiterName}`))
    buf.push(...this._text(this._line('-')))

    // Group by course
    const courses = new Map<number, typeof items>()
    for (const item of items) {
      const c = item.course_number ?? 1
      if (!courses.has(c)) courses.set(c, [])
      courses.get(c)!.push(item)
    }

    const sortedCourses = [...courses.entries()].sort((a, b) => a[0] - b[0])
    const hasCourses = sortedCourses.length > 1 || (sortedCourses.length === 1 && sortedCourses[0][0] > 1)

    if (this._settings.courseSeparate && hasCourses) {
      for (let i = 0; i < sortedCourses.length; i++) {
        const [courseNum, courseItems] = sortedCourses[i]
        if (i > 0) {
          buf.push(...this._cut())
          buf.push(...CMD.RESET, ...CMD.CODEPAGE_858)
          buf.push(...CMD.ALIGN_CENTER, ...CMD.SIZE_DOUBLE, ...CMD.BOLD_ON)
          buf.push(...this._text('COMANDA'))
          buf.push(...CMD.SIZE_NORMAL, ...CMD.BOLD_OFF)
          buf.push(...this._text(this._line('=')))
          buf.push(...CMD.ALIGN_LEFT, ...CMD.SIZE_WIDE, ...CMD.BOLD_ON)
          buf.push(...this._text(`TAV. ${tableLabel}`))
          buf.push(...CMD.SIZE_NORMAL, ...CMD.BOLD_OFF)
          buf.push(...this._text(`Ore: ${time}`))
          buf.push(...this._text(this._line('-')))
        }
        buf.push(...CMD.BOLD_ON)
        buf.push(...this._text(`--- PORTATA ${courseNum} ---`))
        buf.push(...CMD.BOLD_OFF)
        this._appendItems(buf, courseItems)
        buf.push(...this._text(''))
      }
    } else {
      for (const [courseNum, courseItems] of sortedCourses) {
        if (hasCourses) {
          buf.push(...CMD.BOLD_ON)
          buf.push(...this._text(`--- PORTATA ${courseNum} ---`))
          buf.push(...CMD.BOLD_OFF)
        }
        this._appendItems(buf, courseItems)
        buf.push(...this._text(''))
      }
    }

    buf.push(...this._text(this._line('=')))
    buf.push(...CMD.FEED_LINES(2))
    if (this._settings.autoCut) buf.push(...this._cut())

    await this._send(new Uint8Array(buf))
  }

  private _appendItems(buf: number[], items: NonNullable<Order['items']>): void {
    for (const item of items) {
      const name = item.dish?.name || `Piatto #${item.dish_id.slice(0, 6)}`
      buf.push(...CMD.SIZE_TALL, ...CMD.BOLD_ON)
      for (const line of this._wrapText(`${item.quantity}x  ${name}`, COLS - 1)) {
        buf.push(...this._text(` ${line}`))
      }
      buf.push(...CMD.SIZE_NORMAL, ...CMD.BOLD_OFF)
      if (item.note) {
        for (const line of this._wrapText(String(item.note), COLS - 7)) {
          buf.push(...this._text(`     > ${line}`))
        }
      }
    }
  }

  private async _printTakeawayReceipt({ order, restaurantName }: {
    order: Order; restaurantName?: string
  }): Promise<void> {
    const items = order.items || []
    const time = new Date(order.created_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    const pickup = String(order.pickup_number || 0).padStart(3, '0')
    const total = Number(order.total_amount || 0)
    const paid = Number(order.paid_amount || 0)
    const due = Math.max(0, Math.round((total - paid) * 100) / 100)
    const payments: any[] = Array.isArray((order as any).payments) ? (order as any).payments : []
    const buf: number[] = []

    buf.push(...CMD.RESET, ...CMD.CODEPAGE_858)

    // Header
    buf.push(...CMD.ALIGN_CENTER, ...CMD.SIZE_DOUBLE, ...CMD.BOLD_ON)
    buf.push(...this._text(restaurantName || 'MINTHI'))
    buf.push(...CMD.SIZE_NORMAL, ...CMD.BOLD_OFF)
    buf.push(...this._text('RICEVUTA NON FISCALE'))
    buf.push(...this._text(this._line('=')))

    // Pickup number (huge)
    buf.push(...CMD.ALIGN_CENTER, ...CMD.SIZE_DOUBLE, ...CMD.BOLD_ON)
    buf.push(...this._text(`N. ${pickup}`))
    buf.push(...CMD.SIZE_NORMAL, ...CMD.BOLD_OFF)
    buf.push(...CMD.ALIGN_LEFT)
    buf.push(...this._text(`Data: ${time}`))
    if (order.customer_name) buf.push(...this._text(`Cliente: ${order.customer_name}`))
    if (order.customer_phone) buf.push(...this._text(`Tel: ${order.customer_phone}`))
    buf.push(...this._text(this._line('-')))

    // Items with prices
    for (const it of items) {
      const name = it.dish?.name || `Piatto #${it.dish_id.slice(0, 6)}`
      const unit = Number(it.dish?.price || 0)
      const lineTotal = unit * it.quantity
      const left = `${it.quantity}x ${name}`
      const right = `€${lineTotal.toFixed(2)}`
      for (const line of this._moneyLines(left, right)) buf.push(...this._text(line))
      if (it.note) {
        for (const line of this._wrapText(String(it.note), COLS - 6)) {
          buf.push(...this._text(`    > ${line}`))
        }
      }
    }

    // Totals
    buf.push(...this._text(this._line('-')))
    const totalLeft = 'TOTALE'
    const totalRight = `€${total.toFixed(2)}`
    buf.push(...CMD.BOLD_ON)
    buf.push(...this._text(totalLeft + ' '.repeat(Math.max(1, COLS - totalLeft.length - totalRight.length)) + totalRight))
    buf.push(...CMD.BOLD_OFF)

    // Payments breakdown
    if (payments.length > 0) {
      buf.push(...this._text(this._line('-')))
      buf.push(...this._text('PAGAMENTI:'))
      for (const p of payments) {
        const method = p.method === 'cash' ? 'Contanti' : p.method === 'card_pos' ? 'POS' : p.method === 'stripe' ? 'Stripe' : p.method || '?'
        const label = p.label ? ` (${p.label})` : ''
        const leftP = `  ${method}${label}`
        const rightP = `€${Number(p.amount).toFixed(2)}`
        for (const line of this._moneyLines(leftP, rightP)) buf.push(...this._text(line))
      }
      if (due < 0.01) {
        buf.push(...CMD.BOLD_ON)
        buf.push(...this._text('PAGATO'))
        buf.push(...CMD.BOLD_OFF)
      } else {
        const dueLeft = 'DA PAGARE'
        const dueRight = `€${due.toFixed(2)}`
        buf.push(...CMD.BOLD_ON)
        buf.push(...this._text(dueLeft + ' '.repeat(Math.max(1, COLS - dueLeft.length - dueRight.length)) + dueRight))
        buf.push(...CMD.BOLD_OFF)
      }
    }

    buf.push(...this._text(this._line('=')))
    buf.push(...CMD.ALIGN_CENTER)
    buf.push(...this._text('Grazie e buon appetito!'))
    buf.push(...CMD.FEED_LINES(2))
    if (this._settings.autoCut) buf.push(...this._cut())

    await this._send(new Uint8Array(buf))
  }

  private async _printTestPage(): Promise<void> {
    const buf: number[] = []
    buf.push(...CMD.RESET, ...CMD.CODEPAGE_858)
    buf.push(...CMD.ALIGN_CENTER, ...CMD.SIZE_DOUBLE, ...CMD.BOLD_ON)
    buf.push(...this._text('MINTHI'))
    buf.push(...CMD.SIZE_NORMAL, ...CMD.BOLD_OFF)
    buf.push(...this._text(this._line('=')))
    buf.push(...this._text('Stampante collegata!'))
    buf.push(...this._text('Test di stampa OK'))
    buf.push(...this._text(`Modalita: ${this._settings.mode === 'network' ? 'Rete WiFi/LAN' : 'USB'}`))
    buf.push(...this._text(`Protocollo: ${this._settings.protocol === 'custom' ? 'CUSTOM' : 'ESC/POS'}`))
    buf.push(...this._text(''))
    buf.push(...this._text(`${new Date().toLocaleString('it-IT')}`))
    buf.push(...this._text(this._line('=')))
    buf.push(...CMD.FEED_LINES(3))
    if (this._settings.autoCut) buf.push(...this._cut())
    await this._send(new Uint8Array(buf))
  }

  // ========== Low-level Send ==========

  private async _send(data: Uint8Array): Promise<void> {
    if (this._settings.mode === 'network') {
      if (!this.ws || !this.wsConnected) throw new Error('Relay non connesso')
      this.ws.send(data.buffer)
      return
    }
    // USB mode
    if (!this.usbDevice?.opened) throw new Error('Stampante USB non collegata')
    const CHUNK = 4096
    for (let i = 0; i < data.length; i += CHUNK) {
      await this.usbDevice.transferOut(this.usbEndpoint, data.slice(i, i + CHUNK))
    }
  }

  // ========== Queue ==========

  private async _enqueue(fn: () => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      this.printQueue.push(async () => {
        try { await fn(); resolve() }
        catch (e) { reject(e) }
      })
      if (!this.printing) this._processQueue()
    })
  }

  private async _processQueue(): Promise<void> {
    this.printing = true
    while (this.printQueue.length > 0) {
      const fn = this.printQueue.shift()!
      try { await fn() }
      catch (e) { console.error('Print queue error:', e) }
    }
    this.printing = false
  }

  // ========== Settings Persistence ==========

  private _loadSettings(): PrinterSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
    } catch { /* ignore */ }
    return { ...DEFAULT_SETTINGS }
  }

  private _saveSettings(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._settings))
  }

  // ========== Helpers ==========

  private _text(str: string): number[] {
    const bytes: number[] = []
    for (const ch of this._normalizeText(str)) {
      bytes.push(CP858[ch] !== undefined ? CP858[ch] : (ch.charCodeAt(0) < 128 ? ch.charCodeAt(0) : 0x3F))
    }
    bytes.push(LF)
    return bytes
  }

  private _line(char: string): string { return char.repeat(COLS) }

  private _normalizeText(str: string): string {
    return String(str)
      .replace(/[’‘]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, '-')
      .replace(/…/g, '...')
      .replace(/×/g, 'x')
      .replace(/•/g, '*')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
  }

  private _wrapText(str: string, width: number): string[] {
    const clean = this._normalizeText(str).replace(/\s+/g, ' ').trim()
    if (!clean) return ['']
    const max = Math.max(8, width)
    const words = clean.split(' ')
    const lines: string[] = []
    let line = ''

    for (const word of words) {
      if (word.length > max) {
        if (line) {
          lines.push(line)
          line = ''
        }
        for (let i = 0; i < word.length; i += max) lines.push(word.slice(i, i + max))
        continue
      }
      const next = line ? `${line} ${word}` : word
      if (next.length > max) {
        if (line) lines.push(line)
        line = word
      } else {
        line = next
      }
    }
    if (line) lines.push(line)
    return lines
  }

  private _moneyLines(left: string, right: string): string[] {
    const rightClean = this._normalizeText(right)
    const leftWidth = Math.max(10, COLS - rightClean.length - 1)
    const lines = this._wrapText(left, leftWidth)
    const first = lines[0] || ''
    const out = [first + ' '.repeat(Math.max(1, COLS - first.length - rightClean.length)) + rightClean]
    for (const line of lines.slice(1)) out.push(line)
    return out
  }

  private _cut(): number[] {
    return this._settings.protocol === 'custom' ? CMD.CUSTOM_CUT : CMD.FEED_CUT
  }

  private _notify(): void { this.dispatchEvent(new Event('change')) }
}

// Singleton
export const thermalPrinter = new ThermalPrinterService()
