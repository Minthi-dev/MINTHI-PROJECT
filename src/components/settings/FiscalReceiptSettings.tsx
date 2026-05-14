/**
 * FiscalReceiptSettings — Tab "Scontrino Fiscale" delle impostazioni.
 *
 * Mostra:
 *   1. Stato integrazione OpenAPI (banner: not_configured / pending / active / failed).
 *   2. Form dati fiscali (P.IVA, ragione sociale, sede, email).
 *   3. Form credenziali Agenzia Entrate (taxCode + password + PIN), con avviso
 *      di rotazione ogni 90 giorni. NON sono salvate nel nostro DB — passano
 *      in chiaro a OpenAPI tramite edge function HTTPS.
 *   4. Toggle per abilitare l'emissione automatica sui pagamenti Stripe.
 *   5. Statistiche ultimi 30 giorni (emessi / falliti / fatturato).
 */
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { DatabaseService } from '@/services/DatabaseService'
import type { FiscalReceipt, Restaurant } from '@/services/types'
import { toast } from 'sonner'
import {
    CheckCircle,
    Warning,
    Receipt,
    ShieldCheck,
    Eye,
    EyeSlash,
    ArrowsClockwise,
    Buildings,
    Key,
    Question,
    Percent,
    DownloadSimple,
} from '@phosphor-icons/react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Props {
    restaurantId: string
}

function isValidVatIT(vat: string): boolean {
    if (!/^\d{11}$/.test(vat)) return false
    let sum = 0
    for (let i = 0; i < 10; i++) {
        const digit = parseInt(vat[i], 10)
        if (i % 2 === 0) {
            sum += digit
        } else {
            const doubled = digit * 2
            sum += doubled > 9 ? doubled - 9 : doubled
        }
    }
    const check = (10 - (sum % 10)) % 10
    return check === parseInt(vat[10], 10)
}

function isValidTaxCodeIT(cf: string): boolean {
    if (!cf) return false
    const upper = cf.toUpperCase()
    if (/^\d{11}$/.test(upper)) return isValidVatIT(upper)
    if (!/^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(upper)) return false
    const odd: Record<string, number> = {
        '0': 1, '1': 0, '2': 5, '3': 7, '4': 9, '5': 13, '6': 15, '7': 17, '8': 19, '9': 21,
        A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18,
        N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
    }
    const even: Record<string, number> = {}
    '0123456789'.split('').forEach((c, i) => { even[c] = i })
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((c, i) => { even[c] = i })
    let sum = 0
    for (let i = 0; i < 15; i++) {
        const c = upper[i]
        sum += i % 2 === 0 ? odd[c] : even[c]
    }
    return upper[15] === String.fromCharCode('A'.charCodeAt(0) + (sum % 26))
}

