import React, { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { QrCode, Plus, Link as LinkIcon, ArrowsLeftRight, Trash, Tag, Copy } from '@phosphor-icons/react'
import { DatabaseService } from '@/services/DatabaseService'
import type { Restaurant } from '@/services/types'
import PhysicalQrPosterButton from './qr/PhysicalQrPosterButton'
import { generatePhysicalQrUrl } from '@/utils/qrUtils'

type QrRow = {
    id: string
    code: string
    restaurant_id: string | null
    label: string | null
    created_at: string
    assigned_at: string | null
    restaurant: { id: string; name: string } | null
}

interface Props {
    restaurants: Restaurant[]
}

/**
 * Admin section for managing reusable physical QR codes:
 *
 *   - create new QR (with optional custom code/label/initial assignment)
 *   - see assignment state at a glance
 *   - re-assign or unassign a QR (printed posters can be re-used)
 *   - print A4 PDF poster ready to be physically distributed
 *   - delete (irreversibly kills the printed QR)
 */
export default function AdminQrCodesView({ restaurants }: Props) {
    const [rows, setRows] = useState<QrRow[] | null>(null)
    const [loading, setLoading] = useState(false)
    const [filterStatus, setFilterStatus] = useState<'all' | 'assigned' | 'unassigned'>('all')
    const [searchQuery, setSearchQuery] = useState('')

    // Create dialog
    const [showCreate, setShowCreate] = useState(false)
    const [newLabel, setNewLabel] = useState('')
    const [newCustomCode, setNewCustomCode] = useState('')
    const [newRestaurantId, setNewRestaurantId] = useState<string>('')
    const [creating, setCreating] = useState(false)

    // Assign dialog
    const [assignTarget, setAssignTarget] = useState<QrRow | null>(null)
    const [assignRestaurantId, setAssignRestaurantId] = useState<string>('')
    const [assigning, setAssigning] = useState(false)

    // Edit label
    const [editLabelTarget, setEditLabelTarget] = useState<QrRow | null>(null)
    const [editLabelValue, setEditLabelValue] = useState('')
    const [savingLabel, setSavingLabel] = useState(false)

    const refresh = async () => {
        setLoading(true)
        try {
            const data = await DatabaseService.listPhysicalQrCodes()
            setRows(data as QrRow[])
        } catch (e: any) {
            toast.error(e?.message || 'Errore caricamento QR')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        refresh()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const filtered = useMemo(() => {
        const base = (rows || []).filter(r => {
            if (filterStatus === 'assigned' && !r.restaurant_id) return false
            if (filterStatus === 'unassigned' && r.restaurant_id) return false
            return true
        })
        const q = searchQuery.trim().toLowerCase()
        if (!q) return base
        return base.filter(r =>
            r.code.includes(q) ||
            (r.label || '').toLowerCase().includes(q) ||
            (r.restaurant?.name || '').toLowerCase().includes(q)
        )
    }, [rows, filterStatus, searchQuery])

    const counts = useMemo(() => {
        const total = rows?.length || 0
        const assigned = (rows || []).filter(r => r.restaurant_id).length
        return { total, assigned, unassigned: total - assigned }
    }, [rows])

    const handleCreate = async () => {
        if (creating) return
        setCreating(true)
        try {
            const code = newCustomCode.trim().toLowerCase()
            if (code && !/^[a-z0-9]{6,32}$/.test(code)) {
                toast.error('Codice non valido: 6-32 caratteri minuscoli/numeri')
                setCreating(false)
                return
            }
            await DatabaseService.createPhysicalQrCode({
                code: code || undefined,
                label: newLabel.trim() || undefined,
                restaurantId: newRestaurantId || undefined,
            })
            toast.success('QR creato')
            setShowCreate(false)
            setNewLabel('')
            setNewCustomCode('')
            setNewRestaurantId('')
            await refresh()
        } catch (e: any) {
            toast.error(e?.message || 'Errore creazione QR')
        } finally {
            setCreating(false)
        }
    }

    const handleAssign = async () => {
        if (!assignTarget || !assignRestaurantId) {
            toast.error('Seleziona un ristorante')
            return
        }
        setAssigning(true)
        try {
            await DatabaseService.assignPhysicalQrCode(assignTarget.id, assignRestaurantId)
            toast.success('QR riassegnato')
            setAssignTarget(null)
            setAssignRestaurantId('')
            await refresh()
        } catch (e: any) {
            toast.error(e?.message || 'Errore assegnazione')
        } finally {
            setAssigning(false)
        }
    }

    const handleUnassign = async (qr: QrRow) => {
        if (!confirm(`Sganciare il QR "${qr.code}"? Chi lo scansiona vedrà "non assegnato".`)) return
        try {
            await DatabaseService.unassignPhysicalQrCode(qr.id)
            toast.success('QR sganciato')
            await refresh()
        } catch (e: any) {
            toast.error(e?.message || 'Errore sgancio')
        }
    }

    const handleDelete = async (qr: QrRow) => {
        if (!confirm(`Eliminare DEFINITIVAMENTE il QR "${qr.code}"?\n\nIl QR fisico stampato diventerà inutilizzabile. Operazione irreversibile.`)) return
        try {
            await DatabaseService.deletePhysicalQrCode(qr.id)
            toast.success('QR eliminato')
            await refresh()
        } catch (e: any) {
            toast.error(e?.message || 'Errore eliminazione')
        }
    }

    const handleEditLabel = async () => {
        if (!editLabelTarget) return
        setSavingLabel(true)
        try {
            await DatabaseService.updatePhysicalQrCodeLabel(
                editLabelTarget.id,
                editLabelValue.trim() || null
            )
            toast.success('Etichetta aggiornata')
            setEditLabelTarget(null)
            setEditLabelValue('')
            await refresh()
        } catch (e: any) {
            toast.error(e?.message || 'Errore aggiornamento')
        } finally {
            setSavingLabel(false)
        }
    }

    const copyUrl = (code: string) => {
        const url = generatePhysicalQrUrl(code)
        navigator.clipboard.writeText(url)
            .then(() => toast.success('URL copiato negli appunti'))
            .catch(() => toast.error('Impossibile copiare'))
    }

    return (
        <div className="space-y-6">
            {/* Header + stats */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold text-white">
                        QR <span className="text-amber-500">Asporto</span> Riutilizzabili
                    </h2>
                    <p className="text-zinc-500 text-sm mt-0.5">
                        Stampa una volta, riassegna quante volte vuoi. Quando cambi ristorante l'aggiornamento è immediato.
                    </p>
                </div>
                <Button
                    onClick={() => setShowCreate(true)}
                    className="h-11 px-6 bg-amber-500 hover:bg-amber-600 text-black font-bold rounded-xl shadow-lg shadow-amber-500/10"
                >
                    <Plus size={18} weight="bold" className="mr-2" />
                    Nuovo QR
                </Button>
            </div>

            {/* Stats badges */}
            <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-white/5 bg-black/40 p-4">
                    <p className="text-xs text-zinc-500 uppercase tracking-widest">Totale</p>
                    <p className="text-2xl font-bold text-white mt-1">{counts.total}</p>
                </div>
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <p className="text-xs text-emerald-400 uppercase tracking-widest">Assegnati</p>
                    <p className="text-2xl font-bold text-white mt-1">{counts.assigned}</p>
                </div>
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                    <p className="text-xs text-amber-400 uppercase tracking-widest">Disponibili</p>
                    <p className="text-2xl font-bold text-white mt-1">{counts.unassigned}</p>
                </div>
            </div>

            {/* Filter + search */}
            <div className="flex items-center gap-2">
                <div className="flex gap-1 bg-black/40 p-1 rounded-xl border border-white/5">
                    {(['all', 'assigned', 'unassigned'] as const).map(s => (
                        <Button
                            key={s}
                            variant="ghost"
                            size="sm"
                            onClick={() => setFilterStatus(s)}
                            className={`h-8 px-4 rounded-lg ${filterStatus === s ? 'bg-amber-500 text-black font-bold' : 'text-zinc-400'}`}
                        >
                            {s === 'all' ? 'Tutti' : s === 'assigned' ? 'Assegnati' : 'Disponibili'}
                        </Button>
                    ))}
                </div>
                <Input
                    placeholder="Cerca per codice, etichetta o ristorante"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="bg-black/40 border-white/5 text-white rounded-xl flex-1"
                />
            </div>

            {/* Table */}
            <div className="rounded-2xl border border-white/5 bg-black/40 overflow-hidden">
                {loading && !rows ? (
                    <div className="text-center py-12 text-zinc-500">Caricamento...</div>
                ) : !filtered.length ? (
                    <div className="text-center py-12 text-zinc-500">
                        <QrCode size={48} className="mx-auto mb-3 opacity-30" />
                        <p>Nessun QR {filterStatus !== 'all' ? `(filtro: ${filterStatus})` : ''}</p>
                    </div>
                ) : (
                    <div className="divide-y divide-white/5">
                        {filtered.map(qr => {
                            const isAssigned = !!qr.restaurant_id
                            return (
                                <div key={qr.id} className="px-4 py-3 flex flex-col md:flex-row md:items-center gap-3 hover:bg-white/5 transition-colors">
                                    {/* Code + label */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <code className="text-amber-500 font-mono font-bold text-base">{qr.code}</code>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => copyUrl(qr.code)}
                                                className="h-7 w-7 p-0 text-zinc-500 hover:text-amber-400"
                                                title="Copia URL"
                                            >
                                                <Copy size={14} />
                                            </Button>
                                            <button
                                                onClick={() => { setEditLabelTarget(qr); setEditLabelValue(qr.label || '') }}
                                                className="text-xs text-zinc-400 hover:text-amber-400 underline-offset-2 hover:underline"
                                            >
                                                {qr.label || 'aggiungi etichetta'}
                                            </button>
                                        </div>
                                        <div className="mt-1 text-xs text-zinc-500">
                                            {isAssigned ? (
                                                <span className="text-emerald-400">
                                                    → {qr.restaurant?.name || 'ristorante eliminato'}
                                                </span>
                                            ) : (
                                                <span className="text-zinc-500">Non assegnato</span>
                                            )}
                                            {qr.assigned_at && (
                                                <span className="ml-2 text-zinc-600">
                                                    dal {new Date(qr.assigned_at).toLocaleDateString('it-IT')}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1 flex-wrap">
                                        <PhysicalQrPosterButton
                                            code={qr.code}
                                            restaurantName={qr.restaurant?.name}
                                            label={qr.label}
                                            size="sm"
                                            variant="outline"
                                            className="border-white/10 text-white hover:bg-white/5"
                                        />
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                                setAssignTarget(qr)
                                                setAssignRestaurantId(qr.restaurant_id || '')
                                            }}
                                            className="h-9 px-3 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                                        >
                                            <ArrowsLeftRight size={14} className="mr-1" />
                                            {isAssigned ? 'Riassegna' : 'Assegna'}
                                        </Button>
                                        {isAssigned && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleUnassign(qr)}
                                                className="h-9 px-3 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                                            >
                                                Sgancia
                                            </Button>
                                        )}
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleDelete(qr)}
                                            className="h-9 w-9 p-0 text-red-400 hover:bg-red-500/10"
                                            title="Elimina QR"
                                        >
                                            <Trash size={14} />
                                        </Button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* CREATE dialog */}
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
                <DialogContent className="max-w-md bg-black/95 border-amber-500/20 text-white backdrop-blur-2xl">
                    <DialogHeader>
                        <DialogTitle>Nuovo QR Asporto</DialogTitle>
                        <DialogDescription>
                            Crea un QR riutilizzabile. Puoi assegnarlo subito a un ristorante o lasciarlo disponibile.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div>
                            <Label className="text-xs text-zinc-400">Etichetta interna (facoltativa)</Label>
                            <Input
                                value={newLabel}
                                onChange={e => setNewLabel(e.target.value)}
                                placeholder='Es. "Lotto stampa marzo 2026"'
                                className="bg-black/40 border-white/10 text-white mt-1"
                            />
                        </div>
                        <div>
                            <Label className="text-xs text-zinc-400">Codice personalizzato (facoltativo)</Label>
                            <Input
                                value={newCustomCode}
                                onChange={e => setNewCustomCode(e.target.value.toLowerCase())}
                                placeholder="Lascia vuoto = genera automatico"
                                className="bg-black/40 border-white/10 text-white mt-1 font-mono"
                                maxLength={32}
                            />
                            <p className="text-[10px] text-zinc-600 mt-1">6-32 caratteri, solo lettere minuscole e numeri</p>
                        </div>
                        <div>
                            <Label className="text-xs text-zinc-400">Assegna subito a (facoltativo)</Label>
                            <select
                                value={newRestaurantId}
                                onChange={e => setNewRestaurantId(e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-md h-10 px-3 text-white text-sm mt-1"
                            >
                                <option value="">Non assegnato</option>
                                {restaurants.map(r => (
                                    <option key={r.id} value={r.id}>{r.name}</option>
                                ))}
                            </select>
                        </div>
                        <Button
                            onClick={handleCreate}
                            disabled={creating}
                            className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold h-11 rounded-xl"
                        >
                            {creating ? 'Creazione...' : 'Crea QR'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ASSIGN dialog */}
            <Dialog open={!!assignTarget} onOpenChange={open => !open && setAssignTarget(null)}>
                <DialogContent className="max-w-md bg-black/95 border-amber-500/20 text-white backdrop-blur-2xl">
                    <DialogHeader>
                        <DialogTitle>
                            {assignTarget?.restaurant_id ? 'Riassegna QR' : 'Assegna QR'}
                        </DialogTitle>
                        <DialogDescription>
                            Il QR <code className="text-amber-400">{assignTarget?.code}</code> punterà al ristorante selezionato.
                            Il cambio è immediato — nessuna ristampa necessaria.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        {assignTarget?.restaurant && (
                            <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3 text-sm">
                                <span className="text-zinc-400">Attuale: </span>
                                <span className="text-amber-400 font-medium">{assignTarget.restaurant.name}</span>
                            </div>
                        )}
                        <div>
                            <Label className="text-xs text-zinc-400">Nuovo ristorante</Label>
                            <select
                                value={assignRestaurantId}
                                onChange={e => setAssignRestaurantId(e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-md h-10 px-3 text-white text-sm mt-1"
                            >
                                <option value="">Seleziona ristorante…</option>
                                {restaurants.map(r => (
                                    <option key={r.id} value={r.id}>{r.name}</option>
                                ))}
                            </select>
                        </div>
                        <Button
                            onClick={handleAssign}
                            disabled={assigning || !assignRestaurantId}
                            className="w-full bg-emerald-500 hover:bg-emerald-600 text-black font-bold h-11 rounded-xl"
                        >
                            <LinkIcon size={16} className="mr-1.5" />
                            {assigning ? 'Salvataggio...' : 'Conferma assegnazione'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* EDIT LABEL dialog */}
            <Dialog open={!!editLabelTarget} onOpenChange={open => !open && setEditLabelTarget(null)}>
                <DialogContent className="max-w-md bg-black/95 border-amber-500/20 text-white backdrop-blur-2xl">
                    <DialogHeader>
                        <DialogTitle>Etichetta interna</DialogTitle>
                        <DialogDescription>
                            Solo per la tua organizzazione interna. Il cliente non la vede.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <Input
                            value={editLabelValue}
                            onChange={e => setEditLabelValue(e.target.value)}
                            placeholder="Es. Tavolo 3, lotto marzo, ecc."
                            className="bg-black/40 border-white/10 text-white"
                            maxLength={120}
                            autoFocus
                        />
                        <Button
                            onClick={handleEditLabel}
                            disabled={savingLabel}
                            className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold h-11 rounded-xl"
                        >
                            <Tag size={16} className="mr-1.5" />
                            {savingLabel ? 'Salvataggio...' : 'Salva etichetta'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
