import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Restaurant } from '../services/types'
import { ChartBar, Money, ShoppingCart, Users, Clock, Fire, Calendar, TrendUp, Storefront, Eye, Funnel, Check, UsersThree, Receipt, CurrencyEur, CaretDown } from '@phosphor-icons/react'
import { format, parseISO, subDays } from 'date-fns'
import { it } from 'date-fns/locale'
import { Badge } from '@/components/ui/badge'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from 'recharts'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '../lib/supabase'

interface AdminStatisticsProps {
    onImpersonate?: (restaurantId: string) => void
}

interface GlobalStats {
    totalRevenue: number
    totalOrders: number
    totalCustomers: number
    activeOrders: number
    totalRestaurants: number
    activeSessions: number
    avgRevenuePerRestaurant: number
    avgOrdersPerRestaurant: number
    avgOrderValue: number
    totalSessions: number
    revenueByRestaurant: { id: string; name: string; revenue: number; orders: number; customers: number }[]
    peakHours: { hour: number; count: number }[]
    growthData: { date: string; restaurants: number; orders: number; revenue: number }[]
}

type DateFilter = 'today' | 'yesterday' | 'week' | '2weeks' | 'month' | '3months' | 'custom'

const dateFilterOptions: { value: DateFilter; label: string }[] = [
    { value: 'today', label: 'Oggi' },
    { value: 'yesterday', label: 'Ieri' },
    { value: 'week', label: 'Ultima Settimana' },
    { value: '2weeks', label: 'Ultime 2 Settimane' },
    { value: 'month', label: 'Ultimo Mese' },
    { value: '3months', label: 'Ultimi 3 Mesi' },
    { value: 'custom', label: 'Personalizzato' }
]

function getAdminDateRange(filter: DateFilter, customStart?: string, customEnd?: string) {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    switch (filter) {
        case 'today':
            return { start: today, end: now }
        case 'yesterday': {
            const yesterday = new Date(today)
            yesterday.setDate(yesterday.getDate() - 1)
            return { start: yesterday, end: new Date(today.getTime() - 1) }
        }
        case 'week': {
            const weekAgo = new Date(today)
            weekAgo.setDate(weekAgo.getDate() - 7)
            return { start: weekAgo, end: now }
        }
        case '2weeks': {
            const twoWeeksAgo = new Date(today)
            twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
            return { start: twoWeeksAgo, end: now }
        }
        case 'month': {
            const monthAgo = new Date(today)
            monthAgo.setMonth(monthAgo.getMonth() - 1)
            return { start: monthAgo, end: now }
        }
        case '3months': {
            const threeMonthsAgo = new Date(today)
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
            return { start: threeMonthsAgo, end: now }
        }
        case 'custom': {
            if (customStart && customEnd) {
                const s = new Date(customStart)
                const e = new Date(customEnd)
                e.setHours(23, 59, 59, 999)
                return { start: s, end: e }
            }
            const weekAgo = new Date(today)
            weekAgo.setDate(weekAgo.getDate() - 7)
            return { start: weekAgo, end: now }
        }
    }
}

interface SubscriptionStats {
    totalEarned: number
    activeSubscriptions: number
    activeDiscounts: number
    bonusMonthsGiven: number
    revenueByMonth: { month: string; revenue: number }[]
}

