import { EscPos, eur } from './escpos'

export interface TicketItem { name: string; quantity: number; notes?: string | null; course?: number; unitPrice?: number }

export function kitchenTicket(o: { title: string; subtitle?: string; items: TicketItem[]; time?: Date }, columns: number) {
  const p = new EscPos(columns).align('center').size('double').bold().line(o.title).size('normal').bold(false)
  if (o.subtitle) p.line(o.subtitle)
  p.line((o.time ?? new Date()).toLocaleString('it-IT', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })).align('left').rule('=')
  let course = 0
  for (const it of [...o.items].sort((a, b) => (a.course ?? 1) - (b.course ?? 1))) {
    if ((it.course ?? 1) !== course && o.items.some((x) => (x.course ?? 1) > 1)) {
      course = it.course ?? 1
      p.bold().line(`-- PORTATA ${course} --`).bold(false)
    }
    p.size('tall').bold().line(`${it.quantity} x ${it.name}`).size('normal').bold(false)
    if (it.notes) p.wrap(`>> ${it.notes}`, 4)
  }
  return p.rule('=').cut().build()
}

export function billTicket(o: { restaurant: string; title: string; lines: { label: string; quantity: number; total: number }[]; total: number; paid: number; due: number; guests?: number }, columns: number) {
  const p = new EscPos(columns).align('center').bold().size('wide').line(o.restaurant).size('normal').bold(false).line(o.title).line('PRECONTO - NON FISCALE').align('left').rule()
  for (const l of o.lines) p.pair(`${l.quantity} x ${l.label}`, eur(l.total))
  p.rule().bold().pair('TOTALE', eur(o.total)).bold(false)
  if (o.paid > 0) p.pair('Pagato', eur(o.paid)).bold().pair('DA PAGARE', eur(o.due)).bold(false)
  if (o.guests && o.guests > 1) p.pair(`A persona (${o.guests})`, eur(o.due / o.guests))
  return p.feed(1).align('center').line('Grazie e arrivederci!').cut().build()
}

export function takeawayTicket(o: { restaurant: string; number: number | null; code: string | null; customer?: string | null; items: TicketItem[]; total: number; paid: boolean; notes?: string | null }, columns: number) {
  const p = new EscPos(columns).align('center').bold().line(o.restaurant).bold(false).line('ASPORTO')
    .size('double').bold().line(`N. ${o.number ?? '-'}`).size('normal').bold(false)
  if (o.code) p.line(`Codice ritiro: ${o.code}`)
  if (o.customer) p.line(o.customer)
  p.align('left').rule()
  for (const it of o.items) {
    p.pair(`${it.quantity} x ${it.name}`, it.unitPrice !== undefined ? eur(it.unitPrice * it.quantity) : '')
    if (it.notes) p.wrap(`>> ${it.notes}`, 4)
  }
  if (o.notes) p.rule().wrap(`Note: ${o.notes}`)
  return p.rule().bold().pair('TOTALE', eur(o.total)).bold(false).line(o.paid ? 'PAGATO' : 'DA PAGARE AL RITIRO').cut().build()
}

export function testTicket(columns: number) {
  return new EscPos(columns).align('center').size('double').bold().line('MINTHI').size('normal').bold(false)
    .line('Stampa di prova').line('àèéìòù €').rule().pair('Sinistra', 'Destra').cut().build()
}
