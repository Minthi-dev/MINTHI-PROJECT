import { useState, useMemo, useEffect } from 'react'
import { generatePdfFromElement } from '../utils/pdfUtils'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Area, AreaChart } from 'recharts'
import { TrendUp, CurrencyEur, Users, ShoppingBag, Clock, ChartLine, CalendarBlank, List, CaretDown, Star, Package, TrendDown, Minus, Check, DownloadSimple, ArrowsLeftRight, ArrowUp, ArrowDown } from '@phosphor-icons/react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Order, Dish, Category, OrderItem, RestaurantStaff, WaiterActivityLog } from '../services/types'
import { DatabaseService } from '../services/DatabaseService'


interface AnalyticsChartsProps {
  orders: Order[]
  completedOrders: Order[]
  dishes: Dish[]
  categories: Category[]
  restaurantName?: string
  restaurantId?: string
  passwordButton?: React.ReactNode
}

type DateFilter = 'today' | 'yesterday' | 'week' | '2weeks' | 'month' | '3months' | 'custom'
type InventoryPeriod = '1day' | '2days' | '7days' | '2weeks' | '1month' | '3months' | 'custom'

const dateFilters: { value: DateFilter, label: string }[] = [
  { value: 'today', label: 'Oggi' },
  { value: 'yesterday', label: 'Ieri' },
  { value: 'week', label: 'Ultima Settimana' },
  { value: '2weeks', label: 'Ultime 2 Settimane' },
  { value: 'month', label: 'Ultimo Mese' },
  { value: '3months', label: 'Ultimi 3 Mesi' },
  { value: 'custom', label: 'Personalizzato' }
]

const inventoryPeriods: { value: InventoryPeriod, label: string, days: number }[] = [
  { value: '1day', label: '1 Giorno', days: 1 },
  { value: '2days', label: '2 Giorni', days: 2 },
  { value: '7days', label: '7 Giorni', days: 7 },
  { value: '2weeks', label: '2 Settimane', days: 14 },
  { value: '1month', label: '1 Mese', days: 30 },
  { value: '3months', label: '3 Mesi', days: 90 },
  { value: 'custom', label: 'Personalizzato', days: 0 }
]

const COLORS = ['#C9A152', '#8B7355', '#F4E6D1', '#E8C547', '#D4B366', '#A68B5B', '#F0D86F', '#C09853']

interface DailyData {
  date: string
  fullDate?: string
  orders: number
  revenue: number
  averageValue: number
}

interface HourlyData {
  hour: string
  orders: number
  revenue: number
}

type FilteredOrder = Order & { filteredItems?: OrderItem[]; filteredAmount?: number }

