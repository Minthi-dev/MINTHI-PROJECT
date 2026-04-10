/**
 * ThermalPrinterService — Epson TM-T20III (and compatible) via WebUSB
 * Generates ESC/POS commands and sends them to the printer.
 */

import type { Order } from './types'

// --- ESC/POS Constants ---
const ESC = 0x1B
const GS  = 0x1D
const LF  = 0x0A

const CMD = {
  RESET:        [ESC, 0x40],                    // ESC @
  CODEPAGE_858: [ESC, 0x74, 19],                // ESC t 19  (CP858: Italian + €)
  BOLD_ON:      [ESC, 0x45, 1],                 // ESC E 1
  BOLD_OFF:     [ESC, 0x45, 0],                 // ESC E 0
  ALIGN_LEFT:   [ESC, 0x61, 0],                 // ESC a 0
  ALIGN_CENTER: [ESC, 0x61, 1],                 // ESC a 1
  SIZE_NORMAL:  [GS, 0x21, 0x00],              // GS ! 0x00
  SIZE_DOUBLE:  [GS, 0x21, 0x11],              // GS ! 0x11  (double width + height)
  SIZE_WIDE:    [GS, 0x21, 0x10],              // GS ! 0x10  (double width only)
  SIZE_TALL:    [GS, 0x21, 0x01],              // GS ! 0x01  (double height only)
  FEED_CUT:     [GS, 0x56, 66, 3],             // GS V 66 n  (feed 3 lines + partial cut)
  FEED_LINES:   (n: number) => [ESC, 0x64, n], // ESC d n
}

// CP858 mapping for Italian/European characters
const CP858: Record<string, number> = {
  'à': 0x85, 'è': 0x8A, 'é': 0x82, 'ì': 0x8D, 'ò': 0x95, 'ù': 0x97,
  'á': 0xA0, 'í': 0xA1, 'ó': 0xA2, 'ú': 0xA3,
  'À': 0xB7, 'È': 0xD4, 'É': 0x90, 'Ì': 0xDE, 'Ò': 0xE3, 'Ù': 0xEB,
  'Á': 0xB5,
  'ñ': 0xA4, 'Ñ': 0xA5,
  '€': 0xD5, '°': 0xF8, '£': 0x9C, '©': 0xB8,
}

const COLS = 48 // Characters per line on 80mm paper (Font A)

// --- Settings ---
export interface PrinterSettings {
  enabled: boolean       // Master toggle
  autoPrint: boolean     // Auto-print new orders
  autoCut: boolean       // Auto-cut paper after each ticket
  courseSeparate: boolean // Separate ticket per course
}

const DEFAULT_SETTINGS: PrinterSettings = {
  enabled: false,
  autoPrint: true,
  autoCut: true,
  courseSeparate: false,
}

const STORAGE_KEY = 'minthi_printer_settings'

// WebUSB type declarations (not all browsers ship these)
declare global {
  interface Navigator { usb: USB }
  interface USB {
    requestDevice(options: { filters: { vendorId: number }[] }): Promise<any>
    getDevices(): Promise<any[]>
    addEventListener(type: string, listener: (e: any) => void): void
    removeEventListener(type: string, listener: (e: any) => void): void
  }
}

// --- Service ---
class ThermalPrinterService extends EventTarget {
  private device: any
  private endpoint: number = 1
  private printQueue: (() => Promise<void>)[] = []
  private printing = false
  private _settings: PrinterSettings
  private _disconnectHandler: ((e: any) => void) | null = null

  constructor() {
    super()
    this._settings = this._loadSettings()
  }

  // ========== Connection ==========

