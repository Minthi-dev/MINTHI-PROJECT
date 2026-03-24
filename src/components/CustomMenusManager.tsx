import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import {
    Plus, Trash, Calendar, Clock, CheckCircle, ForkKnife,
    Pencil, X, MagnifyingGlass, Sparkle, CopySimple,
    CalendarCheck, Check, Info, ArrowLeft, FloppyDisk
} from '@phosphor-icons/react'
import type { CustomMenu, CustomMenuSchedule, Dish, MealType, Category } from '../services/types'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface CustomMenusManagerProps {
    restaurantId: string
    dishes: Dish[]
    categories: Category[]
    onDishesChange: () => void
    onMenuDeactivated?: () => void
    weeklyServiceHours?: any
    onGoToSettings?: () => void
}

const DAYS_OF_WEEK = [
    { value: 1, label: 'Lun' },
    { value: 2, label: 'Mar' },
    { value: 3, label: 'Mer' },
    { value: 4, label: 'Gio' },
    { value: 5, label: 'Ven' },
    { value: 6, label: 'Sab' },
    { value: 0, label: 'Dom' }
]

const MEAL_TYPES: { value: MealType, label: string }[] = [
    { value: 'lunch', label: 'Pranzo' },
    { value: 'dinner', label: 'Cena' },
]