export default function AnalyticsCharts({ orders, completedOrders, dishes, categories, restaurantName = 'Ristorante', restaurantId, passwordButton }: AnalyticsChartsProps) {
  const [dateFilter, setDateFilter] = useState<DateFilter>('week')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])

  // Tabs State (using strings for active tab)
  const [activeTab, setActiveTab] = useState('overview') // 'overview' | 'waiters'
  const [waiterChartMetric, setWaiterChartMetric] = useState<'waiters' | 'ordersPerHour' | 'avgWait'>('waiters')

  // Staff and Logs State
  const [staffList, setStaffList] = useState<RestaurantStaff[]>([])
  const [waiterLogs, setWaiterLogs] = useState<WaiterActivityLog[]>([])

  useEffect(() => {
    if (restaurantId) {
      DatabaseService.getStaff(restaurantId).then(setStaffList).catch(console.error)
      DatabaseService.getWaiterLogs(restaurantId).then(setWaiterLogs).catch(console.error)
    }
  }, [restaurantId])

  // Inventory state
  const [inventoryPeriod, setInventoryPeriod] = useState<InventoryPeriod>('7days')
  const [inventoryCustomStart, setInventoryCustomStart] = useState('')
  const [inventoryCustomEnd, setInventoryCustomEnd] = useState('')
  const [inventoryCategories, setInventoryCategories] = useState<string[]>([])
  const [inventorySortBy, setInventorySortBy] = useState<'quantity' | 'revenue' | 'category' | 'price'>('quantity')

  // Magazzino comparison state
  const [magCompareEnabled, setMagCompareEnabled] = useState(false)
  const [magCompareMode, setMagCompareMode] = useState<'prev_week' | 'prev_month' | 'custom'>('prev_week')
  const [magCompareCustomStart, setMagCompareCustomStart] = useState('')
  const [magCompareCustomEnd, setMagCompareCustomEnd] = useState('')

  // Chart Toggles
  const [timeSeriesMetric, setTimeSeriesMetric] = useState<'orders' | 'revenue' | 'average'>('orders')
  const [categoryMetric, setCategoryMetric] = useState<'quantity' | 'revenue'>('revenue')

  // Update selected categories when categories change
  useEffect(() => {
    setSelectedCategories(categories.map(c => c.id))
    setInventoryCategories(categories.map(c => c.id))
  }, [categories])

  // Helper function to get date range
  const getDateRange = (filter: DateFilter) => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekAgo = new Date(today)
    weekAgo.setDate(weekAgo.getDate() - 7)

    switch (filter) {
      case 'today':
        return { start: today.getTime(), end: now.getTime() }
      case 'yesterday':
        const yesterday = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)
        return { start: yesterday.getTime(), end: today.getTime() - 1 }
      case 'week':
        return { start: weekAgo.getTime(), end: now.getTime() }
      case '2weeks':
        const twoWeeksAgo = new Date(today)
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
        return { start: twoWeeksAgo.getTime(), end: now.getTime() }
      case 'month':
        const monthAgo = new Date(today)
        monthAgo.setMonth(monthAgo.getMonth() - 1)
        return { start: monthAgo.getTime(), end: now.getTime() }
      case '3months':
        const threeMonthsAgo = new Date(today)
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
        return { start: threeMonthsAgo.getTime(), end: now.getTime() }
      case 'custom':
        if (customStartDate && customEndDate) {
          const startDate = new Date(customStartDate)
          const endDate = new Date(customEndDate)
          endDate.setHours(23, 59, 59, 999)
          return { start: startDate.getTime(), end: endDate.getTime() }
        }
        return { start: weekAgo.getTime(), end: now.getTime() }
    }
  }

  // Helper function to get inventory date range
  const getInventoryDateRange = (period: InventoryPeriod) => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    if (period === 'custom' && inventoryCustomStart && inventoryCustomEnd) {
      const startDate = new Date(inventoryCustomStart)
      const endDate = new Date(inventoryCustomEnd)
      endDate.setHours(23, 59, 59, 999)
      return { start: startDate.getTime(), end: endDate.getTime() }
    }

    const periodInfo = inventoryPeriods.find(p => p.value === period)
    const days = periodInfo?.days || 7
    const startDate = new Date(today)
    startDate.setDate(startDate.getDate() - days)

    return { start: startDate.getTime(), end: now.getTime() }
  }

  const dateRange = getDateRange(dateFilter)
  const { start, end } = dateRange

  // Combine active and completed orders for comprehensive analytics
  const allOrders = useMemo(() => [...completedOrders, ...orders], [completedOrders, orders])

  const dateFilteredOrders = allOrders.filter(order => {
    const orderTime = new Date(order.created_at).getTime()
    return orderTime >= start && orderTime <= end
  })

  const activeCategoryIds = selectedCategories

  const categoryFilteredOrders: FilteredOrder[] = dateFilteredOrders.map(order => {
    const filteredItems = (order.items || []).filter((item: OrderItem) => {
      const dish = dishes.find(d => d.id === item.dish_id)
      return dish ? activeCategoryIds.includes(dish.category_id) : false
    })

    const filteredAmount = filteredItems.reduce((sum, item) => {
      const dish = dishes.find(d => d.id === item.dish_id)
      return sum + (dish?.price || 0) * item.quantity
    }, 0)

    return { ...order, filteredItems, filteredAmount }
  }).filter(order => (order.filteredItems || []).length > 0)

  // Analytics calculations
  const analytics = useMemo(() => {
    const totalOrders = categoryFilteredOrders.length
    const totalRevenue = categoryFilteredOrders.reduce((sum, order) => sum + (order.filteredAmount || order.total_amount || 0), 0)
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0
    const activeOrdersCount = orders.filter(order => order.status === 'OPEN').length

    // Daily data for charts
    const dailyData: DailyData[] = []
    const days = Math.max(1, Math.ceil((end - start) / (24 * 60 * 60 * 1000)))

    const isSingleDay = days === 1 || dateFilter === 'today' || dateFilter === 'yesterday'

    for (let i = 0; i < days; i++) {
      const dayStart = start + (i * 24 * 60 * 60 * 1000)
      const dayEnd = dayStart + (24 * 60 * 60 * 1000)
      const dayOrders = categoryFilteredOrders.filter(order => {
        const orderTime = new Date(order.created_at).getTime()
        return orderTime >= dayStart && orderTime < dayEnd
      })

      const date = new Date(dayStart)
      const dayRevenue = dayOrders.reduce((sum, order) => sum + (order.filteredAmount || order.total_amount || 0), 0)
      dailyData.push({
        date: isSingleDay ? 'Oggi' : `${date.getDate()}/${date.getMonth() + 1}`,
        fullDate: isSingleDay ? 'Oggi' : date.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }),
        orders: dayOrders.length,
        revenue: dayRevenue,
        averageValue: dayOrders.length > 0 ? dayRevenue / dayOrders.length : 0
      })
    }

    // Category analysis
    const categoryStats = categories
      .filter(category => activeCategoryIds.includes(category.id))
      .map(category => {
        const categoryOrders = categoryFilteredOrders.flatMap(order =>
          (order.filteredItems || []).filter(item => {
            const dish = dishes.find(d => d.id === item.dish_id)
            return dish?.category_id === category.id
          })
        )

        const totalQuantity = categoryOrders.reduce((sum, item) => sum + item.quantity, 0)
        const totalRevenue = categoryOrders.reduce((sum, item) => {
          const dish = dishes.find(d => d.id === item.dish_id)
          return sum + (dish?.price || 0) * item.quantity
        }, 0)

        return {
          name: category.name,
          quantity: totalQuantity,
          revenue: totalRevenue,
          percentage: totalOrders > 0 ? (categoryOrders.length / totalOrders) * 100 : 0
        }
      }).filter(cat => cat.quantity > 0)
      .sort((a, b) => categoryMetric === 'revenue' ? b.revenue - a.revenue : b.quantity - a.quantity)

    // Most ordered dishes
    const dishStats = dishes
      .filter(dish => activeCategoryIds.includes(dish.category_id))
      .map(dish => {
        const dishOrders = categoryFilteredOrders.flatMap(order =>
          (order.filteredItems || []).filter(item => item.dish_id === dish.id)
        )

        const totalQuantity = dishOrders.reduce((sum, item) => sum + item.quantity, 0)
        const totalRevenue = totalQuantity * dish.price
        const category = categories.find(c => c.id === dish.category_id)

        return {
          name: dish.name,
          category: category?.name || 'Unknown',
          quantity: totalQuantity,
          revenue: totalRevenue
        }
      }).filter(dish => dish.quantity > 0)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 50)

    return {
      totalOrders,
      totalRevenue,
      averageOrderValue,
      activeOrders: activeOrdersCount,
      dailyData,
      categoryStats,
      dishStats,
      isSingleDay
    }
  }, [categoryFilteredOrders, orders, categories, dishes, dateFilter, start, end, activeCategoryIds, categoryMetric])

  // EXPORT ANALYTICS FUNCTION - VISUAL PDF
  const handleExportAnalytics = async () => {
    const toastId = toast.loading('Generazione PDF in corso...')
    try {
      await generatePdfFromElement('analytics-pdf-export-view', {
        fileName: `report-analitico-${restaurantName.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`,
        orientation: 'portrait',
        backgroundColor: '#f4f4f5', // Light/Grey background for elegant PDF
        margin: 0 // Template handles padding
      })
      toast.success('Report esportato con successo')
    } catch (e) {
      console.error(e)
      toast.error('Errore export PDF')
    } finally {
      toast.dismiss(toastId)
    }
  }

  // Helper to compute comparison period range based on mode
  const getComparisonRange = () => {
    const currentDuration = end - start
    if (magCompareMode === 'prev_week') {
      const compEnd = start - 1
      const compStart = compEnd - (7 * 24 * 60 * 60 * 1000)
      return { compStart, compEnd }
    } else if (magCompareMode === 'prev_month') {
      const compEnd = start - 1
      const compStart = compEnd - (30 * 24 * 60 * 60 * 1000)
      return { compStart, compEnd }
    } else if (magCompareMode === 'custom' && magCompareCustomStart && magCompareCustomEnd) {
      const cs = new Date(magCompareCustomStart).getTime()
      const ceDate = new Date(magCompareCustomEnd)
      ceDate.setHours(23, 59, 59, 999)
      return { compStart: cs, compEnd: ceDate.getTime() }
    }
    // fallback: previous equivalent period
    return { compStart: start - currentDuration, compEnd: start - 1 }
  }

  // Inventory (Magazzino) calculations - NOW USES MAIN DATE FILTER
  const inventoryData = useMemo(() => {
    // Use the same date range as the main analytics (from dateFilter)
    const invStart = start
    const invEnd = end
    const periodDays = Math.max(1, Math.ceil((invEnd - invStart) / (24 * 60 * 60 * 1000)))

    // Filter orders for inventory period (excluding cancelled)
    const inventoryOrders = allOrders.filter(order => {
      const orderTime = new Date(order.created_at).getTime()
      return orderTime >= invStart && orderTime <= invEnd && order.status !== 'CANCELLED'
    })

    // Calculate historical average (limit to last 2 years for relevance) - EXCLUDE CURRENT PERIOD
    const twoYearsAgo = Date.now() - (2 * 365 * 24 * 60 * 60 * 1000)
    const historicalOrders = allOrders.filter(order => {
      const orderTime = new Date(order.created_at).getTime()
      // STRICTLY BEFORE the start of the current inventory period
      return orderTime >= twoYearsAgo && orderTime < invStart && order.status !== 'CANCELLED'
    })

    const historicalDays = historicalOrders.length > 0
      ? Math.max(1, Math.ceil((invStart - Math.max(twoYearsAgo, new Date(Math.min(...historicalOrders.map(o => new Date(o.created_at).getTime()))).getTime())) / (24 * 60 * 60 * 1000)))
      : 1

    // Comparison period calculations (when enabled)
    let compOrders: typeof allOrders = []
    let compDays = 1
    let compLabel = ''
    if (magCompareEnabled) {
      const { compStart: cs, compEnd: ce } = getComparisonRange()
      compDays = Math.max(1, Math.ceil((ce - cs) / (24 * 60 * 60 * 1000)))
      compOrders = allOrders.filter(order => {
        const orderTime = new Date(order.created_at).getTime()
        return orderTime >= cs && orderTime <= ce && order.status !== 'CANCELLED'
      })
      const csDate = new Date(cs)
      const ceDate = new Date(ce)
      compLabel = `${csDate.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} - ${ceDate.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}`
    }

    // Calculate per-dish inventory stats - include ALL dishes (removed is_active filter)
    const dishInventory = dishes
      .filter(dish => inventoryCategories.length === 0 || inventoryCategories.includes(dish.category_id)) // Filter by selected categories
      .map(dish => {
        // Current period
        const periodSales = inventoryOrders.flatMap(order =>
          (order.items || []).filter(item => item.dish_id === dish.id)
        )
        const periodQuantity = periodSales.reduce((sum, item) => sum + item.quantity, 0)
        const periodAvgPerDay = periodQuantity / periodDays

        // Historical average (last 2 years)
        const historicalSales = historicalOrders.flatMap(order =>
          (order.items || []).filter(item => item.dish_id === dish.id)
        )
        const historicalQuantity = historicalSales.reduce((sum, item) => sum + item.quantity, 0)
        const historicalAvgPerDay = historicalQuantity / historicalDays

        // Calculate percentage change
        let percentageChange = 0
        if (historicalAvgPerDay > 0) {
          percentageChange = ((periodAvgPerDay - historicalAvgPerDay) / historicalAvgPerDay) * 100
        } else if (periodAvgPerDay > 0) {
          percentageChange = 100 // New dish with sales (or significant increase from zero)
        }

        // Comparison period stats
        let compQuantity = 0
        let compAvgPerDay = 0
        let compPercentageChange = 0
        if (magCompareEnabled) {
          const compSales = compOrders.flatMap(order =>
            (order.items || []).filter(item => item.dish_id === dish.id)
          )
          compQuantity = compSales.reduce((sum, item) => sum + item.quantity, 0)
          compAvgPerDay = compQuantity / compDays
          if (compAvgPerDay > 0) {
            compPercentageChange = ((periodAvgPerDay - compAvgPerDay) / compAvgPerDay) * 100
          } else if (periodAvgPerDay > 0) {
            compPercentageChange = 100
          }
        }

        const category = categories.find(c => c.id === dish.category_id)

        return {
          id: dish.id,
          name: dish.name,
          category: category?.name || 'Sconosciuta',
          categoryId: dish.category_id,
          periodQuantity,
          periodAvgPerDay: Math.round(periodAvgPerDay * 100) / 100,
          allTimeAvgPerDay: Math.round(historicalAvgPerDay * 100) / 100,
          percentageChange: Math.round(percentageChange * 10) / 10,
          price: dish.price,
          isActive: dish.is_active !== false, // Track status for display
          // Comparison data
          compQuantity,
          compAvgPerDay: Math.round(compAvgPerDay * 100) / 100,
          compPercentageChange: Math.round(compPercentageChange * 10) / 10
        }
      })
      .sort((a, b) => {
        switch (inventorySortBy) {
          case 'quantity':
            return b.periodQuantity - a.periodQuantity
          case 'revenue':
            return (b.periodQuantity * b.price) - (a.periodQuantity * a.price)
          case 'category':
            return a.category.localeCompare(b.category)
          case 'price':
            return b.price - a.price
          default:
            return b.periodQuantity - a.periodQuantity
        }
      })

    // Generate trend alerts for significant variations (>15% or <-15%)
    const trendAlerts = dishInventory
      .filter(dish => Math.abs(dish.percentageChange) >= 15 && dish.periodQuantity > 0)
      .sort((a, b) => Math.abs(b.percentageChange) - Math.abs(a.percentageChange))
      .slice(0, 2) // Top 2 significant changes
      .map(dish => ({
        name: dish.name,
        category: dish.category,
        change: dish.percentageChange
      }))

    // Comparison aggregate stats
    const compTotalPortions = magCompareEnabled ? dishInventory.reduce((sum, d) => sum + d.compQuantity, 0) : 0
    const compTotalRevenue = magCompareEnabled ? dishInventory.reduce((sum, d) => sum + d.compQuantity * d.price, 0) : 0
    const currentTotalRevenue = dishInventory.reduce((sum, d) => sum + d.periodQuantity * d.price, 0)

    return {
      dishes: dishInventory,
      periodDays,
      totalPortions: dishInventory.reduce((sum, d) => sum + d.periodQuantity, 0),
      trendAlerts,
      compLabel,
      compDays,
      compTotalPortions,
      compTotalRevenue,
      currentTotalRevenue
    }
  }, [allOrders, dishes, categories, start, end, inventorySortBy, inventoryCategories, magCompareEnabled, magCompareMode, magCompareCustomStart, magCompareCustomEnd])

  // Waiter Analytics Calculations
  const waiterStats = useMemo(() => {
    const logsInPeriod = waiterLogs.filter(log => {
      const logTime = new Date(log.created_at || Date.now()).getTime()
      return logTime >= start && logTime <= end
    })

    const waiterMap = new Map<string, { name: string; dishesDelivered: number; bellsResolved: number; firstActivity: number; lastActivity: number }>()

    staffList.forEach(staff => {
      waiterMap.set(staff.id, { name: staff.name, dishesDelivered: 0, bellsResolved: 0, firstActivity: Infinity, lastActivity: 0 })
    })

    logsInPeriod.forEach(log => {
      if (!waiterMap.has(log.waiter_id)) return
      const entry = waiterMap.get(log.waiter_id)!
      const logTime = new Date(log.created_at || Date.now()).getTime()
      if (log.action_type === 'DISH_DELIVERED') {
        entry.dishesDelivered += 1
      } else if (log.action_type === 'BELL_RESOLVED') {
        entry.bellsResolved += 1
      }
      entry.firstActivity = Math.min(entry.firstActivity, logTime)
      entry.lastActivity = Math.max(entry.lastActivity, logTime)
    })

    const rankings = Array.from(waiterMap.values()).sort((a, b) => b.dishesDelivered - a.dishesDelivered)

    // Total active waiters in period
    const totalActiveWaiters = rankings.filter(w => w.dishesDelivered > 0 || w.bellsResolved > 0).length

    // Calculate per-waiter table data
    const waiterTable = Array.from(waiterMap.entries()).map(([id, w]) => {
      const totalActivities = w.dishesDelivered + w.bellsResolved
      const activeHours = w.lastActivity > w.firstActivity
        ? Math.max(1, (w.lastActivity - w.firstActivity) / (1000 * 60 * 60))
        : totalActivities > 0 ? 1 : 0
      return {
        id,
        name: w.name,
        dishesDelivered: w.dishesDelivered,
        bellsResolved: w.bellsResolved,
        totalActivities,
        activeHours: Math.round(activeHours * 10) / 10,
        activitiesPerHour: activeHours > 0 ? Math.round((totalActivities / activeHours) * 10) / 10 : 0
      }
    }).filter(w => w.totalActivities > 0).sort((a, b) => b.totalActivities - a.totalActivities)

    // Orders in period for wait time calc
    const ordersInPeriod = allOrders.filter(o => {
      const t = new Date(o.created_at).getTime()
      return t >= start && t <= end
    })

    // Avg wait time: use updated_at - created_at if available, or closed_at - created_at
    let totalWaitMs = 0
    let waitCount = 0
    ordersInPeriod.forEach(o => {
      const endTime = o.closed_at ? new Date(o.closed_at).getTime() : o.updated_at ? new Date(o.updated_at).getTime() : 0
      const startTime = new Date(o.created_at).getTime()
      if (endTime > startTime) {
        const diff = endTime - startTime
        // Only count reasonable wait times (under 4 hours)
        if (diff < 4 * 60 * 60 * 1000) {
          totalWaitMs += diff
          waitCount++
        }
      }
    })
    const avgWaitMinutes = waitCount > 0 ? Math.round(totalWaitMs / waitCount / 60000) : 0

    // Global avg orders per waiter per hour
    const totalHoursInPeriod = Math.max(1, (end - start) / (1000 * 60 * 60))
    const avgOrdersPerWaiterHour = totalActiveWaiters > 0
      ? Math.round((ordersInPeriod.length / totalActiveWaiters / (totalHoursInPeriod / Math.max(1, Math.ceil((end - start) / (24 * 60 * 60 * 1000))) * (restaurant_hours_per_day()))) * 10) / 10
      : 0

    // Estimate restaurant service hours per day (lunch + dinner ~8h)
    function restaurant_hours_per_day() { return 8 }

    // Daily metrics for combined chart
    const dailyMetrics: { date: string; waiters: number; ordersPerHour: number; avgWait: number }[] = []
    const days = Math.max(1, Math.ceil((end - start) / (24 * 60 * 60 * 1000)))
    const isSingleDay = days === 1 || dateFilter === 'today' || dateFilter === 'yesterday'

    for (let i = 0; i < days; i++) {
      const dayStart = start + (i * 24 * 60 * 60 * 1000)
      const dayEnd = dayStart + (24 * 60 * 60 * 1000)

      const dayLogs = waiterLogs.filter(log => {
        const logTime = new Date(log.created_at || Date.now()).getTime()
        return logTime >= dayStart && logTime < dayEnd
      })

      const activeWaiterIds = new Set(dayLogs.map(l => l.waiter_id))
      const dayActiveWaiters = activeWaiterIds.size

      // Orders this day
      const dayOrders = allOrders.filter(o => {
        const t = new Date(o.created_at).getTime()
        return t >= dayStart && t < dayEnd
      })

      // Orders per waiter per hour (assuming ~8 service hours per day)
      const serviceHours = 8
      const ordPerWH = dayActiveWaiters > 0
        ? Math.round((dayOrders.length / dayActiveWaiters / serviceHours) * 10) / 10
        : 0

      // Avg wait time this day
      let dayWaitMs = 0
      let dayWaitCount = 0
      dayOrders.forEach(o => {
        const et = o.closed_at ? new Date(o.closed_at).getTime() : o.updated_at ? new Date(o.updated_at).getTime() : 0
        const st = new Date(o.created_at).getTime()
        if (et > st && (et - st) < 4 * 60 * 60 * 1000) {
          dayWaitMs += (et - st)
          dayWaitCount++
        }
      })
      const dayAvgWait = dayWaitCount > 0 ? Math.round(dayWaitMs / dayWaitCount / 60000) : 0

      const date = new Date(dayStart)
      dailyMetrics.push({
        date: isSingleDay ? 'Oggi' : date.toLocaleDateString('it-IT', { month: 'short', day: 'numeric' }),
        waiters: dayActiveWaiters,
        ordersPerHour: ordPerWH,
        avgWait: dayAvgWait
      })
    }

    return {
      rankings,
      waiterTable,
      totalActiveWaiters,
      avgWaitMinutes,
      avgOrdersPerWaiterHour,
      dailyMetrics
    }
  }, [waiterLogs, staffList, allOrders, start, end, dateFilter])

  return (
    <>
      {/* All analytics content in a single view */}
      <div className="space-y-8" id="analytics-export-container">
        {/* Header - Matching standard pattern */}
        <div data-tour="analytics-header" className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4 pb-4 border-b border-white/10">
          <div>
            <h2 className="text-2xl font-light text-white tracking-tight">Gestione <span className="font-bold text-amber-500">Analitiche</span></h2>
            <p className="text-sm text-zinc-400 mt-1 uppercase tracking-wider font-medium">Visualizza statistiche e report</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {passwordButton}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-10 border-white/10 bg-black/40 hover:bg-zinc-900/60 backdrop-blur-sm text-zinc-300">
                  <List size={16} className="mr-2" />
                  Categorie
                  <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 min-w-5 bg-amber-500/20 text-amber-500 border border-amber-500/20">
                    {activeCategoryIds.length}
                  </Badge>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3 bg-zinc-950 border-zinc-800" align="end">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-zinc-800">
                  <span className="text-xs font-medium text-zinc-400">Filtra per categoria</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-zinc-500 hover:text-white" onClick={() => setSelectedCategories(categories.map(c => c.id))}>Tutte</Button>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-zinc-500 hover:text-white" onClick={() => setSelectedCategories([])}>Nessuna</Button>
                  </div>
                </div>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {categories.map(category => {
                    const checked = activeCategoryIds.includes(category.id)
                    return (
                      <label key={category.id} className={`flex items-center gap-2 text-sm px-2 py-1.5 rounded-md cursor-pointer transition-colors ${checked ? 'bg-amber-500/10 text-amber-500' : 'text-zinc-400 hover:bg-zinc-900'}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCategories(prev => Array.from(new Set([...prev, category.id])))
                            } else {
                              setSelectedCategories(prev => prev.filter(id => id !== category.id))
                            }
                          }}
                          className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500/20"
                        />
                        <span className="truncate">{category.name}</span>
                      </label>
                    )
                  })}
                </div>
              </PopoverContent>
            </Popover>

            <Select value={dateFilter} onValueChange={(v: DateFilter) => setDateFilter(v)}>
              <SelectTrigger className="w-44 h-10 border-white/10 bg-black/40 text-zinc-300 hover:bg-zinc-900/60 transition-all">
                <CalendarBlank size={16} className="mr-2 text-amber-500/70" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-950 border-zinc-800 text-zinc-300">
                {dateFilters.map(filter => (
                  <SelectItem key={filter.value} value={filter.value} className="focus:bg-amber-500/10 focus:text-amber-500">{filter.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {dateFilter === 'custom' && (
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-36 h-10 bg-black/40 border-white/10 text-zinc-300"
                />
                <span className="text-zinc-600">-</span>
                <Input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-36 h-10 bg-black/40 border-white/10 text-zinc-300"
                />
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              className="h-10 border-white/10 bg-black/40 hover:bg-zinc-900/60 text-zinc-300"
              onClick={handleExportAnalytics}
            >
              <DownloadSimple size={16} className="mr-2" />
              Esporta Report
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-zinc-900/50 border border-white/10 mb-8 p-1 rounded-xl flex-wrap">
            <TabsTrigger value="overview" className="rounded-lg data-[state=active]:bg-amber-500 data-[state=active]:text-black transition-all font-bold">Panoramica & Magazzino</TabsTrigger>
            <TabsTrigger value="waiters" className="rounded-lg data-[state=active]:bg-amber-500 data-[state=active]:text-black transition-all font-bold">Performance Camerieri</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-8 focus:outline-none">
            {/* Summary Cards - Enhanced Vibrant Design */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border-zinc-800/60 bg-gradient-to-br from-zinc-900/90 to-zinc-950/90 shadow-lg relative overflow-hidden group hover:border-amber-500/30 transition-all duration-300">
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 blur-2xl rounded-full -mr-10 -mt-10 pointer-events-none group-hover:bg-amber-500/10 transition-all"></div>
                <CardContent className="p-5 relative z-10">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-zinc-800/50 rounded-xl border border-zinc-700/50 text-zinc-400 group-hover:text-amber-500 group-hover:border-amber-500/30 transition-colors">
                      <ShoppingBag size={22} weight="duotone" />
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Ordini</p>
                      <p className="text-2xl font-bold text-white tracking-tight">{analytics.totalOrders}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-zinc-800/60 bg-gradient-to-br from-zinc-900/90 to-zinc-950/90 shadow-lg relative overflow-hidden group hover:border-amber-500/30 transition-all duration-300">
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 blur-2xl rounded-full -mr-10 -mt-10 pointer-events-none group-hover:bg-amber-500/10 transition-all"></div>
                <CardContent className="p-5 relative z-10">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-zinc-800/50 rounded-xl border border-zinc-700/50 text-amber-500 group-hover:text-amber-400 group-hover:border-amber-500/50 transition-colors shadow-[0_0_10px_-3px_rgba(245,158,11,0.1)]">
                      <CurrencyEur size={22} weight="duotone" />
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Ricavi</p>
                      <p className="text-2xl font-bold text-amber-400 tracking-tight">€{analytics.totalRevenue.toFixed(0)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-zinc-800/60 bg-gradient-to-br from-zinc-900/90 to-zinc-950/90 shadow-lg relative overflow-hidden group hover:border-amber-500/30 transition-all duration-300">
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 blur-2xl rounded-full -mr-10 -mt-10 pointer-events-none group-hover:bg-amber-500/10 transition-all"></div>
                <CardContent className="p-5 relative z-10">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-zinc-800/50 rounded-xl border border-zinc-700/50 text-zinc-400 group-hover:text-amber-500 transition-colors">
                      <TrendUp size={22} weight="duotone" />
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Scontrino Medio</p>
                      <p className="text-2xl font-bold text-white tracking-tight">€{analytics.averageOrderValue.toFixed(2)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-zinc-800/60 bg-gradient-to-br from-zinc-900/90 to-zinc-950/90 shadow-lg relative overflow-hidden group hover:border-amber-500/30 transition-all duration-300">
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 blur-2xl rounded-full -mr-10 -mt-10 pointer-events-none group-hover:bg-amber-500/10 transition-all"></div>
                <CardContent className="p-5 relative z-10">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-xl border transition-colors ${inventoryData.trendAlerts?.[0]?.change > 0 ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-400' : inventoryData.trendAlerts?.[0]?.change < 0 ? 'bg-red-950/30 border-red-500/30 text-red-400' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400'}`}>
                      {inventoryData.trendAlerts?.[0]?.change > 0 ? (
                        <TrendUp size={22} weight="duotone" />
                      ) : inventoryData.trendAlerts?.[0]?.change < 0 ? (
                        <TrendDown size={22} weight="duotone" />
                      ) : (
                        <Minus size={22} weight="bold" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Top Trend</p>
                      {inventoryData.trendAlerts && inventoryData.trendAlerts.length > 0 ? (
                        <div className="flex flex-col">
                          <p className="text-sm font-bold text-white truncate">{inventoryData.trendAlerts[0].name}</p>
                          <span className={`text-xs font-bold ${inventoryData.trendAlerts[0].change > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {inventoryData.trendAlerts[0].change > 0 ? '+' : ''}{inventoryData.trendAlerts[0].change}%
                          </span>
                        </div>
                      ) : (
                        <p className="text-lg font-bold text-zinc-600 mt-0.5">-</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Time Series Chart */}
              <Card className="border-zinc-800/50 bg-zinc-900/40 shadow-xl overflow-hidden backdrop-blur-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6 border-b border-white/5">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-zinc-100">
                    <div className="w-1 h-5 bg-amber-500 rounded-full"></div>
                    Andamento nel Tempo
                  </CardTitle>
                  <Select value={timeSeriesMetric} onValueChange={(v: any) => setTimeSeriesMetric(v)}>
                    <SelectTrigger className="w-36 h-8 text-xs border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:border-amber-500/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-300">
                      <SelectItem value="orders">Num. Ordini</SelectItem>
                      <SelectItem value="revenue">Ricavi (€)</SelectItem>
                      <SelectItem value="average">Scontrino Medio</SelectItem>
                    </SelectContent>
                  </Select>
                </CardHeader>
                <CardContent className="pt-6 pl-0">
                  <ResponsiveContainer width="100%" height={300}>
                    {analytics.isSingleDay ? (
                      <BarChart data={analytics.dailyData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                        <XAxis
                          dataKey="date"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11, fill: '#71717a' }}
                          dy={10}
                          interval={analytics.dailyData.length > 14 ? Math.ceil(analytics.dailyData.length / 10) - 1 : 0}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 12, fill: '#71717a' }}
                          tickFormatter={(value) => timeSeriesMetric === 'orders' ? value : `€${value}`}
                          dx={-10}
                        />
                        <Tooltip
                          cursor={{ fill: 'rgba(245, 158, 11, 0.05)' }}
                          contentStyle={{ backgroundColor: '#09090b', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}
                          itemStyle={{ color: '#fbbf24', fontWeight: 'bold' }}
                          labelStyle={{ color: '#a1a1aa', marginBottom: '8px' }}
                          formatter={(value: number) => [
                            timeSeriesMetric === 'orders' ? value : `€${value.toFixed(2)}`,
                            timeSeriesMetric === 'orders' ? 'Ordini' : timeSeriesMetric === 'revenue' ? 'Ricavi' : 'Valore Medio'
                          ]}
                        />
                        <Bar
                          dataKey={timeSeriesMetric === 'orders' ? 'orders' : timeSeriesMetric === 'revenue' ? 'revenue' : 'averageValue'}
                          fill="#f59e0b"
                          radius={[6, 6, 0, 0]}
                          barSize={60}
                        />
                      </BarChart>
                    ) : (
                      <AreaChart data={analytics.dailyData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                        <XAxis
                          dataKey="date"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11, fill: '#71717a' }}
                          dy={10}
                          interval={analytics.dailyData.length > 14 ? Math.ceil(analytics.dailyData.length / 10) - 1 : 0}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 12, fill: '#71717a' }}
                          tickFormatter={(value) => timeSeriesMetric === 'orders' ? value : `€${value}`}
                          dx={-10}
                        />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#09090b', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}
                          itemStyle={{ color: '#fbbf24', fontWeight: 'bold' }}
                          labelStyle={{ color: '#a1a1aa', marginBottom: '8px' }}
                          formatter={(value: number) => [
                            timeSeriesMetric === 'orders' ? value : `€${value.toFixed(2)}`,
                            timeSeriesMetric === 'orders' ? 'Ordini' : timeSeriesMetric === 'revenue' ? 'Ricavi' : 'Valore Medio'
                          ]}
                        />
                        <Area
                          type="monotone"
                          dataKey={timeSeriesMetric === 'orders' ? 'orders' : timeSeriesMetric === 'revenue' ? 'revenue' : 'averageValue'}
                          stroke="#fbbf24"
                          strokeWidth={3}
                          fillOpacity={1}
                          fill="url(#colorMetric)"
                          activeDot={{ r: 6, strokeWidth: 0, fill: '#fff' }}
                        />
                      </AreaChart>
                    )}
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Category Chart */}
              <Card className="border-zinc-800/50 bg-zinc-900/40 shadow-xl overflow-hidden backdrop-blur-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6 border-b border-white/5">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-zinc-100">
                    <div className="w-1 h-5 bg-amber-500 rounded-full"></div>
                    Performance Categorie
                  </CardTitle>
                  <Select value={categoryMetric} onValueChange={(v: any) => setCategoryMetric(v)}>
                    <SelectTrigger className="w-36 h-8 text-xs border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:border-amber-500/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-300">
                      <SelectItem value="revenue">Per Ricavi (€)</SelectItem>
                      <SelectItem value="quantity">Per Quantità</SelectItem>
                    </SelectContent>
                  </Select>
                </CardHeader>
                <CardContent className="pt-6">
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart
                      data={analytics.categoryStats}
                      layout="vertical"
                      margin={{ top: 0, right: 30, left: 40, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
                      <XAxis type="number" hide />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={100}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 13, fill: '#a1a1aa', fontWeight: 500 }}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                        contentStyle={{ backgroundColor: '#09090b', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}
                        itemStyle={{ color: '#fbbf24', fontWeight: 'bold' }}
                        labelStyle={{ color: '#fff', fontWeight: 'bold', marginBottom: '5px' }}
                        formatter={(value: number) => [
                          categoryMetric === 'revenue' ? `€${value.toFixed(2)}` : value,
                          categoryMetric === 'revenue' ? 'Ricavi' : 'Quantità'
                        ]}
                      />
                      <Bar
                        dataKey={categoryMetric}
                        fill="#fbbf24"
                        radius={[0, 4, 4, 0]}
                        barSize={24}
                        background={{ fill: 'rgba(255,255,255,0.02)' }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* REDESIGNED INVENTORY SECTION */}
            <Card className="shadow-2xl border-none overflow-hidden bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 ring-1 ring-white/5">
              <CardHeader className="border-b border-white/5 pb-4 bg-black/20">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-amber-500/10 rounded-2xl border border-amber-500/20 shadow-inner">
                      <Package size={24} className="text-amber-500" weight="duotone" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-bold text-white tracking-tight">
                        Analisi Magazzino
                      </CardTitle>
                      <p className="text-sm text-zinc-400 mt-1">
                        Confronto vendite vs periodo precedente (2 anni)
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {/* Category Filter */}
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-9 border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-all">
                          <List size={16} className="mr-2 opacity-70" />
                          Categorie
                          {inventoryCategories.length > 0 && inventoryCategories.length < categories.length && (
                            <Badge variant="secondary" className="ml-2 h-5 bg-amber-500/10 text-amber-500 border border-amber-500/20">
                              {inventoryCategories.length}
                            </Badge>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-3 bg-zinc-900 border-zinc-800" align="end">
                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/5">
                          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Filtra per categoria</span>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-zinc-500 hover:text-white" onClick={() => setInventoryCategories(categories.map(c => c.id))}>Tutte</Button>
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-zinc-500 hover:text-white" onClick={() => setInventoryCategories([])}>Nessuna</Button>
                          </div>
                        </div>
                        <div className="space-y-1 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                          {categories.map(category => {
                            const checked = inventoryCategories.includes(category.id)
                            return (
                              <div
                                key={category.id}
                                className={`flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg cursor-pointer transition-all ${checked ? 'bg-amber-500/10 text-amber-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
                                onClick={() => {
                                  if (checked) {
                                    setInventoryCategories(prev => prev.filter(id => id !== category.id))
                                  } else {
                                    setInventoryCategories(prev => Array.from(new Set([...prev, category.id])))
                                  }
                                }}
                              >
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${checked ? 'bg-amber-500 border-amber-500' : 'border-zinc-600'}`}>
                                  {checked && <Check size={10} className="text-black" weight="bold" />}
                                </div>
                                <span className="truncate flex-1">{category.name}</span>
                              </div>
                            )
                          })}
                        </div>
                      </PopoverContent>
                    </Popover>

                    {/* Sort Selector */}
                    <Select value={inventorySortBy} onValueChange={(v: any) => setInventorySortBy(v)}>
                      <SelectTrigger className="w-[160px] h-9 border-zinc-700 bg-zinc-800/50 text-zinc-300">
                        <span className="opacity-50 mr-2 text-xs uppercase">Ordina:</span>
                        <span>
                          {inventorySortBy === 'quantity' ? 'Piatti V.' :
                            inventorySortBy === 'revenue' ? 'Incassi' :
                              inventorySortBy === 'category' ? 'Categoria' : 'Prezzo'}
                        </span>
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-300">
                        <SelectItem value="quantity" className="focus:bg-zinc-800 focus:text-white">Piatti Venduti</SelectItem>
                        <SelectItem value="revenue" className="focus:bg-zinc-800 focus:text-white">Incassi Totali</SelectItem>
                        <SelectItem value="category" className="focus:bg-zinc-800 focus:text-white">Categoria</SelectItem>
                        <SelectItem value="price" className="focus:bg-zinc-800 focus:text-white">Prezzo Listino</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Comparison Toggle & Controls */}
                <div className="mt-4 pt-4 border-t border-white/5">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    {/* Toggle */}
                    <button
                      onClick={() => setMagCompareEnabled(!magCompareEnabled)}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        magCompareEnabled
                          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          : 'bg-zinc-800/50 text-zinc-500 border border-zinc-700/50 hover:text-zinc-300 hover:border-zinc-600'
                      }`}
                    >
                      <div className={`w-8 h-4.5 rounded-full relative transition-all ${magCompareEnabled ? 'bg-amber-500' : 'bg-zinc-700'}`}>
                        <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${magCompareEnabled ? 'left-[18px]' : 'left-0.5'}`}></div>
                      </div>
                      <ArrowsLeftRight size={14} weight="bold" />
                      Confronta periodo
                    </button>

                    {/* Comparison mode selector (visible only when enabled) */}
                    {magCompareEnabled && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Select value={magCompareMode} onValueChange={(v: any) => setMagCompareMode(v)}>
                          <SelectTrigger className="w-[200px] h-9 border-zinc-700 bg-zinc-800/50 text-zinc-300 text-sm">
                            <span className="opacity-50 mr-1.5 text-xs">vs</span>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-300">
                            <SelectItem value="prev_week" className="focus:bg-zinc-800 focus:text-white">Settimana precedente</SelectItem>
                            <SelectItem value="prev_month" className="focus:bg-zinc-800 focus:text-white">Mese precedente</SelectItem>
                            <SelectItem value="custom" className="focus:bg-zinc-800 focus:text-white">Periodo personalizzato</SelectItem>
                          </SelectContent>
                        </Select>

                        {magCompareMode === 'custom' && (
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="date"
                              value={magCompareCustomStart}
                              onChange={(e) => setMagCompareCustomStart(e.target.value)}
                              className="w-32 h-9 bg-zinc-800/50 border-zinc-700 text-zinc-300 text-sm"
                            />
                            <span className="text-zinc-600 text-xs">-</span>
                            <Input
                              type="date"
                              value={magCompareCustomEnd}
                              onChange={(e) => setMagCompareCustomEnd(e.target.value)}
                              className="w-32 h-9 bg-zinc-800/50 border-zinc-700 text-zinc-300 text-sm"
                            />
                          </div>
                        )}

                        {magCompareEnabled && inventoryData.compLabel && (
                          <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
                            ({inventoryData.compLabel})
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                {/* Quick Stats Bar */}
                <div className="grid grid-cols-4 gap-px bg-white/5 border-b border-white/5">
                  {(() => {
                    const portionsDelta = magCompareEnabled && inventoryData.compTotalPortions > 0
                      ? ((inventoryData.totalPortions - inventoryData.compTotalPortions) / inventoryData.compTotalPortions * 100)
                      : null
                    const revenueDelta = magCompareEnabled && inventoryData.compTotalRevenue > 0
                      ? ((inventoryData.currentTotalRevenue - inventoryData.compTotalRevenue) / inventoryData.compTotalRevenue * 100)
                      : null

                    const stats = [
                      {
                        label: "Porzioni Vendute",
                        value: inventoryData.totalPortions,
                        icon: <Package size={16} weight="fill" className="text-blue-400" />,
                        delta: portionsDelta
                      },
                      {
                        label: "Piatti Analizzati",
                        value: inventoryData.dishes.length,
                        icon: <List size={16} weight="bold" className="text-zinc-400" />,
                        delta: null
                      },
                      {
                        label: "Giorni Analizzati",
                        value: inventoryData.periodDays,
                        icon: <CalendarBlank size={16} weight="fill" className="text-zinc-400" />,
                        delta: null
                      },
                      {
                        label: magCompareEnabled ? "Incasso Periodo" : "Piatti Attivi",
                        value: magCompareEnabled
                          ? `€${Math.round(inventoryData.currentTotalRevenue)}`
                          : inventoryData.dishes.filter(d => d.periodQuantity > 0).length,
                        icon: magCompareEnabled
                          ? <CurrencyEur size={16} weight="fill" className="text-amber-400" />
                          : <Check size={16} weight="bold" className="text-emerald-400" />,
                        delta: revenueDelta
                      },
                    ]

                    return stats.map((stat, i) => (
                      <div key={i} className="p-4 flex flex-col items-center justify-center bg-zinc-900/50 hover:bg-zinc-900 transition-colors">
                        <div className="flex items-center gap-2 mb-1 opacity-70">
                          {stat.icon}
                          <span className="text-[10px] uppercase font-bold text-zinc-400">{stat.label}</span>
                        </div>
                        <span className="text-xl font-bold text-white">{stat.value}</span>
                        {stat.delta !== null && (
                          <span className={`text-[10px] font-bold mt-0.5 flex items-center gap-0.5 ${
                            stat.delta > 0 ? 'text-emerald-400' : stat.delta < 0 ? 'text-rose-400' : 'text-zinc-500'
                          }`}>
                            {stat.delta > 0 ? <ArrowUp size={10} weight="bold" /> : stat.delta < 0 ? <ArrowDown size={10} weight="bold" /> : null}
                            {stat.delta > 0 ? '+' : ''}{Math.round(stat.delta * 10) / 10}% vs periodo
                          </span>
                        )}
                      </div>
                    ))
                  })()}
                </div>

                {/* Table Header */}
                <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-zinc-950/30 border-b border-white/5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                  <div className="col-span-4 pl-2">Piatto / Categoria</div>
                  <div className="col-span-2 text-center">Prezzo</div>
                  <div className="col-span-2 text-center">Vendite Tot.</div>
                  <div className="col-span-2 text-center">Media / GG</div>
                  <div className="col-span-2 text-right pr-2">Trend (vs 2 Anni)</div>
                </div>

                {/* Scrollable List */}
                <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                  {inventoryData.dishes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                      <Package size={48} weight="duotone" className="mb-4 opacity-20" />
                      <p>Nessun dato disponibile</p>
                    </div>
                  ) : (
                    inventoryData.dishes.map((dish, i) => (
                      <div
                        key={dish.id}
                        className="grid grid-cols-12 gap-4 px-6 py-4 items-center border-b border-white/5 hover:bg-white/[0.02] transition-colors group"
                      >
                        {/* Dish Info */}
                        <div className="col-span-4 pl-2 min-w-0">
                          <p className="font-semibold text-zinc-200 group-hover:text-white transition-colors truncate">{dish.name}</p>
                          <Badge variant="outline" className="mt-1 text-[10px] h-5 px-1.5 border-zinc-800 text-zinc-500 bg-zinc-900/50">
                            {dish.category}
                          </Badge>
                        </div>

                        {/* Price */}
                        <div className="col-span-2 text-center">
                          <span className="text-sm text-zinc-400">€{dish.price.toFixed(2)}</span>
                        </div>

                        {/* Sales */}
                        <div className="col-span-2 text-center">
                          <span className={`text-sm font-bold ${dish.periodQuantity > 0 ? 'text-white' : 'text-zinc-600'}`}>
                            {dish.periodQuantity}
                          </span>
                        </div>

                        {/* Avg/Day */}
                        <div className="col-span-2 flex flex-col items-center justify-center">
                          <span className="text-sm font-semibold text-zinc-300">{dish.periodAvgPerDay}</span>
                          <span className="text-[10px] text-zinc-600">storico: {dish.allTimeAvgPerDay}</span>
                        </div>

                        {/* Trend */}
                        <div className="col-span-2 flex justify-end pr-2">
                          <div className={`
                          flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border
                          ${dish.percentageChange === 0 ? 'bg-zinc-900/50 text-zinc-500 border-zinc-800' : ''}
                          ${dish.percentageChange > 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : ''}
                          ${dish.percentageChange < 0 ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : ''}
                       `}>
                            {dish.percentageChange > 0 ? <TrendUp weight="bold" /> : dish.percentageChange < 0 ? <TrendDown weight="bold" /> : <Minus />}
                            {Math.abs(dish.percentageChange)}%
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="waiters" className="space-y-8 focus:outline-none">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Card className="border-zinc-800/60 bg-gradient-to-br from-zinc-900/90 to-zinc-950/90 shadow-lg relative overflow-hidden group hover:border-amber-500/30 transition-all duration-300">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 blur-2xl rounded-full -mr-10 -mt-10 pointer-events-none"></div>
                <CardContent className="p-5 relative z-10">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-zinc-800/50 rounded-xl border border-zinc-700/50 text-emerald-500">
                      <Users size={22} weight="duotone" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Camerieri Attivi</p>
                      <p className="text-2xl font-black text-white tabular-nums mt-0.5">{waiterStats.totalActiveWaiters}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-zinc-800/60 bg-gradient-to-br from-zinc-900/90 to-zinc-950/90 shadow-lg relative overflow-hidden group hover:border-amber-500/30 transition-all duration-300">
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 blur-2xl rounded-full -mr-10 -mt-10 pointer-events-none"></div>
                <CardContent className="p-5 relative z-10">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-zinc-800/50 rounded-xl border border-zinc-700/50 text-amber-500">
                      <ShoppingBag size={22} weight="duotone" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Ordini/Cameriere/Ora</p>
                      <p className="text-2xl font-black text-white tabular-nums mt-0.5">{waiterStats.avgOrdersPerWaiterHour}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-zinc-800/60 bg-gradient-to-br from-zinc-900/90 to-zinc-950/90 shadow-lg relative overflow-hidden group hover:border-amber-500/30 transition-all duration-300 col-span-2 md:col-span-1">
                <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/5 blur-2xl rounded-full -mr-10 -mt-10 pointer-events-none"></div>
                <CardContent className="p-5 relative z-10">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-zinc-800/50 rounded-xl border border-zinc-700/50 text-violet-500">
                      <Clock size={22} weight="duotone" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Tempo Medio Attesa</p>
                      <p className="text-2xl font-black text-white tabular-nums mt-0.5">{waiterStats.avgWaitMinutes} <span className="text-sm text-zinc-500 font-medium">min</span></p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Combined Chart with Filter */}
            <Card className="border-zinc-800/50 bg-zinc-900/40 shadow-xl overflow-hidden backdrop-blur-sm">
              <CardHeader className="border-b border-white/5 pb-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                    <ChartLine size={20} className="text-amber-500" /> Andamento Camerieri
                  </CardTitle>
                  <div className="flex gap-1.5">
                    {([
                      { key: 'waiters' as const, label: 'Camerieri Attivi', color: 'emerald' },
                      { key: 'ordersPerHour' as const, label: 'Ordini/Cam/Ora', color: 'amber' },
                      { key: 'avgWait' as const, label: 'Tempo Attesa', color: 'violet' }
                    ]).map(opt => (
                      <button
                        key={opt.key}
                        onClick={() => setWaiterChartMetric(opt.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${waiterChartMetric === opt.key
                          ? `bg-${opt.color}-500/20 text-${opt.color}-400 border border-${opt.color}-500/30`
                          : 'bg-zinc-800/50 text-zinc-500 border border-zinc-700/50 hover:text-zinc-300'
                        }`}
                        style={waiterChartMetric === opt.key ? {
                          backgroundColor: opt.color === 'emerald' ? 'rgba(16,185,129,0.2)' : opt.color === 'amber' ? 'rgba(245,158,11,0.2)' : 'rgba(139,92,246,0.2)',
                          color: opt.color === 'emerald' ? '#34d399' : opt.color === 'amber' ? '#fbbf24' : '#a78bfa',
                          borderColor: opt.color === 'emerald' ? 'rgba(16,185,129,0.3)' : opt.color === 'amber' ? 'rgba(245,158,11,0.3)' : 'rgba(139,92,246,0.3)'
                        } : {}}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={waiterStats.dailyMetrics} margin={{ top: 10, right: 30, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={waiterChartMetric === 'waiters' ? '#10b981' : waiterChartMetric === 'ordersPerHour' ? '#f59e0b' : '#8b5cf6'} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={waiterChartMetric === 'waiters' ? '#10b981' : waiterChartMetric === 'ordersPerHour' ? '#f59e0b' : '#8b5cf6'} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#71717a' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#71717a' }} dx={-10} allowDecimals={waiterChartMetric !== 'waiters'} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#09090b', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}
                      itemStyle={{ color: waiterChartMetric === 'waiters' ? '#10b981' : waiterChartMetric === 'ordersPerHour' ? '#f59e0b' : '#8b5cf6', fontWeight: 'bold' }}
                      labelStyle={{ color: '#a1a1aa', marginBottom: '8px' }}
                      formatter={(value: number) => waiterChartMetric === 'avgWait' ? `${value} min` : value}
                    />
                    <Area
                      type="monotone"
                      dataKey={waiterChartMetric}
                      name={waiterChartMetric === 'waiters' ? 'Camerieri Attivi' : waiterChartMetric === 'ordersPerHour' ? 'Ordini/Cam/Ora' : 'Tempo Attesa (min)'}
                      stroke={waiterChartMetric === 'waiters' ? '#10b981' : waiterChartMetric === 'ordersPerHour' ? '#f59e0b' : '#8b5cf6'}
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#colorMetric)"
                      activeDot={{ r: 6, strokeWidth: 0, fill: '#fff' }}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Waiter Performance Table */}
            <Card className="border-zinc-800/50 bg-zinc-900/40 shadow-xl overflow-hidden backdrop-blur-sm">
              <CardHeader className="border-b border-white/5 pb-4">
                <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                  <Users size={20} className="text-amber-500" /> Performance Camerieri
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 px-0">
                {waiterStats.waiterTable.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-zinc-600 text-sm">
                    <Users size={32} className="mb-2 opacity-20" />
                    <p>Nessuna attività camerieri nel periodo</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/5">
                          <th className="text-left px-6 py-3 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Cameriere</th>
                          <th className="text-center px-4 py-3 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Piatti Serviti</th>
                          <th className="text-center px-4 py-3 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Tavoli Assistiti</th>
                          <th className="text-center px-4 py-3 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Attività/Ora</th>
                          <th className="text-center px-4 py-3 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Ore Attive</th>
                        </tr>
                      </thead>
                      <tbody>
                        {waiterStats.waiterTable.map((w, i) => (
                          <tr key={w.id} className={`border-b border-white/5 transition-colors hover:bg-white/5 ${i === 0 ? 'bg-amber-500/5' : ''}`}>
                            <td className="px-6 py-3.5 font-medium text-zinc-200 flex items-center gap-2">
                              {i === 0 && <Star size={14} weight="fill" className="text-amber-500" />}
                              {w.name}
                            </td>
                            <td className="text-center px-4 py-3.5 tabular-nums font-bold text-amber-500">{w.dishesDelivered}</td>
                            <td className="text-center px-4 py-3.5 tabular-nums font-bold text-violet-400">{w.bellsResolved}</td>
                            <td className="text-center px-4 py-3.5 tabular-nums font-bold text-emerald-400">{w.activitiesPerHour}</td>
                            <td className="text-center px-4 py-3.5 tabular-nums text-zinc-400">{w.activeHours}h</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* 
        ========================================================================== 
        HIDDEN PRINT TEMPLATE FOR ANALYTICS STYLING 
        (Optimized for A4 PDF rendering with html2canvas)
        ========================================================================== 
      */}
      <div
        id="analytics-pdf-export-view"
        style={{
          position: 'fixed',
          top: '-9999px',
          left: '-9999px',
          width: '1100px', // Fixed width for high quality A4
          minHeight: '100vh',
          backgroundColor: '#f4f4f5', // Grigio Chiaro Sfondo
          color: '#18181b', // Testo Scuro
          fontFamily: 'Segoe UI, system-ui, sans-serif',
          padding: '60px',
          boxSizing: 'border-box',
          display: 'block', // Visible for html2canvas
          pointerEvents: 'none'
        }}
      >
        {/* PDF Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '40px', borderBottom: '2px solid #e4e4e7', paddingBottom: '20px' }}>
          <div>
            <h1 style={{ fontSize: '36px', fontWeight: '800', color: '#18181b', margin: 0, letterSpacing: '-0.02em' }}>
              Report Analitico
            </h1>
            <p style={{ fontSize: '16px', color: '#71717a', marginTop: '8px', fontWeight: 500 }}>
              {restaurantName}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '14px', color: '#71717a', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Periodo di Analisi</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#f59e0b' }}>
              {new Date(start).toLocaleDateString('it-IT')} — {new Date(end).toLocaleDateString('it-IT')}
            </div>
            <div style={{ fontSize: '12px', color: '#a1a1aa', marginTop: '4px' }}>Generato il {new Date().toLocaleDateString('it-IT')} alle {new Date().toLocaleTimeString('it-IT')}</div>
          </div>
        </div>

        {/* Summary Metric Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '40px' }}>
          {/* Orders */}
          <div style={{ background: '#ffffff', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', border: '1px solid #e4e4e7' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Totale Ordini</div>
            <div style={{ fontSize: '32px', fontWeight: 800, color: '#18181b' }}>{analytics.totalOrders}</div>
          </div>
          {/* Revenue */}
          <div style={{ background: '#ffffff', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', border: '1px solid #e4e4e7' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Ricavi Totali</div>
            <div style={{ fontSize: '32px', fontWeight: 800, color: '#f59e0b' }}>€{analytics.totalRevenue.toFixed(2)}</div>
          </div>
          {/* Avg Value */}
          <div style={{ background: '#ffffff', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', border: '1px solid #e4e4e7' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Scontrino Medio</div>
            <div style={{ fontSize: '32px', fontWeight: 800, color: '#18181b' }}>€{analytics.averageOrderValue.toFixed(2)}</div>
          </div>
          {/* Trend */}
          <div style={{ background: '#ffffff', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', border: '1px solid #e4e4e7' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Miglior Trend</div>
            {(inventoryData.trendAlerts && inventoryData.trendAlerts.length > 0) ? (
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#18181b', wordWrap: 'break-word', lineHeight: '1.3' }}>{inventoryData.trendAlerts[0].name}</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: inventoryData.trendAlerts[0].change > 0 ? '#10b981' : '#ef4444', marginTop: '4px' }}>
                  {inventoryData.trendAlerts[0].change > 0 ? '+' : ''}{inventoryData.trendAlerts[0].change}%
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#d4d4d8' }}>-</div>
            )}
          </div>
        </div>

        {/* Section: Time Series Data (Table format for PDF) */}
        <div style={{ marginBottom: '40px', background: '#ffffff', borderRadius: '20px', padding: '30px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', border: '1px solid #e4e4e7' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#18181b', marginBottom: '20px', borderBottom: '1px solid #f4f4f5', paddingBottom: '15px' }}>Andamento nel Tempo</h3>

          {/* Chart for PDF */}
          <div style={{ width: '100%', height: '300px', marginBottom: '20px' }}>
            <ResponsiveContainer width="100%" height="100%">
              {analytics.isSingleDay ? (
                <BarChart data={analytics.dailyData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#71717a' }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#71717a' }}
                    tickFormatter={(value) => timeSeriesMetric === 'orders' ? value : `€${value}`}
                    dx={-10}
                  />
                  <Bar
                    dataKey={timeSeriesMetric === 'orders' ? 'orders' : timeSeriesMetric === 'revenue' ? 'revenue' : 'averageValue'}
                    fill="#f59e0b"
                    radius={[6, 6, 0, 0]}
                    barSize={60}
                  />
                </BarChart>
              ) : (
                <AreaChart data={analytics.dailyData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorMetricPdf" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#71717a' }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#71717a' }}
                    tickFormatter={(value) => timeSeriesMetric === 'orders' ? value : `€${value}`}
                    dx={-10}
                  />
                  <Area
                    type="monotone"
                    dataKey={timeSeriesMetric === 'orders' ? 'orders' : timeSeriesMetric === 'revenue' ? 'revenue' : 'averageValue'}
                    stroke="#fbbf24"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorMetricPdf)"
                    activeDot={{ r: 6, strokeWidth: 0, fill: '#fff' }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                <th style={{ padding: '10px 0', fontSize: '12px', color: '#71717a', textTransform: 'uppercase' }}>Data</th>
                <th style={{ padding: '10px 0', fontSize: '12px', color: '#71717a', textTransform: 'uppercase', textAlign: 'right' }}>Ordini</th>
                <th style={{ padding: '10px 0', fontSize: '12px', color: '#71717a', textTransform: 'uppercase', textAlign: 'right' }}>Ricavi</th>
                <th style={{ padding: '10px 0', fontSize: '12px', color: '#71717a', textTransform: 'uppercase', textAlign: 'right' }}>Scontrino Medio</th>
              </tr>
            </thead>
            <tbody>
              {analytics.dailyData.slice(0, 14).map((day: any, idx: number) => (
                <tr key={idx} style={{ borderBottom: '1px solid #f4f4f5' }}>
                  <td style={{ padding: '10px 0', fontWeight: 600, color: '#18181b' }}>{day.date}</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', color: '#52525b' }}>{day.orders}</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 600, color: '#f59e0b' }}>€{day.revenue.toFixed(2)}</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', color: '#52525b' }}>€{day.averageValue.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {analytics.dailyData.length > 14 && (
            <div style={{ textAlign: 'center', marginTop: '15px', color: '#71717a', fontSize: '12px', fontStyle: 'italic' }}>
              ... e altri {analytics.dailyData.length - 14} giorni
            </div>
          )}
        </div>

        {/* Section: Category Performance (Visual Table) */}
        <div style={{ marginBottom: '40px', background: '#ffffff', borderRadius: '20px', padding: '30px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', border: '1px solid #e4e4e7' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#18181b', marginBottom: '20px', borderBottom: '1px solid #f4f4f5', paddingBottom: '15px' }}>Performance Categorie</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                <th style={{ padding: '10px 0', fontSize: '12px', color: '#71717a', textTransform: 'uppercase' }}>Categoria</th>
                <th style={{ padding: '10px 0', fontSize: '12px', color: '#71717a', textTransform: 'uppercase', width: '40%' }}>Volume Vendite</th>
                <th style={{ padding: '10px 0', fontSize: '12px', color: '#71717a', textTransform: 'uppercase', textAlign: 'right' }}>Quantità</th>
                <th style={{ padding: '10px 0', fontSize: '12px', color: '#71717a', textTransform: 'uppercase', textAlign: 'right' }}>Ricavi</th>
              </tr>
            </thead>
            <tbody>
              {analytics.categoryStats.map((cat, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #f4f4f5' }}>
                  <td style={{ padding: '12px 0', fontWeight: 600, color: '#18181b' }}>{cat.name}</td>
                  <td style={{ padding: '12px 0' }}>
                    <div style={{ height: '8px', width: '100%', background: '#f4f4f5', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(cat.percentage, 100)}%`, background: '#f59e0b', borderRadius: '4px' }}></div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 600, color: '#52525b' }}>{cat.quantity}</td>
                  <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 700, color: '#18181b' }}>€{cat.revenue.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Section: Inventory Analysis (Data Table) */}
        <div style={{ background: '#ffffff', borderRadius: '20px', padding: '30px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', border: '1px solid #e4e4e7', pageBreakInside: 'avoid' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#18181b', marginBottom: '20px', borderBottom: '1px solid #f4f4f5', paddingBottom: '15px' }}>Dettaglio Magazzino & Vendite</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #e4e4e7' }}>
                <th style={{ padding: '12px', color: '#52525b', fontWeight: 700 }}>Prodotto</th>
                <th style={{ padding: '12px', color: '#52525b', fontWeight: 700 }}>Categoria</th>
                <th style={{ padding: '12px', color: '#52525b', fontWeight: 700, textAlign: 'center' }}>Venduti (Periodo)</th>
                <th style={{ padding: '12px', color: '#52525b', fontWeight: 700, textAlign: 'center' }}>Media/Giorno</th>
                <th style={{ padding: '12px', color: '#52525b', fontWeight: 700, textAlign: 'center' }}>Trend Storico</th>
                <th style={{ padding: '12px', color: '#52525b', fontWeight: 700, textAlign: 'right' }}>Ricavo Tot.</th>
              </tr>
            </thead>
            <tbody>
              {inventoryData.dishes.slice(0, 30).map((dish, idx) => ( // Limit to top 30 to fit one page nicely, or handle pagination
                <tr key={dish.id} style={{ borderBottom: '1px solid #f4f4f5', background: idx % 2 === 0 ? 'transparent' : '#fafafa' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: '#18181b' }}>{dish.name}</td>
                  <td style={{ padding: '10px 12px', color: '#71717a' }}>{dish.category}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#18181b' }}>{dish.periodQuantity}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', color: '#52525b' }}>{dish.periodAvgPerDay}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 700,
                      background: dish.percentageChange > 0 ? '#ecfdf5' : dish.percentageChange < 0 ? '#fef2f2' : '#f4f4f5',
                      color: dish.percentageChange > 0 ? '#059669' : dish.percentageChange < 0 ? '#dc2626' : '#71717a'
                    }}>
                      {dish.percentageChange > 0 ? '+' : ''}{dish.percentageChange}%
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#f59e0b' }}>
                    €{(dish.periodQuantity * dish.price).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {inventoryData.dishes.length > 30 && (
            <div style={{ textAlign: 'center', marginTop: '15px', color: '#71717a', fontSize: '12px', fontStyle: 'italic' }}>
              ... e altri {inventoryData.dishes.length - 30} articoli (lista completa consultabile in dashboard)
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ marginTop: '40px', textAlign: 'center', color: '#a1a1aa', fontSize: '12px', borderTop: '1px solid #e4e4e7', paddingTop: '20px' }}>
          Documento generato automaticamente da Minthi
        </div>
      </div>
    </>
  )
}