  get isSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.usb
  }

  get connected(): boolean {
    return !!this.device?.opened
  }

  /** Show the browser USB picker and connect (requires user gesture) */
  async connect(): Promise<boolean> {
    if (!this.isSupported) return false
    try {
      const device = await navigator.usb.requestDevice({
        filters: [
          { vendorId: 0x04B8 }, // Epson
          { vendorId: 0x0519 }, // Star Micronics
          { vendorId: 0x0DD4 }, // Custom (brand italiano)
          { vendorId: 0x0FE6 }, // ICS (POS-X)
          { vendorId: 0x20D1 }, // MUNBYN / generic POS
          { vendorId: 0x0483 }, // STMicroelectronics (some POS printers)
          { classCode: 7 },     // USB Printer class (matches any printer)
        ]
      })
      await this._openDevice(device)
      return true
    } catch (e: any) {
      if (e.name !== 'NotFoundError') { // User cancelled picker
        console.error('Printer connect error:', e)
      }
      return false
    }
  }

  /** Try to reconnect to a previously paired device (no user gesture needed) */
  async reconnect(): Promise<boolean> {
    if (!this.isSupported || this.connected) return this.connected
    try {
      const devices = await navigator.usb.getDevices()
      if (devices.length > 0) {
        await this._openDevice(devices[0])
        return true
      }
    } catch (e) {
      console.warn('Printer reconnect failed:', e)
    }
    return false
  }

  async disconnect(): Promise<void> {
    this._removeDisconnectListener()
    if (this.device?.opened) {
      try { await this.device.close() } catch { /* ignore */ }
    }
    this.device = null
    this._notify()
  }

  private _removeDisconnectListener(): void {
    if (this._disconnectHandler) {
      navigator.usb.removeEventListener('disconnect', this._disconnectHandler)
      this._disconnectHandler = null
    }
  }

  private async _openDevice(device: any): Promise<void> {
    await device.open()
    if (device.configuration === null) {
      await device.selectConfiguration(1)
    }
    await device.claimInterface(0)

    // Find the bulk OUT endpoint
    const iface = device.configuration!.interfaces[0]
    const alt = iface.alternates[0]
    const ep = alt.endpoints.find(e => e.direction === 'out' && e.type === 'bulk')
    this.endpoint = ep?.endpointNumber ?? 1

    this.device = device

    // Remove any previous listener before adding a new one
    this._removeDisconnectListener()
    this._disconnectHandler = (e: any) => {
      if (e.device === this.device) {
        this.device = null
        this._disconnectHandler = null
        this._notify()
      }
    }
    navigator.usb.addEventListener('disconnect', this._disconnectHandler)

    this._notify()
  }

  // ========== Settings ==========

  get settings(): PrinterSettings {
    return { ...this._settings }
  }

  updateSettings(patch: Partial<PrinterSettings>): void {
    this._settings = { ...this._settings, ...patch }
    this._saveSettings()
    this._notify()
  }

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

  // ========== Printing ==========

  /** Print a kitchen order ticket */
  async printKitchenOrder(params: {
    order: Order
    tableLabel: string
    waiterName?: string
  }): Promise<void> {
    await this._enqueue(() => this._printKitchenOrder(params))
  }

  /** Print a test page */
  async printTestPage(): Promise<void> {
    await this._enqueue(() => this._printTestPage())
  }

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

  // ========== ESC/POS Builders ==========

  private async _printKitchenOrder({ order, tableLabel, waiterName }: {
    order: Order, tableLabel: string, waiterName?: string
  }): Promise<void> {
    const items = order.items || []
    const time = new Date(order.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    const buf: number[] = []

    // Init
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
    if (waiterName) {
      buf.push(...this._text(`Cam: ${waiterName}`))
    }
    buf.push(...this._text(this._line('-')))

    // Group items by course
    const courses = new Map<number, typeof items>()
    for (const item of items) {
      const c = item.course_number ?? 1
      if (!courses.has(c)) courses.set(c, [])
      courses.get(c)!.push(item)
    }

    const sortedCourses = [...courses.entries()].sort((a, b) => a[0] - b[0])
    const hasCourses = sortedCourses.length > 1 || (sortedCourses.length === 1 && sortedCourses[0][0] > 1)

    if (this._settings.courseSeparate && hasCourses) {
      // Print separate tickets per course
      for (let i = 0; i < sortedCourses.length; i++) {
        const [courseNum, courseItems] = sortedCourses[i]
        if (i > 0) {
          // New ticket for each course after the first
          buf.push(...CMD.FEED_CUT)
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
      // Single ticket, all courses
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

    // Footer
    buf.push(...this._text(this._line('=')))
    buf.push(...CMD.FEED_LINES(2))

    if (this._settings.autoCut) {
      buf.push(...CMD.FEED_CUT)
    }

    await this._send(new Uint8Array(buf))
  }

  private _appendItems(buf: number[], items: NonNullable<Order['items']>): void {
    for (const item of items) {
      const name = item.dish?.name || `Piatto #${item.dish_id.slice(0, 6)}`
      const qty = item.quantity

      // Item line: "2x  Margherita"
      buf.push(...CMD.SIZE_TALL, ...CMD.BOLD_ON)
      buf.push(...this._text(` ${qty}x  ${name}`))
      buf.push(...CMD.SIZE_NORMAL, ...CMD.BOLD_OFF)

      // Note (if any)
      if (item.note) {
        buf.push(...this._text(`     > ${item.note}`))
      }
    }
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
    buf.push(...this._text(''))
    buf.push(...this._text(`${new Date().toLocaleString('it-IT')}`))
    buf.push(...this._text(this._line('=')))
    buf.push(...CMD.FEED_LINES(3))
    buf.push(...CMD.FEED_CUT)

    await this._send(new Uint8Array(buf))
  }

  // ========== Low-level Helpers ==========

  /** Encode a string to CP858 bytes + LF */
  private _text(str: string): number[] {
    const bytes: number[] = []
    for (const ch of str) {
      if (CP858[ch] !== undefined) {
        bytes.push(CP858[ch])
      } else {
        const code = ch.charCodeAt(0)
        bytes.push(code < 128 ? code : 0x3F) // '?' for unmapped chars
      }
    }
    bytes.push(LF)
    return bytes
  }

  /** Generate a full-width separator line */
  private _line(char: string): string {
    return char.repeat(COLS)
  }

  /** Send raw bytes to the printer */
  private async _send(data: Uint8Array): Promise<void> {
    if (!this.device?.opened) {
      throw new Error('Stampante non collegata')
    }
    // Send in chunks to avoid overflowing the USB transfer buffer
    const CHUNK = 4096
    for (let i = 0; i < data.length; i += CHUNK) {
      const chunk = data.slice(i, i + CHUNK)
      await this.device.transferOut(this.endpoint, chunk)
    }
  }

  private _notify(): void {
    this.dispatchEvent(new Event('change'))
  }
}

// Singleton
export const thermalPrinter = new ThermalPrinterService()