export default function AdminStatistics({ onImpersonate }: AdminStatisticsProps) {
    const [stats, setStats] = useState<GlobalStats | null>(null)
    const [loading, setLoading] = useState(true)
    const [dateFilter, setDateFilter] = useState<DateFilter>('month')
    const [customStartDate, setCustomStartDate] = useState<string>(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
    const [customEndDate, setCustomEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
    const [allRestaurants, setAllRestaurants] = useState<Restaurant[]>([])
    const [selectedRestaurantIds, setSelectedRestaurantIds] = useState<string[]>([])
    const [rankingMode, setRankingMode] = useState<'revenue' | 'access'>('revenue')
    const [subStats, setSubStats] = useState<SubscriptionStats | null>(null)

    // Fetch subscription analytics
    useEffect(() => {
        const fetchSubStats = async () => {
            try {
                const [paymentsResult, bonusesResult, discountsResult, restaurantsResult] = await Promise.all([
                    supabase.from('subscription_payments').select('amount, status, created_at').eq('status', 'paid'),
                    supabase.from('restaurant_bonuses').select('free_months, is_active'),
                    supabase.from('restaurant_discounts').select('is_active'),
                    supabase.from('restaurants').select('subscription_status'),
                ])

                const payments = paymentsResult.data || []
                const bonuses = bonusesResult.data || []
                const discounts = discountsResult.data || []
                const restaurants = restaurantsResult.data || []

                const totalEarned = payments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0)
                const activeSubscriptions = restaurants.filter((r: any) => r.subscription_status === 'active').length
                const activeDiscounts = discounts.filter((d: any) => d.is_active).length
                const bonusMonthsGiven = bonuses.reduce((sum: number, b: any) => sum + (b.free_months || 0), 0)

                // Revenue by month (last 12 months)
                const revenueByMonth: Record<string, number> = {}
                const now = new Date()
                for (let i = 11; i >= 0; i--) {
                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
                    const key = format(d, 'MMM yy', { locale: it })
                    revenueByMonth[key] = 0
                }
                payments.forEach((p: any) => {
                    if (!p.created_at) return
                    try {
                        const d = parseISO(p.created_at)
                        const key = format(d, 'MMM yy', { locale: it })
                        if (revenueByMonth[key] !== undefined) {
                            revenueByMonth[key] += p.amount || 0
                        }
                    } catch { /* ignore */ }
                })

                setSubStats({
                    totalEarned,
                    activeSubscriptions,
                    activeDiscounts,
                    bonusMonthsGiven,
                    revenueByMonth: Object.entries(revenueByMonth).map(([month, revenue]) => ({ month, revenue })),
                })
            } catch (e) {
                console.error('Error fetching subscription stats:', e)
            }
        }
        fetchSubStats()
    }, [])

    useEffect(() => {
        const fetchStats = async () => {
            try {
                setLoading(true)

                // Load restaurants list first (needed for filter init and cumulative chart)
                const { data: restaurantsData } = await supabase
                    .from('restaurants')
                    .select('id, name, created_at, subscription_status')
                    .order('name')

                const restaurants = (restaurantsData || []) as Restaurant[]
                setAllRestaurants(restaurants)

                const activeRestaurantIds = selectedRestaurantIds.length > 0
                    ? selectedRestaurantIds
                    : restaurants.map(r => r.id)

                if (selectedRestaurantIds.length === 0) {
                    setSelectedRestaurantIds(restaurants.map(r => r.id))
                }

                const dateRange = getAdminDateRange(dateFilter, customStartDate, customEndDate)

                // Call server-side RPC — replaces loading 5000 orders in browser
                const { data: rpcData, error: rpcError } = await supabase.rpc('get_admin_stats', {
                    p_start_date: dateRange.start.toISOString(),
                    p_end_date: dateRange.end.toISOString(),
                    p_restaurant_ids: selectedRestaurantIds.length > 0 ? selectedRestaurantIds : null
                })

                if (rpcError) throw rpcError

                const d = rpcData as any
                const totalRevenue = Number(d.totalRevenue) || 0
                const totalOrders = Number(d.totalOrders) || 0
                const paidOrders = Number(d.paidOrders) || 0
                const activeRestaurantCount = activeRestaurantIds.length
                const avgRevenuePerRestaurant = activeRestaurantCount > 0 ? totalRevenue / activeRestaurantCount : 0
                const avgOrdersPerRestaurant = activeRestaurantCount > 0 ? totalOrders / activeRestaurantCount : 0
                const avgOrderValue = paidOrders > 0 ? totalRevenue / paidOrders : 0

                // Map daily growth: add cumulative restaurant count (requires all restaurants)
                const growthData = (d.dailyGrowth || []).map((row: any) => {
                    const dayDate = parseISO(row.date)
                    const cumulativeRes = restaurants.filter(r => r.created_at && parseISO(r.created_at) <= dayDate).length
                    return {
                        date: format(dayDate, 'dd MMM', { locale: it }),
                        restaurants: cumulativeRes,
                        orders: Number(row.orders) || 0,
                        revenue: Number(row.revenue) || 0
                    }
                })

                setStats({
                    totalRevenue,
                    totalOrders,
                    totalCustomers: Number(d.totalCustomers) || 0,
                    activeOrders: Number(d.activeOrders) || 0,
                    totalRestaurants: Number(d.totalRestaurants) || 0,
                    activeSessions: Number(d.activeSessions) || 0,
                    avgRevenuePerRestaurant,
                    avgOrdersPerRestaurant,
                    avgOrderValue,
                    totalSessions: Number(d.totalSessions) || 0,
                    revenueByRestaurant: (d.revenueByRestaurant || []).map((r: any) => ({
                        id: r.id,
                        name: r.name,
                        revenue: Number(r.revenue) || 0,
                        orders: Number(r.orders) || 0,
                        customers: Number(r.customers) || 0,
                    })),
                    peakHours: (d.peakHours || []).map((h: any) => ({
                        hour: Number(h.hour),
                        count: Number(h.count) || 0,
                    })),
                    growthData
                })
            } catch (error) {
                console.error('Error fetching stats:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchStats()
    }, [dateFilter, customStartDate, customEndDate, selectedRestaurantIds])

    if (loading) return (
        <div className="p-12 flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
            <p className="text-zinc-500 text-sm tracking-widest uppercase animate-pulse">Analisi dati in corso...</p>
        </div>
    )

    if (!stats) return <div className="p-12 text-center text-zinc-500">Nessun dato disponibile.</div>

    return (
        <div className="space-y-8 relative z-10 pb-20">

            {/* Economia MINTHI */}
            {subStats && (
                <div className="space-y-4">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <CurrencyEur className="text-amber-500" size={22} /> Economia MINTHI
                        </h2>
                        <p className="text-xs text-zinc-500 uppercase tracking-widest mt-0.5">Abbonamenti, sconti e bonus</p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Card className="bg-zinc-900/50 border border-amber-500/10 rounded-2xl shadow-[0_10px_30px_-10px_rgba(245,158,11,0.15)] overflow-hidden">
                            <CardContent className="p-5">
                                <p className="text-[10px] text-amber-500/70 font-bold uppercase tracking-widest mb-1">Incassato</p>
                                <p className="text-2xl font-black text-amber-400">€{subStats.totalEarned.toFixed(0)}</p>
                                <p className="text-[10px] text-zinc-500 mt-1">Abbonamenti pagati</p>
                            </CardContent>
                        </Card>
                        <Card className="bg-zinc-900/50 border border-emerald-500/10 rounded-2xl overflow-hidden">
                            <CardContent className="p-5">
                                <p className="text-[10px] text-emerald-500/70 font-bold uppercase tracking-widest mb-1">Abbonati attivi</p>
                                <p className="text-2xl font-black text-emerald-400">{subStats.activeSubscriptions}</p>
                                <p className="text-[10px] text-zinc-500 mt-1">Subscription active</p>
                            </CardContent>
                        </Card>
                        <Card className="bg-zinc-900/50 border border-violet-500/10 rounded-2xl overflow-hidden">
                            <CardContent className="p-5">
                                <p className="text-[10px] text-violet-500/70 font-bold uppercase tracking-widest mb-1">Sconti attivi</p>
                                <p className="text-2xl font-black text-violet-400">{subStats.activeDiscounts}</p>
                                <p className="text-[10px] text-zinc-500 mt-1">Ristoranti con sconto</p>
                            </CardContent>
                        </Card>
                        <Card className="bg-zinc-900/50 border border-blue-500/10 rounded-2xl overflow-hidden">
                            <CardContent className="p-5">
                                <p className="text-[10px] text-blue-500/70 font-bold uppercase tracking-widest mb-1">Mesi bonus</p>
                                <p className="text-2xl font-black text-blue-400">{subStats.bonusMonthsGiven}</p>
                                <p className="text-[10px] text-zinc-500 mt-1">Mesi gratuiti regalati</p>
                            </CardContent>
                        </Card>
                    </div>
                    {/* Revenue by month chart */}
                    {subStats.revenueByMonth.length > 0 && (
                        <Card className="bg-zinc-900/40 border border-white/5 rounded-2xl overflow-hidden">
                            <CardHeader className="pb-0 pt-5 px-6">
                                <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                                    <Receipt className="text-amber-500" size={16} /> Ricavi Abbonamenti — Ultimi 12 mesi
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 pt-2">
                                <ResponsiveContainer width="100%" height={160}>
                                    <BarChart data={subStats.revenueByMonth} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                                        <XAxis dataKey="month" tick={{ fill: '#52525b', fontSize: 10 }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fill: '#52525b', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `€${v}`} />
                                        <Tooltip
                                            contentStyle={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, color: '#fff', fontSize: 12 }}
                                            formatter={(v: any) => [`€${Number(v).toFixed(2)}`, 'Ricavi']}
                                            cursor={{ fill: 'rgba(245,158,11,0.05)' }}
                                        />
                                        <Bar dataKey="revenue" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={32} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}

            {/* Filter Bar */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 bg-zinc-900/40 p-6 rounded-2xl border border-white/5 backdrop-blur-xl shadow-2xl">
                <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                        <ChartBar className="text-amber-500" size={28} />
                        Panoramica Analytics
                    </h2>
                    <p className="text-xs text-zinc-500 font-bold uppercase tracking-[0.2em] mt-1">Global Platform Performance</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Restaurant Filter */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className="h-9 gap-2 bg-black/40 border-white/10 text-zinc-300 hover:text-white hover:bg-zinc-800">
                                <Storefront size={16} className="text-amber-500" />
                                <span className="text-xs">
                                    {selectedRestaurantIds.length === allRestaurants.length || selectedRestaurantIds.length === 0
                                        ? 'Tutti i ristoranti'
                                        : `${selectedRestaurantIds.length} selezionati`}
                                </span>
                                <CaretDown size={14} />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 p-0 bg-zinc-950 border-zinc-800" align="end">
                            <div className="p-3 border-b border-zinc-800">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Filtra Ristoranti</span>
                                    <div className="flex gap-1">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 px-2 text-xs text-zinc-500 hover:text-white"
                                            onClick={() => setSelectedRestaurantIds(allRestaurants.map(r => r.id))}
                                        >
                                            Tutti
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 px-2 text-xs text-zinc-500 hover:text-white"
                                            onClick={() => setSelectedRestaurantIds([])}
                                        >
                                            Nessuno
                                        </Button>
                                    </div>
                                </div>
                            </div>
                            <div className="max-h-64 overflow-y-auto p-2 space-y-1">
                                {allRestaurants.map(restaurant => {
                                    const isSelected = selectedRestaurantIds.includes(restaurant.id)
                                    return (
                                        <div
                                            key={restaurant.id}
                                            className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-amber-500/10 text-amber-400' : 'text-zinc-400 hover:bg-zinc-800'}`}
                                            onClick={() => {
                                                if (isSelected) {
                                                    setSelectedRestaurantIds(prev => prev.filter(id => id !== restaurant.id))
                                                } else {
                                                    setSelectedRestaurantIds(prev => [...prev, restaurant.id])
                                                }
                                            }}
                                        >
                                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-amber-500 border-amber-500' : 'border-zinc-600'}`}>
                                                {isSelected && <Check size={10} className="text-black" weight="bold" />}
                                            </div>
                                            <span className="text-sm truncate flex-1">{restaurant.name}</span>
                                        </div>
                                    )
                                })}
                            </div>
                        </PopoverContent>
                    </Popover>

                    {/* Date Filter - Matching AnalyticsCharts */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
                            <SelectTrigger className="h-10 w-auto min-w-[180px] border-white/10 bg-black/40 hover:bg-zinc-900/60 backdrop-blur-sm text-zinc-300 rounded-xl">
                                <div className="flex items-center gap-2">
                                    <Calendar className="text-zinc-500" size={16} />
                                    <SelectValue />
                                </div>
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-950 border-zinc-800">
                                {dateFilterOptions.map(opt => (
                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {dateFilter === 'custom' && (
                            <div className="flex items-center gap-2 bg-black/40 p-2 rounded-xl border border-white/5">
                                <Input
                                    type="date"
                                    value={customStartDate}
                                    onChange={(e) => setCustomStartDate(e.target.value)}
                                    className="bg-transparent border-none text-white text-sm w-32 h-8 focus-visible:ring-0"
                                />
                                <div className="w-3 h-px bg-zinc-700" />
                                <Input
                                    type="date"
                                    value={customEndDate}
                                    onChange={(e) => setCustomEndDate(e.target.value)}
                                    className="bg-transparent border-none text-white text-sm w-32 h-8 focus-visible:ring-0"
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* KPI Cards - Row 1: Main metrics */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <KPICard title="Revenue Totale" value={`€ ${stats.totalRevenue.toLocaleString('it-IT')}`} subtitle="Incasso periodo" icon={<Money size={24} />} color="amber" />
                <KPICard title="Partner Attivi" value={stats.totalRestaurants.toString()} subtitle="Ristoranti registrati" icon={<Storefront size={24} />} color="amber" />
                <KPICard title="Volume Ordini" value={stats.totalOrders.toString()} subtitle={`Media ${Math.round(stats.totalOrders / (stats.growthData.length || 1))} / giorno`} icon={<ShoppingCart size={24} />} color="amber" />
                <KPICard title="Sessioni Live" value={stats.activeSessions.toString()} subtitle="Tavoli attivi ora" icon={<Fire size={24} weight="fill" />} color="orange" isLive />
            </div>

            {/* KPI Cards - Row 2: Detailed metrics */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <KPICard title="Totale Accessi" value={stats.totalCustomers.toLocaleString('it-IT')} subtitle={`${stats.totalSessions} sessioni uniche`} icon={<UsersThree size={24} />} color="blue" />
                <KPICard title="Scontrino Medio" value={`€ ${stats.avgOrderValue.toFixed(2)}`} subtitle="Valore medio ordine" icon={<Receipt size={24} />} color="green" />
                <KPICard title="Media/Ristorante" value={`€ ${stats.avgRevenuePerRestaurant.toFixed(0)}`} subtitle={`~${stats.avgOrdersPerRestaurant.toFixed(0)} ordini ciascuno`} icon={<CurrencyEur size={24} />} color="purple" />
                <KPICard title="Ordini Attivi" value={stats.activeOrders.toString()} subtitle="In lavorazione" icon={<Clock size={24} />} color="amber" />
            </div>

            {/* Charts Section */}
            <div className="grid gap-6 md:grid-cols-2">
                {/* Growth Chart */}
                <Card className="bg-zinc-900/40 backdrop-blur-3xl border border-white/5 rounded-3xl shadow-[0_30px_60px_-15px_rgba(0,0,0,1)] overflow-hidden">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg font-bold text-white flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <TrendUp className="text-amber-500" />
                                Crescita Piattaforma
                            </div>
                            <Badge variant="outline" className="text-[10px] font-bold border-amber-500/30 text-amber-500">CUMULATIVO</Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 h-[320px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={stats.growthData}>
                                <defs>
                                    <linearGradient id="colorRes" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                                <XAxis dataKey="date" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                                <YAxis stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px', fontSize: '12px' }}
                                    itemStyle={{ color: '#f59e0b' }}
                                />
                                <Area type="monotone" dataKey="restaurants" stroke="#f59e0b" strokeWidth={3} fillOpacity={1} fill="url(#colorRes)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Order Volume Chart */}
                <Card className="bg-zinc-900/40 backdrop-blur-3xl border border-white/5 rounded-3xl shadow-[0_30px_60px_-15px_rgba(0,0,0,1)] overflow-hidden">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg font-bold text-white flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <ShoppingCart className="text-blue-500" />
                                Volume Ordini Giornalieri
                            </div>
                            <Badge variant="outline" className="text-[10px] font-bold border-blue-500/30 text-blue-500">GIORNALIERO</Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 h-[320px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={stats.growthData}>
                                <defs>
                                    <linearGradient id="colorOrd" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                                <XAxis dataKey="date" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                                <YAxis stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px', fontSize: '12px' }}
                                    itemStyle={{ color: '#3b82f6' }}
                                />
                                <Area type="monotone" dataKey="orders" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorOrd)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                {/* Rankings */}
                <Card className="col-span-2 bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl shadow-[0_30px_60px_-15px_rgba(0,0,0,0.9)] overflow-hidden">
                    <CardHeader className="border-b border-white/5 pb-6 flex flex-row items-center justify-between">
                        <div className="flex flex-col gap-1">
                            <CardTitle className="text-xl font-bold text-white flex items-center gap-3">
                                <div className="p-2 bg-amber-500/10 rounded-xl">
                                    <ChartBar className="text-amber-500" size={20} />
                                </div>
                                Performance Partner
                            </CardTitle>
                            <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest pl-12">TOP RANKING</span>
                        </div>

                        {/* Ranking Mode Toggle */}
                        <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/5">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setRankingMode('revenue')}
                                className={`text-xs font-bold px-3 rounded-lg transition-all ${rankingMode === 'revenue' ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' : 'text-zinc-500 hover:text-white'}`}
                            >
                                Fatturato
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setRankingMode('access')}
                                className={`text-xs font-bold px-3 rounded-lg transition-all ${rankingMode === 'access' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-zinc-500 hover:text-white'}`}
                            >
                                Accessi
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-6 mt-4">
                            {stats.revenueByRestaurant
                                .sort((a, b) => rankingMode === 'revenue' ? b.revenue - a.revenue : b.customers - a.customers)
                                .slice(0, 10)
                                .map((item, index) => {
                                    const primaryMetric = rankingMode === 'revenue' ? item.revenue : item.customers
                                    const maxMetric = rankingMode === 'revenue'
                                        ? Math.max(...stats.revenueByRestaurant.map(r => r.revenue))
                                        : Math.max(...stats.revenueByRestaurant.map(r => r.customers))
                                    const percentage = maxMetric > 0 ? (primaryMetric / maxMetric) * 100 : 0

                                    const barColor = rankingMode === 'revenue' ? 'from-amber-600 to-amber-400' : 'from-blue-600 to-blue-400'
                                    const shadowColor = rankingMode === 'revenue' ? 'rgba(245,158,11,0.4)' : 'rgba(59,130,246,0.4)'
                                    const metricColor = rankingMode === 'revenue' ? 'text-amber-500' : 'text-blue-500'

                                    return (
                                        <div key={item.id} className="group relative">
                                            <div className="flex items-center mb-3">
                                                <div className={`w-10 font-bold text-lg italic ${rankingMode === 'revenue' ? 'text-amber-500/20' : 'text-blue-500/20'}`}>#{index + 1}</div>
                                                <div className="flex-1 flex items-center justify-between">
                                                    <div className="flex flex-col">
                                                        <div className="flex items-center gap-2">
                                                            <p className={`text-base font-bold text-zinc-100 group-hover:${rankingMode === 'revenue' ? 'text-amber-500' : 'text-blue-500'} transition-colors uppercase tracking-tight`}>{item.name}</p>
                                                            {onImpersonate && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className={`h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg ${rankingMode === 'revenue' ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-500'}`}
                                                                    onClick={() => onImpersonate(item.id)}
                                                                >
                                                                    <Eye size={16} />
                                                                </Button>
                                                            )}
                                                        </div>
                                                        <p className="text-[10px] text-zinc-600 font-bold tracking-widest uppercase">
                                                            {rankingMode === 'revenue'
                                                                ? `${item.orders} ORDINI COMPLETATI`
                                                                : `FATTURATO: € ${item.revenue.toLocaleString('it-IT')}`}
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className={`text-xl font-black ${metricColor} tabular-nums`}>
                                                            {rankingMode === 'revenue'
                                                                ? `€ ${item.revenue.toLocaleString('it-IT')}`
                                                                : item.customers.toLocaleString('it-IT')}
                                                        </p>
                                                        {rankingMode === 'access' && <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">PERSONE</p>}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full bg-gradient-to-r ${barColor} transition-all duration-1000 ease-out`}
                                                    style={{
                                                        width: `${percentage}%`,
                                                        boxShadow: `0 0 15px ${shadowColor}`
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    )
                                })}
                        </div>
                    </CardContent>
                </Card>

                {/* Peak Hours Breakdown — Bar Chart */}
                <Card className="col-span-1 bg-zinc-900/40 backdrop-blur-3xl border border-white/5 rounded-3xl shadow-[0_30px_60px_-15px_rgba(0,0,0,0.9)] overflow-hidden">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-3 text-lg font-bold text-white">
                            <Clock className="text-amber-500" /> Distribuzione Oraria
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="mt-2">
                            <ResponsiveContainer width="100%" height={320}>
                                <BarChart data={stats.peakHours} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                                    <XAxis
                                        dataKey="hour"
                                        tick={{ fill: '#52525b', fontSize: 10 }}
                                        axisLine={false}
                                        tickLine={false}
                                        tickFormatter={(h: number) => `${h}`}
                                    />
                                    <YAxis
                                        tick={{ fill: '#52525b', fontSize: 10 }}
                                        axisLine={false}
                                        tickLine={false}
                                        allowDecimals={false}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: '#09090b',
                                            borderRadius: '12px',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            boxShadow: '0 8px 30px rgba(0,0,0,0.5)'
                                        }}
                                        itemStyle={{ color: '#fbbf24', fontWeight: 'bold' }}
                                        labelStyle={{ color: '#a1a1aa', marginBottom: '8px' }}
                                        labelFormatter={(h: number) => `${String(h).padStart(2, '0')}:00`}
                                        formatter={(value: number) => [`${value} ordini`, 'Ordini']}
                                    />
                                    <Bar
                                        dataKey="count"
                                        fill="#f59e0b"
                                        radius={[4, 4, 0, 0]}
                                        maxBarSize={20}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

function KPICard({ title, value, subtitle, icon, color, isLive }: { title: string, value: string, subtitle: string, icon: any, color: string, isLive?: boolean }) {
    const colorClasses: Record<string, { text: string; bg: string; border: string }> = {
        amber: { text: 'text-amber-500', bg: 'bg-amber-500/10', border: 'hover:border-amber-500/20' },
        orange: { text: 'text-orange-500', bg: 'bg-orange-500/10', border: 'hover:border-orange-500/20' },
        blue: { text: 'text-blue-500', bg: 'bg-blue-500/10', border: 'hover:border-blue-500/20' },
        green: { text: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'hover:border-emerald-500/20' },
        purple: { text: 'text-purple-500', bg: 'bg-purple-500/10', border: 'hover:border-purple-500/20' }
    }
    const { text: colorClass, bg: bgClass, border: borderClass } = colorClasses[color] || colorClasses.amber

    return (
        <Card className={`bg-zinc-900/50 backdrop-blur-3xl border border-white/5 rounded-2xl shadow-[0_20px_40px_-12px_rgba(0,0,0,0.8)] ${borderClass} transition-all group overflow-hidden`}>
            <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                    <div className={`p-2.5 rounded-xl ${bgClass} ${colorClass}`}>
                        {icon}
                    </div>
                    {isLive && (
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
                            <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">LIVE</span>
                        </div>
                    )}
                </div>
                <div>
                    <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-zinc-500 group-hover:text-zinc-300 transition-colors">{title}</h3>
                    <div className={`text-2xl font-black mt-1 ${colorClass} tracking-tight tabular-nums`}>{value}</div>
                    <p className="text-[10px] text-zinc-500 font-bold mt-1 uppercase tracking-widest flex items-center gap-1">
                        {subtitle}
                    </p>
                </div>
            </CardContent>
        </Card>
    )
}


