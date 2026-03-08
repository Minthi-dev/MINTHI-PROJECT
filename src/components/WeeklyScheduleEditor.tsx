import React, { useState, useEffect } from 'react'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Sun, Moon, CalendarBlank, CurrencyEur, Check, X, Timer } from '@phosphor-icons/react'
import type { WeeklyCopertoSchedule, WeeklyAyceSchedule, DaySchedule, DayMealConfig } from '@/services/types'

const DAYS = [
    { key: 'monday', label: 'Lunedì', short: 'Lun' },
    { key: 'tuesday', label: 'Martedì', short: 'Mar' },
    { key: 'wednesday', label: 'Mercoledì', short: 'Mer' },
    { key: 'thursday', label: 'Giovedì', short: 'Gio' },
    { key: 'friday', label: 'Venerdì', short: 'Ven' },
    { key: 'saturday', label: 'Sabato', short: 'Sab' },
    { key: 'sunday', label: 'Domenica', short: 'Dom' },
] as const

type DayKey = typeof DAYS[number]['key']

interface WeeklyScheduleEditorProps {
    type: 'coperto' | 'ayce'
    schedule: WeeklyCopertoSchedule | WeeklyAyceSchedule
    onChange: (schedule: WeeklyCopertoSchedule | WeeklyAyceSchedule) => void
}

// Helper component to handle local state for price inputs
// Prevents "0" snap-back when clearing the input
const PriceInput = ({ value, onChange, className, ...props }: { value: number, onChange: (val: number) => void } & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'>) => {
    const [localValue, setLocalValue] = useState(value?.toString() || '0')

    useEffect(() => {
        // If local is empty and value is 0, DO NOT sync (allows empty state)
        if (localValue === '' && value === 0) return

        // If values match numerically, don't sync (preserves "1.0" vs "1")
        if (parseFloat(localValue) === value) return

        setLocalValue(value.toString())
    }, [value])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        setLocalValue(val)
        if (val === '') {
            onChange(0)
        } else {
            const parsed = parseFloat(val)
            if (!isNaN(parsed)) onChange(parsed)
        }
    }

    return (
        <Input
            type="number"
            value={localValue}
            onChange={handleChange}
            className={className}
            {...props}
        />
    )
}

