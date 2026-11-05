// Encoder ESC/POS minimale (Epson TM-T20, Custom e compatibili), code page CP858 con €.
const ESC = 0x1b
const GS = 0x1d

const CP858: Record<string, number> = {
  à: 0x85, è: 0x8a, é: 0x82, ì: 0x8d, ò: 0x95, ù: 0x97, á: 0xa0, í: 0xa1, ó: 0xa2, ú: 0xa3,
  À: 0xb7, È: 0xd4, É: 0x90, Ì: 0xde, Ò: 0xe3, Ù: 0xeb, ñ: 0xa4, Ñ: 0xa5, '€': 0xd5, '°': 0xf8, '£': 0x9c,
  '’': 0x27, '‘': 0x27, '“': 0x22, '”': 0x22, '–': 0x2d, '—': 0x2d, '…': 0x2e,
}

export class EscPos {
  private bytes: number[] = []
  constructor(public columns = 48) {
    this.raw(ESC, 0x40).raw(ESC, 0x74, 19) // reset + CP858
  }
  raw(...b: number[]) {
    this.bytes.push(...b)
    return this
  }
  text(s: string) {
    for (const ch of s.normalize('NFC')) {
      const code = ch.charCodeAt(0)
      this.bytes.push(CP858[ch] ?? (code < 128 ? code : 0x3f))
    }
    return this
  }
  line(s = '') {
    return this.text(s).raw(0x0a)
  }
  align(a: 'left' | 'center' | 'right') {
    return this.raw(ESC, 0x61, a === 'left' ? 0 : a === 'center' ? 1 : 2)
  }
  bold(on = true) {
    return this.raw(ESC, 0x45, on ? 1 : 0)
  }
  size(s: 'normal' | 'double' | 'tall' | 'wide') {
    return this.raw(GS, 0x21, { normal: 0x00, double: 0x11, tall: 0x01, wide: 0x10 }[s])
  }
  rule(ch = '-') {
    return this.line(ch.repeat(this.columns))
  }
  /** Due colonne: testo a sinistra, importo a destra. */
  pair(left: string, right: string, width = this.columns) {
    const space = Math.max(1, width - right.length)
    const l = left.length > space - 1 ? left.slice(0, space - 1) : left
    return this.line(l + ' '.repeat(width - l.length - right.length) + right)
  }
  /** Va a capo sulle parole. */
  wrap(s: string, indent = 0, width = this.columns) {
    const words = s.split(/\s+/)
    let cur = ''
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > width - indent) {
        this.line(' '.repeat(indent) + cur.trim())
        cur = w
      } else cur += ' ' + w
    }
    if (cur.trim()) this.line(' '.repeat(indent) + cur.trim())
    return this
  }
  feed(n = 3) {
    return this.raw(ESC, 0x64, n)
  }
  cut() {
    return this.feed(4).raw(GS, 0x56, 66, 3)
  }
  build() {
    return new Uint8Array(this.bytes)
  }
}

export const eur = (n: number) => n.toFixed(2).replace('.', ',') + ' €'
