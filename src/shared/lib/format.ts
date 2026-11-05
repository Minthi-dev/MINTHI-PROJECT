const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })

export const formatMoney = (value: number | string | null | undefined) => eur.format(Number(value ?? 0))

export function formatTime(value: string | Date | null | undefined) {
  if (!value) return ''
  return new Date(value).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

export function formatDate(value: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('it-IT', opts)
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return ''
  return new Date(value).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** "3 min fa", "1 h 20 min" */
export function elapsed(from: string | Date, now = Date.now()) {
  const mins = Math.max(0, Math.floor((now - new Date(from).getTime()) / 60000))
  if (mins < 1) return 'ora'
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  return `${h} h ${mins % 60} min`
}

export function toDateInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const ALLERGENS: Record<string, string> = {
  glutine: 'Glutine', crostacei: 'Crostacei', uova: 'Uova', pesce: 'Pesce', arachidi: 'Arachidi', soia: 'Soia',
  latte: 'Latte', frutta_guscio: 'Frutta a guscio', sedano: 'Sedano', senape: 'Senape', sesamo: 'Sesamo',
  solfiti: 'Solfiti', lupini: 'Lupini', molluschi: 'Molluschi',
}

export const VAT_CODES = [
  { value: '10', label: '10% (ristorazione)' },
  { value: '22', label: '22%' },
  { value: '5', label: '5%' },
  { value: '4', label: '4%' },
  { value: 'N1', label: 'N1 – escluse art. 15' },
  { value: 'N2', label: 'N2 – non soggette' },
  { value: 'N3', label: 'N3 – non imponibili' },
  { value: 'N4', label: 'N4 – esenti' },
  { value: 'N5', label: 'N5 – regime del margine' },
  { value: 'N6', label: 'N6 – inversione contabile' },
]
