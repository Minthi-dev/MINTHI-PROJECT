import { useState, useEffect, useRef } from 'react'
import { DatabaseService } from '../services/DatabaseService'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { ArrowRight, ChefHat } from 'lucide-react'
import { User } from '../services/types'

interface ClientTableAccessProps {
    tableId: string
    onAccessGranted: (user: User) => void
}

// Fixed dark theme colors
const C = {
    primary: '#f59e0b',
    pageBgGradient: 'linear-gradient(to bottom, #09090b, #171717, #18181b)',
    cardBg: 'rgba(24, 24, 27, 0.9)',
    cardBorder: 'rgba(255, 255, 255, 0.06)',
    inputBg: 'rgba(24, 24, 27, 0.5)',
    inputBorder: 'rgba(255, 255, 255, 0.1)',
    textPrimary: '#ffffff',
    textSecondary: '#a1a1aa',
    textMuted: '#52525b',
    primaryAlpha: (o: number) => `rgba(245, 158, 11, ${o})`,
}

export default function ClientTableAccess({ tableId, onAccessGranted }: ClientTableAccessProps) {
    const [pin, setPin] = useState(['', '', '', ''])
    const [loading, setLoading] = useState(false)
    const [tableName, setTableName] = useState<string>('')
    const [restaurantName, setRestaurantName] = useState<string>('')
    const inputRefs = useRef<(HTMLInputElement | null)[]>([])

    useEffect(() => {
        const fetchTableInfo = async () => {
            try {
                const { data } = await supabase
                    .from('tables')
                    .select('number, restaurants(name)')
                    .eq('id', tableId)
                    .single()

                if (data) {
                    setTableName(data.number)
                    if (data.restaurants) {
                        setRestaurantName((data.restaurants as unknown as { name: string }).name || '')
                    }
                }
            } catch (error) {
                console.error('Error fetching table info', error)
            }
        }
        fetchTableInfo()

        setTimeout(() => {
            inputRefs.current[0]?.focus()
        }, 100)
    }, [tableId])

    const handlePinChange = (index: number, value: string) => {
        const numericValue = value.replace(/[^0-9]/g, '')

        if (numericValue.length > 1) {
            const chars = numericValue.split('').slice(0, 4 - index)
            const newPin = [...pin]
            chars.forEach((char, i) => {
                if (index + i < 4) newPin[index + i] = char
            })
            setPin(newPin)
            const nextIndex = Math.min(3, index + chars.length)
            inputRefs.current[nextIndex]?.focus()
            return
        }

        const newPin = [...pin]
        newPin[index] = numericValue
        setPin(newPin)

        if (numericValue && index < 3) {
            inputRefs.current[index + 1]?.focus()
        }
    }

    const handlePinFocus = (index: number) => {
        const firstEmptyIndex = pin.findIndex(digit => digit === '')
        if (firstEmptyIndex !== -1 && firstEmptyIndex !== index) {
            inputRefs.current[firstEmptyIndex]?.focus()
        } else {
            inputRefs.current[index]?.select()
        }
    }

    const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace' && !pin[index] && index > 0) {
            inputRefs.current[index - 1]?.focus()
        }
    }

    const handleAccess = async () => {
        const fullPin = pin.join('')
        if (fullPin.length < 4) {
            toast.error('Inserisci il PIN completo')
            return
        }

        setLoading(true)
        try {
            const isValid = await DatabaseService.verifySessionPin(tableId, fullPin)

            if (isValid) {
                const tempUser: User = {
                    id: 'customer-' + Date.now(),
                    name: 'Cliente',
                    role: 'CUSTOMER',
                    email: 'customer@temp.com'
                }
                onAccessGranted(tempUser)
                toast.success('Accesso effettuato')
            } else {
                toast.error('PIN non valido')
                setPin(['', '', '', ''])
                inputRefs.current[0]?.focus()
            }
        } catch (error) {
            console.error('Access error:', error)
            toast.error('Errore di connessione')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-[100dvh] flex items-center justify-center relative overflow-hidden font-sans" style={{ background: C.pageBgGradient }}>
            <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl" style={{ backgroundColor: C.primaryAlpha(0.08) }}></div>
            <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl bg-slate-500/10"></div>

            <Card className="w-full max-w-md relative z-10 overflow-hidden shadow-2xl backdrop-blur-xl" style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder, borderRadius: '12px' }}>
                <CardHeader className="text-center pb-2 pt-10">
                    <div className="mx-auto mb-6 relative">
                        <div className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg border" style={{ backgroundColor: C.primaryAlpha(0.1), borderColor: C.primaryAlpha(0.2) }}>
                            <ChefHat size={40} style={{ color: C.primary }} />
                        </div>
                    </div>

                    <CardTitle className="text-3xl font-bold tracking-tight" style={{ color: C.textPrimary }}>
                        {restaurantName || 'Minthi'}
                    </CardTitle>
                    <CardDescription className="font-medium text-sm mt-2" style={{ color: C.textSecondary }}>
                        Accedi al menu e ordina
                    </CardDescription>
                </CardHeader>

                <CardContent className="px-8 pb-10 pt-6 space-y-8">
                    <div className="text-center space-y-8">
                        {tableName && (
                            <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full backdrop-blur-sm border shadow-sm" style={{ backgroundColor: C.inputBg, borderColor: C.inputBorder }}>
                                <span className="font-bold text-2xl" style={{ color: C.textPrimary }}>{tableName}</span>
                            </div>
                        )}

                        <div className="space-y-4">
                            <div className="flex justify-center gap-3">
                                {pin.map((digit, idx) => (
                                    <input
                                        key={idx}
                                        ref={(el) => { inputRefs.current[idx] = el }}
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        maxLength={1}
                                        value={digit}
                                        onChange={(e) => handlePinChange(idx, e.target.value)}
                                        onKeyDown={(e) => handleKeyDown(idx, e)}
                                        onFocus={() => handlePinFocus(idx)}
                                        onClick={() => handlePinFocus(idx)}
                                        className="w-14 h-16 text-center text-3xl font-bold border rounded-xl outline-none transition-all shadow-inner"
                                        style={{
                                            backgroundColor: C.inputBg,
                                            borderColor: digit ? C.primary : C.inputBorder,
                                            color: C.textPrimary,
                                            boxShadow: digit ? `0 0 0 4px ${C.primaryAlpha(0.1)}` : 'none'
                                        }}
                                        placeholder="•"
                                        autoComplete="off"
                                    />
                                ))}
                            </div>
                            <p className="text-xs" style={{ color: C.textMuted }}>Inserisci il PIN fornito dal personale</p>
                        </div>
                    </div>

                    <Button
                        className="w-full h-14 text-base font-bold shadow-lg transition-all active:scale-[0.98]"
                        style={{ backgroundColor: C.primary, color: '#000000', borderRadius: '12px', boxShadow: `0 10px 15px -3px ${C.primaryAlpha(0.2)}` }}
                        onClick={handleAccess}
                        disabled={loading || pin.some(d => !d)}
                    >
                        {loading ? (
                            <div className="flex items-center gap-2">
                                <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                <span>Verifica in corso...</span>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center gap-2">
                                <span>Accedi al Menu</span>
                                <ArrowRight size={20} />
                            </div>
                        )}
                    </Button>
                </CardContent>
            </Card>

            <div className="absolute bottom-6 text-xs" style={{ color: C.textMuted }}>
                Powered by Minthi
            </div>
        </div>
    )
}
