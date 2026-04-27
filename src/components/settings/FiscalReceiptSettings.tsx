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
import type { Restaurant } from '@/services/types'
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
    TestTube,
    Percent,
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
    const [emailToCustomer, setEmailToCustomer] = useState(true)
    const [savingPrefs, setSavingPrefs] = useState(false)
    const [testingReceipt, setTestingReceipt] = useState(false)
    const [setupOpen, setSetupOpen] = useState(false)
    const [credentialsOpen, setCredentialsOpen] = useState(false)

    const [saving, setSaving] = useState(false)
    const [stats, setStats] = useState<{ sent_count: number; failed_count: number; voided_count: number; revenue_total: number } | null>(null)

    const loadRestaurant = async () => {
        setLoading(true)
        try {
            const dashboard = await DatabaseService.getOpenApiFiscalDashboard(restaurantId, false)
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
                setEmailToCustomer(r.fiscal_email_to_customer !== false)
                const configured = r.openapi_status && r.openapi_status !== 'not_configured'
                setSetupOpen(Boolean(configured || r.fiscal_receipts_enabled))
                setCredentialsOpen(r.openapi_status !== 'active')
                setStats(dashboard.stats || null)
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

    async function handleTestReceipt() {
        setTestingReceipt(true)
        try {
            const result = await DatabaseService.issueFiscalTestReceipt(restaurantId)
            if (result?.alreadyIssued) {
                toast.success('Scontrino di test già emesso in precedenza')
            } else if (result?.skipped) {
                toast.error(result.message || 'Test non eseguito: completa prima l\'attivazione')
            } else {
                toast.success('Scontrino di test emesso! Verifica la dashboard OpenAPI.')
            }
            await loadRestaurant()
        } catch (err: any) {
            toast.error(err?.message || 'Errore emissione test')
        } finally {
            setTestingReceipt(false)
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-10 max-w-3xl"
        >
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
                <StatusBanner
                    status={status}
                    lastError={restaurant.openapi_last_error}
                    expiresAt={credentialsExpiresAt}
                    daysLeft={credentialsDaysLeft}
                    expiringSoon={credentialsExpiringSoon}
                />
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
                            subtitle="Ogni pagamento Stripe (asporto e tavoli) genera lo scontrino. Se il cliente lascia l'email, riceverà il PDF in automatico."
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
                        <ToggleRow
                            title="Invia il PDF al cliente via email"
                            subtitle="Quando il cliente lascia un'email durante il checkout, riceve lo scontrino fiscale in PDF."
                            checked={emailToCustomer}
                            onChange={async v => {
                                setEmailToCustomer(v)
                                await handleSavePreferences({ fiscalEmailToCustomer: v })
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

            {/* === TEST INTEGRAZIONE === */}
            {isActive && (
                <section>
                    <h3 className="text-[15px] font-bold text-white mb-3 px-1 tracking-wide uppercase flex items-center gap-2">
                        <TestTube size={18} className="opacity-70" />
                        Test integrazione
                    </h3>
                    <div className="rounded-xl bg-zinc-900/60 border border-white/10 px-4 py-4">
                        <div className="text-[13px] text-zinc-400 mb-3">
                            Emette uno scontrino di test da <strong>€1,00</strong> verso l'ambiente
                            sandbox di OpenAPI per verificare che le credenziali e l'integrazione
                            funzionino correttamente. Non viene inviato all'Agenzia delle Entrate
                            in ambiente di test.
                        </div>
                        <Button
                            onClick={handleTestReceipt}
                            disabled={testingReceipt || !enableAuto}
                            variant="secondary"
                            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-white/10"
                        >
                            <TestTube size={16} className="mr-2" weight="bold" />
                            {testingReceipt ? 'Emissione in corso…' : 'Emetti scontrino di test'}
                        </Button>
                        {!enableAuto && (
                            <div className="text-[11px] text-amber-400/80 mt-2">
                                Attiva l'emissione automatica qui sopra per poter testare.
                            </div>
                        )}
                    </div>
                </section>
            )}
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
        const friendlyError = friendlyFiscalError(lastError)
        return (
            <div className="rounded-xl bg-red-500/10 border border-red-500/40 px-4 py-3 flex items-start gap-3">
                <Warning size={20} className="text-red-400 mt-0.5 shrink-0" weight="fill" />
                <div className="text-sm text-red-100">
                    <div className="font-semibold">Attivazione fallita</div>
                    <div className="text-red-100/80 text-[13px] mt-1">
                        {friendlyError}
                    </div>
                    <div className="text-red-100/60 text-[12px] mt-1">
                        Ripremi “Attiva scontrino fiscale” dopo aver controllato i campi.
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

function friendlyFiscalError(raw?: string | null): string {
    const text = String(raw || '').toLowerCase()
    if (text.includes('not found or not registered') || text.includes('error":424')) {
        return 'La configurazione sandbox OpenAPI era disallineata. Il sistema ora prova ad agganciarla o ricrearla automaticamente.'
    }
    if (text.includes('already exists') || text.includes('error":111')) {
        return 'Questa P.IVA risulta già presente su OpenAPI. Il sistema prova ad agganciarla automaticamente.'
    }
    if (text.includes('password') || text.includes('pin') || text.includes('credential')) {
        return 'Le credenziali AdE non sono state accettate. Controlla codice fiscale, password e PIN.'
    }
    return 'OpenAPI non ha accettato l’attivazione. Controlla P.IVA, indirizzo e credenziali AdE.'
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
