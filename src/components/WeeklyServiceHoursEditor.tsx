import React, { useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Sun, Moon, CalendarCheck, Check, X, Clock, Info } from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'
import type { WeeklyServiceSchedule } from '@/services/types'

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

interface WeeklyServiceHoursEditorProps {
    schedule: WeeklyServiceSchedule
    onChange: (schedule: WeeklyServiceSchedule) => void
    defaultLunchStart?: string
    defaultLunchEnd?: string
    defaultDinnerStart?: string
    defaultDinnerEnd?: string
}

export default function WeeklyServiceHoursEditor({
    schedule,
    onChange,
    defaultLunchStart = '12:00',
    defaultLunchEnd = '15:00',
    defaultDinnerStart = '19:00',
    defaultDinnerEnd = '23:00'
}: WeeklyServiceHoursEditorProps) {
    const [showAdvanced, setShowAdvanced] = useState(schedule?.useWeeklySchedule || false)
    const [showInfo, setShowInfo] = useState(false)

    const updateUseWeeklySchedule = (use: boolean) => {
        setShowAdvanced(use)
        onChange({ ...schedule, useWeeklySchedule: use })
    }

    const updateDayMeal = (day: DayKey, meal: 'lunch' | 'dinner', config: Partial<{ enabled: boolean; start: string; end: string }>) => {
        const daySchedule = schedule.schedule?.[day] || {}
        const defaultStart = meal === 'lunch' ? defaultLunchStart : defaultDinnerStart;
        const defaultEnd = meal === 'lunch' ? defaultLunchEnd : defaultDinnerEnd;
        const mealConfig = daySchedule[meal] || { enabled: false, start: defaultStart, end: defaultEnd }

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

    const getMealConfig = (day: DayKey, meal: 'lunch' | 'dinner') => {
        const daySchedule = schedule?.schedule?.[day]
        const defaultStart = meal === 'lunch' ? defaultLunchStart : defaultDinnerStart;
        const defaultEnd = meal === 'lunch' ? defaultLunchEnd : defaultDinnerEnd;
        if (!daySchedule || !daySchedule[meal]) {
            return { enabled: false, start: defaultStart, end: defaultEnd }
        }
        return daySchedule[meal]!
    }

    const applyToAll = (meal: 'lunch' | 'dinner') => {
        const newSchedule = { ...schedule.schedule }

        // Find the first enabled day to copy from, otherwise use defaults
        let sourceStart = meal === 'lunch' ? defaultLunchStart : defaultDinnerStart;
        let sourceEnd = meal === 'lunch' ? defaultLunchEnd : defaultDinnerEnd;

        for (const { key } of DAYS) {
            const conf = getMealConfig(key, meal);
            if (conf.enabled) {
                sourceStart = conf.start;
                sourceEnd = conf.end;
                break;
            }
        }

        DAYS.forEach(({ key }) => {
            const currentObj = newSchedule[key] || {};
            newSchedule[key as DayKey] = {
                ...currentObj,
                [meal]: { enabled: true, start: sourceStart, end: sourceEnd }
            }
        })
        onChange({ ...schedule, schedule: newSchedule })
    }

    return (
        <motion.div layout className="space-y-4">
            {/* Main Toggle Header */}
            <motion.div layout className="flex items-center justify-between p-4 bg-zinc-900/60 rounded-2xl border border-zinc-800 shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-amber-500/20 text-amber-500 border border-amber-500/30 shrink-0 shadow-inner">
                        <CalendarCheck size={24} weight="duotone" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            Orari di Servizio
                            <button onClick={() => setShowInfo(prev => !prev)}>
                                <Info size={18} className={`transition-colors ${showInfo ? 'text-amber-500' : 'text-zinc-500 hover:text-amber-500'}`} weight="fill" />
                            </button>
                        </h3>
                        <p className="text-sm text-zinc-400">
                            Gestisci i giorni di apertura e gli orari di coprifuoco ordini
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 bg-black/40 p-2 px-4 rounded-xl border border-white/5">
                    <Label className="text-zinc-300 text-sm font-semibold cursor-pointer">Settimanale</Label>
                    <Switch
                        checked={showAdvanced}
                        onCheckedChange={updateUseWeeklySchedule}
                        className="data-[state=checked]:bg-amber-500 scale-110"
                    />
                </div>
            </motion.div>

            {showInfo && (
                <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-4 text-sm text-zinc-400 leading-relaxed">
                    <strong className="text-amber-400">Orari di Servizio</strong> — Configura gli orari di apertura per pranzo e cena. Questi orari determinano quando i clienti possono ordinare dal QR code e quando i tavoli sono disponibili per le prenotazioni online. Con la modalità "Settimanale" puoi impostare orari diversi per ogni giorno (es. chiuso il lunedì, solo cena il martedì). Se un servizio è disattivato per un giorno, il QR code non accetterà ordini in quella fascia oraria.
                </div>
            )}

            {/* Weekly Schedule Grid */}
            <AnimatePresence>
                {showAdvanced && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="overflow-hidden"
                    >
                        <Card className="bg-zinc-900/40 border-zinc-800 p-2 sm:p-4 space-y-3 shadow-lg rounded-2xl">
                            {/* Header row */}
                            <div className="grid grid-cols-[3rem_1fr_1fr] md:grid-cols-[4rem_1fr_1fr] gap-4 items-center px-4 py-2 border-b border-white/5">
                                <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Giorno</span>
                                <span className="flex items-center gap-2 text-xs font-bold text-amber-500 uppercase tracking-wider">
                                    <Sun size={14} weight="fill" /> Pranzo
                                </span>
                                <span className="flex items-center gap-2 text-xs font-bold text-indigo-400 uppercase tracking-wider">
                                    <Moon size={14} weight="fill" /> Cena
                                </span>
                            </div>

                            <div className="space-y-1.5">
                                {DAYS.map(({ key, short, label }) => (
                                    <div
                                        key={key}
                                        className="grid grid-cols-[3rem_1fr_1fr] md:grid-cols-[4rem_1fr_1fr] gap-4 items-center py-2.5 px-4 rounded-xl hover:bg-zinc-800/40 transition-colors border border-transparent hover:border-white/5"
                                    >
                                        <span className="font-semibold text-zinc-200 text-sm shrink-0 md:hidden">{short}</span>
                                        <span className="font-semibold text-zinc-200 text-sm shrink-0 hidden md:inline">{label}</span>

                                        {/* Lunch */}
                                        <div className="flex items-center gap-3 min-w-0 bg-black/20 p-1.5 rounded-lg border border-white/5">
                                            <button
                                                onClick={() => updateDayMeal(key, 'lunch', { enabled: !getMealConfig(key, 'lunch').enabled })}
                                                className={cn(
                                                    "w-7 h-7 rounded-md flex items-center justify-center transition-all shrink-0 shadow-sm",
                                                    getMealConfig(key, 'lunch').enabled
                                                        ? "bg-amber-500 text-black font-bold"
                                                        : "bg-zinc-800 text-zinc-500 border border-zinc-700 hover:bg-zinc-700 hover:text-white"
                                                )}
                                            >
                                                {getMealConfig(key, 'lunch').enabled ? <Check size={14} weight="bold" /> : <X size={14} />}
                                            </button>
                                            <div className={cn("flex items-center gap-1.5 min-w-0 flex-1 transition-opacity", !getMealConfig(key, 'lunch').enabled && "opacity-30 grayscale pointer-events-none")}>
                                                <div className="relative flex-1">
                                                    <Input
                                                        type="time"
                                                        value={getMealConfig(key, 'lunch').start}
                                                        onChange={(e) => updateDayMeal(key, 'lunch', { start: e.target.value })}
                                                        className="h-8 text-xs sm:text-sm bg-zinc-900 border-zinc-700 px-1 sm:px-2 text-center w-full focus:ring-amber-500/50"
                                                    />
                                                </div>
                                                <span className="text-zinc-600 font-bold shrink-0">-</span>
                                                <div className="relative flex-1">
                                                    <Input
                                                        type="time"
                                                        value={getMealConfig(key, 'lunch').end}
                                                        onChange={(e) => updateDayMeal(key, 'lunch', { end: e.target.value })}
                                                        className="h-8 text-xs sm:text-sm bg-zinc-900 border-zinc-700 px-1 sm:px-2 text-center w-full focus:ring-amber-500/50"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Dinner */}
                                        <div className="flex items-center gap-3 min-w-0 bg-black/20 p-1.5 rounded-lg border border-white/5">
                                            <button
                                                onClick={() => updateDayMeal(key, 'dinner', { enabled: !getMealConfig(key, 'dinner').enabled })}
                                                className={cn(
                                                    "w-7 h-7 rounded-md flex items-center justify-center transition-all shrink-0 shadow-sm",
                                                    getMealConfig(key, 'dinner').enabled
                                                        ? "bg-indigo-500 text-white font-bold"
                                                        : "bg-zinc-800 text-zinc-500 border border-zinc-700 hover:bg-zinc-700 hover:text-white"
                                                )}
                                            >
                                                {getMealConfig(key, 'dinner').enabled ? <Check size={14} weight="bold" /> : <X size={14} />}
                                            </button>
                                            <div className={cn("flex items-center gap-1.5 min-w-0 flex-1 transition-opacity", !getMealConfig(key, 'dinner').enabled && "opacity-30 grayscale pointer-events-none")}>
                                                <div className="relative flex-1">
                                                    <Input
                                                        type="time"
                                                        value={getMealConfig(key, 'dinner').start}
                                                        onChange={(e) => updateDayMeal(key, 'dinner', { start: e.target.value })}
                                                        className="h-8 text-xs sm:text-sm bg-zinc-900 border-zinc-700 px-1 sm:px-2 text-center w-full focus:ring-indigo-500/50"
                                                    />
                                                </div>
                                                <span className="text-zinc-600 font-bold shrink-0">-</span>
                                                <div className="relative flex-1">
                                                    <Input
                                                        type="time"
                                                        value={getMealConfig(key, 'dinner').end}
                                                        onChange={(e) => updateDayMeal(key, 'dinner', { end: e.target.value })}
                                                        className="h-8 text-xs sm:text-sm bg-zinc-900 border-zinc-700 px-1 sm:px-2 text-center w-full focus:ring-indigo-500/50"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Quick Actions */}
                            <div className="flex gap-4 pt-4 mt-2 border-t border-white/10 px-2 pb-2">
                                <Button
                                    variant="outline"
                                    className="h-10 px-4 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500 hover:text-black hover:border-amber-500 text-amber-500 font-bold shadow-sm transition-all"
                                    onClick={() => applyToAll('lunch')}
                                >
                                    <Sun size={16} weight="fill" className="mr-2" />
                                    Attiva tutti a Pranzo
                                </Button>
                                <Button
                                    variant="outline"
                                    className="h-10 px-4 border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500 hover:text-white hover:border-indigo-500 text-indigo-400 font-bold shadow-sm transition-all"
                                    onClick={() => applyToAll('dinner')}
                                >
                                    <Moon size={16} weight="fill" className="mr-2" />
                                    Attiva tutti a Cena
                                </Button>
                            </div>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}
