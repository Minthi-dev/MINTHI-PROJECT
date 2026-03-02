import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { toast } from 'sonner'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Switch } from './ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Checkbox } from './ui/checkbox'
import { RadioGroup, RadioGroupItem } from './ui/radio-group'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, VisuallyHidden } from './ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Badge } from './ui/badge'
import { Separator } from './ui/separator'
import { ScrollArea } from './ui/scroll-area'
import { Textarea } from './ui/textarea'
import { DishPlaceholder } from './ui/DishPlaceholder'
import { hashPassword } from '../utils/passwordUtils'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { DropdownMenu, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu'
import {
  SignOut,

  BookBookmark,
  ChartLine,
  Gear,
  Plus,
  Trash,
  PencilSimple,
  X,
  CaretRight,
  List,
  CheckCircle,
  Warning,
  Eye,
  EyeSlash,
  MagnifyingGlass,
  Funnel,
  SortAscending,
  SortDescending,
  DownloadSimple,
  QrCode,
  ForkKnife,
  WarningCircle,
  Clock,
  MapPin,
  BookOpen,
  Calendar,
  ChartBar,
  Check,
  Minus,
  ClockCounterClockwise,
  Users,
  Receipt,
  Sparkle,
  DotsSixVertical,
  Tag
} from '@phosphor-icons/react'
import { ChefHat, SlidersHorizontal } from 'lucide-react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { generatePdfFromElement } from '../utils/pdfUtils'
import { useRestaurantActions } from '../hooks/useRestaurantLogic'
import { DatabaseService } from '../services/DatabaseService'
import { useSupabaseData } from '../hooks/useSupabaseData'
import { getCurrentCopertoPrice, getCurrentAyceSettings } from '../utils/pricingUtils'
import { KitchenView } from './KitchenView'
import TableBillDialog from './TableBillDialog'
import { SettingsView } from './SettingsView'
import ReservationsManager from './ReservationsManager'
import AnalyticsCharts from './AnalyticsCharts'
import CustomMenusManager from './CustomMenusManager'
import QRCodeGenerator from './QRCodeGenerator'
import type { Table, Order, Dish, Category, TableSession, Booking, Restaurant, Room } from '../services/types'
import { soundManager, type SoundType } from '../utils/SoundManager'
import { ModeToggle } from './ModeToggle'
import { motion, AnimatePresence } from 'framer-motion'


interface RestaurantDashboardProps {
  user: any
  onLogout: () => void
}

// Helper function to fix oklch colors that html2canvas doesn't support

const RestaurantDashboard = ({ user, onLogout }: RestaurantDashboardProps) => {
  const navigate = useNavigate()
  // Check both root level (from our custom login) and metadata (from Supabase Auth if used directly)
  const restaurantId = user?.restaurant_id || user?.user_metadata?.restaurant_id
  const [activeSection, setActiveSection] = useState('orders')
  const [pendingAutoOrderTableId, setPendingAutoOrderTableId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('orders')
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true) // Collapsible sidebar state
  const [tableSearchTerm, setTableSearchTerm] = useState('')

  // Schedule Settings State
  const [lunchTimeStart, setLunchTimeStart] = useState('12:00')
  const [dinnerTimeStart, setDinnerTimeStart] = useState('19:00')

  // Orders state initialized with explicit type to prevent 'never' inference
  const [orders, setOrders] = useState<Order[]>([])
  const [pastOrders, setPastOrders] = useState<Order[]>([])

  // Export Menu State
  const [showExportMenuDialog, setShowExportMenuDialog] = useState(false)
  const [exportMode, setExportMode] = useState<'full' | 'custom'>('full')
  const [exportSelectedCategories, setExportSelectedCategories] = useState<string[]>([])
  const [availableCustomMenus, setAvailableCustomMenus] = useState<any[]>([])
  const [selectedCustomMenuId, setSelectedCustomMenuId] = useState<string>('')
  const [isExportingMenu, setIsExportingMenu] = useState(false)
  const [exportPreviewData, setExportPreviewData] = useState<{ title: string, subtitle?: string, sections: { id: string, title: string, dishes: Dish[] }[] } | null>(null)
  const [dishes, , refreshDishes, setDishes] = useSupabaseData<Dish>('dishes', [], { column: 'restaurant_id', value: restaurantId })
  const [tables, , refreshTables, setTables] = useSupabaseData<Table>('tables', [], { column: 'restaurant_id', value: restaurantId })
  const [categories, , refreshCategories, setCategories] = useSupabaseData<Category>('categories', [], { column: 'restaurant_id', value: restaurantId })
  const [bookings, , refreshBookings] = useSupabaseData<Booking>('bookings', [], { column: 'restaurant_id', value: restaurantId })
  const [sessions, , refreshSessions] = useSupabaseData<TableSession>('table_sessions', [], { column: 'restaurant_id', value: restaurantId })
  const [rooms, , refreshRooms, setRooms] = useSupabaseData<Room>('rooms', [], { column: 'restaurant_id', value: restaurantId })

  // Initialize selected categories when available
  const categoriesInitializedRef = useRef(false)

  // Initialize selected categories when available (RUN ONCE)
  useEffect(() => {
    if (categories && categories.length > 0 && !categoriesInitializedRef.current) {
      setExportSelectedCategories(categories.map(c => c.id))
      categoriesInitializedRef.current = true
    }
  }, [categories])

  // Fetch custom menus when dialog opens
  useEffect(() => {
    if (showExportMenuDialog && restaurantId) {
      DatabaseService.getAllCustomMenus(restaurantId)
        .then(menus => setAvailableCustomMenus(menus || []))
        .catch(console.error)
    }
  }, [showExportMenuDialog, restaurantId])

  const [restaurants, , refreshRestaurants] = useSupabaseData<Restaurant>('restaurants', [], { column: 'id', value: restaurantId })
  const currentRestaurant = restaurants?.[0]
  const restaurantSlug = currentRestaurant?.name?.toLowerCase().replace(/\s+/g, '_') || ''

  // Aliases for compatibility and lint fixes
  const restaurantCategories = categories || []
  const restaurantDishes = dishes || []
  const restaurantTables = tables || []
  const restaurantOrders = orders || []
  const restaurantCompletedOrders = useMemo(() => orders?.filter(o => o.status === 'completed') || [], [orders])

  // Mappa piatti per categoria — evita O(categories × dishes) per render
  const dishesByCategory = useMemo(() => {
    const map = new Map<string, Dish[]>()
    restaurantDishes.forEach(d => {
      const list = map.get(d.category_id) || []
      list.push(d)
      map.set(d.category_id, list)
    })
    return map
  }, [restaurantDishes])

  // Sound Settings State
  const [selectedReservationDate, setSelectedReservationDate] = useState(new Date())
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('soundEnabled') !== 'false'
  })
  const [selectedSound, setSelectedSound] = useState<SoundType>(() => {
    return (localStorage.getItem('selectedSound') as SoundType) || 'classic'
  })

  // Sound refs for stable subscription usage
  const soundEnabledRef = useRef(soundEnabled)
  const selectedSoundRef = useRef(selectedSound)
  const lastScheduledMenuRef = useRef<{ menuId: string | null, mealType: string | null, day: number | null }>({
    menuId: null,
    mealType: null,
    day: null
  })

  useEffect(() => {
    soundEnabledRef.current = soundEnabled
  }, [soundEnabled])

  useEffect(() => {
    selectedSoundRef.current = selectedSound
  }, [selectedSound])

  // Persist settings
  useEffect(() => {
    localStorage.setItem('soundEnabled', String(soundEnabled))
  }, [soundEnabled])

  useEffect(() => {
    localStorage.setItem('selectedSound', selectedSound)
  }, [selectedSound])

  // --- Scheduled Menu Automation ---
  useEffect(() => {
    if (!restaurantId) return

    const checkAndApplySchedules = async () => {
      try {
        const now = new Date()
        const dayOfWeek = now.getDay() // 0 = Sunday
        const currentTime = now.getHours() * 60 + now.getMinutes() // Minutes from midnight

        // Parse time strings (e.g., "12:00") to minutes
        const parseTime = (t: string) => {
          if (!t) return 0
          const [h, m] = t.split(':').map(Number)
          return h * 60 + m
        }

        const lunchStart = parseTime(lunchTimeStart)
        const dinnerStart = parseTime(dinnerTimeStart)

        // Improved Logic for "Restaurant Day" (Customer Issue: "wrong date")
        // If currentTime is before 06:00 AM, we consider it the "late night" of the previous day.
        // This ensures that a dinner service ending at 2 AM is still linked to Yesterday's menu.
        const LATE_NIGHT_CUTOFF = 6 * 60 // 06:00 AM

        let effectiveDay = dayOfWeek
        let checkTime = currentTime

        // If it's late night (e.g. 01:00 AM), treat it as previous day (e.g. 25:00)
        if (currentTime < LATE_NIGHT_CUTOFF) {
          effectiveDay = (dayOfWeek + 6) % 7 // Previous day
          checkTime = currentTime + (24 * 60) // Add 24h for easier comparison
        }

        // Determine current meal type based on effective ranges
        let currentMealType: string | null = null

        if (lunchStart > 0 && dinnerStart > 0) {
          // Both meals configured
          if (lunchStart < dinnerStart) {
            // Standard: Lunch 12:00, Dinner 19:00
            if (checkTime >= lunchStart && checkTime < dinnerStart) {
              currentMealType = 'lunch'
            } else if (checkTime >= dinnerStart) {
              currentMealType = 'dinner'
            }
          } else {
            // Rare: Dinner starts before Lunch? (Logic fallback)
            currentMealType = checkTime >= lunchStart ? 'lunch' : 'dinner'
          }
        } else if (lunchStart > 0) {
          // Only Lunch
          // Assume Lunch lasts until ~16:00 or just use start? 
          // Let's assume valid if > start and < late night cutoff of NEXT day?
          // Simplification: logic is "Active if > Start".
          if (checkTime >= lunchStart) currentMealType = 'lunch'
        } else if (dinnerStart > 0) {
          // Only Dinner
          if (checkTime >= dinnerStart) currentMealType = 'dinner'
        }

        // Special case: If we are in "late night" mode (e.g. 25:00), but the detected meal type is 'lunch' (unlikely)
        // or null, we might want to default to 'dinner' if it was valid.

        // Valid schedule day is the effective day
        const scheduleDay = effectiveDay
        const { data: allSchedules } = await supabase
          .from('custom_menu_schedules')
          .select('custom_menu_id, custom_menus!inner(restaurant_id)')
          .eq('is_active', true)
          .eq('day_of_week', scheduleDay)
          .eq('custom_menus.restaurant_id', restaurantId)

        if (!allSchedules || allSchedules.length === 0) {
          // No schedules found - reset to full menu if a scheduled menu was active
          if (lastScheduledMenuRef.current.menuId) {
            await supabase.rpc('reset_to_full_menu', { p_restaurant_id: restaurantId })
            lastScheduledMenuRef.current = { menuId: null, mealType: null, day: null }
          }
          return
        }

        // Get full schedule details
        const { data: schedules } = await supabase
          .from('custom_menu_schedules')
          .select('id, custom_menu_id, day_of_week, meal_type, start_time, end_time, is_active')
          .eq('is_active', true)
          .eq('day_of_week', scheduleDay)
          .in('custom_menu_id', allSchedules.map(s => s.custom_menu_id))

        if (!schedules || schedules.length === 0) {
          if (lastScheduledMenuRef.current.menuId) {
            await supabase.rpc('reset_to_full_menu', { p_restaurant_id: restaurantId })
            lastScheduledMenuRef.current = { menuId: null, mealType: null, day: null }
          }
          return
        }

        // Find matching schedule: prefer exact meal match, then 'all'
        const exactMatch = schedules.find(s => s.meal_type === currentMealType)
        const allMatch = schedules.find(s => s.meal_type === 'all')
        const match = exactMatch || allMatch

        if (!match) {
          // No matching schedule for current meal type

          // Check if there's a stale manual menu (> 24 hours)
          const { data: activeMenus } = await supabase
            .from('custom_menus')
            .select('updated_at')
            .eq('restaurant_id', restaurantId)
            .eq('is_active', true)

          if (activeMenus && activeMenus.length > 0) {
            const activeMenu = activeMenus[0]
            if (activeMenu.updated_at) {
              const lastUpdate = new Date(activeMenu.updated_at).getTime()
              const diffHours = (now.getTime() - lastUpdate) / (1000 * 60 * 60)

              if (diffHours >= 24) {
                console.log('Manual menu active for > 24h, resetting.')
                await supabase.rpc('reset_to_full_menu', { p_restaurant_id: restaurantId })
                lastScheduledMenuRef.current = { menuId: null, mealType: null, day: null }
                return
              }
            }
          }

          // EARLY SUPPRESSION CHECK:
          // If we manually deactivated a scheduled menu, suppression lasts until end of current meal service.
          const suppressionKey = 'minthi_menu_suppressed'
          const suppression = localStorage.getItem(suppressionKey)
          let isSuppressedForNow = false;
          if (suppression) {
            try {
              const sup = JSON.parse(suppression)
              const expiresAt = sup.expiresAt ? new Date(sup.expiresAt).getTime() : 0
              if (now.getTime() < expiresAt) {
                isSuppressedForNow = true;
              } else {
                localStorage.removeItem(suppressionKey)
              }
            } catch { localStorage.removeItem(suppressionKey) }
          }

          if (isSuppressedForNow) {
            // We have actively suppressed the custom menu until service ends.
            // DO NOT process any new schedule activations.
            if (lastScheduledMenuRef.current.menuId) {
              lastScheduledMenuRef.current = { menuId: null, mealType: null, day: null }
            }
            return // Skip applying any new schedule
          }

          if (lastScheduledMenuRef.current.menuId) {
            await supabase.rpc('reset_to_full_menu', { p_restaurant_id: restaurantId })
            lastScheduledMenuRef.current = { menuId: null, mealType: null, day: null }
          }
          return
        }

        // EARLY SUPPRESSION CHECK FOR MULTIPLE MENUS:
        const suppressionKey2 = 'minthi_menu_suppressed'
        const suppression2 = localStorage.getItem(suppressionKey2)
        if (suppression2) {
          try {
            const sup = JSON.parse(suppression2)
            const expiresAt = sup.expiresAt ? new Date(sup.expiresAt).getTime() : 0
            if (now.getTime() < expiresAt) {
              return
            } else {
              localStorage.removeItem(suppressionKey2)
            }
          } catch { localStorage.removeItem(suppressionKey2) }
        }

        if (
          lastScheduledMenuRef.current.menuId === match.custom_menu_id &&
          lastScheduledMenuRef.current.mealType === currentMealType &&
          lastScheduledMenuRef.current.day === scheduleDay
        ) {
          // Already applied, no change needed
          return
        }
        // Apply the scheduled menu
        const { error } = await supabase.rpc('apply_custom_menu', {
          p_restaurant_id: restaurantId,
          p_menu_id: match.custom_menu_id
        })

        if (!error) {
          lastScheduledMenuRef.current = {
            menuId: match.custom_menu_id,
            mealType: currentMealType,
            day: scheduleDay
          }
          console.log(`Applied scheduled menu: ${match.custom_menu_id} for ${currentMealType} on day ${scheduleDay}`)
        }
      } catch (err) {
        console.error("Error in menu scheduler:", err)
      }
    }

    const interval = setInterval(checkAndApplySchedules, 60 * 1000) // Every minute
    checkAndApplySchedules() // Run immediately

    return () => clearInterval(interval)
  }, [restaurantId, lunchTimeStart, dinnerTimeStart])

  // Export Menu Function
  // Export Menu Function
  // Execute Menu Export
  const executeExport = async () => {
    const toastId = toast.loading('Preparazione PDF...')

    try {
      let dataToExport: { title: string, subtitle?: string, sections: { id: string, title: string, dishes: Dish[] }[] }

      if (exportMode === 'full') {
        const selectedCats = categories.filter(c => exportSelectedCategories.includes(c.id))
        if (selectedCats.length === 0) {
          toast.error('Seleziona almeno una categoria')
          toast.dismiss(toastId)
          return
        }

        dataToExport = {
          title: restaurantName,
          subtitle: 'Menu alla Carta',
          sections: selectedCats.map(c => ({
            id: c.id,
            title: c.name,
            dishes: restaurantDishes.filter(d => d.category_id === c.id && d.is_active)
          })).filter(s => s.dishes.length > 0)
        }
      } else {
        if (!selectedCustomMenuId) {
          toast.error('Seleziona un menu personalizzato')
          toast.dismiss(toastId)
          return
        }

        const menuDetails = await DatabaseService.getCustomMenuWithDishes(selectedCustomMenuId)
        if (!menuDetails) {
          toast.error('Menu non trovato')
          toast.dismiss(toastId)
          return
        }

        dataToExport = {
          title: menuDetails.name,
          subtitle: 'Menu Speciale',
          sections: [{
            id: 'custom',
            title: '',
            dishes: menuDetails.dishes.map((d: any) => d.dish).filter((d: any) => !!d)
          }]
        }
      }

      setExportPreviewData(dataToExport)

      // Wait for render
      setTimeout(async () => {
        const element = document.getElementById('menu-print-view')
        if (!element) {
          toast.error('Errore generazione PDF')
          return
        }

        try {
          // Posiziona fuori schermo per evitare flash visibile
          element.style.display = 'block'
          element.style.left = '-9999px'
          element.style.visibility = 'hidden'
          await generatePdfFromElement('menu-print-view', {
            fileName: `Menu_${restaurantSlug}_${exportMode}_${new Date().toISOString().split('T')[0]}.pdf`,
            scale: 2,
            backgroundColor: '#ffffff',
            orientation: 'portrait',
            onClone: (doc) => {
              const el = doc.getElementById('menu-print-view')
              if (el) {
                el.style.backgroundColor = '#ffffff'
                el.style.padding = '20px'
              }
            }
          })
          toast.success('Menu scaricato con successo!')
          setShowExportMenuDialog(false)
        } catch (err) {
          console.error(err)
          toast.error('Errore creazione PDF')
        } finally {
          element.style.display = 'none'
          element.style.left = '0'
          element.style.visibility = 'visible'
          setExportPreviewData(null)
          toast.dismiss(toastId)
        }
      }, 500)

    } catch (error) {
      console.error(error)
      toast.error('Errore durante l\'export')
      toast.dismiss(toastId)
    }
  }

  // Fetch Orders with Relations
  const fetchOrders = async () => {
    if (!restaurantId) return
    try {
      const data = await DatabaseService.getOrders(restaurantId)
      setOrders(data)

      // Also fetch past orders for analytics
      const pastData = await DatabaseService.getPastOrders(restaurantId)
      setPastOrders(pastData)
    } catch (error) {
      console.error('Error fetching orders:', error)
    }
  }

  useEffect(() => {
    if (!restaurantId) return // Ensure restaurantId is present

    fetchOrders()

    // Debounced fetch to avoid rapid re-fetches and ensure items are committed
    let fetchTimeout: ReturnType<typeof setTimeout> | null = null
    const debouncedFetch = () => {
      if (fetchTimeout) clearTimeout(fetchTimeout)
      fetchTimeout = setTimeout(() => fetchOrders(), 500)
    }

    const channel = supabase
      .channel(`dashboard_orders_${restaurantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` }, (payload) => {
        debouncedFetch()
        // Play sound on new order using refs to avoid re-subscription
        if (payload.eventType === 'INSERT' && soundEnabledRef.current) {
          soundManager.play(selectedSoundRef.current)
          toast.info('Nuovo ordine ricevuto!', { icon: '🔔' })
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items', filter: `restaurant_id=eq.${restaurantId}` }, () => {
        // Also refresh when order items change (new items added, status updated, etc.)
        debouncedFetch()
      })
      .subscribe()

    return () => {
      if (fetchTimeout) clearTimeout(fetchTimeout)
      supabase.removeChannel(channel)
    }
  }, [restaurantId]) // Only re-subscribe if restaurantId changes



  const getTableIdFromOrder = (order: Order) => {
    const session = sessions?.find(s => s.id === order.table_session_id)
    return session?.table_id
  }

  const [newTableName, setNewTableName] = useState('')
  const [newTableSeats, setNewTableSeats] = useState<number | string>(4)
  const [editTableSeats, setEditTableSeats] = useState<number | string>(4)
  const [newDish, setNewDish] = useState<{
    name: string
    description: string
    price: string
    categoryId: string
    image: string
    is_ayce: boolean
    allergens?: string[]
    imageFile?: File
  }>({
    name: '',
    description: '',
    price: '',
    categoryId: '',
    image: '',
    is_ayce: false,
    allergens: [],
    imageFile: undefined
  })
  const [newCategory, setNewCategory] = useState('')
  const [showNewCategoryPopup, setShowNewCategoryPopup] = useState(false)
  const [draggedCategory, setDraggedCategory] = useState<Category | null>(null)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [editCategoryName, setEditCategoryName] = useState('')
  const [showCategoryDialog, setShowCategoryDialog] = useState(false)
  const [selectedTable, setSelectedTable] = useState<Table | null>(null)
  const [showTableDialog, setShowTableDialog] = useState(false)
  const [showCreateTableDialog, setShowCreateTableDialog] = useState(false)
  const [editingTable, setEditingTable] = useState<Table | null>(null)
  const [editTableName, setEditTableName] = useState('')
  // Duplicate editTableSeats removed in previous step (kept here as comment or cleaned up later)
  const [newTableRoomId, setNewTableRoomId] = useState<string>('all')
  const [editTableRoomId, setEditTableRoomId] = useState<string>('all')
  const [editTableIsActive, setEditTableIsActive] = useState<boolean>(true)

  // Room State
  const [selectedRoomFilter, setSelectedRoomFilter] = useState<string>('all')
  const [showRoomDialog, setShowRoomDialog] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const [editingRoom, setEditingRoom] = useState<Room | null>(null)
  const [showAddRoomDialog, setShowAddRoomDialog] = useState(false)
  const [newRoomSelectedTables, setNewRoomSelectedTables] = useState<string[]>([])
  const [editingDish, setEditingDish] = useState<Dish | null>(null)
  const [editDishData, setEditDishData] = useState<{
    name: string
    description: string
    price: string
    categoryId: string
    image: string
    is_ayce: boolean
    allergens?: string[]
    imageFile?: File
  }>({
    name: '',
    description: '',
    price: '',
    categoryId: '',
    image: '',
    is_ayce: false,
    allergens: [],
    imageFile: undefined
  })
  const [showQrDialog, setShowQrDialog] = useState(false)
  const [customerCount, setCustomerCount] = useState('')
  const [tableAyceOverride, setTableAyceOverride] = useState(true) // true = use restaurant setting, false = disabled for this table
  const [tableCopertoOverride, setTableCopertoOverride] = useState(true) // true = use restaurant setting, false = disabled for this table
  const [showOrderHistory, setShowOrderHistory] = useState(false)
  const [orderSortMode, setOrderSortMode] = useState<'oldest' | 'newest'>('oldest')
  const [tableHistorySearch, setTableHistorySearch] = useState('')
  const [tableSortMode, setTableSortMode] = useState<'number' | 'seats' | 'status'>('number')
  const [tableHistoryDateFilter, setTableHistoryDateFilter] = useState<'today' | 'week' | 'month' | 'all'>('week')
  const [tableHistoryMinTotal, setTableHistoryMinTotal] = useState('')
  const [tableHistoryMinCovers, setTableHistoryMinCovers] = useState('')
  const [tableHistorySort, setTableHistorySort] = useState<'recent' | 'amount' | 'duration' | 'covers'>('recent')
  const [isAddItemDialogOpen, setIsAddItemDialogOpen] = useState(false)
  const [currentSessionPin, setCurrentSessionPin] = useState<string>('')
  const [showOverbookingAlert, setShowOverbookingAlert] = useState(false)
  const [allergenInput, setAllergenInput] = useState('')
  const [showTableQrDialog, setShowTableQrDialog] = useState(false)
  const [isGeneratingTableQrPdf, setIsGeneratingTableQrPdf] = useState(false)
  const [showTableBillDialog, setShowTableBillDialog] = useState(false)
  const [selectedTableForActions, setSelectedTableForActions] = useState<Table | null>(null)
  // Confirmation dialog state for close/pay/empty table
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  const [closeConfirmAction, setCloseConfirmAction] = useState<{ tableId: string; markPaid: boolean } | null>(null)
  const [kitchenViewMode, setKitchenViewMode] = useState<'table' | 'dish'>('table')
  const [selectedKitchenCategories, setSelectedKitchenCategories] = useState<string[]>([])
  const [kitchenZoom, setKitchenZoom] = useState(1)
  const [tableZoom, setTableZoom] = useState(1)

  // Timeline State
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const refreshData = useCallback(async () => {
    refreshTables?.()
    refreshBookings?.()
    refreshRooms?.()
    refreshSessions?.()
  }, [refreshTables, refreshBookings, refreshRooms, refreshSessions])

  // Restaurant Settings State (initialized from DB)
  const [restaurantName, setRestaurantName] = useState(currentRestaurant?.name || '')
  const [waiterModeEnabled, setWaiterModeEnabled] = useState(currentRestaurant?.waiter_mode_enabled || false)
  const [allowWaiterPayments, setAllowWaiterPayments] = useState(currentRestaurant?.allow_waiter_payments || false)
  const [waiterPassword, setWaiterPassword] = useState(currentRestaurant?.waiter_password || '')

  // New Settings State
  const [ayceEnabled, setAyceEnabled] = useState(false)
  const [aycePrice, setAycePrice] = useState<number | string>(0)
  const [ayceMaxOrders, setAyceMaxOrders] = useState<number | string>(0)
  const [copertoEnabled, setCopertoEnabled] = useState(false)
  const [copertoPrice, setCopertoPrice] = useState<number | string>(0)
  const [courseSplittingEnabled, setCourseSplittingEnabled] = useState(false)
  const [reservationDuration, setReservationDuration] = useState(120)

  // Weekly schedule state
  const [weeklyCoperto, setWeeklyCoperto] = useState<any>(currentRestaurant?.weekly_coperto || null)
  const [weeklyAyce, setWeeklyAyce] = useState<any>(currentRestaurant?.weekly_ayce || null)
  const [weeklyServiceHours, setWeeklyServiceHours] = useState<any>(currentRestaurant?.weekly_service_hours || null)

  // Reservation Settings
  const [enableReservationRoomSelection, setEnableReservationRoomSelection] = useState(false)
  const [enablePublicReservations, setEnablePublicReservations] = useState(true)

  // Dirty state tracking
  const [restaurantNameDirty, setRestaurantNameDirty] = useState(false)

  // Split Bill State
  const [isSplitMode, setIsSplitMode] = useState(false)
  const [selectedSplitItems, setSelectedSplitItems] = useState<Set<string>>(new Set())

  // Helper: Get detailed status for table color
  const getDetailedTableStatus = (tableId: string): 'free' | 'waiting' | 'eating' => {
    const session = sessions?.find(s => s.table_id === tableId && s.status === 'OPEN')
    if (!session) return 'free'

    const sessionOrders = orders?.filter(o => o.table_session_id === session.id && o.status !== 'CANCELLED') || []

    if (sessionOrders.length === 0) return 'eating' // Or 'waiting' if just seated? optimizing for "eating" means seated/safe. User said "Red = must receive dishes". If no orders, maybe default to seated/yellow or red? Let's assume Red if just seated? 
    // Actually user said: "Green: free", "Red: table must receive dishes", "Yellow: received all dishes and eating".
    // If just seated (no orders), they haven't received dishes, so technically waiting? Or just neutral.
    // Let's stick to: If ANY item is NOT served/completed/delivered -> RED. Else YELLOW.

    const hasPendingItems = sessionOrders.some(order =>
      order.items?.some((item: any) =>
        !['SERVED', 'DELIVERED', 'COMPLETED'].includes(item.status?.toUpperCase()) &&
        item.status !== 'CANCELLED' &&
        item.status !== 'PAID'
      )
    )

    return hasPendingItems ? 'waiting' : 'eating'
  }
  const [waiterCredentialsDirty, setWaiterCredentialsDirty] = useState(false)
  const [ayceDirty, setAyceDirty] = useState(false)
  const [copertoDirty, setCopertoDirty] = useState(false)
  const [settingsInitialized, setSettingsInitialized] = useState(false)

  // Sync state with DB data when loaded
  useEffect(() => {
    if (currentRestaurant) {
      setRestaurantName(currentRestaurant.name)
      setWaiterModeEnabled(currentRestaurant.waiter_mode_enabled || false)
      setAllowWaiterPayments(currentRestaurant.allow_waiter_payments || false)
      setWaiterPassword('')

      setAyceEnabled(!!currentRestaurant.all_you_can_eat?.enabled)
      setAycePrice(currentRestaurant.all_you_can_eat?.pricePerPerson || 0)
      setAyceMaxOrders(currentRestaurant.all_you_can_eat?.maxOrders || 0)
      // For now, let's stick to what we know exists or was added.

      // refreshRestaurants() // This was causing an infinite loop, removed.

      const coverCharge = currentRestaurant.cover_charge_per_person
      if (coverCharge !== undefined) {
        setCopertoPrice(coverCharge)
        setCopertoEnabled(coverCharge > 0)
      }
      setSettingsInitialized(true)

      setWaiterModeEnabled(currentRestaurant.waiter_mode_enabled || false)
      setAllowWaiterPayments(currentRestaurant.allow_waiter_payments || false)
      setWaiterPassword('')
      setRestaurantName(currentRestaurant.name || '')
      setCourseSplittingEnabled(currentRestaurant.enable_course_splitting || false)

      // Schedule Times
      if (currentRestaurant.lunch_time_start) setLunchTimeStart(currentRestaurant.lunch_time_start)
      if (currentRestaurant.dinner_time_start) setDinnerTimeStart(currentRestaurant.dinner_time_start)

      // Weekly schedules
      if (currentRestaurant.weekly_coperto) setWeeklyCoperto(currentRestaurant.weekly_coperto)
      if (currentRestaurant.weekly_coperto) setWeeklyCoperto(currentRestaurant.weekly_coperto)
      if (currentRestaurant.weekly_ayce) setWeeklyAyce(currentRestaurant.weekly_ayce)
      if (currentRestaurant.weekly_service_hours) setWeeklyServiceHours(currentRestaurant.weekly_service_hours)

      setEnableReservationRoomSelection(currentRestaurant.enable_reservation_room_selection || false)
      setEnablePublicReservations(currentRestaurant.enable_public_reservations !== false) // Default true
    }
  }, [currentRestaurant])

  const updateEnableReservationRoomSelection = async (enabled: boolean) => {
    setEnableReservationRoomSelection(enabled)
    if (restaurantId) {
      await DatabaseService.updateRestaurant({
        id: restaurantId,
        enable_reservation_room_selection: enabled
      })
    }
  }

  const updateEnablePublicReservations = async (enabled: boolean) => {
    setEnablePublicReservations(enabled)
    if (restaurantId) {
      await DatabaseService.updateRestaurant({
        id: restaurantId,
        enable_public_reservations: enabled
      })
    }
  }

  // Handlers for updating settings
  const saveRestaurantName = async () => {
    if (!restaurantId) return
    await DatabaseService.updateRestaurant({ id: restaurantId, name: restaurantName })
    toast.success('Nome ristorante aggiornato')
    setRestaurantNameDirty(false)
    refreshRestaurants()
  }

  // This block was misplaced and causing a syntax error. It's removed as per instruction.
  // if (currentRestaurant && currentRestaurant.isActive === false) {sword,

  // Auto-save handlers for waiter settings - save immediately on change
  const updateWaiterModeEnabled = async (enabled: boolean) => {
    if (!restaurantId) return
    setWaiterModeEnabled(enabled)
    await DatabaseService.updateRestaurant({
      id: restaurantId,
      waiter_mode_enabled: enabled
    })
    toast.success(enabled ? 'Modalità cameriere attivata' : 'Modalità cameriere disattivata')
    refreshRestaurants()
  }

  const updateWaiterPassword = async (password: string) => {
    if (!restaurantId) return
    setWaiterPassword(password)
    // Use debounce - save after user stops typing (handled in SettingsView)
  }

  const saveWaiterPassword = async (password: string) => {
    if (!restaurantId || !password.trim()) return
    const hashedPw = await hashPassword(password)
    // Update local state with original password for display
    setWaiterPassword(password)
    await DatabaseService.updateRestaurant({
      id: restaurantId,
      waiter_password: hashedPw
    })
    toast.success('Password cameriere aggiornata')
    // Don't call refreshRestaurants() here as it can cause a race condition
    // that resets the state before the UI updates
  }

  const updateAllowWaiterPayments = async (enabled: boolean) => {
    if (!restaurantId) return
    setAllowWaiterPayments(enabled)
    await DatabaseService.updateRestaurant({
      id: restaurantId,
      allow_waiter_payments: enabled
    })
    toast.success(enabled ? 'Permessi pagamento abilitati' : 'Permessi pagamento disabilitati')
    refreshRestaurants()
  }

  // Specific handlers for direct toggles
  const updateAyceEnabled = async (enabled: boolean) => {
    if (!restaurantId) return
    setAyceEnabled(enabled)
    const price = typeof aycePrice === 'string' ? parseFloat(aycePrice) : aycePrice
    const maxOrders = typeof ayceMaxOrders === 'string' ? parseInt(ayceMaxOrders) : ayceMaxOrders
    await DatabaseService.updateRestaurant({
      id: restaurantId,
      all_you_can_eat: {
        enabled,
        pricePerPerson: price || 0,
        maxOrders: maxOrders || 0
      }
    })
    // Don't refresh immediately - it causes a race condition that resets the toggle
  }

  const updateCopertoEnabled = async (enabled: boolean) => {
    if (!restaurantId) return
    setCopertoEnabled(enabled)

    // Create update object
    const updateData: Partial<Restaurant> = {}
    let newSchedule = weeklyCoperto ? { ...weeklyCoperto } : null

    if (enabled) {
      // If enabling and price is 0, set a default or keep 0 but ensure DB knows
      const price = Number(copertoPrice) || 2.0
      setCopertoPrice(price)
      updateData.cover_charge_per_person = price

      if (newSchedule) {
        newSchedule.enabled = true
        newSchedule.defaultPrice = price
        updateData.weekly_coperto = newSchedule
        setWeeklyCoperto(newSchedule)
      }
    } else {
      updateData.cover_charge_per_person = 0

      if (newSchedule) {
        newSchedule.enabled = false
        updateData.weekly_coperto = newSchedule
        setWeeklyCoperto(newSchedule)
      }
    }

    await DatabaseService.updateRestaurant({ id: restaurantId, ...updateData })
  }

  const updateCopertoPrice = async (price: number | string) => {
    const val = parseFloat(price.toString()) || 0
    setCopertoPrice(val)
    if (!restaurantId) return

    if (copertoEnabled) {
      const updateData: Partial<Restaurant> = {
        cover_charge_per_person: val
      }

      // Also update default price in weekly schedule if it exists, to keep them in sync
      if (weeklyCoperto) {
        const newSchedule = { ...weeklyCoperto, defaultPrice: val }
        updateData.weekly_coperto = newSchedule
        setWeeklyCoperto(newSchedule)
      }

      await DatabaseService.updateRestaurant({ id: restaurantId, ...updateData })
    }
  }
  // View Only Menu State
  const [optimisticViewOnly, setOptimisticViewOnly] = useState<boolean | null>(null)
  const viewOnlyMenuEnabled = optimisticViewOnly ?? currentRestaurant?.view_only_menu_enabled ?? false

  const updateViewOnlyMenuEnabled = async (enabled: boolean) => {
    setOptimisticViewOnly(enabled)
    if (!restaurantId) return
    try {
      await DatabaseService.updateRestaurant({
        id: restaurantId,
        view_only_menu_enabled: enabled
      })
      toast.success(enabled ? 'Menu Solo Visualizzazione attivato' : 'Menu Solo Visualizzazione disattivato')
    } catch (error) {
      console.error('Error updating view only settings:', error)
      toast.error('Errore durante l\'aggiornamento delle impostazioni')
      setOptimisticViewOnly(null) // Revert on error
    }
  }

  // Show Cooking Times State
  const [optimisticShowCookingTimes, setOptimisticShowCookingTimes] = useState<boolean | null>(null)
  const showCookingTimes = optimisticShowCookingTimes ?? (currentRestaurant as any)?.show_cooking_times ?? false

  const updateShowCookingTimes = async (enabled: boolean) => {
    setOptimisticShowCookingTimes(enabled)
    if (!restaurantId) return
    try {
      await DatabaseService.updateRestaurant({
        id: restaurantId,
        show_cooking_times: enabled
      } as any)
      toast.success(enabled ? 'Tempo di cottura attivato' : 'Tempo di cottura disattivato')
    } catch (error) {
      console.error('Error updating cooking times setting:', error)
      toast.error('Errore durante l\'aggiornamento')
      setOptimisticShowCookingTimes(null)
    }
  }


  // --- Handlers ---
  const updateRestaurantName = async (name: string) => {
    setRestaurantName(name)
    if (!restaurantId) return
    await DatabaseService.updateRestaurant({ id: restaurantId, name })
    setRestaurantNameDirty(false)
  }

  const updateLunchStart = async (time: string) => {
    setLunchTimeStart(time)
    if (!restaurantId) return
    await DatabaseService.updateRestaurant({ id: restaurantId, lunch_time_start: time })
  }


  const updateDinnerStart = async (time: string) => {
    setDinnerTimeStart(time)
    if (!restaurantId) return
    await DatabaseService.updateRestaurant({ id: restaurantId, dinner_time_start: time })
  }

  const updateCourseSplitting = async (enabled: boolean) => {
    setCourseSplittingEnabled(enabled)
    if (!restaurantId) return
    await DatabaseService.updateRestaurant({ id: restaurantId, enable_course_splitting: enabled })
  }

  const updateReservationDuration = async (minutes: number) => {
    setReservationDuration(minutes)
    if (!restaurantId) return
    await DatabaseService.updateRestaurant({ id: restaurantId, reservation_duration: minutes })
    refreshRestaurants()
  }

  const filteredOrders = useMemo(() => {
    return orders.map(order => {
      if (selectedKitchenCategories.length === 0) return order
      const filteredItems = order.items?.filter(item => {
        const dish = dishes?.find(d => d.id === item.dish_id)
        return dish && selectedKitchenCategories.includes(dish.category_id)
      })
      return { ...order, items: filteredItems }
    }).filter(order => {
      // Must have items
      if (!order.items || order.items.length === 0) return false

      // Hide orders where ALL items are delivered (waiter marked as consegnato)
      const allDelivered = order.items.every(i =>
        i.status?.toLowerCase() === 'delivered'
      )
      if (allDelivered) return false

      return true
    })
  }, [orders, dishes, selectedKitchenCategories])

  // Load additional settings from restaurant (Coperto, etc - AYCE is handled in the main sync effect above)
  useEffect(() => {
    if (currentRestaurant) {
      // AYCE is already handled in the main sync effect at line 400+
      // This effect handles additional settings that might not be in the main effect

      const coverCharge = currentRestaurant.cover_charge_per_person
      if (coverCharge !== undefined) {
        setCopertoPrice(coverCharge)
        setCopertoEnabled(coverCharge > 0)
      }
      setSettingsInitialized(true)

      // Schedule Times
      if (currentRestaurant.lunch_time_start) setLunchTimeStart(currentRestaurant.lunch_time_start)
      if (currentRestaurant.dinner_time_start) setDinnerTimeStart(currentRestaurant.dinner_time_start)
    }
  }, [currentRestaurant])

  const { updateOrderItemStatus, updateOrderStatus } = useRestaurantActions()

  useEffect(() => {
    if (activeTab === 'tables') {
      refreshSessions()
    }
  }, [activeTab, refreshSessions])

  const generatePin = () => Math.floor(1000 + Math.random() * 9000).toString()

  const generateQrCode = (tableId: string) => {
    return `${window.location.origin}/client/table/${tableId}`
  }

  const handleCreateTable = () => {
    if (!newTableName.trim()) {
      toast.error('Inserisci un nome per il tavolo')
      return
    }

    if (!restaurantId) {
      toast.error('Errore: Ristorante non trovato')
      return
    }

    const newTable: Partial<Table> = {
      restaurant_id: restaurantId,
      number: newTableName,
      seats: typeof newTableSeats === 'string' ? parseInt(newTableSeats) || 4 : newTableSeats,
      room_id: newTableRoomId !== 'all' ? newTableRoomId : undefined
    }

    DatabaseService.createTable(newTable)
      .then(() => {
        setNewTableName('')
        setNewTableSeats(4)
        setNewTableRoomId('all')
        setShowCreateTableDialog(false)
        toast.success('Tavolo creato con successo')
      })
      .catch(err => {
        console.error('Create table error', err)
        toast.error('Errore nella creazione del tavolo')
      })
  }

  const getOpenSessionForTable = (tableId: string) =>
    sessions?.find(s => s.table_id === tableId && s.status === 'OPEN')

  // Wrapper that shows confirmation before closing
  const requestCloseTable = (tableId: string, markPaid: boolean) => {
    setCloseConfirmAction({ tableId, markPaid })
    setShowCloseConfirm(true)
  }

  const handleCloseTable = async (tableId: string, markPaid: boolean) => {
    const openSession = getOpenSessionForTable(tableId)
    if (openSession) {
      try {
        await DatabaseService.closeSession(openSession.id)
        if (markPaid) {
          await DatabaseService.markOrdersPaidForSession(openSession.id)
        } else {
          // FIX: If just emptying the table (not paid), cancel all active orders
          // so they don't count as "Active" in analytics.
          await DatabaseService.cancelSessionOrders(openSession.id)
        }

        toast.success(markPaid ? 'Tavolo pagato e liberato' : 'Tavolo svuotato e liberato')
        refreshSessions()
        setSelectedTable(null)
        setSelectedTableForActions(null)
        setShowTableDialog(false)
        setShowQrDialog(false)
        setShowTableBillDialog(false)
      } catch (error) {
        console.error('Error freeing table:', error)
        toast.error('Errore durante la chiusura del tavolo')
      }
    }
  }

  const handleToggleTable = async (tableId: string) => {
    const openSession = getOpenSessionForTable(tableId)
    if (openSession) {
      handleCloseTable(tableId, true)
      return
    }

    const table = tables?.find(t => t.id === tableId)
    if (!table) return

    const isAyceEnabled = ayceEnabled
    const currentAycePrice = currentRestaurant
      ? getCurrentAyceSettings({ ...currentRestaurant, weekly_ayce: weeklyAyce } as any, lunchTimeStart, dinnerTimeStart).price
      : (typeof aycePrice === 'string' ? parseFloat(aycePrice) : aycePrice)
    const isAyceEffective = isAyceEnabled && (currentAycePrice || 0) > 0
    const price = typeof copertoPrice === 'string' ? parseFloat(copertoPrice) : copertoPrice
    const isCopertoEnabled = copertoEnabled && (price || 0) > 0

    if (!isAyceEffective && !isCopertoEnabled) {
      setPendingAutoOrderTableId(tableId)
      handleActivateTable(tableId, 1)
    } else {
      setTableCopertoOverride(isCopertoEnabled)
      setTableAyceOverride(isAyceEffective)
      setSelectedTable(table)
      setShowTableDialog(true)
    }
  }

  const handleActivateTable = async (tableId: string, customerCount: number) => {
    if (!customerCount || customerCount <= 0) {
      toast.error('Inserisci un numero valido di clienti')
      return
    }

    const tableToUpdate = tables?.find(t => t.id === tableId)
    if (!tableToUpdate) return

    try {
      const session = await DatabaseService.createSession({
        restaurant_id: restaurantId,
        table_id: tableId,
        status: 'OPEN',
        opened_at: new Date().toISOString(),
        session_pin: generatePin(),
        customer_count: customerCount,
        coperto_enabled: copertoEnabled ? tableCopertoOverride : false,
        ayce_enabled: ayceEnabled ? tableAyceOverride : false
      })

      if (ayceEnabled) {
        toast.success(`Tavolo attivato per ${customerCount} persone`)
      } else {
        toast.success('Tavolo attivato')
      }
      setCustomerCount('')
      setSelectedTable(null)
      setCurrentSessionPin(session.session_pin || '')
      refreshSessions()
      setShowTableDialog(false)
      setShowQrDialog(false)

      if (pendingAutoOrderTableId === tableId) {
        navigate(`/waiter/table/${tableId}`)
        setPendingAutoOrderTableId(null)
      }
    } catch (err) {
      console.error('Error activating table:', err)
      toast.error('Errore durante l\'attivazione del tavolo')
    }
  }

  const handleShowTableQr = async (table: Table) => {
    setSelectedTableForActions(table)
    setShowTableQrDialog(true)

    // Use local state as source of truth (same as the card)
    const session = getOpenSessionForTable(table.id)
    if (session && session.session_pin) {
      setCurrentSessionPin(session.session_pin)
    } else {
      // Fallback only if not in local state (unlikely if card is red)
      setCurrentSessionPin('Caricamento...')
      try {
        const fetchedSession = await DatabaseService.getActiveSession(table.id)
        if (fetchedSession && fetchedSession.session_pin) {
          setCurrentSessionPin(fetchedSession.session_pin)
        } else {
          setCurrentSessionPin('N/A')
          refreshSessions()
        }
      } catch (error) {
        console.error('Error fetching session for PIN:', error)
        setCurrentSessionPin('Errore')
      }
    }
  }

  const handleDeleteTable = (tableId: string) => {
    if (!confirm('Sei sicuro di voler eliminare questo tavolo?')) return

    setTables(prev => prev.filter(t => t.id !== tableId))

    DatabaseService.deleteTable(tableId)
      .then(() => toast.success('Tavolo eliminato'))
      .catch((error) => {
        console.error('Error deleting table:', error)
        toast.error('Errore nell\'eliminare il tavolo')
        refreshTables()
      })
  }

  const saveAyceSettings = async () => {
    if (!restaurantId || !settingsInitialized) return

    const price = typeof aycePrice === 'string' ? parseFloat(aycePrice) : aycePrice
    const maxOrders = typeof ayceMaxOrders === 'string' ? parseInt(ayceMaxOrders) : ayceMaxOrders

    if (ayceEnabled) {
      if (!price || price <= 0) {
        toast.error('Inserisci un prezzo valido per persona')
        return
      }
      if (!maxOrders || maxOrders <= 0) {
        toast.error('Imposta un numero massimo di ordini valido')
        return
      }
    }

    try {
      await DatabaseService.updateRestaurant({
        id: restaurantId,
        allYouCanEat: {
          enabled: ayceEnabled,
          pricePerPerson: ayceEnabled ? price : 0,
          maxOrders: ayceEnabled ? maxOrders : 0
        }
      })
      if (ayceDirty) {
        toast.success(ayceEnabled ? 'All You Can Eat attivato' : 'All You Can Eat disattivato')
        setAyceDirty(false)
      }
    } catch (error) {
      toast.error('Errore nel salvare le impostazioni')
    }
  }

  const saveCopertoSettings = async () => {
    if (!restaurantId || !settingsInitialized) return

    const price = typeof copertoPrice === 'string' ? parseFloat(copertoPrice) : copertoPrice

    if (copertoEnabled && (!price || price <= 0)) {
      toast.error('Inserisci un importo valido per il coperto')
      return
    }

    try {
      await DatabaseService.updateRestaurant({
        id: restaurantId,
        cover_charge_per_person: copertoEnabled ? price : 0
      })
      if (copertoDirty) {
        toast.success(copertoEnabled ? 'Coperto attivato' : 'Coperto disattivato')
        setCopertoDirty(false)
      }
    } catch (error) {
      toast.error('Errore nel salvare le impostazioni')
    }
  }



  // Ensure these update their dirty states when changed in the view (View handles onChange, pass Setters)

  useEffect(() => {
    if (!settingsInitialized || !ayceDirty) return
    const timeout = setTimeout(() => {
      saveAyceSettings()
    }, 400)
    return () => clearTimeout(timeout)
  }, [ayceEnabled, aycePrice, ayceMaxOrders, settingsInitialized, ayceDirty])

  useEffect(() => {
    if (!settingsInitialized || !copertoDirty) return
    const timeout = setTimeout(() => {
      saveCopertoSettings()
    }, 400)
    return () => clearTimeout(timeout)
  }, [copertoEnabled, copertoPrice, settingsInitialized, copertoDirty])

  const handleEditTable = (table: Table) => {
    setEditingTable(table)
    setEditTableName(table.number)
    setEditTableSeats(table.seats || 4)
    setEditTableRoomId(table.room_id || 'all')
    setEditTableIsActive(table.is_active !== false)
  }

  const handleCreateDish = async () => {
    if (!newDish.name.trim() || !newDish.price || !newDish.categoryId) {
      toast.error('Compila tutti i campi obbligatori')
      return
    }

    let imageUrl = newDish.image
    if (newDish.imageFile) {
      try {
        imageUrl = await DatabaseService.uploadImage(newDish.imageFile, 'dishes')
      } catch (error) {
        console.error('Error uploading image:', error)
        toast.error('Errore durante il caricamento dell\'immagine')
        return
      }
    }

    const newItem: Partial<Dish> = {
      restaurant_id: restaurantId,
      name: newDish.name,
      description: newDish.description,
      price: parseFloat(newDish.price),
      category_id: newDish.categoryId,
      image_url: imageUrl,
      is_active: true,
      is_ayce: newDish.is_ayce,
      excludeFromAllYouCanEat: !newDish.is_ayce,
      allergens: newDish.allergens || []
    }

    DatabaseService.createDish(newItem)
      .then(() => {
        setNewDish({ name: '', description: '', price: '', categoryId: '', image: '', is_ayce: false, allergens: [] })
        setAllergenInput('')
        setIsAddItemDialogOpen(false)
        toast.success('Piatto aggiunto al menu')
      })
      .catch((error) => {
        console.error('Error creating dish:', error)
        toast.error('Errore durante la creazione del piatto')
      })
  }

  const handleToggleDish = (dishId: string) => {
    const item = dishes?.find(i => i.id === dishId)
    if (item) {
      const previousStatus = item.is_active ?? true
      const updatedItem = { ...item, is_active: !(item.is_active ?? true) }

      setDishes((prev) => prev.map(dish => dish.id === dishId ? updatedItem : dish))

      DatabaseService.updateDish(updatedItem)
        .catch((error) => {
          console.error('Error updating dish:', error)
          toast.error('Errore durante l\'aggiornamento del piatto')
          setDishes((prev) => prev.map(dish => dish.id === dishId ? { ...dish, is_active: previousStatus } : dish))
        })
    }
  }

  const handleDeleteDish = (dishId: string) => {
    setDishes(prev => prev.filter(d => d.id !== dishId))

    DatabaseService.deleteDish(dishId)
      .then(() => toast.success('Piatto eliminato'))
      .catch((error) => {
        console.error('Error deleting dish:', error)
        toast.error('Errore durante l\'eliminazione del piatto')
      })
  }

  const handleEditDish = (item: Dish) => {
    setEditingDish(item)
    setEditDishData({
      name: item.name,
      description: item.description || '',
      price: item.price.toString(),
      categoryId: item.category_id,
      image: item.image_url || '',
      is_ayce: item.is_ayce || false,
      allergens: item.allergens || []
    })
    setAllergenInput(item.allergens?.join(', ') || '')
  }

  const handleSaveDish = async () => {
    if (!editingDish || !editDishData.name.trim() || !editDishData.price || !editDishData.categoryId) {
      toast.error('Compila tutti i campi obbligatori')
      return
    }

    let imageUrl = editDishData.image
    if (editDishData.imageFile) {
      try {
        imageUrl = await DatabaseService.uploadImage(editDishData.imageFile, 'dishes')
      } catch (error) {
        console.error('Error uploading image:', error)
        toast.error('Errore durante il caricamento dell\'immagine')
        return
      }
    }

    const updatedItem = {
      ...editingDish,
      name: editDishData.name.trim(),
      description: editDishData.description.trim(),
      price: parseFloat(editDishData.price),
      category_id: editDishData.categoryId,
      image_url: imageUrl,
      is_ayce: editDishData.is_ayce,
      excludeFromAllYouCanEat: !editDishData.is_ayce,
      allergens: editDishData.allergens || []
    }

    DatabaseService.updateDish(updatedItem)
      .then(() => {
        setDishes?.((prev = []) =>
          prev.map(d => d.id === updatedItem.id ? { ...d, ...updatedItem } : d)
        )
        setEditingDish(null)
        setEditDishData({ name: '', description: '', price: '', categoryId: '', image: '', is_ayce: false, allergens: [] })
        setAllergenInput('')
        toast.success('Piatto modificato')
      })
  }

  const handleCancelDishEdit = () => {
    setEditingDish(null)
    setEditDishData({ name: '', description: '', price: '', categoryId: '', image: '', is_ayce: false, allergens: [], imageFile: undefined })
  }


  const handleCompleteOrder = async (orderId: string) => {
    const targetOrder = orders?.find(o => o.id === orderId)

    if (targetOrder?.items?.length) {
      await Promise.all(
        targetOrder.items.map(item => updateOrderItemStatus(orderId, item.id, 'SERVED'))
      )
    }

    await updateOrderStatus(orderId, 'completed')
    toast.success('Ordine completato e spostato nello storico')
  }

  const handleCompleteDish = async (orderId: string, itemId: string, showToast = true) => {
    // FIX: Set status to 'READY' (uppercase) so it is recognized as done by KitchenView
    await updateOrderItemStatus(orderId, itemId, 'READY')

    // Update local orders state immediately for UI refresh
    setOrders(prevOrders => prevOrders.map(order => {
      if (order.id === orderId) {
        return {
          ...order,
          items: order.items?.map(item =>
            item.id === itemId ? { ...item, status: 'READY' as const } : item
          )
        }
      }
      return order
    }))

    if (showToast) toast.success('Piatto pronto! Notifica inviata ai camerieri.')
  }


  const handleCreateCategory = () => {
    if (!newCategory.trim()) {
      toast.error('Inserisci un nome per la categoria')
      return
    }

    if (categories?.some(cat => cat.name === newCategory)) {
      toast.error('Categoria già esistente')
      return
    }

    const nextOrder = restaurantCategories.length

    const newCategoryObj: Partial<Category> = {
      restaurant_id: restaurantId,
      name: newCategory,
      order: nextOrder
    }

    DatabaseService.createCategory(newCategoryObj)
      .then(() => {
        setNewCategory('')
        toast.success('Categoria aggiunta')
      })
  }

  const handleDeleteCategory = (categoryId: string) => {
    DatabaseService.deleteCategory(categoryId)
      .then(() => toast.success('Categoria eliminata'))
  }

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category)
    setEditCategoryName(category.name)
  }

  const handleSaveCategory = () => {
    if (!editingCategory || !editCategoryName.trim()) return

    const nameExists = categories?.some(cat =>
      cat.name.toLowerCase() === editCategoryName.trim().toLowerCase() &&
      cat.id !== editingCategory.id
    )

    if (nameExists) {
      toast.error('Esiste già una categoria con questo nome')
      return
    }

    const updatedCategory = { ...editingCategory, name: editCategoryName.trim() }
    DatabaseService.updateCategory(updatedCategory)
      .then(() => {
        setEditingCategory(null)
        setEditCategoryName('')
        toast.success('Categoria modificata')
      })
  }

  const handleCancelEdit = () => {
    setEditingCategory(null)
    setEditCategoryName('')
  }

  // --- Category Drag & Drop Logic ---
  const handleDragStart = (category: Category) => {
    setDraggedCategory(category)
  }

  const handleDragOver = (e: React.DragEvent, targetCategory: Category) => {
    e.preventDefault()
    if (!draggedCategory || draggedCategory.id === targetCategory.id) return
  }

  const handleDrop = async (targetCategory: Category) => {
    if (!draggedCategory || draggedCategory.id === targetCategory.id) return

    const updatedCategories = [...restaurantCategories]
    const draggedIndex = updatedCategories.findIndex(c => c.id === draggedCategory.id)
    const targetIndex = updatedCategories.findIndex(c => c.id === targetCategory.id)

    updatedCategories.splice(draggedIndex, 1)
    updatedCategories.splice(targetIndex, 0, draggedCategory)

    // Update orders in DB
    try {
      const updates = updatedCategories.map((cat, index) => ({
        ...cat,
        order: index
      }))

      // Batch update all categories with new order
      for (const cat of updates) {
        await DatabaseService.updateCategory(cat)
      }

      // Force update local state after successful DB save
      setCategories(updates)
      setDraggedCategory(null)

      toast.success('Ordine categorie aggiornato')
    } catch (err) {
      console.error("Failed to reorder categories", err)
      toast.error("Errore nel riordinare le categorie")
      // Revert to original order on error
      setCategories([...restaurantCategories])
    }
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean = false) => {
    const file = e.target.files?.[0]
    if (file) {
      const previewUrl = URL.createObjectURL(file)
      if (isEdit) {
        // Revoke previous blob URL to prevent memory leak (Issue #17)
        if (editDishData.image?.startsWith('blob:')) URL.revokeObjectURL(editDishData.image)
        setEditDishData(prev => ({ ...prev, image: previewUrl, imageFile: file }))
      } else {
        if (newDish.image?.startsWith('blob:')) URL.revokeObjectURL(newDish.image)
        setNewDish(prev => ({ ...prev, image: previewUrl, imageFile: file }))
      }
    }
  }

  useEffect(() => {
    if (activeSection === 'tables') setActiveTab('tables')
    else if (activeSection === 'menu') setActiveTab('menu')
    else if (activeSection === 'reservations') setActiveTab('reservations')
    else if (activeSection === 'analytics') setActiveTab('analytics')
    else if (activeSection === 'settings') setActiveTab('settings')
    else setActiveTab('orders')
  }, [activeSection])

  if (!restaurantId) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-6 bg-black text-amber-50 px-4">
        {/* Ambient Background for loading screen too */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[20%] left-[50%] -translate-x-1/2 w-[60%] h-[60%] bg-amber-500/5 rounded-full blur-[150px] opacity-40" />
        </div>
        <div className="relative z-10 w-12 h-12 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin shadow-[0_0_30px_-5px_rgba(245,158,11,0.3)]" />
        <div className="relative z-10 flex flex-col items-center gap-2">
          <p className="text-lg font-light tracking-[0.2em] uppercase text-white">MINTHI</p>
          <p className="text-xs text-zinc-500 uppercase tracking-widest">Caricamento sistema...</p>
        </div>
        <Button variant="ghost" onClick={onLogout} className="relative z-10 mt-8 text-zinc-600 hover:text-amber-500 hover:bg-white/5 uppercase text-xs tracking-widest">
          Torna al login
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-screen w-full bg-black text-amber-50 font-sans overflow-hidden selection:bg-amber-500/30 relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 bg-black">
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-amber-500/[0.02] rounded-full blur-[150px]" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-amber-500/[0.02] rounded-full blur-[150px]" />
      </div>

      {/* Sidebar Toggle Button - Inline, does not overlap content */}

      {/* Sidebar - Collapsible with AnimatePresence */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0, x: -50 }}
            animate={{ width: 272, opacity: 1, x: 0 }}
            exit={{ width: 0, opacity: 0, x: -50 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="h-full bg-zinc-950/80 backdrop-blur-3xl border-r border-white/[0.03] flex flex-col flex-shrink-0 z-40 relative shadow-[20px_0_50px_rgba(0,0,0,0.5)] overflow-hidden"
          >
            <div className="p-6 border-b border-white/5 flex items-center justify-between gap-4 min-w-[272px]">
              {currentRestaurant?.logo_url ? (
                <div className="flex items-center gap-4 flex-1">
                  <div className="w-12 h-12 rounded-xl bg-zinc-900/50 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img src={currentRestaurant.logo_url} alt={currentRestaurant.name} className="w-full h-full object-contain" />
                  </div>
                  <div className="overflow-hidden flex-1 min-w-0">
                    <h1 className="font-medium text-base text-zinc-100 tracking-tight leading-none truncate">{currentRestaurant.name}</h1>
                    <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 font-bold mt-1.5 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                      Online
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4 flex-1">
                  <div className="flex-shrink-0 p-2.5 bg-zinc-900/50 border border-amber-500/20 rounded-xl text-amber-500 shadow-[0_0_15px_-5px_rgba(245,158,11,0.2)]">
                    <ChefHat size={24} />
                  </div>
                  <div className="overflow-hidden flex-1 min-w-0">
                    <h1 className="font-medium text-base text-zinc-100 tracking-tight leading-none truncate">{currentRestaurant?.name || 'MINTHI'}</h1>
                    <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 font-bold mt-1.5 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                      Online
                    </p>
                  </div>
                </div>
              )}

              {/* Close Sidebar Button */}
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="p-2 text-zinc-500 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
              >
                <CaretRight size={20} className="transform rotate-180" />
              </button>
            </div>

            <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto min-w-[272px]">
              {[
                { id: 'orders', label: 'Ordini', icon: Clock },
                { id: 'tables', label: 'Tavoli', icon: MapPin },
                { id: 'menu', label: 'Menu', icon: BookOpen },
                { id: 'reservations', label: 'Prenotazioni', icon: Calendar },
                { id: 'analytics', label: 'Analitiche', icon: ChartBar },
              ].map((item) => (
                <Button
                  key={item.id}
                  variant="ghost"
                  className={`w-full justify-start h-12 px-4 rounded-xl transition-all duration-300 group relative overflow-hidden ${activeTab === item.id
                    // Active State: Minimal & Elegant
                    ? 'bg-gradient-to-r from-amber-500/10 to-transparent text-amber-500 font-medium'
                    // Inactive State
                    : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.03]'
                    }`}
                  onClick={() => {
                    const section = item.id
                    setActiveTab(section)
                    setActiveSection(section)
                    // Auto collapsing logic
                    setIsSidebarOpen(false)
                  }}
                >
                  {activeTab === item.id && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.8)]" />
                  )}
                  <item.icon
                    size={22}
                    weight={activeTab === item.id ? 'fill' : 'regular'}
                    className={`mr-3 transition-colors duration-300 flex-shrink-0 ${activeTab === item.id ? 'text-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]' : 'text-zinc-600 group-hover:text-zinc-400'}`}
                  />
                  <span className={`relative z-10 text-sm tracking-wide truncate ${activeTab === item.id ? 'font-medium' : 'font-normal'}`}>{item.label}</span>

                  {/* Subtle shimmer for active item */}
                  {activeTab === item.id && (
                    <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-transparent opacity-50" />
                  )}
                </Button>
              ))}
            </nav>

            <div className="p-3 border-t border-white/5 bg-black/20 min-w-[272px] flex flex-col gap-1">
              <Button
                variant="ghost"
                onClick={() => {
                  setActiveTab('settings')
                  setActiveSection('settings')
                  setIsSidebarOpen(false)
                }}
                className={`w-full justify-start h-11 px-4 rounded-xl transition-all group relative overflow-hidden ${activeTab === 'settings'
                  ? 'bg-gradient-to-r from-amber-500/10 to-transparent text-amber-500 font-medium'
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.03]'
                  }`}
              >
                {activeTab === 'settings' && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.8)]" />
                )}
                <Gear size={20} weight={activeTab === 'settings' ? 'fill' : 'regular'} className={`mr-3 transition-colors flex-shrink-0 ${activeTab === 'settings' ? 'text-amber-500' : 'text-zinc-600 group-hover:text-zinc-400'}`} />
                <span className="text-sm tracking-wide">Impostazioni</span>
              </Button>
              <Button
                variant="ghost"
                onClick={onLogout}
                className="w-full justify-start h-11 px-4 rounded-xl text-zinc-500 hover:text-red-400 hover:bg-red-500/5 transition-all border border-transparent hover:border-red-500/10 group"
              >
                <SignOut size={20} weight="regular" className="mr-3 group-hover:text-red-400 transition-colors flex-shrink-0" />
                <span className="text-sm tracking-wide">Esci</span>
              </Button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 scroll-smooth scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
          {/* Inline sidebar toggle — never overlaps content */}
          <AnimatePresence>
            {!isSidebarOpen && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="mb-4 sticky top-0 z-[60] pb-4 pt-4 -mt-4 -translate-y-px"
              >
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className="flex items-center gap-3 px-4 py-3 bg-zinc-950 border border-white/10 rounded-xl text-zinc-300 hover:text-amber-500 hover:border-amber-500/30 hover:bg-zinc-900 transition-all shadow-lg shadow-black/20"
                  title="Apri Menu Navigazione"
                >
                  <CaretRight size={20} weight="bold" className="transform rotate-180" />
                  <span className="text-sm font-semibold tracking-wide">Indietro</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8 animate-in fade-in-30 duration-500">
            {/* Orders Tab */}
            <TabsContent value="orders" className="space-y-6">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4 pb-4 border-b border-white/10">
                <div>
                  <h2 className="text-2xl font-light text-white tracking-tight">Gestione <span className="font-bold text-amber-500">Ordini</span></h2>
                  <p className="text-sm text-zinc-400 mt-1 uppercase tracking-wider font-medium">Gestisci gli ordini in tempo reale</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex bg-black/60 p-1.5 rounded-2xl mr-2 border border-white/5 shadow-2xl shadow-black/80 backdrop-blur-3xl">
                    <Button
                      variant={kitchenViewMode === 'table' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setKitchenViewMode('table')}
                      className={`h-9 px-4 text-xs font-bold rounded-xl transition-all duration-300 ${kitchenViewMode === 'table' ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                      Tavoli
                    </Button>
                    <Button
                      variant={kitchenViewMode === 'dish' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setKitchenViewMode('dish')}
                      className={`h-9 px-4 text-xs font-bold rounded-xl transition-all duration-300 ${kitchenViewMode === 'dish' ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                      Piatti
                    </Button>
                  </div>

                  {/* Category Filter */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant={selectedKitchenCategories.length > 0 ? "default" : "outline"} size="sm" className="mr-2 h-10 border-white/10 bg-black/40 hover:bg-zinc-900/60 backdrop-blur-sm text-zinc-300">
                        <Funnel size={16} className={`mr-2 ${selectedKitchenCategories.length > 0 ? 'text-amber-500' : ''}`} />
                        Filtra
                        {selectedKitchenCategories.length > 0 && (
                          <span className="ml-1.5 rounded-full bg-amber-500 text-black font-bold w-4 h-4 text-[10px] flex items-center justify-center">
                            {selectedKitchenCategories.length}
                          </span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-0 bg-zinc-950 border-zinc-800 text-zinc-100 shadow-xl" align="start">
                      <div className="p-2 border-b border-white/10">
                        <h4 className="font-medium text-xs text-zinc-500 uppercase tracking-wider">Seleziona Categorie</h4>
                      </div>
                      <div className="p-2 max-h-64 overflow-y-auto space-y-1">
                        {categories?.map(cat => (
                          <div key={cat.id} className="flex items-center space-x-2 p-2 hover:bg-white/5 rounded-lg cursor-pointer transition-colors"
                            onClick={() => {
                              setSelectedKitchenCategories(prev =>
                                prev.includes(cat.id)
                                  ? prev.filter(id => id !== cat.id)
                                  : [...prev, cat.id]
                              )
                            }}
                          >
                            <div className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-colors ${selectedKitchenCategories.includes(cat.id) ? 'bg-amber-500 border-amber-500 text-black' : 'border-zinc-700 bg-black/40'}`}>
                              {selectedKitchenCategories.includes(cat.id) && <Check size={10} weight="bold" />}
                            </div>
                            <span className="text-sm text-zinc-300">{cat.name}</span>
                          </div>
                        ))}
                      </div>
                      {selectedKitchenCategories.length > 0 && (
                        <div className="p-2 border-t border-white/10">
                          <Button variant="ghost" size="sm" className="w-full h-8 text-xs text-zinc-400 hover:text-white" onClick={() => setSelectedKitchenCategories([])}>
                            Resetta Filtri
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>

                  <div className="flex items-center gap-1 bg-black/50 p-1 rounded-xl mr-2 border border-white/10 backdrop-blur-sm">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setKitchenZoom(prev => Math.max(0.2, Math.round((prev - 0.1) * 10) / 10))}
                      className="h-8 w-8 p-0 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg"
                    >
                      <Minus size={14} />
                    </Button>
                    <span className="w-10 text-center text-xs font-bold font-mono text-zinc-500">{Math.round(kitchenZoom * 100)}%</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setKitchenZoom(prev => Math.min(3.0, Math.round((prev + 0.1) * 10) / 10))}
                      className="h-8 w-8 p-0 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg"
                    >
                      <Plus size={14} />
                    </Button>
                  </div>



                  <Select value={orderSortMode} onValueChange={(value: 'oldest' | 'newest') => setOrderSortMode(value)}>
                    <SelectTrigger className="w-[140px] h-10 bg-black/60 border-white/5 text-zinc-300 shadow-2xl shadow-black/80 rounded-xl backdrop-blur-3xl focus:ring-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-950 border-zinc-900 text-zinc-100 rounded-xl">
                      <SelectItem value="oldest">Meno recenti</SelectItem>
                      <SelectItem value="newest">Più recenti</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button
                    variant={showOrderHistory ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowOrderHistory(!showOrderHistory)}
                    className={`ml-2 h-10 border-white/10 bg-black/40 hover:bg-zinc-900/60 transition-all ${showOrderHistory ? 'border-amber-500/50 text-amber-500' : 'text-zinc-300'}`}
                  >
                    <ClockCounterClockwise size={16} className="mr-2" />
                    Storico
                  </Button>
                </div>
              </div>

              {
                showOrderHistory ? (
                  <div className="space-y-4">
                    <h3 className="text-lg font-light text-zinc-400 mb-4">Storico Ordini Completati</h3>
                    {restaurantCompletedOrders.length === 0 ? (
                      <div className="text-center py-10 text-zinc-600 bg-zinc-900/20 rounded-2xl border border-white/5 border-dashed">
                        Nessun ordine completato
                      </div>
                    ) : (
                      <div className="grid gap-4">
                        {restaurantCompletedOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(order => (
                          <Card key={order.id} className="bg-zinc-900/50 border-white/5 shadow-none hover:border-amber-500/20 transition-colors">
                            <CardHeader className="p-4 pb-2">
                              <div className="flex justify-between items-center">
                                <CardTitle className="text-base text-zinc-200">Ordine #{order.id.slice(0, 8)}</CardTitle>
                                <Badge variant="outline" className="border-white/10 text-zinc-500">{new Date(order.created_at).toLocaleString()}</Badge>
                              </div>
                              <CardDescription className="text-zinc-500">{restaurantTables.find(t => t.id === getTableIdFromOrder(order))?.number || 'N/D'}</CardDescription>
                            </CardHeader>
                            <CardContent className="p-4 pt-2">
                              <div className="space-y-2">
                                {order.items?.map(item => (
                                  <div key={item.id} className="flex justify-between text-sm text-zinc-400">
                                    <span>{item.quantity}x {restaurantDishes.find(d => d.id === item.dish_id)?.name}</span>
                                    <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-0">Completato</Badge>
                                  </div>
                                ))}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )
                    }
                  </div>
                ) : filteredOrders.length === 0 ? (
                  <div className="col-span-full text-center py-24 flex flex-col items-center justify-center">
                    <div className="w-20 h-20 rounded-full bg-zinc-900/50 border border-white/5 flex items-center justify-center mb-6 shadow-inner">
                      <Clock size={40} className="text-zinc-700" weight="duotone" />
                    </div>
                    <p className="text-xl font-light text-zinc-500">Nessun ordine attivo</p>
                    <p className="text-xs text-zinc-700 mt-2 uppercase tracking-wide">In attesa di nuovi ordini dalla sala...</p>
                  </div>
                ) : (
                  <KitchenView
                    orders={filteredOrders}
                    tables={tables || []}
                    dishes={dishes || []}
                    selectedCategoryIds={selectedKitchenCategories}
                    viewMode={kitchenViewMode}
                    // columns={kitchenColumns} // Removed in favor of responsive grid
                    onCompleteDish={handleCompleteDish}
                    onCompleteOrder={handleCompleteOrder}
                    sessions={sessions || []}
                    zoom={kitchenZoom}
                  />
                )}
            </TabsContent >

            {/* Tables Tab */}
            <TabsContent value="tables" className="space-y-6">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4 pb-4 border-b border-white/10">
                <div>
                  <h2 className="text-2xl font-light text-white tracking-tight">Gestione <span className="font-bold text-amber-500">Tavoli</span></h2>
                  <p className="text-sm text-zinc-400 mt-1 uppercase tracking-wider font-medium">Gestisci la sala e i tavoli</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                    <Input
                      placeholder="Cerca tavolo..."
                      value={tableSearchTerm}
                      onChange={(e) => setTableSearchTerm(e.target.value)}
                      className="pl-9 h-10 w-[180px] lg:w-[230px] bg-background/50 backdrop-blur-sm"
                    />
                  </div>
                  <Button onClick={() => setShowCreateTableDialog(true)} size="sm" className="h-10 shadow-sm hover:shadow-md transition-shadow">
                    <Plus size={16} className="mr-2" />
                    Nuovo Tavolo
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 shadow-sm hover:shadow-md transition-shadow border-dashed border-zinc-700 hover:border-amber-500 hover:text-amber-500"
                    onClick={async () => {
                      const toastId = toast.loading('Generazione PDF Griglia Tavoli...')
                      try {
                        const element = document.getElementById('tables-grid-print-view')
                        if (element) {
                          element.style.display = 'block'
                          await generatePdfFromElement('tables-grid-print-view', {
                            fileName: `Tavoli_Griglia_${restaurantSlug}.pdf`,
                            scale: 2,
                            backgroundColor: '#FFFFFF',
                            orientation: 'portrait'
                          })
                          element.style.display = 'none'
                          toast.success('PDF scaricato!')
                        }
                      } catch (e) {
                        console.error(e)
                        toast.error('Errore generazione PDF')
                      } finally {
                        toast.dismiss(toastId)
                      }
                    }}
                  >
                    <DownloadSimple size={16} className="mr-2" />
                    Scarica PDF QR
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-10 shadow-sm hover:shadow-md transition-shadow bg-muted/50 border-white/10 hover:border-amber-500/50 hover:text-amber-500">
                        <SlidersHorizontal size={16} className="mr-2" />
                        Vista & Ordine
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[240px] bg-zinc-950 border-zinc-900 text-zinc-100 p-2 shadow-xl rounded-xl">
                      <div className="px-2 py-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                        Ordina Tavoli
                      </div>
                      <div className="grid grid-cols-3 gap-1 mb-3 bg-zinc-900/50 p-1 rounded-lg border border-white/5">
                        <Button
                          variant={tableSortMode === 'number' ? 'default' : 'ghost'}
                          size="sm"
                          onClick={() => setTableSortMode('number')}
                          className={`h-8 text-[11px] font-bold px-0 w-full rounded-md ${tableSortMode === 'number' ? 'bg-amber-500 text-black shadow-sm' : 'text-zinc-400 hover:text-white'}`}
                        >
                          A-Z
                        </Button>
                        <Button
                          variant={tableSortMode === 'seats' ? 'default' : 'ghost'}
                          size="sm"
                          onClick={() => setTableSortMode('seats')}
                          className={`h-8 text-[11px] font-bold px-0 w-full rounded-md ${tableSortMode === 'seats' ? 'bg-amber-500 text-black shadow-sm' : 'text-zinc-400 hover:text-white'}`}
                        >
                          Posti
                        </Button>
                        <Button
                          variant={tableSortMode === 'status' ? 'default' : 'ghost'}
                          size="sm"
                          onClick={() => setTableSortMode('status')}
                          className={`h-8 text-[11px] font-bold px-0 w-full rounded-md ${tableSortMode === 'status' ? 'bg-amber-500 text-black shadow-sm' : 'text-zinc-400 hover:text-white'}`}
                        >
                          Stato
                        </Button>
                      </div>

                      <DropdownMenuSeparator className="bg-white/10" />

                      <div className="px-2 py-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider mt-1 mb-1 flex justify-between items-center">
                        <span>Zoom Griglia</span>
                        <span className="text-amber-500 font-mono bg-amber-500/10 px-1.5 py-0.5 rounded text-[10px]">{Math.round(tableZoom * 100)}%</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 p-1 bg-zinc-900/50 rounded-lg border border-white/5">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.preventDefault(); setTableZoom(prev => Math.max(0.2, Math.round((prev - 0.1) * 10) / 10)) }}
                          className="h-8 w-12 hover:bg-white/10 text-zinc-400 rounded-md shrink-0"
                        >
                          <Minus size={14} />
                        </Button>
                        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden relative">
                          <div className="absolute left-0 top-0 bottom-0 bg-amber-500" style={{ width: `${((Math.round(tableZoom * 10) - 2) / 28) * 100}%` }} />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.preventDefault(); setTableZoom(prev => Math.min(3.0, Math.round((prev + 0.1) * 10) / 10)) }}
                          className="h-8 w-12 hover:bg-white/10 text-zinc-400 rounded-md shrink-0"
                        >
                          <Plus size={14} />
                        </Button>
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Dialog>
                    <DialogTrigger asChild>
                      <Button type="button" variant="outline" size="sm" className="h-10 shadow-sm hover:shadow-md transition-shadow">
                        <ClockCounterClockwise size={16} className="mr-2" />
                        Storico
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col bg-zinc-950 border-zinc-800 text-zinc-100">
                      <DialogHeader>
                        <DialogTitle>Storico Tavoli Chiusi</DialogTitle>
                        <DialogDescription className="text-zinc-400">Visualizza le sessioni dei tavoli concluse con dettagli e incassi.</DialogDescription>
                      </DialogHeader>
                      <div className="flex flex-wrap gap-3 py-3 border-b">
                        <div className="relative flex-1 min-w-[200px]">
                          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                          <Input
                            placeholder="Cerca per tavolo, PIN..."
                            value={tableHistorySearch}
                            onChange={(e) => setTableHistorySearch(e.target.value)}
                            className="pl-9 h-9"
                          />
                        </div>
                        <Select value={tableHistoryDateFilter} onValueChange={(v: any) => setTableHistoryDateFilter(v)}>
                          <SelectTrigger className="w-[150px] h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="today">Oggi</SelectItem>
                            <SelectItem value="week">Ultima settimana</SelectItem>
                            <SelectItem value="month">Ultimo mese</SelectItem>
                            <SelectItem value="all">Tutto</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          placeholder="€ minimo"
                          value={tableHistoryMinTotal}
                          onChange={(e) => setTableHistoryMinTotal(e.target.value)}
                          className="w-[120px] h-9"
                        />
                        <Input
                          type="number"
                          placeholder="Coperti min"
                          value={tableHistoryMinCovers}
                          onChange={(e) => setTableHistoryMinCovers(e.target.value)}
                          className="w-[120px] h-9"
                        />
                        <Select value={tableHistorySort} onValueChange={(v: any) => setTableHistorySort(v)}>
                          <SelectTrigger className="w-[170px] h-9">
                            <SelectValue placeholder="Ordina per" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="recent">Più recenti</SelectItem>
                            <SelectItem value="amount">Incasso</SelectItem>
                            <SelectItem value="duration">Durata</SelectItem>
                            <SelectItem value="covers">Coperti</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1 overflow-y-auto py-4 space-y-3">
                        {(() => {
                          const now = new Date()
                          const closedSessions = sessions
                            .filter(s => s.status === 'CLOSED' && s.restaurant_id === restaurantId)
                            .filter(s => {
                              const sessionDate = new Date(s.created_at)
                              if (tableHistoryDateFilter === 'today') {
                                return sessionDate.toDateString() === now.toDateString()
                              } else if (tableHistoryDateFilter === 'week') {
                                const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
                                return sessionDate >= weekAgo
                              } else if (tableHistoryDateFilter === 'month') {
                                const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
                                return sessionDate >= monthAgo
                              }
                              return true
                            })
                            .filter(s => {
                              if (!tableHistorySearch) return true
                              const table = restaurantTables.find(t => t.id === s.table_id)
                              const searchLower = tableHistorySearch.toLowerCase()
                              return (
                                table?.number?.toLowerCase().includes(searchLower) ||
                                s.session_pin?.toLowerCase().includes(searchLower)
                              )
                            })
                            .map(session => {
                              const table = restaurantTables.find(t => t.id === session.table_id)
                              const sessionOrders = pastOrders.filter(o => o.table_session_id === session.id)
                              const totalAmount = sessionOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0)
                              const totalItems = sessionOrders.reduce((sum, o) => sum + (o.items?.length || 0), 0)
                              const openDate = new Date(session.created_at)
                              const closeDate = session.closed_at ? new Date(session.closed_at) : null
                              const duration = closeDate ? Math.round((closeDate.getTime() - openDate.getTime()) / (1000 * 60)) : 0

                              return { session, table, sessionOrders, totalAmount, totalItems, openDate, closeDate, duration }
                            })
                            .filter(summary => {
                              const minTotal = parseFloat(tableHistoryMinTotal || '0')
                              const minCovers = parseInt(tableHistoryMinCovers || '0')
                              const coversOk = minCovers ? (summary.session.customer_count || 0) >= minCovers : true
                              const totalOk = minTotal ? summary.totalAmount >= minTotal : true
                              return coversOk && totalOk
                            })
                            .sort((a, b) => {
                              if (tableHistorySort === 'amount') return b.totalAmount - a.totalAmount
                              if (tableHistorySort === 'duration') return (b.duration || 0) - (a.duration || 0)
                              if (tableHistorySort === 'covers') return (b.session.customer_count || 0) - (a.session.customer_count || 0)
                              return new Date(b.session.closed_at || b.session.created_at).getTime() - new Date(a.session.closed_at || a.session.created_at).getTime()
                            })

                          if (closedSessions.length === 0) {
                            return (
                              <div className="text-center py-12 text-muted-foreground">
                                <ClockCounterClockwise size={48} className="mx-auto mb-4 opacity-30" />
                                <p className="font-medium">Nessuna sessione trovata</p>
                                <p className="text-sm">Prova a modificare i filtri di ricerca</p>
                              </div>
                            )
                          }

                          return closedSessions.map(({ session, table, sessionOrders, totalAmount, totalItems, openDate, closeDate, duration }) => {
                            return (
                              <div key={session.id} className="p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors border border-border/50">
                                <div className="flex items-start justify-between gap-4 flex-wrap">
                                  <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
                                      <span className="text-lg font-bold text-primary">{table?.number || '?'}</span>
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="font-bold text-zinc-100">Tavolo {table?.number}</span>
                                        <Badge variant="outline" className="text-[10px] font-mono border-zinc-700 text-zinc-400">{session.session_pin}</Badge>
                                      </div>
                                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                        <span className="flex items-center gap-1">
                                          <Calendar size={12} />
                                          {openDate.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </span>
                                        <span className="flex items-center gap-1">
                                          <Clock size={12} />
                                          {openDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                                          {closeDate && ` - ${closeDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`}
                                        </span>
                                        {duration > 0 && <span>({duration} min)</span>}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-6">
                                    <div className="text-center">
                                      <p className="text-xs text-muted-foreground">Coperti</p>
                                      <p className="font-bold text-lg">{session.customer_count || '-'}</p>
                                    </div>
                                    <div className="text-center">
                                      <p className="text-xs text-muted-foreground">Ordini</p>
                                      <p className="font-bold text-lg">{sessionOrders.length}</p>
                                    </div>
                                    <div className="text-center">
                                      <p className="text-xs text-muted-foreground">Piatti</p>
                                      <p className="font-bold text-lg">{totalItems}</p>
                                    </div>
                                    <div className="text-center min-w-[80px]">
                                      <p className="text-xs text-muted-foreground">Totale</p>
                                      <p className="font-bold text-lg text-amber-500">€{totalAmount.toFixed(2)}</p>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                                    <span className="px-2 py-1 bg-background/50 rounded-md border border-border/50">€{session.customer_count ? (totalAmount / session.customer_count).toFixed(2) : '0.00'} a coperto</span>
                                    {duration > 0 && <span className="px-2 py-1 bg-background/50 rounded-md border border-border/50">Durata {duration} min</span>}
                                    <span className="px-2 py-1 bg-background/50 rounded-md border border-border/50">{totalItems} piatti totali</span>
                                    {sessionOrders.length > 0 && <span className="px-2 py-1 bg-background/50 rounded-md border border-border/50">~{Math.round(duration / sessionOrders.length || 0)} min/ordine</span>}
                                  </div>
                                </div>
                              </div>
                            )
                          })
                        })()}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              {/* Room Filters & Management */}
              <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
                <Button
                  variant={selectedRoomFilter === 'all' ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedRoomFilter('all')}
                  className="rounded-full"
                >
                  Tutte
                </Button>
                {rooms?.filter(r => r.is_active !== false).map(room => (
                  <Button
                    key={room.id}
                    variant={selectedRoomFilter === room.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedRoomFilter(room.id)}
                    className="rounded-full whitespace-nowrap"
                  >
                    {room.name}
                  </Button>
                ))}

                <Separator orientation="vertical" className="h-6 mx-2" />

                <Dialog open={showRoomDialog} onOpenChange={setShowRoomDialog}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors">
                      <MapPin size={16} />
                      Gestisci Sale
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100">
                    <DialogHeader>
                      <DialogTitle>Gestione Sale</DialogTitle>
                      <DialogDescription className="text-zinc-400">Crea e organizza le aree del tuo ristorante</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <Button
                        onClick={() => {
                          setNewRoomName('')
                          setNewRoomSelectedTables([])
                          setShowAddRoomDialog(true)
                        }}
                        className="w-full bg-amber-600 hover:bg-amber-700 text-white gap-2"
                      >
                        <Plus size={16} />
                        Aggiungi Sala
                      </Button>

                      <div className="space-y-2 mt-4">
                        {rooms?.filter(r => r.is_active !== false).map(room => (
                          <div key={room.id} className="flex items-center justify-between p-3 bg-zinc-900/50 rounded-lg border border-zinc-800">
                            {editingRoom?.id === room.id ? (
                              <div className="flex items-center gap-2 flex-1 mr-2">
                                <Input
                                  value={editingRoom.name}
                                  onChange={(e) => setEditingRoom({ ...editingRoom, name: e.target.value })}
                                  className="h-8 bg-black/50 border-zinc-700"
                                  autoFocus
                                />
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                                  onClick={async () => {
                                    if (!editingRoom.name.trim()) return
                                    try {
                                      await DatabaseService.updateRoom(room.id, { name: editingRoom.name.trim() })
                                      toast.success('Sala aggiornata')
                                      setEditingRoom(null)
                                      refreshRooms()
                                    } catch (e) {
                                      console.error(e)
                                      toast.error('Errore aggiornamento')
                                    }
                                  }}
                                >
                                  <Check size={16} weight="bold" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-zinc-500 hover:text-zinc-300"
                                  onClick={() => setEditingRoom(null)}
                                >
                                  <X size={16} />
                                </Button>
                              </div>
                            ) : (
                              <>
                                <span className="font-medium">{room.name}</span>
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-zinc-500 hover:text-amber-500 hover:bg-amber-500/10"
                                    onClick={() => setEditingRoom(room)}
                                  >
                                    <PencilSimple size={16} />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-zinc-500 hover:text-red-500 hover:bg-red-500/10"
                                    onClick={async () => {
                                      if (!confirm('Eliminare questa sala?')) return;
                                      try {
                                        await DatabaseService.deleteRoom(room.id)
                                        toast.success('Sala eliminata')
                                        refreshRooms()
                                      } catch (e) {
                                        toast.error('Impossibile eliminare')
                                      }
                                    }}
                                  >
                                    <Trash size={16} />
                                  </Button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                        {rooms?.filter(r => r.is_active !== false).length === 0 && <p className="text-center text-sm text-zinc-500 py-4">Nessuna sala configurata</p>}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Add Room Dialog */}
                <Dialog open={showAddRoomDialog} onOpenChange={setShowAddRoomDialog}>
                  <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100 max-h-[85vh] flex flex-col">
                    <DialogHeader>
                      <DialogTitle>Nuova Sala</DialogTitle>
                      <DialogDescription className="text-zinc-400">Inserisci il nome e seleziona i tavoli da assegnare</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-2 flex-1 overflow-hidden flex flex-col">
                      <Input
                        placeholder="Nome sala (es. Dehor, Interna...)"
                        value={newRoomName}
                        onChange={(e) => setNewRoomName(e.target.value)}
                        className="bg-zinc-900 border-zinc-800 focus:border-amber-500"
                        autoFocus
                      />
                      <div className="flex-1 overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm text-zinc-400 font-medium">Tavoli da assegnare</p>
                          <span className="text-xs text-zinc-500">{newRoomSelectedTables.length} selezionati</span>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-1 pr-1 max-h-[40vh]">
                          {restaurantTables
                            .filter(t => t.is_active !== false)
                            .sort((a, b) => {
                              const numA = parseInt(a.number?.replace(/\D/g, '') || '0')
                              const numB = parseInt(b.number?.replace(/\D/g, '') || '0')
                              if (numA !== numB) return numA - numB
                              return (a.number || '').localeCompare(b.number || '')
                            })
                            .map(table => {
                              const currentRoom = rooms?.find(r => r.id === table.room_id)
                              return (
                                <label
                                  key={table.id}
                                  className="flex items-center gap-3 p-2.5 rounded-lg bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-colors"
                                >
                                  <Checkbox
                                    checked={newRoomSelectedTables.includes(table.id)}
                                    onCheckedChange={(checked) => {
                                      setNewRoomSelectedTables(prev =>
                                        checked
                                          ? [...prev, table.id]
                                          : prev.filter(id => id !== table.id)
                                      )
                                    }}
                                    className="border-zinc-600 data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600"
                                  />
                                  <div className="flex items-center justify-between flex-1 min-w-0">
                                    <span className="font-medium text-sm">{table.number}</span>
                                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                                      {table.seats && <span>{table.seats} posti</span>}
                                      {currentRoom && <span className="text-amber-500/70">{currentRoom.name}</span>}
                                    </div>
                                  </div>
                                </label>
                              )
                            })}
                          {restaurantTables.filter(t => t.is_active !== false).length === 0 && (
                            <p className="text-center text-sm text-zinc-500 py-4">Nessun tavolo disponibile</p>
                          )}
                        </div>
                      </div>
                      <Button
                        onClick={async () => {
                          if (!newRoomName.trim()) {
                            toast.error('Inserisci un nome per la sala')
                            return
                          }
                          if (!restaurantId) {
                            toast.error('ID ristorante mancante')
                            return
                          }
                          try {
                            const { data: newRoom, error } = await supabase.from('rooms').insert({
                              restaurant_id: restaurantId,
                              name: newRoomName.trim(),
                              is_active: true
                            }).select().single()
                            if (error) {
                              console.error('Room creation error:', error)
                              toast.error(`Errore: ${error.message}`)
                              return
                            }
                            // Assign selected tables to the new room
                            if (newRoomSelectedTables.length > 0 && newRoom) {
                              const { error: updateError } = await supabase
                                .from('tables')
                                .update({ room_id: newRoom.id })
                                .in('id', newRoomSelectedTables)
                              if (updateError) {
                                console.error('Table assignment error:', updateError)
                                toast.error('Sala creata, ma errore nell\'assegnazione tavoli')
                              }
                              // Update local table state
                              setTables(prev => prev.map(t =>
                                newRoomSelectedTables.includes(t.id)
                                  ? { ...t, room_id: newRoom.id }
                                  : t
                              ))
                            }
                            setNewRoomName('')
                            setNewRoomSelectedTables([])
                            setShowAddRoomDialog(false)
                            toast.success('Sala creata!')
                            refreshRooms()
                          } catch (e: any) {
                            console.error('Room creation exception:', e)
                            toast.error(`Errore: ${e?.message || 'Sconosciuto'}`)
                          }
                        }}
                        className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                        disabled={!newRoomName.trim()}
                      >
                        Crea Sala
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div
                className="origin-top-left transition-all duration-200"
                style={{
                  transform: `scale(${tableZoom})`,
                  transformOrigin: 'top left',
                  width: `${100 / tableZoom}%`
                }}
              >
                <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
                  {restaurantTables
                    // Search filter
                    .filter(t => !tableSearchTerm || t.number?.toLowerCase().includes(tableSearchTerm.toLowerCase()))
                    // Room filter
                    .filter(t => selectedRoomFilter === 'all' || t.room_id === selectedRoomFilter)
                    // Sorting
                    .sort((a, b) => {
                      if (tableSortMode === 'number') {
                        // Sort by number/name
                        const numA = parseInt(a.number?.replace(/\D/g, '') || '0')
                        const numB = parseInt(b.number?.replace(/\D/g, '') || '0')
                        if (numA !== numB) return numA - numB
                        return (a.number || '').localeCompare(b.number || '')
                      } else if (tableSortMode === 'seats') {
                        // Sort by capacity
                        return (b.seats || 0) - (a.seats || 0)
                      } else if (tableSortMode === 'status') {
                        // Sort by active status (active first)
                        const sessionA = sessions?.find(s => s.table_id === a.id && s.status === 'OPEN')
                        const sessionB = sessions?.find(s => s.table_id === b.id && s.status === 'OPEN')
                        const isActiveA = sessionA ? 1 : 0
                        const isActiveB = sessionB ? 1 : 0
                        return isActiveB - isActiveA
                      }
                      return 0
                    })
                    .map(table => {
                      const isTableMarkedInactive = table.is_active === false
                      const session = getOpenSessionForTable(table.id)
                      const isActive = session?.status === 'OPEN'
                      const activeOrder = restaurantOrders.find(o => getTableIdFromOrder(o) === table.id)

                      return (
                        <Card
                          key={table.id}
                          className={`relative overflow-hidden transition-all duration-300 group cursor-pointer ${isTableMarkedInactive
                            ? 'opacity-60 grayscale'
                            : (() => {
                              const status = getDetailedTableStatus(table.id)
                              if (status === 'free') return 'bg-black/40 border-emerald-500/20 shadow-[0_0_15px_-5px_rgba(16,185,129,0.1)] hover:border-emerald-500/40' // Green (Free)
                              if (status === 'waiting') return 'bg-red-900/20 border-red-500/50 shadow-[0_0_15px_-5px_rgba(239,68,68,0.3)]' // Red (Waiting for food)
                              return 'bg-amber-900/20 border-amber-500/50 shadow-[0_0_15px_-5px_rgba(245,158,11,0.3)]' // Yellow (Eating)
                            })()
                            }`}
                          onClick={() => {
                            if (isTableMarkedInactive) {
                              handleEditTable(table)
                              return
                            }
                            if (isActive) {
                              // For active tables: show management dialog instead of deactivating
                              setSelectedTableForActions(table)
                              setShowTableBillDialog(true)
                            } else {
                              // For free tables: activate them
                              handleToggleTable(table.id)
                            }
                          }}
                        >
                          {isTableMarkedInactive && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
                              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 -rotate-12 border-2 border-white/20 px-3 py-1 rounded">Disattivato</span>
                            </div>
                          )}
                          {isActive && (
                            <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/10 blur-xl rounded-full -mr-8 -mt-8 pointer-events-none"></div>
                          )}
                          {!isActive && (
                            <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 blur-xl rounded-full -mr-8 -mt-8 pointer-events-none"></div>
                          )}
                          <CardContent className="p-0 flex flex-col h-full">
                            <div className="p-4 flex flex-wrap items-center justify-between gap-2 border-b border-white/5">
                              <div className="flex items-center gap-3">
                                <span className={`text-2xl font-bold tracking-tight whitespace-nowrap ${isActive ? 'text-amber-500' : 'text-zinc-100'}`}>
                                  {table.number}
                                </span>
                                <div className="flex items-center gap-1.5 text-zinc-400 bg-white/5 px-3 py-1 rounded-full">
                                  <Users size={16} weight="bold" />
                                  <span className="text-sm font-bold">{table.seats || 4}</span>
                                </div>
                              </div>
                              <Badge
                                variant={isActive ? 'default' : 'outline'}
                                className={isActive ? 'bg-amber-500 text-black border-none font-bold' : 'bg-transparent text-zinc-500 border-zinc-700'}
                              >
                                {isActive ? 'Occupato' : 'Libero'}
                              </Badge>
                            </div>

                            <div className="flex-1 p-5 flex flex-col items-center justify-center gap-3">
                              {isActive ? (
                                <>
                                  <div className="text-center">
                                    <p className="text-[9px] text-amber-500/70 mb-1 uppercase tracking-[0.2em] font-semibold">PIN</p>
                                    <div className="bg-black/40 px-6 py-3 rounded-xl border border-amber-500/20 shadow-inner min-w-[120px]">
                                      <span className="text-4xl font-mono font-bold tracking-widest text-amber-500 whitespace-nowrap">
                                        {session?.session_pin || '...'}
                                      </span>
                                    </div>
                                  </div>
                                  {activeOrder && (
                                    <Badge variant="outline" className="text-[10px] bg-black/40 border-amber-500/30 text-amber-200">
                                      <CheckCircle size={10} className="mr-1" weight="fill" />
                                      {activeOrder.items?.filter(i => i.status === 'SERVED').length || 0} completati
                                    </Badge>
                                  )}
                                </>
                              ) : (
                                <div className="text-center text-zinc-700 group-hover:text-zinc-500 transition-all duration-300">
                                  <ForkKnife size={32} className="mx-auto mb-1" weight="duotone" />
                                  <p className="text-xs font-medium">Clicca per Ordinare</p>
                                </div>
                              )}
                            </div>

                            <div className="p-3 bg-gradient-to-t from-muted/10 to-transparent border-t border-border/5 grid gap-2">
                              {isActive ? (
                                <div className="grid grid-cols-2 gap-2">
                                  <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleShowTableQr(table); }} className="shadow-sm hover:shadow transition-shadow h-8 text-xs">
                                    <QrCode size={14} className="mr-1.5" />
                                    QR
                                  </Button>
                                  <Button
                                    className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground hover:from-primary/90 hover:to-primary/70 shadow-sm hover:shadow transition-all h-8 text-xs"
                                    size="sm"
                                    onClick={(e) => { e.stopPropagation(); setSelectedTableForActions(table); setShowTableBillDialog(true); }}
                                  >
                                    <Receipt size={14} className="mr-1.5" />
                                    Conto
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  className="w-full shadow-sm hover:shadow transition-shadow h-8 text-xs"
                                  size="sm"
                                  onClick={(e) => { e.stopPropagation(); handleToggleTable(table.id); }}
                                >
                                  <Plus size={14} className="mr-1.5" />
                                  Attiva
                                </Button>
                              )}
                            </div>

                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-background/90 backdrop-blur-md p-1 rounded-lg border border-border/30 shadow-lg">
                              <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-muted" onClick={(e) => { e.stopPropagation(); handleEditTable(table); }}>
                                <PencilSimple size={12} />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); handleDeleteTable(table.id); }}>
                                <Trash size={12} />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>

                      )
                    })}
                </div>
              </div>
            </TabsContent >

            {/* Timeline Tab */}
            <TabsContent value="timeline" className="space-y-6">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4 pb-4 border-b border-white/10">
                <div>
                  <h2 className="text-2xl font-light text-white tracking-tight">Timeline <span className="font-bold text-amber-500">Prenotazioni</span></h2>
                  <p className="text-sm text-zinc-400 mt-1 uppercase tracking-wider font-medium">Gestisci le prenotazioni su linea temporale</p>
                </div>
              </div>

              <div className="bg-zinc-950/50 backdrop-blur-md rounded-2xl border border-white/[0.05] p-6">
                {(() => {
                  const serviceSegments: { label: string; start: string; end: string }[] = [];

                  if (weeklyServiceHours?.useWeeklySchedule && weeklyServiceHours.schedule) {
                    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                    const dayName = days[selectedDate.getDay()];
                    const daySchedule = weeklyServiceHours.schedule[dayName];

                    if (daySchedule) {
                      const lunch = daySchedule.lunch;
                      const dinner = daySchedule.dinner;
                      if (lunch?.enabled) {
                        serviceSegments.push({ label: 'Pranzo', start: lunch.start || lunchTimeStart || '12:00', end: lunch.end || '15:00' });
                      }
                      if (dinner?.enabled) {
                        serviceSegments.push({ label: 'Cena', start: dinner.start || dinnerTimeStart || '19:00', end: dinner.end || '23:00' });
                      }
                    }
                  }

                  // Fallback: single continuous range
                  if (serviceSegments.length === 0) {
                    serviceSegments.push({ label: 'Servizio', start: lunchTimeStart || '12:00', end: '23:00' });
                  }

                  const effOpen = serviceSegments[0].start;
                  const effClose = serviceSegments[serviceSegments.length - 1].end;

                  return (
                    <ReservationsManager
                      user={user}
                      restaurantId={restaurantId}
                      tables={tables || []}
                      rooms={rooms || []}
                      bookings={bookings || []}
                      selectedDate={selectedDate}
                      openingTime={effOpen}
                      closingTime={effClose}
                      serviceSegments={serviceSegments}
                      reservationDuration={reservationDuration}
                      onRefresh={refreshData}
                      onDateChange={setSelectedDate}
                    />
                  );
                })()}
              </div>
            </TabsContent>

            {/* Menu Tab */}
            <TabsContent value="menu" className="space-y-6">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4 pb-4 border-b border-white/10">
                <div>
                  <h2 className="text-2xl font-light text-white tracking-tight">Gestione <span className="font-bold text-amber-500">Menu</span></h2>
                  <p className="text-sm text-zinc-400 mt-1 uppercase tracking-wider font-medium">Gestisci piatti e categorie</p>
                </div>
                <div className="flex gap-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="border-dashed border-zinc-700 hover:border-amber-500 hover:bg-amber-500/10 hover:text-amber-500 text-zinc-400">
                        <Sparkle size={16} className="mr-2 text-amber-500" />
                        Menu Personalizzati
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-[92vw] w-full md:max-w-4xl h-[75vh] max-h-[80vh] p-0 overflow-hidden bg-zinc-950 border-zinc-800/60 text-zinc-100 flex flex-col rounded-2xl shadow-2xl shadow-black/60">
                      <VisuallyHidden>
                        <DialogTitle>Gestione Menu Personalizzati</DialogTitle>
                        <DialogDescription>Gestisci i menu personalizzati</DialogDescription>
                      </VisuallyHidden>
                      <CustomMenusManager
                        restaurantId={restaurantId || ''}
                        dishes={dishes || []}
                        categories={categories || []}
                        onDishesChange={refreshDishes}
                        onMenuDeactivated={() => {
                          // Suppress the scheduler until the END of the current meal service
                          const now = new Date()
                          const currentMinutes = now.getHours() * 60 + now.getMinutes()
                          const lunchMin = lunchTimeStart ? parseInt(lunchTimeStart.split(':')[0]) * 60 + parseInt(lunchTimeStart.split(':')[1]) : 0
                          const dinnerMin = dinnerTimeStart ? parseInt(dinnerTimeStart.split(':')[0]) * 60 + parseInt(dinnerTimeStart.split(':')[1]) : 0

                          // Calculate when the current meal service ends
                          let endMinutes: number
                          if (dinnerMin > 0 && currentMinutes >= dinnerMin) {
                            // Currently in dinner service → suppress until next day 06:00
                            endMinutes = 24 * 60 + 6 * 60 // next day 06:00
                          } else if (lunchMin > 0 && currentMinutes >= lunchMin && dinnerMin > 0) {
                            // Currently in lunch service → suppress until dinner starts
                            endMinutes = dinnerMin
                          } else if (lunchMin > 0 && currentMinutes >= lunchMin) {
                            // Only lunch configured → suppress until 18:00 or end of day
                            endMinutes = 18 * 60
                          } else {
                            // Outside service hours → suppress for 4 hours
                            endMinutes = currentMinutes + 4 * 60
                          }

                          // Convert endMinutes to an actual Date
                          const expiresAt = new Date(now)
                          if (endMinutes >= 24 * 60) {
                            // Next day
                            expiresAt.setDate(expiresAt.getDate() + 1)
                            expiresAt.setHours(Math.floor((endMinutes - 24 * 60) / 60), (endMinutes - 24 * 60) % 60, 0, 0)
                          } else {
                            expiresAt.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0)
                          }

                          localStorage.setItem('minthi_menu_suppressed', JSON.stringify({ expiresAt: expiresAt.toISOString() }))
                          // Also clear the lastScheduledMenuRef so it doesn't think it's already applied
                          lastScheduledMenuRef.current = { menuId: null, mealType: null, day: null }
                        }}
                      />
                    </DialogContent>
                  </Dialog>

                  <Dialog open={showExportMenuDialog} onOpenChange={setShowExportMenuDialog}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="border-zinc-700 hover:border-amber-500 hover:text-amber-500">
                        <DownloadSimple size={16} className="mr-2" />
                        Esporta Menu
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md bg-zinc-950 border-zinc-800 text-zinc-100">
                      <DialogHeader>
                        <DialogTitle>Esporta Menu PDF</DialogTitle>
                        <DialogDescription>
                          Scegli cosa includere nel menu da stampare.
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-6 py-4">
                        <RadioGroup value={exportMode} onValueChange={(v: 'full' | 'custom') => setExportMode(v)} className="grid grid-cols-2 gap-4">
                          <div>
                            <RadioGroupItem value="full" id="export-full" className="peer sr-only" />
                            <Label
                              htmlFor="export-full"
                              className="flex flex-col items-center justify-between rounded-xl border-2 border-zinc-800 bg-zinc-900/50 p-4 hover:bg-zinc-900 hover:text-zinc-100 peer-data-[state=checked]:border-amber-500 peer-data-[state=checked]:text-amber-500 cursor-pointer transition-all"
                            >
                              <BookOpen size={24} className="mb-2" />
                              <span className="font-semibold">Menu Completo</span>
                            </Label>
                          </div>
                          <div>
                            <RadioGroupItem value="custom" id="export-custom" className="peer sr-only" />
                            <Label
                              htmlFor="export-custom"
                              className="flex flex-col items-center justify-between rounded-xl border-2 border-zinc-800 bg-zinc-900/50 p-4 hover:bg-zinc-900 hover:text-zinc-100 peer-data-[state=checked]:border-amber-500 peer-data-[state=checked]:text-amber-500 cursor-pointer transition-all"
                            >
                              <Sparkle size={24} className="mb-2" />
                              <span className="font-semibold">Menu Personalizzato</span>
                            </Label>
                          </div>
                        </RadioGroup>

                        {exportMode === 'full' ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                              <span className="text-sm font-medium">Categorie Incluse</span>
                              <div className="flex gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-auto py-1 text-xs text-zinc-400 hover:text-zinc-200"
                                  onClick={() => setExportSelectedCategories([])}
                                >
                                  Deseleziona
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-auto py-1 text-xs text-amber-500"
                                  onClick={() => setExportSelectedCategories(categories.map(c => c.id))}
                                >
                                  Seleziona Tutte
                                </Button>
                              </div>
                            </div>
                            <ScrollArea className="h-[200px] pr-4">
                              <div className="space-y-2">
                                {restaurantCategories.map(cat => (
                                  <div key={cat.id} className="flex items-center space-x-2 p-2 rounded hover:bg-zinc-900/50">
                                    <Checkbox
                                      id={`cat-${cat.id}`}
                                      checked={exportSelectedCategories.includes(cat.id)}
                                      onCheckedChange={(checked) => {
                                        if (checked) {
                                          setExportSelectedCategories([...exportSelectedCategories, cat.id])
                                        } else {
                                          setExportSelectedCategories(exportSelectedCategories.filter(id => id !== cat.id))
                                        }
                                      }}
                                    />
                                    <Label htmlFor={`cat-${cat.id}`} className="flex-1 cursor-pointer font-normal text-zinc-300">
                                      {cat.name}
                                    </Label>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label>Seleziona Menu</Label>
                              <Select value={selectedCustomMenuId} onValueChange={setSelectedCustomMenuId}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Scegli un menu..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableCustomMenus.map(menu => (
                                    <SelectItem key={menu.id} value={menu.id}>
                                      {menu.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            {availableCustomMenus.length === 0 && (
                              <p className="text-sm text-yellow-500/80 bg-yellow-500/10 p-3 rounded-lg border border-yellow-500/20">
                                Non hai ancora creato menu personalizzati.
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="ghost" onClick={() => setShowExportMenuDialog(false)}>Annulla</Button>
                        <Button className="bg-amber-500 hover:bg-amber-600 text-black font-semibold" onClick={executeExport}>
                          Genera PDF
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Dialog open={isAddItemDialogOpen} onOpenChange={setIsAddItemDialogOpen}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus size={16} className="mr-2" />
                        Nuovo Piatto
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100">
                      {/* Dish Form Content */}
                      <DialogHeader>
                        <DialogTitle>Aggiungi Piatto</DialogTitle>
                        <DialogDescription>
                          Compila i dettagli del piatto.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 mt-4">
                        <div className="space-y-2">
                          <Label>Nome Piatto</Label>
                          <Input
                            value={newDish.name}
                            onChange={(e) => setNewDish({ ...newDish, name: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Descrizione</Label>
                          <Textarea
                            value={newDish.description}
                            onChange={(e) => setNewDish({ ...newDish, description: e.target.value })}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Prezzo (€)</Label>
                            <Input
                              type="number"
                              value={newDish.price}
                              onChange={(e) => setNewDish({ ...newDish, price: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Categoria</Label>
                            <Select
                              value={newDish.categoryId}
                              onValueChange={(value) => setNewDish({ ...newDish, categoryId: value })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Seleziona" />
                              </SelectTrigger>
                              <SelectContent>
                                {restaurantCategories.map(cat => (
                                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Foto Piatto</Label>
                          <Input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleImageChange(e)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Allergeni (separati da virgola)</Label>
                          <Input
                            value={allergenInput}
                            onChange={(e) => {
                              setAllergenInput(e.target.value)
                              setNewDish({ ...newDish, allergens: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })
                            }}
                            placeholder="Glutine, Lattosio, etc."
                          />
                        </div>
                        <div className="flex items-center space-x-2 pt-4">
                          <Switch
                            id="new_is_ayce"
                            checked={newDish.is_ayce}
                            onCheckedChange={(checked) => setNewDish({ ...newDish, is_ayce: checked })}
                          />
                          <Label htmlFor="new_is_ayce">Incluso in All You Can Eat</Label>
                        </div>
                        <Button onClick={handleCreateDish} className="w-full">Aggiungi Piatto</Button>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline">
                        <List size={16} className="mr-2" />
                        Categorie
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100">
                      <DialogHeader>
                        <DialogTitle>Gestione Categorie</DialogTitle>
                        <DialogDescription>
                          Trascina le categorie per riordinarle.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 mt-4">
                        <Button
                          className="w-full h-11 border-dashed border-zinc-700 hover:border-amber-500 hover:bg-amber-500/10 hover:text-amber-500 text-zinc-400 font-bold"
                          variant="outline"
                          onClick={() => { setNewCategory(''); setShowNewCategoryPopup(true); }}
                        >
                          <Plus size={16} className="mr-2" />
                          Nuova Categoria
                        </Button>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                          {restaurantCategories.map((cat, index) => (
                            <div
                              key={cat.id}
                              draggable
                              onDragStart={() => handleDragStart(cat)}
                              onDragOver={(e) => handleDragOver(e, cat)}
                              onDrop={() => handleDrop(cat)}
                              className={`flex items-center justify-between p-3 bg-card border border-border/50 rounded-xl shadow-sm hover:shadow-md transition-all group cursor-move ${draggedCategory?.id === cat.id ? 'opacity-50 border-primary' : ''}`}
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary cursor-grab">
                                  <DotsSixVertical size={16} weight="bold" />
                                </div>
                                <span className="font-medium">{cat.name}</span>
                              </div>
                              <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                <Button
                                  variant="secondary"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleEditCategory(cat)}
                                >
                                  <PencilSimple size={16} />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                  onClick={() => handleDeleteCategory(cat.id)}
                                >
                                  <Trash size={16} />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                  {/* New Category Popup */}
                  <Dialog open={showNewCategoryPopup} onOpenChange={setShowNewCategoryPopup}>
                    <DialogContent className="sm:max-w-sm bg-zinc-950 border-zinc-800 text-zinc-100 rounded-2xl">
                      <DialogHeader>
                        <DialogTitle className="text-lg">Nuova Categoria</DialogTitle>
                        <DialogDescription>Inserisci il nome della nuova categoria.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 mt-2">
                        <Input
                          placeholder="Nome categoria..."
                          value={newCategory}
                          onChange={(e) => setNewCategory(e.target.value)}
                          autoFocus
                          className="bg-zinc-900 border-zinc-700 focus:border-amber-500/50"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newCategory.trim()) {
                              handleCreateCategory();
                              setShowNewCategoryPopup(false);
                            }
                          }}
                        />
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" onClick={() => setShowNewCategoryPopup(false)} className="text-zinc-400">Annulla</Button>
                          <Button
                            className="bg-amber-500 hover:bg-amber-400 text-black font-bold"
                            onClick={() => {
                              handleCreateCategory();
                              setShowNewCategoryPopup(false);
                            }}
                            disabled={!newCategory.trim()}
                          >
                            Crea
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              <div className="space-y-10">
                {restaurantCategories.map(category => {
                  const categoryDishes = dishesByCategory.get(category.id)?.filter(d => d.id) || []
                  if (categoryDishes.length === 0) return null

                  return (
                    <div key={category.id} className="space-y-5">
                      {/* Category Header - Minimal */}
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center">
                          <Tag size={16} weight="fill" className="text-amber-500" />
                        </div>
                        <h3 className="text-lg font-semibold text-zinc-100 tracking-wide">{category.name}</h3>
                        <div className="flex-1 h-px bg-gradient-to-r from-zinc-800 to-transparent" />
                        <span className="text-xs text-zinc-600 font-medium">{categoryDishes.length} piatti</span>
                      </div>

                      {/* Dish Grid - Responsive */}
                      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                        {categoryDishes.map(dish => (
                          <div
                            key={dish.id}
                            className={`group relative bg-zinc-900/80 rounded-2xl overflow-hidden border border-zinc-800/50 hover:border-amber-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-amber-500/5 ${!dish.is_active ? 'opacity-50 grayscale' : ''}`}
                          >
                            {/* Image Section */}
                            <div className="relative aspect-[4/3] overflow-hidden bg-zinc-800">
                              {dish.image_url ? (
                                <img
                                  src={dish.image_url}
                                  alt={dish.name}
                                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                />
                              ) : (
                                <DishPlaceholder className="group-hover:scale-105 transition-transform duration-500" iconSize={48} />
                              )}

                              {/* Price Badge */}
                              <div className="absolute top-3 right-3">
                                <span className="px-3 py-1.5 bg-zinc-950/90 backdrop-blur-sm rounded-full text-amber-400 font-bold text-sm shadow-lg">
                                  €{dish.price.toFixed(2)}
                                </span>
                              </div>

                              {/* AYCE Badge */}
                              {dish.is_ayce && (
                                <div className="absolute top-3 left-3">
                                  <span className="px-2.5 py-1 bg-amber-500 text-zinc-950 font-bold text-xs rounded-full shadow-md uppercase tracking-wide">
                                    AYCE
                                  </span>
                                </div>
                              )}

                              {/* Hover Actions Overlay */}
                              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/90 via-zinc-950/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-end justify-center pb-4">
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    className="h-9 px-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-full shadow-lg"
                                    onClick={() => handleEditDish(dish)}
                                  >
                                    <PencilSimple size={16} className="mr-1.5" />
                                    Modifica
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="secondary"
                                    className={`h-9 w-9 rounded-full ${dish.is_active ? 'bg-zinc-800 hover:bg-zinc-700' : 'bg-zinc-700 hover:bg-zinc-600'}`}
                                    onClick={() => handleToggleDish(dish.id)}
                                  >
                                    {dish.is_active ? <Eye size={16} className="text-amber-500" /> : <EyeSlash size={16} className="text-zinc-400" />}
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="destructive"
                                    className="h-9 w-9 rounded-full"
                                    onClick={() => handleDeleteDish(dish.id)}
                                  >
                                    <Trash size={16} />
                                  </Button>
                                </div>
                              </div>
                            </div>

                            {/* Content Section */}
                            <div className="p-4">
                              {/* Dish Name - Full visible */}
                              <h4 className="font-semibold text-base text-zinc-100 leading-snug mb-1.5 group-hover:text-amber-400 transition-colors">
                                {dish.name}
                              </h4>

                              {/* Description */}
                              {dish.description && (
                                <p className="text-sm text-zinc-500 leading-relaxed line-clamp-2">
                                  {dish.description}
                                </p>
                              )}

                              {/* Mobile Actions - Always visible on touch devices */}
                              <div className="flex items-center justify-end gap-1 mt-3 sm:hidden">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-zinc-400 hover:text-amber-500 hover:bg-amber-500/10 rounded-full"
                                  onClick={() => handleEditDish(dish)}
                                >
                                  <PencilSimple size={16} />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className={`h-8 w-8 rounded-full ${dish.is_active ? 'text-amber-500' : 'text-zinc-600'}`}
                                  onClick={() => handleToggleDish(dish.id)}
                                >
                                  {dish.is_active ? <Eye size={16} /> : <EyeSlash size={16} />}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-full"
                                  onClick={() => handleDeleteDish(dish.id)}
                                >
                                  <Trash size={16} />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </TabsContent >

            {/* Reservations Tab */}
            <TabsContent value="reservations" className="space-y-6 p-6">
              {/* Date Quick Filters */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-muted-foreground mr-2">Seleziona data:</span>
                <Button
                  variant={selectedReservationDate.toDateString() === new Date().toDateString() ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedReservationDate(new Date())}
                >
                  Oggi
                </Button>
                <Button
                  variant={selectedReservationDate.toDateString() === new Date(Date.now() + 24 * 60 * 60 * 1000).toDateString() ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    const tomorrow = new Date()
                    tomorrow.setDate(tomorrow.getDate() + 1)
                    setSelectedReservationDate(tomorrow)
                  }}
                >
                  Domani
                </Button>
                <Button
                  variant={selectedReservationDate.toDateString() === new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toDateString() ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    const dayAfterTomorrow = new Date()
                    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2)
                    setSelectedReservationDate(dayAfterTomorrow)
                  }}
                >
                  Dopodomani
                </Button>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={selectedReservationDate.toISOString().split('T')[0]}
                    onChange={(e) => setSelectedReservationDate(new Date(e.target.value + 'T00:00:00'))}
                    className="w-[180px] h-9"
                  />
                </div>
              </div>
              {(() => {
                const serviceSegments: { label: string; start: string; end: string }[] = [];

                if (weeklyServiceHours?.useWeeklySchedule && weeklyServiceHours.schedule) {
                  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                  const dayName = days[selectedReservationDate.getDay()];
                  const daySchedule = weeklyServiceHours.schedule[dayName];

                  if (daySchedule) {
                    const lunch = daySchedule.lunch;
                    const dinner = daySchedule.dinner;
                    if (lunch?.enabled) {
                      serviceSegments.push({ label: 'Pranzo', start: lunch.start || lunchTimeStart || '12:00', end: lunch.end || '15:00' });
                    }
                    if (dinner?.enabled) {
                      serviceSegments.push({ label: 'Cena', start: dinner.start || dinnerTimeStart || '19:00', end: dinner.end || '23:00' });
                    }
                  }
                }

                if (serviceSegments.length === 0) {
                  serviceSegments.push({ label: 'Servizio', start: lunchTimeStart || '12:00', end: '23:00' });
                }

                const effOpen = serviceSegments[0].start;
                const effClose = serviceSegments[serviceSegments.length - 1].end;

                return (
                  <ReservationsManager
                    user={user}
                    restaurantId={restaurantId}
                    tables={restaurantTables}
                    rooms={rooms || []}
                    bookings={bookings || []}
                    selectedDate={selectedReservationDate}
                    openingTime={effOpen}
                    closingTime={effClose}
                    serviceSegments={serviceSegments}
                    onRefresh={refreshData}
                    onDateChange={(date) => setSelectedReservationDate(date)}
                    reservationDuration={reservationDuration}
                  />
                );
              })()}
            </TabsContent >

            {/* Analytics Tab */}
            <TabsContent value="analytics" className="m-0 h-full p-4 md:p-6 outline-none data-[state=inactive]:hidden overflow-y-auto">
              {/* Analytics Content */}
              <AnalyticsCharts
                orders={restaurantOrders}
                dishes={restaurantDishes}
                categories={restaurantCategories}
                completedOrders={pastOrders}
                restaurantName={restaurantName}
                restaurantId={restaurantId || ''}
              />
            </TabsContent >

            {/* Settings Tab */}
            <TabsContent value="settings" className="m-0 h-full p-4 md:p-6 outline-none data-[state=inactive]:hidden overflow-y-auto">
              <SettingsView
                restaurantName={restaurantName}
                setRestaurantName={setRestaurantName}
                restaurantNameDirty={restaurantNameDirty}
                saveRestaurantName={saveRestaurantName}

                soundEnabled={soundEnabled}
                setSoundEnabled={setSoundEnabled}
                selectedSound={selectedSound}
                setSelectedSound={setSelectedSound}

                waiterModeEnabled={waiterModeEnabled}
                setWaiterModeEnabled={updateWaiterModeEnabled}
                allowWaiterPayments={allowWaiterPayments}
                setAllowWaiterPayments={updateAllowWaiterPayments}
                waiterPassword={waiterPassword}
                setWaiterPassword={updateWaiterPassword}
                saveWaiterPassword={saveWaiterPassword}
                restaurantId={restaurantId || ''}

                enableReservationRoomSelection={enableReservationRoomSelection}
                setEnableReservationRoomSelection={updateEnableReservationRoomSelection}
                enablePublicReservations={enablePublicReservations}
                setEnablePublicReservations={updateEnablePublicReservations}

                ayceEnabled={ayceEnabled}
                setAyceEnabled={updateAyceEnabled}
                aycePrice={aycePrice}
                setAycePrice={(p) => {
                  setAycePrice(p)
                  const val = typeof p === 'string' ? parseFloat(p) : p
                  if (restaurantId) DatabaseService.updateRestaurant({
                    id: restaurantId,
                    all_you_can_eat: {
                      enabled: ayceEnabled,
                      pricePerPerson: val || 0,
                      maxOrders: Number(ayceMaxOrders) || 0
                    }
                  })
                }}
                ayceMaxOrders={ayceMaxOrders}
                setAyceMaxOrders={(o) => {
                  setAyceMaxOrders(o)
                  const val = typeof o === 'string' ? parseInt(o) : o
                  if (restaurantId) DatabaseService.updateRestaurant({
                    id: restaurantId,
                    all_you_can_eat: {
                      enabled: ayceEnabled,
                      pricePerPerson: Number(aycePrice) || 0,
                      maxOrders: val || 0
                    }
                  })
                }}

                copertoEnabled={copertoEnabled}
                setCopertoEnabled={updateCopertoEnabled}

                viewOnlyMenuEnabled={viewOnlyMenuEnabled}
                setViewOnlyMenuEnabled={updateViewOnlyMenuEnabled}

                showCookingTimes={showCookingTimes}
                setShowCookingTimes={updateShowCookingTimes}

                copertoPrice={copertoPrice}
                setCopertoPrice={updateCopertoPrice}

                openingTime={lunchTimeStart} // Reuse for now or separate?
                setOpeningTime={() => { }} // Legacy prop?
                closingTime={dinnerTimeStart} // Legacy prop?
                setClosingTime={() => { }} // Legacy prop?

                lunchTimeStart={lunchTimeStart}
                setLunchTimeStart={updateLunchStart}
                dinnerTimeStart={dinnerTimeStart}
                setDinnerTimeStart={updateDinnerStart}
                courseSplittingEnabled={courseSplittingEnabled}
                setCourseSplittingEnabled={(enabled) => {
                  setCourseSplittingEnabled(enabled)
                  if (restaurantId) DatabaseService.updateRestaurant({
                    id: restaurantId,
                    enable_course_splitting: enabled
                  })
                }}
                updateCourseSplitting={(enabled) => {
                  /* Legacy prop, mapped above */
                }}

                reservationDuration={reservationDuration}
                setReservationDuration={updateReservationDuration}

                weeklyCoperto={weeklyCoperto}
                setWeeklyCoperto={(schedule) => {
                  setWeeklyCoperto(schedule)
                  if (restaurantId) {
                    DatabaseService.updateRestaurant({ id: restaurantId, weekly_coperto: schedule })
                  }
                }}
                weeklyAyce={weeklyAyce}
                setWeeklyAyce={(schedule) => {
                  setWeeklyAyce(schedule)
                  if (restaurantId) {
                    DatabaseService.updateRestaurant({ id: restaurantId, weekly_ayce: schedule })
                  }
                }}
                weeklyServiceHours={weeklyServiceHours}
                setWeeklyServiceHours={(schedule) => {
                  setWeeklyServiceHours(schedule)
                  if (restaurantId) {
                    DatabaseService.updateRestaurant({ id: restaurantId, weekly_service_hours: schedule })
                  }
                }}
              />
            </TabsContent >
          </Tabs >
          <div className="mt-8"></div> {/* Spacer or container for dialogs if needed */}
          <Dialog open={showTableDialog && !!selectedTable} onOpenChange={(open) => {
            if (!open) {
              setSelectedTable(null);
              setShowTableDialog(false);
              setPendingAutoOrderTableId(null);
              // Reset overrides for next time
              setTableAyceOverride(true);
              setTableCopertoOverride(true);
            }
          }}>
            <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100">
              <DialogHeader>
                <DialogTitle>Attiva {selectedTable?.number}</DialogTitle>
                <DialogDescription>
                  Inserisci il numero di clienti per attivare il tavolo
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Numero Clienti</Label>
                  <Input
                    type="number"
                    min="1"
                    value={customerCount}
                    onChange={(e) => setCustomerCount(e.target.value)}
                    autoFocus
                  />
                </div>

                {/* AYCE and Coperto overrides - only show if enabled in settings */}
                {(ayceEnabled || copertoEnabled) && (
                  <div className="space-y-3 pt-3 border-t border-zinc-800">
                    <p className="text-xs text-zinc-500 uppercase tracking-wider">Opzioni per questo tavolo</p>

                    {ayceEnabled && (() => {
                      const currentAycePrice = currentRestaurant
                        ? getCurrentAyceSettings({ ...currentRestaurant, weekly_ayce: weeklyAyce } as any, lunchTimeStart, dinnerTimeStart).price
                        : (typeof aycePrice === 'string' ? parseFloat(aycePrice) : aycePrice)
                      if (!currentAycePrice || currentAycePrice <= 0) return null
                      return (
                        <div className="flex items-center justify-between p-3 bg-zinc-900/50 rounded-lg border border-zinc-800">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-zinc-300">All You Can Eat</span>
                            <span className="text-xs text-zinc-500">
                              (€{currentAycePrice})
                            </span>
                          </div>
                          <Switch
                            checked={tableAyceOverride}
                            onCheckedChange={setTableAyceOverride}
                          />
                        </div>
                      )
                    })()}

                    {copertoEnabled && (
                      <div className="flex items-center justify-between p-3 bg-zinc-900/50 rounded-lg border border-zinc-800">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-zinc-300">Coperto</span>
                          <span className="text-xs text-zinc-500">
                            (€{currentRestaurant
                              ? getCurrentCopertoPrice({ ...currentRestaurant, weekly_coperto: weeklyCoperto } as any, lunchTimeStart, dinnerTimeStart).price
                              : copertoPrice})
                          </span>
                        </div>
                        <Switch
                          checked={tableCopertoOverride}
                          onCheckedChange={setTableCopertoOverride}
                        />
                      </div>
                    )}
                  </div>
                )}

                <Button
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={() => {
                    if (!selectedTable) return
                    const count = parseInt(customerCount)
                    const seats = selectedTable.seats || 0
                    if (count > seats) {
                      setShowOverbookingAlert(true)
                    } else {
                      handleActivateTable(selectedTable.id, count)
                    }
                  }}
                >
                  Attiva Tavolo
                </Button>
              </div>
            </DialogContent>
          </Dialog >

          <AlertDialog open={showOverbookingAlert} onOpenChange={setShowOverbookingAlert}>
            <AlertDialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100">
              <AlertDialogHeader>
                <AlertDialogTitle>Capacità Superata</AlertDialogTitle>
                <AlertDialogDescription className="text-zinc-400">
                  Il numero di clienti ({customerCount}) supera i posti del tavolo ({selectedTable?.seats || 4}).
                  Vuoi procedere comunque con l'attivazione?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="border-zinc-700 hover:bg-zinc-900 text-zinc-300">Annulla</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-amber-600 hover:bg-amber-700 text-white border-none"
                  onClick={() => {
                    if (selectedTable) {
                      handleActivateTable(selectedTable.id, parseInt(customerCount))
                    }
                    setShowOverbookingAlert(false)
                  }}
                >
                  Procedi
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Dialog open={showCreateTableDialog} onOpenChange={setShowCreateTableDialog}>
            <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100">
              <DialogHeader>
                <DialogTitle>Nuovo Tavolo</DialogTitle>
                <DialogDescription>
                  Inserisci i dettagli del nuovo tavolo.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Nome/Numero Tavolo</Label>
                  <Input
                    value={newTableName}
                    onChange={(e) => setNewTableName(e.target.value)}
                    placeholder="Es. 1, 2, Esterno 1..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Capacità massima (posti)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="20"
                    value={newTableSeats}
                    onChange={(e) => {
                      const val = e.target.value
                      setNewTableSeats(val === '' ? '' : parseInt(val))
                    }}
                    placeholder="4"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sala</Label>
                  <Select value={newTableRoomId} onValueChange={setNewTableRoomId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona Sala" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Nessuna Sala</SelectItem>
                      {rooms?.map(r => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleCreateTable} className="w-full">Crea Tavolo</Button>
              </div>
            </DialogContent>
          </Dialog >

          {/* Edit Table Dialog */}
          <Dialog open={!!editingTable} onOpenChange={(open) => { if (!open) setEditingTable(null) }}>
            <DialogContent className="sm:max-w-md bg-zinc-950/90 backdrop-blur-2xl border-white/10 text-zinc-100 p-6 rounded-[2rem] shadow-[0_0_50px_-12px_rgba(0,0,0,0.8)] outline-none">
              <DialogHeader>
                <DialogTitle>Modifica Tavolo</DialogTitle>
                <DialogDescription>
                  Modifica i dettagli del tavolo.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Nome/Numero Tavolo</Label>
                  <Input
                    value={editTableName}
                    onChange={(e) => setEditTableName(e.target.value)}
                    placeholder="Es. 1, 2, Esterno 1..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Capacità massima (posti)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="20"
                    value={editTableSeats}
                    onChange={(e) => {
                      const val = e.target.value
                      setEditTableSeats(val === '' ? '' : parseInt(val))
                    }}
                    placeholder="4"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sala</Label>
                  <Select value={editTableRoomId} onValueChange={setEditTableRoomId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona Sala" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Nessuna Sala</SelectItem>
                      {rooms?.map(r => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                  <div className="space-y-0.5">
                    <Label className="text-zinc-100 font-bold mb-0">Tavolo Attivo</Label>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Escludi questo tavolo dalle prenotazioni</p>
                  </div>
                  <Switch
                    checked={editTableIsActive}
                    onCheckedChange={setEditTableIsActive}
                  />
                </div>
                <Button onClick={() => {
                  if (editingTable && editTableName.trim()) {
                    const seats = typeof editTableSeats === 'string' ? parseInt(editTableSeats) || 4 : editTableSeats
                    const room_id = editTableRoomId !== 'all' ? editTableRoomId : null
                    // We use 'any' cast or explicit property if type is not fully updated in TS yet, but Room is added.
                    // However updateTable takes Partial<Table>, and Table has room_id.
                    DatabaseService.updateTable(editingTable.id, { number: editTableName, seats, room_id, is_active: editTableIsActive } as any)
                      .then(() => {
                        setTables(prev => prev.map(t => t.id === editingTable.id ? { ...t, number: editTableName, seats, room_id: room_id || undefined, is_active: editTableIsActive } : t))
                        setEditingTable(null)
                        toast.success('Tavolo aggiornato')
                      })
                      .catch(() => toast.error('Errore aggiornamento tavolo'))
                  }
                }} className="w-full">Salva Modifiche</Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={showQrDialog} onOpenChange={(open) => setShowQrDialog(open)}>
            <DialogContent className="sm:max-w-md bg-zinc-950/90 backdrop-blur-2xl border-white/10 text-zinc-100 p-6 rounded-[2rem] shadow-[0_0_50px_-12px_rgba(0,0,0,0.8)] flex flex-col items-center text-center outline-none">
              <DialogHeader>
                <DialogTitle>Tavolo Attivato!</DialogTitle>
                <DialogDescription>
                  Scansiona il QR code per accedere al menu
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center justify-center p-6 space-y-4">
                {selectedTable && (
                  <QRCodeGenerator
                    value={generateQrCode(selectedTable.id)}
                    size={200}
                  />
                )}
                <div className="text-center">
                  <p className="text-sm font-medium">PIN Tavolo</p>
                  <p className="text-3xl font-bold tracking-widest font-mono mt-1">
                    {currentSessionPin || '----'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  disabled={isGeneratingTableQrPdf}
                  onClick={async () => {
                    if (!selectedTable) return
                    setIsGeneratingTableQrPdf(true)
                    try {
                      await generatePdfFromElement('table-qr-pdf-content', {
                        fileName: `QR_Tavolo_${selectedTable?.number || 'tavolo'}.pdf`,
                        scale: 2,
                        backgroundColor: '#FFFFFF',
                        orientation: 'portrait'
                      })
                      toast.success('PDF scaricato!', { duration: 3000 })
                    } catch (err) {
                      console.error(err)
                      toast.error('Errore durante la generazione del PDF')
                    } finally {
                      setIsGeneratingTableQrPdf(false)
                    }
                  }}
                >
                  <DownloadSimple size={18} />
                  {isGeneratingTableQrPdf ? 'Generazione...' : 'Scarica PDF'}
                </Button>
                <Button onClick={() => setShowQrDialog(false)} className="flex-1">
                  Chiudi
                </Button>
              </div>
            </DialogContent>
          </Dialog >

          <Dialog open={!!editingCategory} onOpenChange={(open) => { if (!open) handleCancelEdit() }}>
            <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100">
              <DialogHeader>
                <DialogTitle>Modifica Categoria</DialogTitle>
                <DialogDescription>
                  Modifica il nome della categoria selezionata.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Nome Categoria</Label>
                  <Input
                    value={editCategoryName}
                    onChange={(e) => setEditCategoryName(e.target.value)}
                  />
                </div>
                <Button onClick={handleSaveCategory} className="w-full">Salva Modifiche</Button>
              </div>
            </DialogContent>
          </Dialog >

          <Dialog open={!!editingDish} onOpenChange={(open) => { if (!open) handleCancelDishEdit() }}>
            <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100">
              <DialogHeader>
                <DialogTitle>Modifica Piatto</DialogTitle>
                <DialogDescription>
                  Modifica i dettagli del piatto selezionato.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Nome Piatto</Label>
                  <Input
                    value={editDishData.name}
                    onChange={(e) => setEditDishData({ ...editDishData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descrizione</Label>
                  <Textarea
                    value={editDishData.description}
                    onChange={(e) => setEditDishData({ ...editDishData, description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Prezzo (€)</Label>
                    <Input
                      type="number"
                      value={editDishData.price}
                      onChange={(e) => setEditDishData({ ...editDishData, price: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Categoria</Label>
                    <Select
                      value={editDishData.categoryId}
                      onValueChange={(value) => setEditDishData({ ...editDishData, categoryId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona" />
                      </SelectTrigger>
                      <SelectContent>
                        {restaurantCategories.map(cat => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Foto Piatto</Label>
                  <div className="space-y-2">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageChange(e, true)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Allergeni (separati da virgola)</Label>
                  <Input
                    value={editDishData.allergens?.join(', ') || ''}
                    onChange={(e) => setEditDishData({ ...editDishData, allergens: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                    placeholder="Glutine, Lattosio, etc."
                  />
                </div>
                <div className="flex items-center space-x-2 pt-4">
                  <Switch
                    id="edit_is_ayce"
                    checked={editDishData.is_ayce}
                    onCheckedChange={(checked) => setEditDishData({ ...editDishData, is_ayce: checked })}
                  />
                  <Label htmlFor="edit_is_ayce">Incluso in All You Can Eat</Label>
                </div>
                <Button onClick={handleSaveDish} className="w-full bg-amber-600 hover:bg-amber-700 text-white">Salva Modifiche</Button>
              </div>
            </DialogContent>
          </Dialog >

          <Dialog open={showTableQrDialog} onOpenChange={(open) => setShowTableQrDialog(open)}>
            <DialogContent className="sm:max-w-md bg-zinc-950/90 backdrop-blur-2xl border-white/10 text-zinc-100 p-6 rounded-[2rem] shadow-[0_0_50px_-12px_rgba(0,0,0,0.8)] flex flex-col items-center text-center outline-none">
              <DialogHeader>
                <DialogTitle>QR Code & PIN - {selectedTableForActions?.number}</DialogTitle>
                <DialogDescription>
                  Mostra questo QR al cliente oppure comunica il PIN
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center justify-center p-6 space-y-4">
                {selectedTableForActions && (
                  <>
                    <QRCodeGenerator
                      value={generateQrCode(selectedTableForActions.id)}
                      size={200}
                    />
                    <div className="text-center">
                      <p className="text-sm font-medium">PIN Tavolo</p>
                      <p className="text-4xl font-bold tracking-widest font-mono mt-1 text-primary">
                        {currentSessionPin}
                      </p>
                    </div>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  disabled={isGeneratingTableQrPdf}
                  onClick={async () => {
                    if (typeof window === 'undefined') return
                    setIsGeneratingTableQrPdf(true)
                    try {
                      const originalDisplay = document.getElementById('table-qr-pdf-content')?.style.display
                      const el = document.getElementById('table-qr-pdf-content')
                      if (el) el.style.display = 'flex'

                      await generatePdfFromElement('table-qr-pdf-content', {
                        fileName: `QR_Tavolo_${selectedTableForActions?.number || 'tavolo'}.pdf`,
                        scale: 2,
                        backgroundColor: '#FFFFFF',
                        orientation: 'portrait'
                      })

                      if (el) el.style.display = 'none'
                      toast.success('PDF scaricato!', { duration: 3000 })
                    } catch (err) {
                      console.error(err)
                      toast.error('Errore durante la generazione del PDF')
                    } finally {
                      setIsGeneratingTableQrPdf(false)
                    }
                  }}
                >
                  <DownloadSimple size={18} />
                  {isGeneratingTableQrPdf ? 'Generazione...' : 'Scarica PDF'}
                </Button>
                <Button onClick={() => setShowTableQrDialog(false)} className="flex-1">
                  Chiudi
                </Button>
              </div>

              {/* Hidden content for PDF generation */}
              <div id="table-qr-pdf-content" style={{ display: 'none', position: 'fixed', top: '-9999px', width: '210mm', minHeight: '297mm', backgroundColor: '#FFFFFF' }}>
                <div style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '20mm',
                  backgroundColor: '#FFFFFF',
                  boxSizing: 'border-box'
                }}>
                  {/* Single Elegant Card */}
                  <div style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #e4e4e7',
                    borderRadius: '12px',
                    padding: '50px 40px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '32px',
                    color: '#000000',
                    width: '120mm',
                    maxWidth: '100%'
                  }}>
                    {/* Thin decorative line */}
                    <div style={{ width: '40px', height: '2px', backgroundColor: '#d4d4d8', borderRadius: '1px' }} />

                    {/* Table Name */}
                    <div style={{ textAlign: 'center' }}>
                      <p style={{
                        fontSize: '11px',
                        fontWeight: '700',
                        margin: '0 0 10px 0',
                        textTransform: 'uppercase',
                        letterSpacing: '0.35em',
                        color: '#000000',
                        fontFamily: 'system-ui, -apple-system, sans-serif'
                      }}>
                        TAVOLO
                      </p>
                      <h1 style={{
                        fontSize: '72px',
                        lineHeight: '1.2',
                        fontWeight: '400',
                        margin: 0,
                        color: '#000000',
                        fontFamily: 'Georgia, "Times New Roman", serif'
                      }}>
                        {selectedTableForActions?.number}
                      </h1>
                    </div>

                    {/* CTA */}
                    <p style={{
                      fontSize: '10px',
                      fontWeight: '700',
                      margin: 0,
                      textTransform: 'uppercase',
                      letterSpacing: '0.2em',
                      color: '#000000',
                      fontFamily: 'system-ui, -apple-system, sans-serif',
                      textAlign: 'center'
                    }}>
                      {viewOnlyMenuEnabled ? 'Scansiona per visualizzare il menù' : 'Scansiona per ordinare'}
                    </p>

                    {/* QR Code */}
                    <div style={{ padding: '8px', border: '1px solid #e4e4e7', borderRadius: '8px' }}>
                      <QRCodeGenerator value={generateQrCode(selectedTableForActions?.id || '')} size={200} />
                    </div>

                    {/* Restaurant Name */}
                    <div style={{ textAlign: 'center' }}>
                      <p style={{
                        fontSize: '11px',
                        fontWeight: '700',
                        margin: 0,
                        color: '#000000',
                        textTransform: 'uppercase',
                        letterSpacing: '0.25em',
                        fontFamily: 'system-ui, -apple-system, sans-serif'
                      }}>
                        {currentRestaurant?.name || 'Ristorante'}
                      </p>
                    </div>

                    {/* Thin decorative line */}
                    <div style={{ width: '40px', height: '2px', backgroundColor: '#d4d4d8', borderRadius: '1px' }} />
                  </div>
                </div>
              </div>



              <p style={{ fontSize: '11px', color: '#3f3f46', letterSpacing: '1px' }}>MINTHI</p>
            </DialogContent>
          </Dialog>

          {/* Confirmation Dialog for Close/Pay/Empty */}
          <AlertDialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
            <AlertDialogContent className="bg-zinc-950 border-zinc-800 text-white">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-xl font-bold">
                  {closeConfirmAction?.markPaid ? '💳 Conferma Pagamento' : '🗑️ Conferma Liberazione'}
                </AlertDialogTitle>
                <AlertDialogDescription className="text-zinc-400">
                  {closeConfirmAction?.markPaid
                    ? `Vuoi segnare il tavolo ${tables?.find(t => t.id === closeConfirmAction?.tableId)?.number || ''} come pagato e liberarlo?`
                    : `Vuoi svuotare e liberare il tavolo ${tables?.find(t => t.id === closeConfirmAction?.tableId)?.number || ''}? Gli ordini attivi verranno annullati.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="border-zinc-700 text-zinc-400 hover:bg-zinc-900 hover:text-white">Annulla</AlertDialogCancel>
                <AlertDialogAction
                  className={closeConfirmAction?.markPaid
                    ? 'bg-amber-500 hover:bg-amber-400 text-black font-bold'
                    : 'bg-red-600 hover:bg-red-500 text-white font-bold'}
                  onClick={() => {
                    if (closeConfirmAction) {
                      handleCloseTable(closeConfirmAction.tableId, closeConfirmAction.markPaid)
                    }
                    setShowCloseConfirm(false)
                    setCloseConfirmAction(null)
                  }}
                >
                  {closeConfirmAction?.markPaid ? 'Segna come Pagato' : 'Libera Tavolo'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <TableBillDialog
            isOpen={showTableBillDialog}
            onClose={() => setShowTableBillDialog(false)}
            table={selectedTableForActions}
            session={sessions?.find(s => s.table_id === selectedTableForActions?.id && s.status === 'OPEN') || null}
            orders={orders.filter(o => o.table_session_id === (sessions?.find(s => s.table_id === selectedTableForActions?.id && s.status === 'OPEN')?.id))}
            restaurant={currentRestaurant || null}
            onPaymentComplete={() => {
              if (selectedTableForActions) requestCloseTable(selectedTableForActions.id, true)
              setShowTableBillDialog(false)
            }}
            onEmptyTable={() => {
              if (selectedTableForActions) requestCloseTable(selectedTableForActions.id, false)
              setShowTableBillDialog(false)
            }}
            isWaiter={false}
          />

        </div>
      </main>

      {/* HIDDEN PRINT VIEW FOR MENU EXPORT - ALL INLINE STYLES FOR PDF COMPATIBILITY */}
      <div id="menu-print-view" style={{
        display: 'none',
        position: 'fixed',
        top: 0,
        left: '-9999px',
        zIndex: -1,
        width: '210mm',
        minHeight: '297mm',
        backgroundColor: '#09090b',
        color: '#ffffff',
        padding: '40px 50px',
        fontFamily: 'Georgia, serif',
        boxSizing: 'border-box'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '40px', borderBottom: '1px solid rgba(0,0,0,0.1)', paddingBottom: '30px' }}>
          <div style={{ width: '100px', height: '3px', background: 'linear-gradient(to right, transparent, #d97706, transparent)', margin: '0 auto 20px auto' }}></div>
          <h1 style={{ fontSize: '42px', fontWeight: 300, letterSpacing: '0.2em', color: '#18181b', marginBottom: '10px', textTransform: 'uppercase' }}>
            {exportPreviewData?.title || currentRestaurant?.name || 'Menu'}
          </h1>
          {
            exportPreviewData?.subtitle && (
              <p style={{ color: '#d97706', fontSize: '18px', letterSpacing: '0.15em', fontWeight: 300, marginTop: '10px' }}>{exportPreviewData.subtitle}</p>
            )
          }
          <p style={{ color: '#d97706', fontSize: '12px', fontStyle: 'italic', letterSpacing: '0.2em', fontWeight: 300, marginTop: '15px', opacity: 0.8 }}>Fine Dining Experience</p>
        </div>

        {/* Categories & Dishes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '35px' }}>
          {
            exportPreviewData ? (
              exportPreviewData.sections.map(section => (
                <div key={section.id} style={{ marginBottom: '20px', pageBreakInside: 'avoid' }}>
                  {section.title && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '20px' }}>
                      <h2 style={{ fontSize: '22px', fontWeight: 300, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.15em', whiteSpace: 'nowrap' }}>{section.title}</h2>
                      <div style={{ height: '1px', flex: 1, background: 'linear-gradient(to right, rgba(217,119,6,0.4), transparent)' }}></div>
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {section.dishes.map(dish => (
                      <div key={dish.id} style={{ display: 'flex', gap: '15px', alignItems: 'flex-start', pageBreakInside: 'avoid' }}>
                        {dish.image_url && (
                          <div style={{ width: '60px', height: '60px', flexShrink: 0, borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(0,0,0,0.1)' }}>
                            <img src={dish.image_url} alt={dish.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        )}
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px', borderBottom: '1px dotted rgba(0,0,0,0.15)', paddingBottom: '6px' }}>
                            <h3 style={{ fontSize: '17px', fontWeight: 500, color: '#18181b', letterSpacing: '0.02em', margin: 0 }}>{dish.name}</h3>
                            <span style={{ fontSize: '16px', fontWeight: 300, color: '#b45309', whiteSpace: 'nowrap', marginLeft: '15px' }}>€ {dish.price.toFixed(2)}</span>
                          </div>
                          {dish.description && (
                            <p style={{ color: '#52525b', fontSize: '12px', fontWeight: 300, lineHeight: 1.5, fontStyle: 'italic', margin: 0 }}>{dish.description}</p>
                          )}
                          {dish.allergens && dish.allergens.length > 0 && (
                            <p style={{ color: '#71717a', fontSize: '9px', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Allergeni: {dish.allergens.join(', ')}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : null}
        </div>

        {/* Footer */}
        <div style={{ marginTop: '60px', paddingTop: '20px', borderTop: '1px solid rgba(0,0,0,0.05)', textAlign: 'center' }}>
          <p style={{ color: '#52525b', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', margin: 0 }}>
            {currentRestaurant?.address || ''} {currentRestaurant?.address && currentRestaurant?.phone ? '•' : ''} {currentRestaurant?.phone || ''}
          </p>
          <p style={{ color: '#3f3f46', fontSize: '9px', marginTop: '8px', letterSpacing: '0.1em' }}>Powered by Minthi</p>
        </div>
      </div>

      {/* HIDDEN GRID PRINT VIEW FOR TABLES - 4 BLOCKS PER PAGE */}
      <div id="tables-grid-print-view" style={{
        display: 'none',
        position: 'fixed',
        top: '-9999px',
        left: '-9999px',
        width: '210mm',
        backgroundColor: '#FFFFFF',
        color: '#000000',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        {/* Generate pages with exactly 4 tables each */}
        {
          Array.from({ length: Math.ceil(restaurantTables.length / 4) }).map((_, pageIndex) => {
            const pageTables = restaurantTables.slice(pageIndex * 4, (pageIndex + 1) * 4)
            return (
              <div key={pageIndex} style={{
                width: '210mm',
                height: '297mm',
                padding: '10mm',
                backgroundColor: '#FFFFFF',
                boxSizing: 'border-box',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gridTemplateRows: '1fr 1fr',
                gap: '8mm',
                pageBreakAfter: pageIndex < Math.ceil(restaurantTables.length / 4) - 1 ? 'always' : 'auto'
              }}>
                {
                  pageTables.map((table) => (
                    <div key={table.id} style={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #e4e4e7',
                      borderRadius: '10px',
                      padding: '8mm',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5mm', // Increased gap
                      color: '#000000',
                      boxSizing: 'border-box'
                    }}>
                      {/* Decorative line */}
                      <div style={{ width: '24px', height: '1.5px', backgroundColor: '#d4d4d8', borderRadius: '1px' }} />

                      {/* Table Name */}
                      <div style={{ textAlign: 'center' }}>
                        <p style={{
                          fontSize: '9px',
                          fontWeight: '700',
                          margin: '0 0 6px 0',
                          textTransform: 'uppercase',
                          letterSpacing: '0.35em',
                          color: '#000000',
                          fontFamily: 'system-ui, -apple-system, sans-serif'
                        }}>
                          TAVOLO
                        </p>
                        <h1 style={{
                          fontSize: '48px',
                          lineHeight: '1.2',
                          fontWeight: '400',
                          margin: 0,
                          color: '#000000',
                          fontFamily: 'Georgia, "Times New Roman", serif'
                        }}>
                          {table.number}
                        </h1>
                      </div>

                      <p style={{
                        fontSize: '7px',
                        fontWeight: '700',
                        margin: 0,
                        textTransform: 'uppercase',
                        letterSpacing: '0.2em',
                        color: '#000000',
                        fontFamily: 'system-ui, -apple-system, sans-serif',
                        textAlign: 'center'
                      }}>
                        {viewOnlyMenuEnabled ? 'Scansiona per visualizzare il menù' : 'Scansiona per ordinare'}
                      </p>
                      {/* QR Code */}
                      < div style={{ padding: '2mm', border: '1px solid #e4e4e7', borderRadius: '6px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <QRCodeGenerator value={generateQrCode(table.id)} size={140} />
                      </div>

                      {/* Restaurant Name */}
                      <p style={{
                        fontSize: '8px',
                        fontWeight: '700',
                        margin: 0,
                        color: '#000000',
                        textTransform: 'uppercase',
                        letterSpacing: '0.25em',
                        fontFamily: 'system-ui, -apple-system, sans-serif',
                        textAlign: 'center'
                      }}>
                        {currentRestaurant?.name || 'Ristorante'}
                      </p>

                      {/* Decorative line */}
                      <div style={{ width: '24px', height: '1.5px', backgroundColor: '#d4d4d8', borderRadius: '1px' }} />
                    </div>
                  ))}
              </div>
            )
          })
        }
      </div>
    </div>
  )
}

export default RestaurantDashboard