export function FiscalReceiptSettings({ restaurantId }: Props) {
    const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
    const [loading, setLoading] = useState(true)

    // Anagrafica
    const [vatNumber, setVatNumber] = useState('')
    const [taxCode, setTaxCode] = useState('')
    const [businessName, setBusinessName] = useState('')
    const [billingAddress, setBillingAddress] = useState('')
    const [billingCity, setBillingCity] = useState('')
    const [billingProvince, setBillingProvince] = useState('')
    const [billingPostalCode, setBillingPostalCode] = useState('')
    const [fiscalEmail, setFiscalEmail] = useState('')

    // Credenziali AdE — NON pre-compilate, NON salvate
    const [adeTaxCode, setAdeTaxCode] = useState('')
    const [adePassword, setAdePassword] = useState('')
    const [adePin, setAdePin] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [showPin, setShowPin] = useState(false)

    const [enableAuto, setEnableAuto] = useState(false)
    const [defaultVatRate, setDefaultVatRate] = useState('10')
    const [savingPrefs, setSavingPrefs] = useState(false)
    const [verifying, setVerifying] = useState(false)
    const [retryingReceiptId, setRetryingReceiptId] = useState<string | null>(null)
    const [setupOpen, setSetupOpen] = useState(false)
    const [credentialsOpen, setCredentialsOpen] = useState(false)
    const [showReceipts, setShowReceipts] = useState(false)
    const [receiptsDateFilter, setReceiptsDateFilter] = useState('')
    const [receiptsStatusFilter, setReceiptsStatusFilter] = useState<'all' | 'ready' | 'pending' | 'failed' | 'voided'>('all')
    const [receiptsSearch, setReceiptsSearch] = useState('')
    const [receiptsExpanded, setReceiptsExpanded] = useState<string | null>(null)
    const [receiptsLoadedCount, setReceiptsLoadedCount] = useState(20)
    const [loadingMoreReceipts, setLoadingMoreReceipts] = useState(false)

    const [saving, setSaving] = useState(false)
    const [stats, setStats] = useState<{ sent_count: number; failed_count: number; voided_count: number; revenue_total: number } | null>(null)
    const [recentReceipts, setRecentReceipts] = useState<FiscalReceipt[]>([])
    const [openapiEnv, setOpenapiEnv] = useState<string | null>(null)

    const loadRestaurant = async (overrideLimit?: number) => {
        setLoading(true)
        try {
            const limit = overrideLimit || receiptsLoadedCount
            const dashboard = await DatabaseService.getOpenApiFiscalDashboard(restaurantId, true, limit)
            if (dashboard?.restaurant) {
                const r = dashboard.restaurant as unknown as Restaurant
                setRestaurant(r)
                setVatNumber(r.vat_number || '')
                setTaxCode(r.tax_code || '')
                setBusinessName(r.billing_name || '')
                setBillingAddress(r.billing_address || '')
                setBillingCity(r.billing_city || '')
                setBillingProvince(r.billing_province || '')
                setBillingPostalCode(r.billing_postal_code || (r as any).billing_cap || '')
                setFiscalEmail(r.fiscal_billing_email || r.email || '')
                setEnableAuto(!!r.fiscal_receipts_enabled)
                setDefaultVatRate(r.default_vat_rate_code || '10')
                const configured = r.openapi_status && r.openapi_status !== 'not_configured'
                setSetupOpen(Boolean(configured || r.fiscal_receipts_enabled))
                setCredentialsOpen(r.openapi_status !== 'active')
                setStats(dashboard.stats || null)
                setRecentReceipts(dashboard.receipts || [])
                setOpenapiEnv((dashboard as any).platform?.openapi_env || null)
            }
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (!restaurantId) return
        loadRestaurant()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [restaurantId])

    const formValidationErrors = useMemo(() => {
        const errors: string[] = []
        if (!isValidVatIT(vatNumber.replace(/\s/g, ''))) errors.push('Partita IVA non valida')
        if (taxCode && !isValidTaxCodeIT(taxCode)) errors.push('Codice fiscale non valido')
        if (businessName.trim().length < 2) errors.push('Ragione sociale obbligatoria')
        if (!billingAddress.trim()) errors.push('Indirizzo obbligatorio')
        if (!billingCity.trim()) errors.push('Città obbligatoria')
        if (!/^[A-Z]{2}$/i.test(billingProvince.trim())) errors.push('Provincia non valida')
        if (!/^\d{5}$/.test(billingPostalCode.trim())) errors.push('CAP non valido')
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fiscalEmail.trim())) errors.push('Email aziendale non valida')
        return errors
    }, [vatNumber, taxCode, businessName, billingAddress, billingCity, billingProvince, billingPostalCode, fiscalEmail])
    const formIsValid = formValidationErrors.length === 0

    if (loading || !restaurant) {
        return (
            <div className="text-zinc-500 text-sm py-12 text-center">
                Caricamento dati fiscali…
            </div>
        )
    }

    const status = restaurant.openapi_status || 'not_configured'
    const isActive = status === 'active'
    const setupVisible = setupOpen || status !== 'not_configured'

    const credentialsExpiresAt = restaurant.ade_credentials_expire_at
        ? new Date(restaurant.ade_credentials_expire_at)
        : null
    const credentialsDaysLeft = credentialsExpiresAt
        ? Math.max(0, Math.round((credentialsExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : null
    const credentialsExpiringSoon = credentialsDaysLeft !== null && credentialsDaysLeft <= 14

    const credentialsProvided = adeTaxCode && adePassword && adePin

    async function handleSave(includeCredentials: boolean) { /* eslint-disable @typescript-eslint/no-unused-vars */
        // Restaurant always defined here because of the loading guard above.
        if (!formIsValid) {
            toast.error(formValidationErrors[0] || 'Compila correttamente i dati anagrafici prima di salvare')
            return
        }
        if (includeCredentials && !credentialsProvided) {
            toast.error('Inserisci le credenziali AdE complete (codice fiscale, password, PIN)')
            return
        }
        setSaving(true)
        try {
            const result = await DatabaseService.onboardOpenApiMerchant({
                restaurantId: restaurantId,
                vatNumber: vatNumber.replace(/\s/g, ''),
                taxCode: taxCode || undefined,
                businessName,
                billingAddress,
                billingCity,
                billingProvince: billingProvince.toUpperCase(),
                billingPostalCode,
                fiscalEmail,
                ...(includeCredentials
                    ? { adeTaxCode: adeTaxCode.toUpperCase(), adePassword, adePin }
                    : {}),
                enableAutoEmission: enableAuto,
            })
            toast.success(result.message || 'Salvato')
            // Reset campi sensibili dopo salvataggio
            if (includeCredentials) {
                setAdePassword('')
                setAdePin('')
            }
            await loadRestaurant()
        } catch (err: any) {
            toast.error(err?.message || 'Errore durante il salvataggio')
        } finally {
            setSaving(false)
        }
    }

    async function handleSavePreferences(patch: { defaultVatRateCode?: string; fiscalEmailToCustomer?: boolean }) {
        setSavingPrefs(true)
        try {
            await DatabaseService.updateFiscalPreferences({
                restaurantId,
                ...patch,
            })
            toast.success('Preferenze salvate')
            await loadRestaurant()
        } catch (err: any) {
            toast.error(err?.message || 'Errore salvataggio preferenze')
        } finally {
            setSavingPrefs(false)
        }
    }

    async function handleVerifyConfiguration() {
        setVerifying(true)
        try {
            const result = await DatabaseService.verifyOpenApiConfiguration(restaurantId)
            if (result.onOpenApi) {
                toast.success(result.message || 'Integrazione verificata e attiva.')
            } else {
                toast.error(result.message || 'OpenAPI non ha la P.IVA registrata. Reinserisci le credenziali AdE qui sotto.')
            }
            await loadRestaurant()
        } catch (err: any) {
            toast.error(err?.message || 'Errore verifica')
        } finally {
            setVerifying(false)
        }
    }

    async function handleReceiptPdf(receipt: FiscalReceipt) {
        try {
            await DatabaseService.openFiscalReceiptPdfForReceipt({
                restaurantId,
                receiptId: receipt.id,
            })
        } catch (err: any) {
            toast.error(err?.message || 'PDF scontrino non disponibile')
        }
    }

    async function handleRetryReceipt(receiptId: string) {
        setRetryingReceiptId(receiptId)
        try {
            const result = await DatabaseService.retryFiscalReceipt(restaurantId, receiptId)
            if (result?.success) {
                toast.success('Scontrino riemesso con successo')
            } else {
                toast.error(result?.error || 'Retry non riuscito')
            }
            await loadRestaurant()
        } catch (err: any) {
            toast.error(err?.message || 'Errore retry scontrino')
        } finally {
            setRetryingReceiptId(null)
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-10 max-w-3xl"
        >
            {openapiEnv && openapiEnv !== 'production' && (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/40 px-4 py-3 flex items-start gap-3">
                    <div className="text-2xl leading-none">⚠️</div>
                    <div className="text-sm">
                        <div className="font-bold text-amber-300">MODALITÀ SANDBOX — Scontrini fittizi</div>
                        <div className="text-amber-100/80 text-[12px] mt-1">
                            OpenAPI è configurato in modalità test/sandbox. Gli scontrini emessi
                            in questa fase <strong>NON sono trasmessi all'Agenzia delle Entrate</strong> e
                            non hanno valore fiscale. Per attivare la modalità reale, l'amministratore deve impostare
                            <code className="mx-1 px-1 bg-amber-500/20 rounded text-amber-200">OPENAPI_ENV=production</code>
                            nei secret Supabase.
                        </div>
                    </div>
                </div>
            )}

            <section className="rounded-xl bg-zinc-900/70 border border-white/10 overflow-hidden">
                <div className="flex items-center justify-between gap-4 px-4 py-4">
                    <div className="flex items-start gap-3 min-w-0">
                        <Receipt size={22} className={isActive ? 'text-emerald-400 mt-0.5' : 'text-zinc-400 mt-0.5'} weight="fill" />
                        <div>
                            <div className="text-white font-semibold">Scontrino fiscale digitale</div>
                            <div className="text-[12px] text-zinc-400 mt-0.5">
                                Attiva OpenAPI per generare PDF fiscale automatico sui pagamenti Stripe.
                            </div>
                        </div>
                    </div>
                    <Switch
                        checked={setupVisible}
                        disabled={status !== 'not_configured'}
                        onCheckedChange={(v) => {
                            setSetupOpen(v)
                            if (v && !isActive) setCredentialsOpen(true)
                        }}
                    />
                </div>
                {setupVisible && (
                    <div className="border-t border-white/5 px-4 py-3 text-[12px] text-zinc-400 flex items-start gap-2">
                        <Question size={16} className="text-zinc-500 mt-0.5 shrink-0" />
                        <span>
                            Flusso: dati fiscali, credenziali AdE, IVA default. Le credenziali non vengono salvate da Minthi.
                        </span>
                    </div>
                )}
            </section>

            {/* === STATUS BANNER === */}
            {setupVisible && (
                <>
                    <StatusBanner
                        status={status}
                        lastError={restaurant.openapi_last_error}
                        expiresAt={credentialsExpiresAt}
                        daysLeft={credentialsDaysLeft}
                        expiringSoon={credentialsExpiringSoon}
                    />
                    {(status === 'active' || status === 'failed' || status === 'not_configured') && restaurant.openapi_fiscal_id && (
                        <div className="-mt-6 flex justify-end">
                            <Button
                                onClick={handleVerifyConfiguration}
                                disabled={verifying}
                                size="sm"
                                variant="outline"
                                className="text-[12px] border-white/15 text-zinc-300 hover:bg-white/5"
                            >
                                {verifying ? 'Verifica in corso…' : '🔍 Verifica integrazione su OpenAPI'}
                            </Button>
                        </div>
                    )}
                </>
            )}

            {!setupVisible && (
                <div className="rounded-xl bg-zinc-900/40 border border-white/10 px-4 py-4 text-sm text-zinc-400">
                    Attiva l'interruttore per configurare dati fiscali e collegamento OpenAPI.
                </div>
            )}

            {setupVisible && (
                <>

            {/* === STATS LAST 30 DAYS === */}
            {isActive && stats && (
                <section>
                    <h3 className="text-[15px] font-bold text-white mb-3 px-1 tracking-wide uppercase">
                        Ultimi 30 giorni
                    </h3>
                    <div className="grid grid-cols-3 gap-3">
                        <StatCard label="Emessi" value={stats.sent_count} accent="emerald" />
                        <StatCard label="Falliti" value={stats.failed_count} accent={stats.failed_count > 0 ? 'red' : 'zinc'} />
                        <StatCard label="Fatturato" value={`€${(stats.revenue_total || 0).toFixed(2)}`} accent="amber" />
                    </div>
                </section>
            )}

            {isActive && (
                <section>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-[15px] font-bold text-white px-1 tracking-wide uppercase flex items-center gap-2">
                            <Receipt size={18} className="opacity-70" />
                            Archivio Scontrini
                        </h3>
                        <Button
                            variant="secondary"
                            size="sm"
                            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-white/10 text-xs h-7"
                            onClick={() => setShowReceipts(!showReceipts)}
                        >
                            {showReceipts ? 'Nascondi' : 'Mostra'}
                        </Button>
                    </div>

                    {showReceipts && (() => {
                        const filtered = recentReceipts.filter(r => {
                            if (receiptsDateFilter && !(r.created_at || '').startsWith(receiptsDateFilter)) return false
                            if (receiptsStatusFilter !== 'all') {
                                if (receiptsStatusFilter === 'pending') {
                                    if (!['pending', 'submitted', 'retry'].includes(r.openapi_status || '')) return false
                                } else if (r.openapi_status !== receiptsStatusFilter) return false
                            }
                            const q = receiptsSearch.trim().toLowerCase()
                            if (q) {
                                const hay = [
                                    receiptPrimaryLabel(r),
                                    r.openapi_receipt_id,
                                    String(r.total_amount || ''),
                                    r.customer_email,
                                    r.customer_tax_code,
                                    r.id,
                                ].filter(Boolean).join(' ').toLowerCase()
                                if (!hay.includes(q)) return false
                            }
                            return true
                        })

                        const statusCount = (status: typeof receiptsStatusFilter) => {
                            if (status === 'all') return recentReceipts.length
                            if (status === 'pending') return recentReceipts.filter(r => ['pending', 'submitted', 'retry'].includes(r.openapi_status || '')).length
                            return recentReceipts.filter(r => r.openapi_status === status).length
                        }

                        return (
                            <div className="rounded-xl bg-zinc-900/60 border border-white/10 overflow-hidden flex flex-col">
                                {/* Filters bar */}
                                <div className="p-3 border-b border-white/5 bg-black/20 space-y-2">
                                    <div className="flex gap-2 flex-wrap items-center">
                                        <Input
                                            type="search"
                                            placeholder="Cerca per importo, ID OpenAPI, email, codice fiscale cliente..."
                                            value={receiptsSearch}
                                            onChange={(e) => setReceiptsSearch(e.target.value)}
                                            className="h-8 text-xs bg-black/40 border-white/10 flex-1 min-w-[200px]"
                                        />
                                        <Input
                                            type="date"
                                            value={receiptsDateFilter}
                                            onChange={(e) => setReceiptsDateFilter(e.target.value)}
                                            className="h-8 text-xs bg-black/40 border-white/10 w-auto"
                                        />
                                        {(receiptsDateFilter || receiptsSearch || receiptsStatusFilter !== 'all') && (
                                            <Button variant="ghost" size="sm" className="h-8 text-xs text-zinc-400 px-2" onClick={() => { setReceiptsDateFilter(''); setReceiptsSearch(''); setReceiptsStatusFilter('all') }}>Reset</Button>
                                        )}
                                    </div>
                                    <div className="flex gap-1 flex-wrap">
                                        {(['all', 'ready', 'pending', 'failed', 'voided'] as const).map(s => {
                                            const labels = { all: 'Tutti', ready: '✅ Emessi', pending: '⏳ In corso', failed: '❌ Falliti', voided: '⊘ Annullati' }
                                            return (
                                                <Button
                                                    key={s}
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setReceiptsStatusFilter(s)}
                                                    className={`h-7 px-3 text-[11px] rounded ${receiptsStatusFilter === s ? 'bg-amber-500 text-black font-bold' : 'bg-black/40 text-zinc-400 hover:bg-white/5'}`}
                                                >
                                                    {labels[s]} <span className="ml-1 opacity-60">({statusCount(s)})</span>
                                                </Button>
                                            )
                                        })}
                                    </div>
                                </div>

                                {/* List */}
                                <div className="divide-y divide-white/5 max-h-[500px] overflow-y-auto">
                                    {filtered.length === 0 ? (
                                        <div className="px-4 py-6 text-[13px] text-zinc-500 text-center">
                                            Nessuno scontrino trovato con questi filtri.
                                        </div>
                                    ) : filtered.map(receipt => {
                                        const meta = fiscalReceiptStatusMeta(receipt.openapi_status)
                                        const canDownloadReceipt = Boolean(receipt.openapi_receipt_id) && receipt.openapi_status !== 'failed' && receipt.openapi_status !== 'voided'
                                        const isExpanded = receiptsExpanded === receipt.id
                                        const items: Array<{ description?: string, quantity?: number, unit_price?: number, unitPrice?: number, vat_rate_code?: string }> = Array.isArray((receipt as any).items) ? (receipt as any).items : []
                                        const errorLog: any[] = Array.isArray((receipt as any).error_log) ? (receipt as any).error_log : []
                                        return (
                                            <div key={receipt.id} className="hover:bg-white/5 transition-colors">
                                                <button
                                                    type="button"
                                                    onClick={() => setReceiptsExpanded(isExpanded ? null : receipt.id)}
                                                    className="w-full px-4 py-3 flex items-center gap-3 text-left"
                                                >
                                                    {/* Importo — colonna sinistra, grossa e immediata */}
                                                    <div className="shrink-0 w-20 text-right">
                                                        <div className={`text-base font-bold font-mono ${Number(receipt.total_amount) < 0 ? 'text-red-300' : 'text-zinc-100'}`}>
                                                            {formatEuro(receipt.total_amount)}
                                                        </div>
                                                        <div className="text-[10px] text-zinc-500 mt-0.5">
                                                            {formatReceiptDate(receipt.created_at)}
                                                        </div>
                                                    </div>

                                                    {/* Status badges — Stripe + AdE side-by-side */}
                                                    <div className="min-w-0 flex-1 space-y-1.5">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            {/* AdE badge */}
                                                            <span
                                                                className={`text-[11px] font-bold px-2 py-0.5 rounded-md border whitespace-nowrap ${meta.className}`}
                                                                title="Stato Agenzia delle Entrate"
                                                            >
                                                                AdE: {meta.label}
                                                            </span>
                                                            {/* Stripe badge */}
                                                            {(() => {
                                                                const ps = (receipt as any).payment_summary
                                                                if (!ps) return null
                                                                const stripeMeta = (() => {
                                                                    if (ps.status === 'paid') return { label: '✓ Pagato', cls: 'text-emerald-200 bg-emerald-500/10 border-emerald-500/30' }
                                                                    if (ps.status === 'refunded') return { label: '↩ Rimborsato', cls: 'text-red-200 bg-red-500/10 border-red-500/30' }
                                                                    if (ps.status === 'partial_refund') return { label: '↩ Rimb. parziale', cls: 'text-amber-200 bg-amber-500/10 border-amber-500/30' }
                                                                    if (ps.status === 'cash') return { label: '💵 Contanti/POS', cls: 'text-zinc-300 bg-zinc-700/30 border-white/10' }
                                                                    if (ps.status === 'stripe_pending') return { label: '⏳ In attesa', cls: 'text-sky-200 bg-sky-500/10 border-sky-500/30' }
                                                                    return null
                                                                })()
                                                                if (!stripeMeta) return null
                                                                return (
                                                                    <span
                                                                        className={`text-[11px] font-bold px-2 py-0.5 rounded-md border whitespace-nowrap ${stripeMeta.cls}`}
                                                                        title={`Stripe: pagato €${ps.total_paid.toFixed(2)}${ps.total_refunded > 0 ? ` · rimborsato €${ps.total_refunded.toFixed(2)}` : ''}`}
                                                                    >
                                                                        Stripe: {stripeMeta.label}
                                                                    </span>
                                                                )
                                                            })()}
                                                            {/* Refund tags */}
                                                            {(receipt as any).has_refund && (
                                                                <span className="text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap bg-amber-500/10 border-amber-500/30 text-amber-300" title="Esiste uno scontrino di reso collegato">
                                                                    ⊘ Reso emesso
                                                                </span>
                                                            )}
                                                            {(receipt.issued_via === 'refund_stripe' || receipt.issued_via === 'refund_manual') && (
                                                                <span className="text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap bg-red-500/10 border-red-500/30 text-red-300" title="Scontrino di reso/annullo">
                                                                    ↩ Reso
                                                                </span>
                                                            )}
                                                        </div>
                                                        {(receipt.openapi_receipt_id || (receipt as any).payment_summary?.card_last4) && (
                                                            <div className="text-[10px] text-zinc-500 font-mono truncate flex items-center gap-2">
                                                                {receipt.openapi_receipt_id && (
                                                                    <span>#{receipt.openapi_receipt_id.slice(-12)}</span>
                                                                )}
                                                                {(receipt as any).payment_summary?.card_brand && (receipt as any).payment_summary?.card_last4 && (
                                                                    <span className="text-zinc-600">
                                                                        · {(receipt as any).payment_summary.card_brand} •••• {(receipt as any).payment_summary.card_last4}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Caret */}
                                                    <span className="shrink-0 text-zinc-600 text-xs">{isExpanded ? '▲' : '▼'}</span>
                                                </button>

                                                {isExpanded && (
                                                    <div className="px-3 pb-3 pt-1 border-t border-white/5 bg-black/30 space-y-3 text-[12px]">
                                                        {/* Payment summary block (Stripe side) */}
                                                        {(receipt as any).payment_summary && (receipt as any).payment_summary.status !== 'none' && (
                                                            <div className="rounded bg-black/40 border border-white/10 p-2.5 space-y-1.5">
                                                                <div className="text-zinc-400 text-[10px] uppercase tracking-wide font-bold">💳 Pagamento Stripe</div>
                                                                <div className="grid grid-cols-2 gap-2">
                                                                    <div>
                                                                        <div className="text-zinc-500 text-[10px]">Incassato</div>
                                                                        <div className="text-emerald-300 font-bold font-mono">€{Number((receipt as any).payment_summary.total_paid || 0).toFixed(2)}</div>
                                                                    </div>
                                                                    <div>
                                                                        <div className="text-zinc-500 text-[10px]">Rimborsato</div>
                                                                        <div className={`font-bold font-mono ${Number((receipt as any).payment_summary.total_refunded) > 0 ? 'text-red-300' : 'text-zinc-500'}`}>
                                                                            €{Number((receipt as any).payment_summary.total_refunded || 0).toFixed(2)}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                {(receipt as any).payment_summary.stripe_payment_intent_id && (
                                                                    <div>
                                                                        <div className="text-zinc-500 text-[10px]">Payment Intent</div>
                                                                        <div className="font-mono text-[11px] break-all text-zinc-300">{(receipt as any).payment_summary.stripe_payment_intent_id}</div>
                                                                    </div>
                                                                )}
                                                                {(receipt as any).payment_summary.receipt_url && (
                                                                    <a
                                                                        href={(receipt as any).payment_summary.receipt_url}
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                        className="inline-flex items-center gap-1 text-[11px] text-amber-300 hover:text-amber-200 underline"
                                                                    >
                                                                        Apri ricevuta Stripe ↗
                                                                    </a>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* Status / IDs */}
                                                        <div className="grid grid-cols-2 gap-2 text-zinc-300">
                                                            <div>
                                                                <div className="text-zinc-500 text-[10px] uppercase">Stato AdE</div>
                                                                <div className="font-medium">{receipt.openapi_status}</div>
                                                            </div>
                                                            <div>
                                                                <div className="text-zinc-500 text-[10px] uppercase">ID OpenAPI</div>
                                                                <div className="font-mono text-[11px] break-all">{receipt.openapi_receipt_id || '—'}</div>
                                                            </div>
                                                            {receipt.customer_email && (
                                                                <div className="col-span-2">
                                                                    <div className="text-zinc-500 text-[10px] uppercase">Cliente</div>
                                                                    <div className="text-zinc-200">{receipt.customer_email}{receipt.customer_tax_code ? ` · CF ${receipt.customer_tax_code}` : ''}{receipt.customer_lottery_code ? ` · 🎰 ${receipt.customer_lottery_code}` : ''}</div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Items breakdown */}
                                                        {items.length > 0 && (
                                                            <div>
                                                                <div className="text-zinc-500 text-[10px] uppercase mb-1">Voci</div>
                                                                <div className="rounded bg-black/40 border border-white/5 divide-y divide-white/5">
                                                                    {items.slice(0, 12).map((it, idx) => (
                                                                        <div key={idx} className="px-2 py-1 flex items-center gap-2 text-[11px]">
                                                                            <span className="text-zinc-400 w-8">×{it.quantity || 1}</span>
                                                                            <span className="flex-1 text-zinc-200 truncate">{it.description || '—'}</span>
                                                                            <span className="text-zinc-500 font-mono">€{Number(it.unit_price ?? it.unitPrice ?? 0).toFixed(2)}</span>
                                                                            {it.vat_rate_code && <span className="text-zinc-600">IVA {it.vat_rate_code}</span>}
                                                                        </div>
                                                                    ))}
                                                                    {items.length > 12 && (
                                                                        <div className="px-2 py-1 text-[10px] text-zinc-500 text-center">+{items.length - 12} altri prodotti</div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Error log */}
                                                        {errorLog.length > 0 && (
                                                            <div>
                                                                <div className="text-red-400 text-[10px] uppercase mb-1">Errori (ultimi 3)</div>
                                                                <div className="rounded bg-red-950/40 border border-red-500/20 divide-y divide-red-500/10">
                                                                    {errorLog.slice(-3).map((err, idx) => (
                                                                        <div key={idx} className="px-2 py-1 text-[11px] text-red-200">
                                                                            <div className="text-red-400/70 text-[9px]">{err.at || ''}</div>
                                                                            <div className="break-all">{typeof err === 'string' ? err : (err.message || JSON.stringify(err).slice(0, 200))}</div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Verify on AdE hint */}
                                                        {receipt.openapi_status === 'ready' && (
                                                            <div className="rounded bg-emerald-950/40 border border-emerald-500/20 p-2 text-[11px] text-emerald-200">
                                                                ✓ Scontrino trasmesso all'Agenzia delle Entrate.
                                                                Puoi verificarlo accedendo a{' '}
                                                                <a href="https://www.agenziaentrate.gov.it/portale/web/guest/area-riservata" target="_blank" rel="noreferrer" className="underline">agenziaentrate.gov.it</a>
                                                                {' '}→ Area Riservata → Fatture e Corrispettivi → Corrispettivi Telematici.
                                                            </div>
                                                        )}

                                                        {/* Action buttons — primary CTA = Download PDF */}
                                                        <div className="flex items-center gap-2 flex-wrap pt-2">
                                                            {canDownloadReceipt && (
                                                                <Button
                                                                    type="button"
                                                                    onClick={() => handleReceiptPdf(receipt)}
                                                                    className="h-9 text-sm font-bold bg-amber-500 hover:bg-amber-400 text-black px-4 shadow-md shadow-amber-500/20"
                                                                >
                                                                    <DownloadSimple size={16} weight="bold" className="mr-1.5" />
                                                                    Scarica PDF scontrino
                                                                </Button>
                                                            )}
                                                            {receipt.openapi_status === 'failed' && (receipt.retry_count || 0) < 5 && (
                                                                <Button
                                                                    type="button"
                                                                    onClick={() => handleRetryReceipt(receipt.id)}
                                                                    disabled={retryingReceiptId === receipt.id}
                                                                    className="h-9 text-sm px-3 bg-red-900/40 hover:bg-red-800/50 text-red-100 border border-red-500/30"
                                                                >
                                                                    <ArrowsClockwise size={14} className={`mr-1 ${retryingReceiptId === receipt.id ? 'animate-spin' : ''}`} />
                                                                    Riprova invio
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* Load more + retention notice */}
                                <div className="px-3 py-2 border-t border-white/5 bg-black/20 flex items-center justify-between gap-2">
                                    <span className="text-[10px] text-zinc-500">
                                        {filtered.length} di {recentReceipts.length} caricati · Archiviazione 10 anni per legge
                                    </span>
                                    {recentReceipts.length >= receiptsLoadedCount && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={loadingMoreReceipts}
                                            onClick={async () => {
                                                setLoadingMoreReceipts(true)
                                                const next = receiptsLoadedCount + 50
                                                setReceiptsLoadedCount(next)
                                                await loadRestaurant(next)
                                                setLoadingMoreReceipts(false)
                                            }}
                                            className="h-7 text-[11px] text-amber-400 hover:bg-amber-500/10"
                                        >
                                            {loadingMoreReceipts ? 'Caricamento...' : '+ Carica altri 50'}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )
                    })()}
                </section>
            )}

            {/* === DATI ANAGRAFICI === */}
            <section>
                <h3 className="text-[15px] font-bold text-white mb-3 px-1 tracking-wide uppercase flex items-center gap-2">
                    <Buildings size={18} className="opacity-70" />
                    Dati Fiscali Attività
                </h3>
                <div className="rounded-xl bg-zinc-900/60 border border-white/10 shadow-lg shadow-black/20 overflow-hidden divide-y divide-white/5">
                    <Field label="Partita IVA *" hint="11 cifre, validata automaticamente">
                        <Input
                            value={vatNumber}
                            onChange={e => setVatNumber(e.target.value.replace(/\D/g, '').slice(0, 11))}
                            placeholder="12345678901"
                            inputMode="numeric"
                            className={`${vatNumber && !isValidVatIT(vatNumber) ? 'border-red-500/50' : ''}`}
                        />
                    </Field>
                    <Field label="Codice Fiscale (se ditta individuale)" hint="16 caratteri alfanumerici, opzionale per società">
                        <Input
                            value={taxCode}
                            onChange={e => setTaxCode(e.target.value.toUpperCase().slice(0, 16))}
                            placeholder="RSSMRA80A01H501Z"
                        />
                    </Field>
                    <Field label="Ragione Sociale *">
                        <Input value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Trattoria da Mario s.r.l." />
                    </Field>
                    <Field label="Indirizzo *">
                        <Input value={billingAddress} onChange={e => setBillingAddress(e.target.value)} placeholder="Via Roma 12" />
                    </Field>
                    <div className="grid grid-cols-3 gap-px bg-white/5">
                        <div className="bg-zinc-900/60 px-4 py-3">
                            <Label className="text-[12px] text-zinc-400 mb-2 block">Città *</Label>
                            <Input value={billingCity} onChange={e => setBillingCity(e.target.value)} placeholder="Milano" />
                        </div>
                        <div className="bg-zinc-900/60 px-4 py-3">
                            <Label className="text-[12px] text-zinc-400 mb-2 block">Prov. *</Label>
                            <Input value={billingProvince} onChange={e => setBillingProvince(e.target.value.toUpperCase().slice(0, 2))} placeholder="MI" maxLength={2} />
                        </div>
                        <div className="bg-zinc-900/60 px-4 py-3">
                            <Label className="text-[12px] text-zinc-400 mb-2 block">CAP *</Label>
                            <Input value={billingPostalCode} onChange={e => setBillingPostalCode(e.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="20121" inputMode="numeric" />
                        </div>
                    </div>
                    <Field label="Email aziendale *" hint="Riceverà notifiche dal provider">
                        <Input value={fiscalEmail} onChange={e => setFiscalEmail(e.target.value)} type="email" placeholder="amministrazione@ristorante.it" />
                    </Field>
                </div>
                <div className="flex justify-end mt-3">
                    <Button
                        onClick={() => handleSave(false)}
                        disabled={saving}
                        variant="secondary"
                        className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-white/10"
                    >
                        {saving ? 'Salvataggio…' : 'Salva dati anagrafici'}
                    </Button>
                </div>
            </section>

            {/* === CREDENZIALI ADE === */}
            {isActive && !credentialsOpen && (
                <section className="rounded-xl bg-zinc-900/60 border border-white/10 px-4 py-4 flex items-center justify-between gap-3">
                    <div>
                        <div className="text-[14px] font-semibold text-white">Credenziali AdE collegate</div>
                        <div className="text-[12px] text-zinc-400 mt-0.5">
                            Scadenza: {credentialsDaysLeft !== null ? `tra ${credentialsDaysLeft} giorni` : 'non disponibile'}
                        </div>
                    </div>
                    <Button
                        variant="secondary"
                        className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-white/10"
                        onClick={() => setCredentialsOpen(true)}
                    >
                        Aggiorna
                    </Button>
                </section>
            )}

            {credentialsOpen && (
            <section>
                <h3 className="text-[15px] font-bold text-white mb-3 px-1 tracking-wide uppercase flex items-center gap-2">
                    <Key size={18} className="opacity-70" />
                    Credenziali Agenzia Entrate
                </h3>

                <div className="rounded-xl bg-amber-500/5 border border-amber-500/30 px-4 py-3 mb-3 flex items-start gap-3">
                    <ShieldCheck size={18} className="text-amber-400 mt-0.5 shrink-0" weight="fill" />
                    <div className="text-[13px] text-amber-100/90 leading-relaxed">
                        Servono per autorizzare l'invio degli scontrini all'AdE. <strong>Non vengono salvate da MINTHI</strong> —
                        passano cifrate al provider OpenAPI che le custodisce conformemente alla normativa.
                        Devi <strong>rinnovarle ogni 90 giorni</strong> (l'AdE le scade automaticamente).
                    </div>
                </div>

                <div className="rounded-xl bg-zinc-900/60 border border-white/10 shadow-lg shadow-black/20 overflow-hidden divide-y divide-white/5">
                    <Field label="Codice fiscale del responsabile invio" hint="Persona registrata in Area Riservata AdE">
                        <Input
                            value={adeTaxCode}
                            onChange={e => setAdeTaxCode(e.target.value.toUpperCase().slice(0, 16))}
                            placeholder="RSSMRA80A01H501Z"
                            autoComplete="off"
                        />
                    </Field>
                    <Field label="Password Area Riservata AdE">
                        <div className="relative">
                            <Input
                                type={showPassword ? 'text' : 'password'}
                                value={adePassword}
                                onChange={e => setAdePassword(e.target.value)}
                                placeholder="••••••••"
                                autoComplete="new-password"
                                className="pr-10"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(v => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
                                aria-label={showPassword ? 'Nascondi' : 'Mostra'}
                            >
                                {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </Field>
                    <Field label="PIN AdE">
                        <div className="relative">
                            <Input
                                type={showPin ? 'text' : 'password'}
                                value={adePin}
                                onChange={e => setAdePin(e.target.value.replace(/\D/g, '').slice(0, 16))}
                                placeholder="••••"
                                inputMode="numeric"
                                autoComplete="off"
                                className="pr-10"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPin(v => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
                                aria-label={showPin ? 'Nascondi' : 'Mostra'}
                            >
                                {showPin ? <EyeSlash size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </Field>
                </div>

                <div className="flex justify-end mt-3">
                    {isActive && (
                        <Button
                            onClick={() => setCredentialsOpen(false)}
                            disabled={saving}
                            variant="ghost"
                            className="mr-2 text-zinc-400 hover:text-zinc-100"
                        >
                            Chiudi
                        </Button>
                    )}
                    <Button
                        onClick={() => handleSave(true)}
                        disabled={saving}
                        className="bg-amber-500 hover:bg-amber-400 text-black font-semibold"
                    >
                        {restaurant.openapi_status === 'active'
                            ? <><ArrowsClockwise size={16} className="mr-2" weight="bold" />Aggiorna credenziali AdE</>
                            : <>Attiva scontrino fiscale</>
                        }
                    </Button>
                </div>
            </section>
            )}

            {/* === EMISSIONE AUTOMATICA === */}
            {isActive && (
                <section>
                    <h3 className="text-[15px] font-bold text-white mb-3 px-1 tracking-wide uppercase flex items-center gap-2">
                        <Receipt size={18} className="opacity-70" />
                        Emissione automatica
                    </h3>
                    <div className="rounded-xl bg-zinc-900/60 border border-white/10 overflow-hidden divide-y divide-white/5">
                        <ToggleRow
                            title="Emetti scontrino fiscale automaticamente"
                            subtitle="Ogni pagamento Stripe confermato genera lo scontrino fiscale digitale, scaricabile dalla pagina ordine o dall'archivio."
                            checked={enableAuto}
                            onChange={async v => {
                                setEnableAuto(v)
                                try {
                                    await DatabaseService.onboardOpenApiMerchant({
                                        restaurantId: restaurantId,
                                        vatNumber: vatNumber.replace(/\s/g, ''),
                                        taxCode: taxCode || undefined,
                                        businessName,
                                        billingAddress,
                                        billingCity,
                                        billingProvince: billingProvince.toUpperCase(),
                                        billingPostalCode,
                                        fiscalEmail,
                                        enableAutoEmission: v,
                                    })
                                    toast.success(v ? 'Emissione automatica attiva' : 'Emissione automatica disattivata')
                                    await loadRestaurant()
                                } catch (err: any) {
                                    setEnableAuto(!v)
                                    toast.error(err?.message || 'Errore aggiornamento')
                                }
                            }}
                        />
                    </div>
                </section>
            )}

            {/* === IVA E PREFERENZE === */}
            <section>
                <h3 className="text-[15px] font-bold text-white mb-3 px-1 tracking-wide uppercase flex items-center gap-2">
                    <Percent size={18} className="opacity-70" />
                    Aliquota IVA
                </h3>
                <div className="rounded-xl bg-zinc-900/60 border border-white/10 overflow-hidden">
                    <div className="px-4 py-4 space-y-3">
                        <div className="text-[13px] text-zinc-400">
                            Aliquota IVA usata per i piatti che non ne hanno una propria.
                            Per i piatti specifici (es. acqua minerale 22%, libri 4%) puoi sovrascrivere
                            l'aliquota dalla scheda di ogni piatto.
                        </div>
                        <Select
                            value={defaultVatRate}
                            onValueChange={async (v) => {
                                setDefaultVatRate(v)
                                await handleSavePreferences({ defaultVatRateCode: v })
                            }}
                            disabled={savingPrefs}
                        >
                            <SelectTrigger className="bg-zinc-800/60 border-white/10 text-white">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="10">10% — Ristorazione, somministrazione cibo e bevande (default)</SelectItem>
                                <SelectItem value="22">22% — Bevande alcoliche, articoli non alimentari</SelectItem>
                                <SelectItem value="4">4% — Beni di prima necessità (pane, latte)</SelectItem>
                                <SelectItem value="5">5% — Erbe aromatiche, alcuni alimenti</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-[11px] text-zinc-500">
                            <strong className="text-zinc-300">In dubbio?</strong> Se il tuo locale è una
                            trattoria, ristorante o pizzeria con servizio al tavolo o asporto di cibo
                            preparato, l'aliquota corretta è quasi sempre <strong className="text-amber-400">10%</strong>.
                            Per alcolici, prodotti confezionati o casi esenti usa l'aliquota specifica
                            nella scheda del piatto e verifica col commercialista.
                        </p>
                    </div>
                </div>
            </section>

                </>
            )}
        </motion.div>
    )
}

function StatusBanner({
    status, lastError, daysLeft, expiringSoon
}: {
    status: string
    lastError?: string | null
    expiresAt?: Date | null
    daysLeft: number | null
    expiringSoon: boolean
}) {
    if (status === 'active' && expiringSoon) {
        return (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/40 px-4 py-3 flex items-start gap-3">
                <Warning size={20} className="text-amber-400 mt-0.5 shrink-0" weight="fill" />
                <div className="text-sm text-amber-100">
                    <div className="font-semibold">Credenziali AdE in scadenza</div>
                    <div className="text-amber-100/80 text-[13px] mt-1">
                        Scadono tra <strong>{daysLeft} giorni</strong>. Rinnovale qui sotto per evitare interruzioni nell'emissione degli scontrini.
                    </div>
                </div>
            </div>
        )
    }
    if (status === 'active') {
        return (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 flex items-start gap-3">
                <CheckCircle size={20} className="text-emerald-400 mt-0.5 shrink-0" weight="fill" />
                <div className="text-sm text-emerald-100">
                    <div className="font-semibold">Scontrino fiscale attivo</div>
                    <div className="text-emerald-100/80 text-[13px] mt-1">
                        Gli scontrini fiscali vengono emessi automaticamente sui pagamenti Stripe e inoltrati all'Agenzia delle Entrate.
                    </div>
                </div>
            </div>
        )
    }
    if (status === 'failed') {
        const err = friendlyFiscalError(lastError)
        return (
            <div className="rounded-xl bg-red-500/10 border border-red-500/40 px-4 py-3 flex items-start gap-3">
                <Warning size={20} className="text-red-400 mt-0.5 shrink-0" weight="fill" />
                <div className="text-sm text-red-100">
                    <div className="font-semibold">{err.title}</div>
                    <div className="text-red-100/80 text-[13px] mt-1">
                        {err.message}
                    </div>
                    <div className="text-red-100/60 text-[12px] mt-2 flex items-center gap-1.5">
                        <ArrowsClockwise size={14} className="shrink-0" />
                        {err.action}
                    </div>
                </div>
            </div>
        )
    }
    if (status === 'pending') {
        return (
            <div className="rounded-xl bg-zinc-800/60 border border-white/10 px-4 py-3 flex items-start gap-3">
                <Receipt size={20} className="text-zinc-400 mt-0.5 shrink-0" />
                <div className="text-sm text-zinc-200">
                    <div className="font-semibold">In attesa di completamento</div>
                    <div className="text-zinc-400 text-[13px] mt-1">
                        Hai salvato i dati anagrafici. Inserisci le credenziali AdE qui sotto per attivare l'emissione automatica.
                    </div>
                </div>
            </div>
        )
    }
    return (
        <div className="rounded-xl bg-zinc-800/60 border border-white/10 px-4 py-3 flex items-start gap-3">
            <Receipt size={20} className="text-zinc-400 mt-0.5 shrink-0" />
            <div className="text-sm text-zinc-200">
                <div className="font-semibold">Scontrino fiscale non configurato</div>
                <div className="text-zinc-400 text-[13px] mt-1">
                    Compila i dati fiscali e le credenziali Agenzia Entrate per attivare l'emissione automatica degli scontrini sui pagamenti Stripe.
                </div>
            </div>
        </div>
    )
}

function friendlyFiscalError(raw?: string | null): { title: string; message: string; action: string } {
    // Try to parse structured JSON error from the new backend
    let errorType = 'unknown'
    let errorMessage = ''
    try {
        const parsed = JSON.parse(raw || '')
        if (parsed?.type) errorType = parsed.type
        if (parsed?.message) errorMessage = parsed.message
    } catch {
        // Legacy plain-text error - parse with heuristics
        errorMessage = String(raw || '')
        const text = errorMessage.toLowerCase()
        if (text.includes('already exists') || text.includes('error":111')) {
            errorType = 'already_exists'
        } else if (text.includes('not found') || text.includes('error":424')) {
            errorType = 'not_found'
        } else if (text.includes('password') || text.includes('pin') || text.includes('credential')) {
            errorType = 'credentials'
        } else if (text.includes('verification_failed')) {
            errorType = 'verification_failed'
        } else if (text.includes('address') || text.includes('indirizzo')) {
            errorType = 'address'
        }
    }

    const messages: Record<string, { title: string; message: string; action: string }> = {
        already_exists: {
            title: 'P.IVA bloccata su OpenAPI',
            message: 'La P.IVA risulta occupata. Il sistema ha provato a ricreare la configurazione automaticamente ma non ci è riuscito.',
            action: 'Riprova fra qualche minuto. Se il problema persiste, contatta l\'assistenza OpenAPI per sbloccare la P.IVA.',
        },
        not_found: {
            title: 'Configurazione non trovata',
            message: 'OpenAPI non ha trovato una configurazione per questa P.IVA.',
            action: 'Verifica la P.IVA e riprova. Se hai cambiato ambiente OpenAPI, ri-inserisci le credenziali.',
        },
        credentials: {
            title: 'Credenziali AdE rifiutate',
            message: 'Le credenziali dell\'Agenzia delle Entrate non sono state accettate da OpenAPI.',
            action: 'Controlla il codice fiscale, la password e il PIN dell\'Area Riservata Agenzia Entrate e riprova.',
        },
        verification_failed: {
            title: 'Verifica post-attivazione fallita',
            message: errorMessage || 'La configurazione è stata creata ma la verifica finale non è andata a buon fine.',
            action: 'Ripremi "Attiva scontrino fiscale" per ritentare. Se il problema persiste, contatta l\'assistenza.',
        },
        address: {
            title: 'Indirizzo non accettato',
            message: 'L\'indirizzo non è stato accettato da OpenAPI.',
            action: 'Verifica via, numero civico, CAP, città e provincia. L\'indirizzo deve includere il civico (es. Via Roma 12).',
        },
        unknown: {
            title: 'Attivazione fallita',
            message: errorMessage || 'OpenAPI non ha accettato l\'attivazione.',
            action: 'Controlla P.IVA, indirizzo e credenziali AdE, poi riprova.',
        },
    }

    return messages[errorType] || messages.unknown
}

function fiscalReceiptStatusMeta(status: FiscalReceipt['openapi_status']) {
    if (status === 'ready') {
        // "ready" = AdE has acknowledged the receipt. This is the green
        // light the user should look for.
        return { label: '✓ AdE OK', className: 'text-emerald-200 bg-emerald-500/10 border-emerald-500/30' }
    }
    if (status === 'failed') {
        return { label: '✗ Fallito', className: 'text-red-200 bg-red-500/10 border-red-500/30' }
    }
    if (status === 'retry') {
        return { label: '↻ In retry', className: 'text-amber-200 bg-amber-500/10 border-amber-500/30' }
    }
    if (status === 'voided') {
        return { label: '⊘ Annullato', className: 'text-zinc-300 bg-zinc-700/50 border-white/10' }
    }
    return { label: '⏳ In trasmissione', className: 'text-sky-200 bg-sky-500/10 border-sky-500/30' }
}

function receiptPrimaryLabel(receipt: FiscalReceipt): string {
    if (receipt.openapi_receipt_id) return `OpenAPI ${receipt.openapi_receipt_id.slice(-8)}`
    if (receipt.stripe_session_id) return `Stripe ${receipt.stripe_session_id.slice(-8)}`
    return `Scontrino ${receipt.id.slice(0, 8)}`
}

function formatReceiptDate(value?: string | null): string {
    if (!value) return '-'
    return new Intl.DateTimeFormat('it-IT', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value))
}

function formatEuro(value?: number | null): string {
    return new Intl.NumberFormat('it-IT', {
        style: 'currency',
        currency: 'EUR',
    }).format(Number(value || 0))
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="px-4 py-3">
            <Label className="text-[12px] text-zinc-400 mb-1.5 block">{label}</Label>
            {children}
            {hint && <p className="text-[11px] text-zinc-500 mt-1.5">{hint}</p>}
        </div>
    )
}

function ToggleRow({
    title, subtitle, checked, onChange
}: { title: string; subtitle: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <div className="flex items-center justify-between gap-4 px-4 py-4">
            <div>
                <div className="text-[14px] text-white font-medium">{title}</div>
                <div className="text-[12px] text-zinc-400 mt-0.5">{subtitle}</div>
            </div>
            <Switch checked={checked} onCheckedChange={onChange} />
        </div>
    )
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent: 'emerald' | 'red' | 'amber' | 'zinc' }) {
    const colorMap: Record<string, string> = {
        emerald: 'text-emerald-400',
        red: 'text-red-400',
        amber: 'text-amber-400',
        zinc: 'text-zinc-300',
    }
    return (
        <div className="rounded-xl bg-zinc-900/60 border border-white/10 px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
            <div className={`text-2xl font-bold mt-1 ${colorMap[accent]}`}>{value}</div>
        </div>
    )
}