export default function WeeklyScheduleEditor({
    type,
    schedule,
    onChange
}: WeeklyScheduleEditorProps) {
    const [showAdvanced, setShowAdvanced] = useState(schedule.useWeeklySchedule)

    const updateDefaultPrice = (price: number) => {
        onChange({ ...schedule, defaultPrice: price })
    }

    const updateDefaultMaxOrders = (maxOrders: number) => {
        onChange({ ...schedule, defaultMaxOrders: maxOrders } as any)
    }

    const updateDefaultOrderInterval = (interval: number) => {
        onChange({ ...schedule, defaultOrderInterval: interval } as any)
    }

    const updateEnabled = (enabled: boolean) => {
        onChange({ ...schedule, enabled })
    }

    const updateUseWeeklySchedule = (use: boolean) => {
        setShowAdvanced(use)
        onChange({ ...schedule, useWeeklySchedule: use })
    }

    const updateDayMeal = (day: DayKey, meal: 'lunch' | 'dinner', config: Partial<DayMealConfig>) => {
        const daySchedule = schedule.schedule[day] || {}
        const mealConfig = daySchedule[meal] || { enabled: false, price: schedule.defaultPrice }

        onChange({
            ...schedule,
            schedule: {
                ...schedule.schedule,
                [day]: {
                    ...daySchedule,
                    [meal]: { ...mealConfig, ...config }
                }
            }
        })
    }

    const getMealConfig = (day: DayKey, meal: 'lunch' | 'dinner'): DayMealConfig => {
        const daySchedule = schedule.schedule[day]
        if (!daySchedule || !daySchedule[meal]) {
            return { enabled: true, price: schedule.defaultPrice }
        }
        return daySchedule[meal]!
    }

    const applyToAll = (meal: 'lunch' | 'dinner', enabled: boolean, price: number) => {
        const newSchedule = { ...schedule.schedule }
        DAYS.forEach(({ key }) => {
            newSchedule[key] = {
                ...newSchedule[key],
                [meal]: { enabled, price }
            }
        })
        onChange({ ...schedule, schedule: newSchedule })
    }

    const title = type === 'coperto' ? 'Coperto' : 'All You Can Eat'
    const icon = type === 'coperto' ? <CurrencyEur size={20} weight="duotone" /> : <CalendarBlank size={20} weight="duotone" />

    return (
        <div className="space-y-4">
            {/* Main Enable Toggle */}
            <div className="flex items-center justify-between p-4 bg-zinc-900/50 rounded-xl border border-zinc-800">
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center",
                        schedule.enabled ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-800 text-zinc-500"
                    )}>
                        {icon}
                    </div>
                    <div>
                        <h3 className="font-semibold text-white">{title}</h3>
                        <p className="text-xs text-zinc-500">
                            {schedule.enabled ? 'Attivo' : 'Disattivato'}
                        </p>
                    </div>
                </div>
                <Switch
                    checked={schedule.enabled}
                    onCheckedChange={updateEnabled}
                />
            </div>

            {schedule.enabled && (
                <>
                    {/* Default Price */}
                    <div className="flex items-center gap-4 p-4 bg-zinc-900/30 rounded-xl border border-zinc-800/50">
                        <Label className="text-zinc-400 whitespace-nowrap">Prezzo Base:</Label>
                        <div className="relative flex-1 max-w-[120px]">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">€</span>
                            <PriceInput
                                value={schedule.defaultPrice}
                                onChange={updateDefaultPrice}
                                step="0.5"
                                min="0"
                                className="pl-7 bg-zinc-900 border-zinc-700 h-9"
                            />
                        </div>

                        <div className="flex items-center gap-2 ml-auto relative z-10">
                            <Label className="text-zinc-400 text-sm">Varia per giorno:</Label>
                            <Switch
                                checked={showAdvanced}
                                onCheckedChange={updateUseWeeklySchedule}
                            />
                        </div>
                    </div>

                    {/* Max Orders Limit (AYCE only) */}
                    {type === 'ayce' && (
                        <div className="flex items-center gap-4 p-4 bg-zinc-900/30 rounded-xl border border-zinc-800/50">
                            <div className="flex-1 min-w-0">
                                <Label className="text-zinc-400 whitespace-nowrap">Limite ordini per tavolo</Label>
                                <p className="text-[11px] text-zinc-600 mt-0.5">Massimo ordini per sessione (0 = illimitato)</p>
                            </div>
                            <div className="relative w-[80px]">
                                <PriceInput
                                    value={(schedule as WeeklyAyceSchedule).defaultMaxOrders || 0}
                                    onChange={updateDefaultMaxOrders}
                                    step="1"
                                    min="0"
                                    className="bg-zinc-900 border-zinc-700 h-9 text-center"
                                />
                            </div>
                        </div>
                    )}

                    {/* Order Interval (AYCE only) */}
                    {type === 'ayce' && (
                        <div className="flex items-center gap-4 p-4 bg-zinc-900/30 rounded-xl border border-zinc-800/50">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                <Timer size={16} className="text-zinc-500 shrink-0" />
                                <div>
                                    <Label className="text-zinc-400 whitespace-nowrap">Intervallo tra ordini</Label>
                                    <p className="text-[11px] text-zinc-600 mt-0.5">Minuti minimi tra un ordine e l'altro (0 = nessun limite)</p>
                                </div>
                            </div>
                            <div className="relative w-[100px] flex items-center gap-1">
                                <PriceInput
                                    value={(schedule as WeeklyAyceSchedule).defaultOrderInterval || 0}
                                    onChange={updateDefaultOrderInterval}
                                    step="1"
                                    min="0"
                                    className="bg-zinc-900 border-zinc-700 h-9 text-center"
                                />
                                <span className="text-zinc-500 text-xs">min</span>
                            </div>
                        </div>
                    )}

                    {/* Weekly Schedule Grid */}
                    {showAdvanced && (
                        <Card className="bg-zinc-900/50 border-zinc-800 p-4 space-y-4">
                            <div className="flex items-center justify-between text-xs text-zinc-500 uppercase tracking-wider px-2">
                                <span>Giorno</span>
                                <div className="flex gap-8">
                                    <span className="flex items-center gap-1">
                                        <Sun size={14} weight="duotone" className="text-amber-400" />
                                        Pranzo
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Moon size={14} weight="duotone" className="text-indigo-400" />
                                        Cena
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                {DAYS.map(({ key, label, short }) => (
                                    <div
                                        key={key}
                                        className="flex items-center justify-between p-3 bg-zinc-800/30 rounded-lg hover:bg-zinc-800/50 transition-colors"
                                    >
                                        <span className="font-medium text-zinc-300 w-24">{short}</span>

                                        <div className="flex gap-6">
                                            {/* Lunch */}
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => updateDayMeal(key, 'lunch', { enabled: !getMealConfig(key, 'lunch').enabled })}
                                                    className={cn(
                                                        "w-6 h-6 rounded-md flex items-center justify-center transition-all",
                                                        getMealConfig(key, 'lunch').enabled
                                                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/50"
                                                            : "bg-zinc-800 text-zinc-600 border border-zinc-700"
                                                    )}
                                                >
                                                    {getMealConfig(key, 'lunch').enabled ? <Check size={14} weight="bold" /> : <X size={14} />}
                                                </button>
                                                <PriceInput
                                                    value={getMealConfig(key, 'lunch').price}
                                                    onChange={(val) => updateDayMeal(key, 'lunch', { price: val })}
                                                    disabled={!getMealConfig(key, 'lunch').enabled}
                                                    step="0.5"
                                                    min="0"
                                                    className="w-20 h-8 text-sm bg-zinc-900 border-zinc-700 disabled:opacity-40"
                                                />
                                            </div>

                                            {/* Dinner */}
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => updateDayMeal(key, 'dinner', { enabled: !getMealConfig(key, 'dinner').enabled })}
                                                    className={cn(
                                                        "w-6 h-6 rounded-md flex items-center justify-center transition-all",
                                                        getMealConfig(key, 'dinner').enabled
                                                            ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/50"
                                                            : "bg-zinc-800 text-zinc-600 border border-zinc-700"
                                                    )}
                                                >
                                                    {getMealConfig(key, 'dinner').enabled ? <Check size={14} weight="bold" /> : <X size={14} />}
                                                </button>
                                                <PriceInput
                                                    value={getMealConfig(key, 'dinner').price}
                                                    onChange={(val) => updateDayMeal(key, 'dinner', { price: val })}
                                                    disabled={!getMealConfig(key, 'dinner').enabled}
                                                    step="0.5"
                                                    min="0"
                                                    className="w-20 h-8 text-sm bg-zinc-900 border-zinc-700 disabled:opacity-40"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Quick Actions */}
                            <div className="flex gap-2 pt-2 border-t border-zinc-800">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-xs border-zinc-700 hover:bg-amber-500/10 hover:text-amber-400 hover:border-amber-500/50"
                                    onClick={() => applyToAll('lunch', true, schedule.defaultPrice)}
                                >
                                    <Sun size={12} className="mr-1" />
                                    Attiva tutti i pranzi
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-xs border-zinc-700 hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/50"
                                    onClick={() => applyToAll('dinner', true, schedule.defaultPrice)}
                                >
                                    <Moon size={12} className="mr-1" />
                                    Attiva tutte le cene
                                </Button>
                            </div>
                        </Card>
                    )}
                </>
            )}
        </div>
    )
}
