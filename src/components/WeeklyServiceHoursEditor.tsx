import React, { useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Sun, Moon, CalendarCheck, Check, X, Info } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'framer-motion'
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
        const defaultStart = meal === 'lunch' ? defaultLunchStart : defaultDinnerStart
        const defaultEnd = meal === 'lunch' ? defaultLunchEnd : defaultDinnerEnd
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
        const defaultStart = meal === 'lunch' ? defaultLunchStart : defaultDinnerStart
        const defaultEnd = meal === 'lunch' ? defaultLunchEnd : defaultDinnerEnd
        if (!daySchedule || !daySchedule[meal]) {
            return { enabled: false, start: defaultStart, end: defaultEnd }
        }
        return daySchedule[meal]!
    }

    const applyToAll = (meal: 'lunch' | 'dinner') => {
        const newSchedule = { ...schedule.schedule }
        let sourceStart = meal === 'lunch' ? defaultLunchStart : defaultDinnerStart
        let sourceEnd = meal === 'lunch' ? defaultLunchEnd : defaultDinnerEnd

        for (const { key } of DAYS) {
            const conf = getMealConfig(key, meal)
            if (conf.enabled) {
                sourceStart = conf.start
                sourceEnd = conf.end
                break
            }
        }

        DAYS.forEach(({ key }) => {
            const currentObj = newSchedule[key] || {}
            newSchedule[key as DayKey] = {
                ...currentObj,
                [meal]: { enabled: true, start: sourceStart, end: sourceEnd }
            }
        })
        onChange({ ...schedule, schedule: newSchedule })
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between p-5 bg-zinc-900/50 rounded-xl border border-zinc-800/50">
                <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-lg flex items-center justify-center bg-amber-500/15 text-amber-500 shrink-0">
                        <CalendarCheck size={22} weight="duotone" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                            Orari di Servizio
                            <button onClick={() => setShowInfo(prev => !prev)} className="text-zinc-500 hover:text-amber-500 transition-colors">
                                <Info size={16} weight="fill" />
                            </button>
                        </h3>
                        <p className="text-sm text-zinc-400 mt-0.5">Gestisci giorni e orari di apertura</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <Label className="text-zinc-400 text-sm cursor-pointer">Settimanale</Label>
                    <Switch
                        checked={showAdvanced}
                        onCheckedChange={updateUseWeeklySchedule}
                        className="data-[state=checked]:bg-amber-500"
                    />
                </div>
            </div>

            {showInfo && (
                <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 text-sm text-zinc-400 leading-relaxed">
                    Configura gli orari di apertura per pranzo e cena. Questi orari determinano quando i clienti possono ordinare dal QR code e quando i tavoli sono disponibili per le prenotazioni. Con la modalità "Settimanale" puoi impostare orari diversi per ogni giorno.
                </div>
            )}

            {/* Weekly Schedule */}
            <AnimatePresence>
                {showAdvanced && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-xl overflow-hidden">
                            {/* Column Headers */}
                            <div className="grid grid-cols-[80px_1fr_1fr] gap-3 px-5 py-3 border-b border-zinc-800/50 bg-zinc-900/50">
                                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Giorno</span>
                                <span className="flex items-center gap-2 text-sm font-semibold text-amber-500">
                                    <Sun size={16} weight="fill" /> Pranzo
                                </span>
                                <span className="flex items-center gap-2 text-sm font-semibold text-indigo-400">
                                    <Moon size={16} weight="fill" /> Cena
                                </span>
                            </div>

                            {/* Day Rows */}
                            <div className="divide-y divide-zinc-800/30">
                                {DAYS.map(({ key, short, label }) => (
                                    <div key={key} className="grid grid-cols-[80px_1fr_1fr] gap-3 items-center px-5 py-3 hover:bg-zinc-800/20 transition-colors">
                                        {/* Day name */}
                                        <span className="font-medium text-zinc-200 text-sm">
                                            <span className="md:hidden">{short}</span>
                                            <span className="hidden md:inline">{label}</span>
                                        </span>

                                        {/* Lunch */}
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => updateDayMeal(key, 'lunch', { enabled: !getMealConfig(key, 'lunch').enabled })}
                                                className={cn(
                                                    "w-8 h-8 rounded-lg flex items-center justify-center transition-all shrink-0",
                                                    getMealConfig(key, 'lunch').enabled
                                                        ? "bg-amber-500 text-black"
                                                        : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700"
                                                )}
                                            >
                                                {getMealConfig(key, 'lunch').enabled ? <Check size={14} weight="bold" /> : <X size={14} />}
                                            </button>
                                            <div className={cn("flex items-center gap-1 flex-1 transition-opacity", !getMealConfig(key, 'lunch').enabled && "opacity-25 pointer-events-none")}>
                                                <Input
                                                    type="time"
                                                    value={getMealConfig(key, 'lunch').start}
                                                    onChange={(e) => updateDayMeal(key, 'lunch', { start: e.target.value })}
                                                    className="h-9 text-sm bg-zinc-900 border-zinc-700 text-center flex-1"
                                                />
                                                <span className="text-zinc-600 px-0.5">–</span>
                                                <Input
                                                    type="time"
                                                    value={getMealConfig(key, 'lunch').end}
                                                    onChange={(e) => updateDayMeal(key, 'lunch', { end: e.target.value })}
                                                    className="h-9 text-sm bg-zinc-900 border-zinc-700 text-center flex-1"
                                                />
                                            </div>
                                        </div>

                                        {/* Dinner */}
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => updateDayMeal(key, 'dinner', { enabled: !getMealConfig(key, 'dinner').enabled })}
                                                className={cn(
                                                    "w-8 h-8 rounded-lg flex items-center justify-center transition-all shrink-0",
                                                    getMealConfig(key, 'dinner').enabled
                                                        ? "bg-indigo-500 text-white"
                                                        : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700"
                                                )}
                                            >
                                                {getMealConfig(key, 'dinner').enabled ? <Check size={14} weight="bold" /> : <X size={14} />}
                                            </button>
                                            <div className={cn("flex items-center gap-1 flex-1 transition-opacity", !getMealConfig(key, 'dinner').enabled && "opacity-25 pointer-events-none")}>
                                                <Input
                                                    type="time"
                                                    value={getMealConfig(key, 'dinner').start}
                                                    onChange={(e) => updateDayMeal(key, 'dinner', { start: e.target.value })}
                                                    className="h-9 text-sm bg-zinc-900 border-zinc-700 text-center flex-1"
                                                />
                                                <span className="text-zinc-600 px-0.5">–</span>
                                                <Input
                                                    type="time"
                                                    value={getMealConfig(key, 'dinner').end}
                                                    onChange={(e) => updateDayMeal(key, 'dinner', { end: e.target.value })}
                                                    className="h-9 text-sm bg-zinc-900 border-zinc-700 text-center flex-1"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Quick Actions */}
                            <div className="flex gap-3 p-4 border-t border-zinc-800/50">
                                <Button
                                    variant="outline"
                                    className="h-9 px-4 border-amber-500/30 text-amber-500 hover:bg-amber-500 hover:text-black text-sm"
                                    onClick={() => applyToAll('lunch')}
                                >
                                    <Sun size={14} weight="fill" className="mr-1.5" />
                                    Attiva tutti Pranzo
                                </Button>
                                <Button
                                    variant="outline"
                                    className="h-9 px-4 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500 hover:text-white text-sm"
                                    onClick={() => applyToAll('dinner')}
                                >
                                    <Moon size={14} weight="fill" className="mr-1.5" />
                                    Attiva tutti Cena
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