export default function CustomMenusManager({ restaurantId, dishes, categories, onDishesChange, onMenuDeactivated, weeklyServiceHours, onGoToSettings }: CustomMenusManagerProps) {
    const serviceHoursConfigured = weeklyServiceHours?.useWeeklySchedule && weeklyServiceHours?.enabled !== false
    const [customMenus, setCustomMenus] = useState<CustomMenu[]>([])
    const [selectedMenu, setSelectedMenu] = useState<CustomMenu | null>(null)
    const [menuDishes, setMenuDishes] = useState<string[]>([])
    const [initialMenuDishes, setInitialMenuDishes] = useState<string[]>([])
    const [schedules, setSchedules] = useState<CustomMenuSchedule[]>([])
    const [isSaving, setIsSaving] = useState(false)

    // Editor View State
    const [viewMode, setViewMode] = useState<'list' | 'editor'>('list')
    const [showCreateDialog, setShowCreateDialog] = useState(false)
    const [newMenuName, setNewMenuName] = useState('')
    const [dishSearch, setDishSearch] = useState('')
    const [editorTab, setEditorTab] = useState<'dishes' | 'schedule'>('dishes')
    const [editingName, setEditingName] = useState(false)
    const [editNameValue, setEditNameValue] = useState('')

    // Data Fetching
    const fetchCustomMenus = async () => {
        const { data } = await supabase
            .from('custom_menus')
            .select('id, restaurant_id, name, description, is_active, created_at, updated_at')
            .eq('restaurant_id', restaurantId)
            .order('created_at', { ascending: false })
        if (data) setCustomMenus(data)
    }

    const fetchMenuDetails = async (menuId: string) => {
        const [dishesRes, schedulesRes] = await Promise.all([
            supabase.from('custom_menu_dishes').select('dish_id').eq('custom_menu_id', menuId),
            supabase.from('custom_menu_schedules').select('id, custom_menu_id, day_of_week, meal_type, start_time, end_time, is_active').eq('custom_menu_id', menuId)
        ])

        const dishIds = dishesRes.data ? dishesRes.data.map(d => d.dish_id) : []
        setMenuDishes(dishIds)
        setInitialMenuDishes(dishIds)
        if (schedulesRes.data) setSchedules(schedulesRes.data)
    }

    useEffect(() => {
        if (restaurantId) fetchCustomMenus()
    }, [restaurantId])

    const handleCreateMenu = async () => {
        if (!newMenuName.trim()) return

        const { data, error } = await supabase
            .from('custom_menus')
            .insert({
                restaurant_id: restaurantId,
                name: newMenuName.trim(),
                is_active: false
            })
            .select()
            .single()

        if (error) {
            toast.error('Errore creazione menù')
        } else {
            toast.success('Menù creato')
            setNewMenuName('')
            setShowCreateDialog(false)
            fetchCustomMenus()
            if (data) openEditor(data)
        }
    }

    const openEditor = async (menu: CustomMenu) => {
        setSelectedMenu(menu)
        setViewMode('editor')
        setEditorTab('dishes')
        setEditingName(false)
        setDishSearch('')
        await fetchMenuDetails(menu.id)
    }

    const handleRenameMenu = async () => {
        if (!selectedMenu || !editNameValue.trim() || editNameValue.trim() === selectedMenu.name) {
            setEditingName(false)
            return
        }
        const newName = editNameValue.trim()
        const { error } = await supabase.from('custom_menus').update({ name: newName }).eq('id', selectedMenu.id)
        if (!error) {
            setSelectedMenu({ ...selectedMenu, name: newName })
            setCustomMenus(prev => prev.map(m => m.id === selectedMenu.id ? { ...m, name: newName } : m))
            toast.success('Nome aggiornato')
        } else {
            toast.error('Errore aggiornamento nome')
        }
        setEditingName(false)
    }

    // Check if there are unsaved changes
    const hasChanges = useMemo(() => {
        if (menuDishes.length !== initialMenuDishes.length) return true
        const sorted1 = [...menuDishes].sort()
        const sorted2 = [...initialMenuDishes].sort()
        return sorted1.some((id, i) => id !== sorted2[i])
    }, [menuDishes, initialMenuDishes])

    // SAVE: persist all dish changes to DB, then apply if menu is active
    const handleSaveMenu = async () => {
        if (!selectedMenu) return
        setIsSaving(true)

        try {
            // Calculate diff
            const toAdd = menuDishes.filter(id => !initialMenuDishes.includes(id))
            const toRemove = initialMenuDishes.filter(id => !menuDishes.includes(id))

            // Batch insert new dishes
            if (toAdd.length > 0) {
                const { error } = await supabase.from('custom_menu_dishes').insert(
                    toAdd.map(dishId => ({ custom_menu_id: selectedMenu.id, dish_id: dishId }))
                )
                if (error) throw error
            }

            // Batch delete removed dishes
            if (toRemove.length > 0) {
                const { error } = await supabase.from('custom_menu_dishes')
                    .delete()
                    .eq('custom_menu_id', selectedMenu.id)
                    .in('dish_id', toRemove)
                if (error) throw error
            }

            // If menu is currently active, re-apply it to sync dish visibility
            if (selectedMenu.is_active) {
                const { error } = await supabase.rpc('apply_custom_menu', { p_restaurant_id: restaurantId, p_menu_id: selectedMenu.id })
                if (error) throw error
                onDishesChange()
            }

            // Update initial state to match
            setInitialMenuDishes([...menuDishes])
            toast.success('Menu salvato!')
        } catch (err) {
            console.error('Error saving menu:', err)
            toast.error('Errore durante il salvataggio')
            // Revert to DB state
            await fetchMenuDetails(selectedMenu.id)
        } finally {
            setIsSaving(false)
        }
    }

    // SAVE AND ACTIVATE
    const handleSaveAndActivate = async () => {
        if (!selectedMenu) return
        setIsSaving(true)

        try {
            // Calculate diff
            const toAdd = menuDishes.filter(id => !initialMenuDishes.includes(id))
            const toRemove = initialMenuDishes.filter(id => !menuDishes.includes(id))

            if (toAdd.length > 0) {
                const { error } = await supabase.from('custom_menu_dishes').insert(
                    toAdd.map(dishId => ({ custom_menu_id: selectedMenu.id, dish_id: dishId }))
                )
                if (error) throw error
            }

            if (toRemove.length > 0) {
                const { error } = await supabase.from('custom_menu_dishes')
                    .delete()
                    .eq('custom_menu_id', selectedMenu.id)
                    .in('dish_id', toRemove)
                if (error) throw error
            }

            // Apply (activate) the menu
            const { error } = await supabase.rpc('apply_custom_menu', { p_restaurant_id: restaurantId, p_menu_id: selectedMenu.id })
            if (error) throw error

            await supabase.from('custom_menus').update({ updated_at: new Date().toISOString() }).eq('id', selectedMenu.id)

            setInitialMenuDishes([...menuDishes])
            setSelectedMenu({ ...selectedMenu, is_active: true })
            onDishesChange()
            toast.success('Menu salvato e attivato!')
            fetchCustomMenus()
        } catch (err) {
            console.error('Error saving/activating menu:', err)
            toast.error('Errore durante il salvataggio')
            await fetchMenuDetails(selectedMenu.id)
        } finally {
            setIsSaving(false)
        }
    }

    const closeEditor = () => {
        if (hasChanges) {
            if (!confirm('Hai modifiche non salvate. Vuoi uscire senza salvare?')) return
        }
        fetchCustomMenus()
        setSelectedMenu(null)
        setViewMode('list')
        setDishSearch('')
    }

    const handleDeleteMenu = async (menuId: string, e: React.MouseEvent) => {
        e.stopPropagation()
        if (!confirm('Eliminare questo menù?')) return

        const { error } = await supabase.from('custom_menus').delete().eq('id', menuId)
        if (!error) {
            toast.success('Menù eliminato')
            fetchCustomMenus()
            if (selectedMenu?.id === menuId) {
                setSelectedMenu(null)
                setViewMode('list')
            }
        }
    }

    const handleApplyMenu = async (menuId: string, e?: React.MouseEvent) => {
        e?.stopPropagation()
        const { error } = await supabase.rpc('apply_custom_menu', { p_restaurant_id: restaurantId, p_menu_id: menuId })
        if (!error) {
            await supabase.from('custom_menus').update({ updated_at: new Date().toISOString() }).eq('id', menuId)
            toast.success('Menù Attivato!')
            fetchCustomMenus()
            onDishesChange()
            if (selectedMenu) setSelectedMenu({ ...selectedMenu, is_active: true })
        } else {
            toast.error('Errore attivazione')
        }
    }

    const handleResetToFullMenu = async () => {
        const { error } = await supabase.rpc('reset_to_full_menu', { p_restaurant_id: restaurantId })
        if (!error) {
            toast.success('Menu Completo Ripristinato')
            fetchCustomMenus()
            onDishesChange()
            if (onMenuDeactivated) {
                onMenuDeactivated()
            }
        }
    }

    // --- Editor Logic ---
    const handleToggleDish = (dishId: string) => {
        // Local-only toggle, saved on explicit "Salva"
        setMenuDishes(prev =>
            prev.includes(dishId)
                ? prev.filter(id => id !== dishId)
                : [...prev, dishId]
        )
    }

    const handleToggleSchedule = async (dayOfWeek: number, mealType: MealType) => {
        if (!selectedMenu) return
        const existing = schedules.find(s => s.day_of_week === dayOfWeek && s.meal_type === mealType)

        if (existing) {
            setSchedules(prev => prev.filter(s => s.id !== existing.id))
            await supabase.from('custom_menu_schedules').delete().eq('id', existing.id)
        } else {
            const { data } = await supabase.from('custom_menu_schedules').insert({
                custom_menu_id: selectedMenu.id,
                day_of_week: dayOfWeek,
                meal_type: mealType,
                is_active: true
            }).select().single()

            if (data) setSchedules(prev => [...prev, data])
        }
    }

    // Filter dishes
    const filteredCategories = useMemo(() => {
        if (!dishSearch) return categories
        const search = dishSearch.toLowerCase()
        return categories.filter(cat => {
            const catHasMatch = dishes.some(d => d.category_id === cat.id && d.name.toLowerCase().includes(search))
            return catHasMatch
        })
    }, [categories, dishes, dishSearch])

    // Guard: require service hours before showing custom menus UI
    if (!serviceHoursConfigured) {
        return (
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center max-w-lg space-y-6">
                    <div className="w-20 h-20 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto">
                        <Clock size={40} className="text-amber-500" />
                    </div>
                    <h3 className="text-2xl font-bold text-white">Configura gli Orari di Servizio</h3>
                    <p className="text-zinc-300 text-base leading-relaxed">
                        Per utilizzare i menu personalizzati, devi prima configurare gli orari di servizio settimanali nelle Impostazioni.
                    </p>
                    <p className="text-zinc-400 text-sm">
                        Gli orari definiscono quando attivare automaticamente pranzo e cena, permettendo ai menu personalizzati di funzionare correttamente.
                    </p>
                    {onGoToSettings && (
                        <Button
                            onClick={onGoToSettings}
                            className="bg-amber-600 hover:bg-amber-700 text-white px-6 h-11 text-base"
                        >
                            Vai alle Impostazioni
                        </Button>
                    )}
                </div>
            </div>
        )
    }


    // --- VIEW: LIST ---
    if (viewMode === 'list') {
        const activeMenu = customMenus.find(m => m.is_active)

        return (
            <div className="flex flex-col h-full w-full bg-zinc-950 overflow-hidden">

                {/* Header Section */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-8 pt-8 pb-6 border-b border-white/5 bg-zinc-950">
                    <div className="space-y-1">
                        <h2 className="text-2xl font-bold tracking-tight text-white">
                            Menu Personalizzati
                        </h2>
                        <p className="text-sm text-zinc-400 flex items-center gap-2">
                            Gestisci sottomenu, eventi e limitazioni orarie.
                        </p>
                    </div>

                    <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                        <DialogTrigger asChild>
                            <Button className="mt-4 sm:mt-0 bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-900/20 transition-all hover:scale-105 active:scale-95">
                                <Plus weight="bold" className="mr-2" size={16} />
                                Nuovo Menu
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md bg-zinc-900 border-zinc-800 text-white">
                            <DialogHeader>
                                <DialogTitle className="text-white">Crea Nuovo Menu</DialogTitle>
                                <DialogDescription className="text-zinc-400">
                                    Assegna un nome univoco per identificare questo menu (es. "Menu Pranzo", "San Valentino").
                                </DialogDescription>
                            </DialogHeader>
                            <div className="py-4 space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-zinc-300">Nome del Menu</Label>
                                    <Input
                                        value={newMenuName}
                                        onChange={(e) => setNewMenuName(e.target.value)}
                                        placeholder="Inserisci nome..."
                                        className="h-11 bg-zinc-950 border-zinc-800 text-white placeholder:text-zinc-600"
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button onClick={handleCreateMenu} className="w-full bg-amber-600 hover:bg-amber-700 text-white">
                                    Crea Menu
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between pb-2">
                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">I Tuoi Menu</h4>
                            {activeMenu && (
                                <Button
                                    variant="ghost"
                                    onClick={handleResetToFullMenu}
                                    className="h-8 text-xs font-bold text-red-400 hover:bg-red-500/10 hover:text-red-300 border border-red-500/20"
                                >
                                    <X size={14} className="mr-1.5" /> Disattiva {activeMenu.name}
                                </Button>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {customMenus.map(menu => (
                                <motion.div
                                    key={menu.id}
                                    whileHover={{ y: -2 }}
                                    onClick={() => openEditor(menu)}
                                    className={cn(
                                        "group relative flex flex-col justify-between h-[140px] p-5 rounded-2xl border transition-all cursor-pointer overflow-hidden backdrop-blur-md",
                                        menu.is_active
                                            ? "ring-1 ring-amber-500/50 border-amber-500/50 bg-gradient-to-br from-zinc-900 to-amber-950/20 shadow-[0_8px_30px_rgb(245,158,11,0.15)]"
                                            : "border-white/5 bg-zinc-900/40 hover:border-white/10 hover:bg-zinc-900/60 shadow-lg"
                                    )}
                                >
                                    {/* Action Header */}
                                    <div className="flex justify-between items-start z-10">
                                        <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-500 mb-3 group-hover:bg-amber-500 group-hover:text-black transition-colors duration-300">
                                            <ForkKnife size={20} weight={menu.is_active ? "fill" : "regular"} />
                                        </div>

                                        <div className="flex items-center gap-1 z-20">
                                            {/* Toggle Active/Inactive */}
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className={cn(
                                                    "h-8 w-8 rounded-full",
                                                    menu.is_active
                                                        ? "text-amber-500 hover:text-red-400 hover:bg-red-500/10"
                                                        : "text-zinc-500 hover:text-amber-500 hover:bg-amber-500/10"
                                                )}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    if (menu.is_active) {
                                                        handleResetToFullMenu()
                                                    } else {
                                                        handleApplyMenu(menu.id, e)
                                                    }
                                                }}
                                                title={menu.is_active ? "Disattiva" : "Attiva"}
                                            >
                                                <CheckCircle size={18} weight={menu.is_active ? "fill" : "regular"} />
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="mt-1">
                                        <h3 className="font-bold text-base truncate mb-1 pr-4 text-white">{menu.name}</h3>
                                        {menu.is_active ? (
                                            <p className="text-xs font-bold text-amber-500 flex items-center gap-1.5">
                                                <span className="relative flex h-2 w-2">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                                </span>
                                                ATTIVO ORA
                                            </p>
                                        ) : (
                                            <p className="text-xs text-zinc-500 group-hover:text-amber-400 transition-colors flex items-center gap-1">
                                                <Pencil size={12} />
                                                Clicca per modificare
                                            </p>
                                        )}
                                    </div>

                                    {/* Delete - Bottom Right */}
                                    <div className="absolute bottom-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-full"
                                            onClick={(e) => handleDeleteMenu(menu.id, e)}
                                            title="Elimina"
                                        >
                                            <Trash size={16} />
                                        </Button>
                                    </div>
                                </motion.div>
                            ))}

                            {/* Empty State Card */}
                            <button
                                onClick={() => setShowCreateDialog(true)}
                                className="h-[140px] rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/50 hover:border-amber-500/30 hover:bg-amber-500/5 flex flex-col items-center justify-center gap-3 transition-all group backdrop-blur-sm shadow-inner"
                            >
                                <div className="w-12 h-12 rounded-full bg-zinc-900 group-hover:bg-amber-500/20 flex items-center justify-center text-zinc-500 group-hover:text-amber-500 transition-colors">
                                    <Plus size={24} />
                                </div>
                                <span className="text-sm font-medium text-zinc-400 group-hover:text-white">Crea Nuovo Menu</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // --- VIEW: EDITOR ---
    return (
        <div className="flex flex-col h-full w-full bg-zinc-950">
            {/* Header */}
            <div className="flex items-center justify-between px-6 sm:px-10 py-4 border-b border-white/5 bg-zinc-950 pr-12">
                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={closeEditor}
                        className="h-8 w-8 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white"
                        title="Torna alla lista"
                    >
                        <ArrowLeft size={18} />
                    </Button>
                    <div className="h-6 w-px bg-zinc-800 hidden sm:block" />
                    <div>
                        {editingName ? (
                            <Input
                                autoFocus
                                value={editNameValue}
                                onChange={(e) => setEditNameValue(e.target.value)}
                                onBlur={handleRenameMenu}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleRenameMenu(); if (e.key === 'Escape') setEditingName(false) }}
                                className="h-8 text-lg font-bold bg-zinc-900 border-amber-500/50 text-white w-[200px]"
                            />
                        ) : (
                            <h2
                                className="font-bold text-lg leading-none tracking-tight text-white cursor-pointer hover:text-amber-400 transition-colors"
                                onClick={() => { setEditNameValue(selectedMenu?.name || ''); setEditingName(true) }}
                                title="Clicca per rinominare"
                            >
                                {selectedMenu?.name}
                                <Pencil size={12} className="inline ml-2 text-zinc-500" />
                            </h2>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[10px] font-semibold text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded-full border border-white/5">
                                {menuDishes.length} Piatti
                            </span>
                            <span className="text-[10px] font-semibold text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded-full border border-white/5">
                                {schedules.length} Orari
                            </span>
                            {hasChanges && (
                                <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30 animate-pulse">
                                    Modifiche non salvate
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar Navigation */}
                <div className="w-[50px] sm:w-[100px] flex-shrink-0 border-r border-white/5 bg-zinc-950 flex flex-col gap-3 p-3">
                    <Button
                        variant={editorTab === 'dishes' ? 'secondary' : 'ghost'}
                        size="sm"
                        className={cn(
                            "justify-start h-10 px-3 rounded-lg transition-all",
                            editorTab === 'dishes'
                                ? "bg-amber-500/10 shadow-sm border border-amber-500/50 text-amber-500 font-semibold"
                                : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                        )}
                        onClick={() => setEditorTab('dishes')}
                    >
                        <ForkKnife className="sm:mr-2 shrink-0" size={18} weight={editorTab === 'dishes' ? 'fill' : 'regular'} />
                        <div className="hidden sm:flex flex-col items-start">
                            <span className="text-xs">Piatti</span>
                        </div>
                    </Button>
                    <Button
                        variant={editorTab === 'schedule' ? 'secondary' : 'ghost'}
                        size="sm"
                        className={cn(
                            "justify-start h-10 px-3 rounded-lg transition-all",
                            editorTab === 'schedule'
                                ? "bg-amber-500/10 shadow-sm border border-amber-500/50 text-amber-500 font-semibold"
                                : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                        )}
                        onClick={() => setEditorTab('schedule')}
                    >
                        <CalendarCheck className="sm:mr-2 shrink-0" size={18} weight={editorTab === 'schedule' ? 'fill' : 'regular'} />
                        <div className="hidden sm:flex flex-col items-start">
                            <span className="text-xs">Orari</span>
                        </div>
                    </Button>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col overflow-hidden bg-zinc-950 relative">
                    {editorTab === 'dishes' ? (
                        <>
                            <div className="p-4 border-b border-white/5 bg-zinc-950 z-10">
                                <div className="relative max-w-md">
                                    <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                                    <Input
                                        placeholder="Cerca piatti..."
                                        value={dishSearch}
                                        onChange={(e) => setDishSearch(e.target.value)}
                                        className="pl-9 h-10 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 focus:border-amber-500/50 focus:ring-amber-500/20"
                                    />
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
                                <div className="max-w-5xl mx-auto pb-28">
                                    {filteredCategories.map(cat => {
                                        const catDishes = dishes.filter(d => d.category_id === cat.id)
                                        if (dishSearch && catDishes.every(d => !d.name.toLowerCase().includes(dishSearch.toLowerCase()))) return null

                                        const visibleDishes = dishSearch
                                            ? catDishes.filter(d => d.name.toLowerCase().includes(dishSearch.toLowerCase()))
                                            : catDishes

                                        if (visibleDishes.length === 0) return null

                                        const selectedCount = visibleDishes.filter(d => menuDishes.includes(d.id)).length
                                        const allSelected = selectedCount === visibleDishes.length

                                        return (
                                            <div key={cat.id} className="mb-8 last:mb-0">
                                                <div className="flex items-center gap-4 mb-4">
                                                    <h4 className="text-xs font-bold text-zinc-400 bg-zinc-900/80 px-3 py-1.5 rounded-lg uppercase tracking-widest backdrop-blur-sm sticky top-0 border border-white/5">
                                                        {cat.name}
                                                    </h4>
                                                    <span className="text-[10px] text-zinc-500">{selectedCount}/{visibleDishes.length}</span>
                                                    <button
                                                        className="text-[10px] text-amber-500 hover:text-amber-400 font-medium"
                                                        onClick={() => {
                                                            if (allSelected) {
                                                                setMenuDishes(prev => prev.filter(id => !visibleDishes.some(d => d.id === id)))
                                                            } else {
                                                                setMenuDishes(prev => [...new Set([...prev, ...visibleDishes.map(d => d.id)])])
                                                            }
                                                        }}
                                                    >
                                                        {allSelected ? 'Deseleziona tutti' : 'Seleziona tutti'}
                                                    </button>
                                                    <div className="h-px bg-zinc-800 flex-1" />
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full">
                                                    {visibleDishes.map(dish => {
                                                        const isSelected = menuDishes.includes(dish.id)
                                                        return (
                                                            <div
                                                                key={dish.id}
                                                                onClick={() => handleToggleDish(dish.id)}
                                                                className={cn(
                                                                    "relative flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all duration-200 group active:scale-[0.98]",
                                                                    isSelected
                                                                        ? "bg-amber-500/10 border-amber-500/50 shadow-[0_0_15px_-3px_rgba(245,158,11,0.2)]"
                                                                        : "bg-zinc-900/40 hover:bg-zinc-800/60 border-white/5 hover:border-white/10"
                                                                )}
                                                            >
                                                                <div className="flex items-center gap-3 overflow-hidden w-full">
                                                                    <div className={cn(
                                                                        "w-6 h-6 rounded-md border flex items-center justify-center flex-shrink-0 transition-all",
                                                                        isSelected
                                                                            ? "bg-amber-500 border-amber-500 scale-110 shadow-sm"
                                                                            : "border-zinc-700 bg-zinc-950 group-hover:border-zinc-500"
                                                                    )}>
                                                                        {isSelected && <Check size={14} className="text-zinc-950" weight="bold" />}
                                                                    </div>
                                                                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                                                                        <p className={cn("text-sm truncate transition-colors", isSelected ? "font-bold text-white" : "font-medium text-zinc-300 group-hover:text-zinc-100")}>{dish.name}</p>
                                                                        <p className="text-xs text-zinc-500 font-mono">&euro;{dish.price.toFixed(2)}</p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 p-6 flex flex-col w-full overflow-auto">
                            <div className="w-full max-w-full bg-zinc-900/80 p-6 rounded-2xl border border-zinc-800/50 shadow-xl">
                                <div className="text-center mb-6">
                                    <h3 className="text-base font-semibold flex items-center justify-center gap-2 text-zinc-100">
                                        <Clock weight="duotone" size={20} className="text-amber-500" />
                                        Programmazione Automatica
                                    </h3>
                                    <p className="text-zinc-500 text-xs mt-1.5">
                                        Attiva automaticamente il menu negli orari selezionati.
                                    </p>
                                </div>

                                <div className="w-full overflow-x-auto pb-2">
                                    <div className="border border-zinc-800/50 rounded-xl overflow-hidden min-w-[700px]">
                                        <div className="grid grid-cols-[80px_repeat(7,1fr)]">
                                            {/* Header Row */}
                                            <div className="p-3 border-r border-b border-zinc-800/50 bg-zinc-950"></div>
                                            {DAYS_OF_WEEK.map(day => (
                                                <div key={day.value} className="p-3 text-center text-[10px] font-bold text-zinc-500 uppercase border-b border-r border-zinc-800/50 last:border-r-0 bg-zinc-950 tracking-wider">
                                                    {day.label}
                                                </div>
                                            ))}

                                            {/* Rows */}
                                            {MEAL_TYPES.map((meal, index) => (
                                                <div key={meal.value} className="contents">
                                                    {/* Row Label */}
                                                    <div className={cn(
                                                        "p-3 flex items-center justify-center font-semibold text-[10px] uppercase tracking-wider text-zinc-500 border-r border-zinc-800/50 bg-zinc-950",
                                                        index !== MEAL_TYPES.length - 1 && "border-b"
                                                    )}>
                                                        {meal.label}
                                                    </div>

                                                    {/* Cells */}
                                                    {DAYS_OF_WEEK.map((day, dIndex) => {
                                                        const isActive = schedules.some(s => s.day_of_week === day.value && s.meal_type === meal.value)
                                                        return (
                                                            <div
                                                                key={`${day.value}-${meal.value}`}
                                                                className={cn(
                                                                    "relative h-20 border-r border-zinc-800/50 last:border-r-0 flex items-center justify-center p-2 transition-all cursor-pointer",
                                                                    index !== MEAL_TYPES.length - 1 && "border-b",
                                                                    isActive
                                                                        ? "bg-amber-500/10 hover:bg-amber-500/15"
                                                                        : "bg-zinc-900/50 hover:bg-zinc-800/50"
                                                                )}
                                                                onClick={() => handleToggleSchedule(day.value, meal.value)}
                                                            >
                                                                <div className={cn(
                                                                    "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200",
                                                                    isActive
                                                                        ? "bg-amber-500 text-zinc-950 shadow-lg shadow-amber-500/30"
                                                                        : "border-2 border-dashed border-zinc-700 hover:border-zinc-600"
                                                                )}>
                                                                    {isActive && <Check size={18} weight="bold" />}
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* FIXED SAVE BUTTON BAR */}
                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-zinc-950/95 backdrop-blur-md border-t border-white/10 flex items-center justify-between gap-3 z-20">
                        <div className="text-xs text-zinc-500">
                            {menuDishes.length} piatti selezionati
                            {hasChanges && <span className="ml-2 text-amber-400 font-medium">· Modifiche non salvate</span>}
                        </div>
                        <div className="flex items-center gap-2">
                            {!selectedMenu?.is_active && menuDishes.length > 0 && (
                                <Button
                                    onClick={handleSaveAndActivate}
                                    disabled={isSaving || menuDishes.length === 0}
                                    className="h-10 px-5 text-sm font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-lg shadow-amber-500/20 gap-2"
                                >
                                    {isSaving ? (
                                        <div className="w-4 h-4 border-2 rounded-full animate-spin border-white/30 border-t-white" />
                                    ) : (
                                        <CheckCircle weight="fill" size={18} />
                                    )}
                                    Salva e Attiva
                                </Button>
                            )}
                            <Button
                                onClick={handleSaveMenu}
                                disabled={isSaving || !hasChanges}
                                className={cn(
                                    "h-10 px-5 text-sm font-bold rounded-xl gap-2 transition-all",
                                    hasChanges
                                        ? "bg-white text-black hover:bg-zinc-200 shadow-lg"
                                        : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                                )}
                            >
                                {isSaving ? (
                                    <div className="w-4 h-4 border-2 rounded-full animate-spin border-black/30 border-t-black" />
                                ) : (
                                    <FloppyDisk weight="fill" size={18} />
                                )}
                                Salva
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
