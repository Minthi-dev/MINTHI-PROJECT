import { useState, useMemo, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSupabaseData } from '../hooks/useSupabaseData'
import { DatabaseService } from '../services/DatabaseService'
import { toast } from 'sonner'
import { User, Restaurant, SubscriptionPayment, RestaurantBonus } from '../services/types'
import { supabase } from '../lib/supabase'
import { Crown, Plus, Buildings, SignOut, Trash, ChartBar, PencilSimple, Eye, EyeSlash, Database, MagnifyingGlass, SortAscending, UploadSimple, SignIn, CreditCard, Gift, Warning, CheckCircle, Clock, ArrowRight, Pause, Play, Link as LinkIcon, Copy, Rocket, Receipt, CalendarBlank, Funnel, CaretDown, CaretUp, XCircle, Info, Percent, X, Calendar } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'framer-motion'
import AdminStatistics from './AdminStatistics'
import RestaurantDashboard from './RestaurantDashboard'
import { v4 as uuidv4 } from 'uuid'
import { populateRestaurantData } from '../services/populateData'
import { hashPassword } from '../utils/passwordUtils'

interface Props {
  user: User
  onLogout: () => void
}

type SortOption = 'name' | 'sales' | 'status'

export default function AdminDashboard({ user, onLogout }: Props) {
  // Map is_active to isActive for all restaurant data
  const [restaurants, , refreshRestaurants, setRestaurants] = useSupabaseData<Restaurant>(
    'restaurants',
    [],
    undefined,
    (r: any) => ({ ...r, isActive: r.is_active })
  )
  const [users, , refreshUsers] = useSupabaseData<User>('users', [])
  const [salesByRestaurant, setSalesByRestaurant] = useState<Record<string, number>>({})
  const [activeView, setActiveView] = useState<'restaurants' | 'statistics' | 'admin'>('restaurants')

  // Admin Payments State
  const [subscriptionPayments, loadingPayments, refreshPayments, setSubscriptionPayments] = useSupabaseData<SubscriptionPayment>('subscription_payments', [])
  const [restaurantBonuses, loadingBonuses, refreshBonuses, setRestaurantBonuses] = useSupabaseData<RestaurantBonus>('restaurant_bonuses', [])
  const [adminFilter, setAdminFilter] = useState<'all' | 'paying' | 'not_paying' | 'suspended'>('all')
  const [showBonusDialog, setShowBonusDialog] = useState(false)
  const [bonusRestaurantId, setBonusRestaurantId] = useState('')
  const [bonusMonths, setBonusMonths] = useState(1)
  const [bonusReason, setBonusReason] = useState('')
  const [stripePriceId, setStripePriceId] = useState('')
  const [stripePriceIdSaved, setStripePriceIdSaved] = useState('')
  const [stripePriceAmount, setStripePriceAmount] = useState<number>(0)
  const [newPriceInput, setNewPriceInput] = useState('')
  const [updatingPrice, setUpdatingPrice] = useState(false)
  const [loadingPriceDetails, setLoadingPriceDetails] = useState(false)

  // Discount dialog
  const [showDiscountDialog, setShowDiscountDialog] = useState(false)
  const [discountRestaurantId, setDiscountRestaurantId] = useState('')
  const [discountPercent, setDiscountPercent] = useState<number | string>('')
  const [discountDuration, setDiscountDuration] = useState('once')
  const [discountDurationMonths, setDiscountDurationMonths] = useState(1)
  const [discountReason, setDiscountReason] = useState('')
  const [applyingDiscount, setApplyingDiscount] = useState(false)

  // Admin Payments Sub-Tabs
  const [adminSubTab, setAdminSubTab] = useState<'abbonamenti' | 'fatturazione'>('abbonamenti')

  // Fatturazione Filters
  const [fatturazioneSearch, setFatturazioneSearch] = useState('')
  const [fatturazioneStatus, setFatturazioneStatus] = useState<'all' | 'paid' | 'failed'>('all')
  const [fatturazioneDateFrom, setFatturazioneDateFrom] = useState('')
  const [fatturazioneDateTo, setFatturazioneDateTo] = useState('')
  const [fatturazioneSortField, setFatturazioneSortField] = useState<'date' | 'amount' | 'restaurant'>('date')
  const [fatturazioneSortDir, setFatturazioneSortDir] = useState<'asc' | 'desc'>('desc')
  const [fatturazionePeriod, setFatturazionePeriod] = useState<'7d' | '1w' | '2w' | '1m' | '3m' | 'custom'>('1m')

  // Abbonamenti: expanded restaurant details
  const [expandedRestaurantId, setExpandedRestaurantId] = useState<string | null>(null)
  // Abbonamenti: search within subscription list
  const [abbonamentiSearch, setAbbonamentiSearch] = useState('')
  // Fatturazione: invoice confirmation & delete
  const [confirmedInvoices, setConfirmedInvoices] = useState<Set<string>>(new Set())
  const [confirmInvoiceId, setConfirmInvoiceId] = useState<string | null>(null)
  const [deletePaymentId, setDeletePaymentId] = useState<string | null>(null)
  const [deletingPayment, setDeletingPayment] = useState(false)
  // Bulk actions: multi-select
  const [selectedRestaurants, setSelectedRestaurants] = useState<Set<string>>(new Set())
  const [showBulkBonusDialog, setShowBulkBonusDialog] = useState(false)
  const [showBulkDiscountDialog, setShowBulkDiscountDialog] = useState(false)
  const [bulkBonusMonths, setBulkBonusMonths] = useState(1)
  const [bulkBonusReason, setBulkBonusReason] = useState('')
  const [bulkDiscountPercent, setBulkDiscountPercent] = useState<number | string>('')
  const [bulkDiscountDuration, setBulkDiscountDuration] = useState('once')
  const [applyingBulk, setApplyingBulk] = useState(false)

  // Registration Link Generator
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [inviteFreeMonths, setInviteFreeMonths] = useState(false)
  const [inviteMonthsCount, setInviteMonthsCount] = useState(1)
  const [inviteDiscountPercent, setInviteDiscountPercent] = useState<number | string>('')
  const [inviteDiscountDuration, setInviteDiscountDuration] = useState('once')
  const [inviteDiscountDurationMonths, setInviteDiscountDurationMonths] = useState(1)
  const [generatedLink, setGeneratedLink] = useState('')
  const [generatingLink, setGeneratingLink] = useState(false)

  // Clear generated link when params change so user can generate a new one
  useEffect(() => {
    setGeneratedLink('')
  }, [inviteFreeMonths, inviteMonthsCount, inviteDiscountPercent, inviteDiscountDuration])

  // Dedicated realtime subscription for new restaurant INSERTs.
  // The useSupabaseData hook subscribes to postgres_changes, but INSERT events
  // from RPC functions (register_restaurant_secure / complete_pending_registration)
  // may not propagate to the hook's handler due to RLS context differences.
  // This separate subscription does a full refetch to guarantee the admin sees new restaurants.
  useEffect(() => {
    const channel = supabase
      .channel('admin_restaurants_insert')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'restaurants' },
        () => {
          refreshRestaurants()
        }
      )
      .subscribe()

    // Periodic polling fallback: RPC-created restaurants may not trigger realtime events
    // due to RLS context differences. Poll every 30s to ensure new restaurants appear.
    const pollInterval = setInterval(() => {
      refreshRestaurants()
    }, 30_000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollInterval)
    }
  }, [refreshRestaurants])

  // Load admin data
  useEffect(() => {
    if (activeView === 'admin') {
      DatabaseService.getAppConfig('stripe_price_id').then(val => {
        if (val) { setStripePriceId(val); setStripePriceIdSaved(val) }
      }).catch(console.error)
      // Fetch current Stripe price amount
      setLoadingPriceDetails(true)
      DatabaseService.getStripePriceDetails().then(details => {
        if (details?.amount) setStripePriceAmount(details.amount)
      }).catch(console.error).finally(() => setLoadingPriceDetails(false))
    }
  }, [activeView])

  // Fetch aggregated sales per restaurant (lightweight, no realtime subscription on ALL orders)
  useEffect(() => {
    const fetchSales = async () => {
      const { data } = await supabase
        .from('orders')
        .select('restaurant_id, total_amount')
        .eq('status', 'PAID')
      if (data) {
        const sales: Record<string, number> = {}
        data.forEach((o: any) => {
          sales[o.restaurant_id] = (sales[o.restaurant_id] || 0) + (o.total_amount || 0)
        })
        setSalesByRestaurant(sales)
      }
    }
    fetchSales()
  }, [restaurants])
  const [impersonatedRestaurantId, setImpersonatedRestaurantId] = useState<string | null>(null)

  // Search & Sort State
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOption, setSortOption] = useState<SortOption>('name')

  // Create State
  const [newRestaurant, setNewRestaurant] = useState({
    name: '',
    phone: '',
    email: '',
    logo_url: '',
    username: '',
    password: '',
    billingName: '',
    vatNumber: '',
    billingAddress: '',
    billingCity: '',
    billingCap: '',
    billingProvince: '',
    codiceUnivoco: '',
  })
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [showRestaurantDialog, setShowRestaurantDialog] = useState(false)

  // Edit state
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editingRestaurant, setEditingRestaurant] = useState<Restaurant | null>(null)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [editLogoFile, setEditLogoFile] = useState<File | null>(null)

  // Detail view state
  const [showDetailDialog, setShowDetailDialog] = useState(false)
  const [detailRestaurant, setDetailRestaurant] = useState<Restaurant | null>(null)
  const [detailUser, setDetailUser] = useState<User | null>(null)
  const [detailPasswordVisible, setDetailPasswordVisible] = useState(false)

  // Visibility state for passwords
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({})

  const togglePasswordVisibility = (restaurantId: string) => {
    setVisiblePasswords(prev => ({
      ...prev,
      [restaurantId]: !prev[restaurantId]
    }))
  }

  // Filtered & Sorted Restaurants
  const processedRestaurants = useMemo(() => {
    let result = [...(restaurants || [])]

    // 1. Filter by Search
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(r =>
        r.name.toLowerCase().includes(query) ||
        r.email?.toLowerCase().includes(query) ||
        r.phone?.includes(query)
      )
    }

    // 2. Sort
    result.sort((a, b) => {
      switch (sortOption) {
        case 'name':
          return a.name.localeCompare(b.name)
        case 'status':
          // Active first
          return (a.isActive === b.isActive) ? 0 : a.isActive ? -1 : 1
        case 'sales':
          return (salesByRestaurant[b.id] || 0) - (salesByRestaurant[a.id] || 0)
        default:
          return 0
      }
    })

    return result
  }, [restaurants, salesByRestaurant, searchQuery, sortOption])

  // Period preset date range helper
  const getPeriodDateRange = (period: typeof fatturazionePeriod): { from: Date | null; to: Date | null } => {
    const now = new Date()
    const to = new Date(now)
    to.setHours(23, 59, 59, 999)
    let from: Date | null = null

    switch (period) {
      case '7d': {
        from = new Date(now)
        from.setDate(from.getDate() - 7)
        from.setHours(0, 0, 0, 0)
        break
      }
      case '1w': {
        // Last Monday to last Sunday
        const dayOfWeek = now.getDay()
        const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
        from = new Date(now)
        from.setDate(from.getDate() - diffToMonday - 7)
        from.setHours(0, 0, 0, 0)
        const toDate = new Date(from)
        toDate.setDate(toDate.getDate() + 6)
        toDate.setHours(23, 59, 59, 999)
        return { from, to: toDate }
      }
      case '2w': {
        from = new Date(now)
        from.setDate(from.getDate() - 14)
        from.setHours(0, 0, 0, 0)
        break
      }
      case '1m': {
        from = new Date(now)
        from.setMonth(from.getMonth() - 1)
        from.setHours(0, 0, 0, 0)
        break
      }
      case '3m': {
        from = new Date(now)
        from.setMonth(from.getMonth() - 3)
        from.setHours(0, 0, 0, 0)
        break
      }
      case 'custom':
        return { from: null, to: null }
    }
    return { from, to }
  }

  // Upcoming payments for active subscribers
  const upcomingPayments = useMemo(() => {
    const activeRestaurants = (restaurants || []).filter(r => r.stripe_subscription_id && r.isActive)
    const upcoming = activeRestaurants.map(r => {
      const rPayments = (subscriptionPayments || []).filter(p => p.restaurant_id === r.id && p.status === 'paid')
      // Sort by created_at desc to get last payment
      rPayments.sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime())
      const lastPayment = rPayments[0]
      let nextDate: Date
      if (lastPayment?.period_end) {
        nextDate = new Date(lastPayment.period_end)
      } else if (lastPayment?.created_at) {
        nextDate = new Date(lastPayment.created_at)
        nextDate.setMonth(nextDate.getMonth() + 1)
      } else {
        // No payment history; estimate from now
        nextDate = new Date()
        nextDate.setMonth(nextDate.getMonth() + 1)
      }
      const now = new Date()
      const daysUntil = Math.ceil((nextDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      return {
        restaurant: r,
        nextDate,
        daysUntil,
        amount: lastPayment?.amount || 0
      }
    })
    // Sort by closest date first, only include future payments (not expired)
    upcoming.sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime())
    return upcoming.filter(u => u.daysUntil > 0)
  }, [restaurants, subscriptionPayments])

  // Fatturazione: filtered and sorted subscription payments
  const filteredFatturazionePayments = useMemo(() => {
    let result = [...(subscriptionPayments || [])]

    // Filter by status
    if (fatturazioneStatus === 'paid') {
      result = result.filter(p => p.status === 'paid')
    } else if (fatturazioneStatus === 'failed') {
      result = result.filter(p => p.status === 'failed')
    }

    // Filter by restaurant search
    if (fatturazioneSearch) {
      const q = fatturazioneSearch.toLowerCase()
      result = result.filter(p => {
        const restaurant = (restaurants || []).find(r => r.id === p.restaurant_id)
        return restaurant?.name?.toLowerCase().includes(q) || p.stripe_invoice_id?.toLowerCase().includes(q)
      })
    }

    // Filter by date range (preset or custom)
    if (fatturazionePeriod !== 'custom') {
      const range = getPeriodDateRange(fatturazionePeriod)
      if (range.from) {
        result = result.filter(p => p.created_at && new Date(p.created_at) >= range.from!)
      }
      if (range.to) {
        result = result.filter(p => p.created_at && new Date(p.created_at) <= range.to!)
      }
    } else {
      if (fatturazioneDateFrom) {
        const from = new Date(fatturazioneDateFrom)
        from.setHours(0, 0, 0, 0)
        result = result.filter(p => p.created_at && new Date(p.created_at) >= from)
      }
      if (fatturazioneDateTo) {
        const to = new Date(fatturazioneDateTo)
        to.setHours(23, 59, 59, 999)
        result = result.filter(p => p.created_at && new Date(p.created_at) <= to)
      }
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0
      if (fatturazioneSortField === 'date') {
        cmp = new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime()
      } else if (fatturazioneSortField === 'amount') {
        cmp = a.amount - b.amount
      } else if (fatturazioneSortField === 'restaurant') {
        const nameA = (restaurants || []).find(r => r.id === a.restaurant_id)?.name || ''
        const nameB = (restaurants || []).find(r => r.id === b.restaurant_id)?.name || ''
        cmp = nameA.localeCompare(nameB)
      }
      return fatturazioneSortDir === 'desc' ? -cmp : cmp
    })

    return result
  }, [subscriptionPayments, restaurants, fatturazioneSearch, fatturazioneStatus, fatturazioneDateFrom, fatturazioneDateTo, fatturazioneSortField, fatturazioneSortDir, fatturazionePeriod])

  // Fatturazione summary stats
  const fatturazioneStats = useMemo(() => {
    const allPayments = subscriptionPayments || []
    const totaleIncassato = allPayments.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0)
    const pagamentiInSospeso = allPayments.filter(p => p.status === 'pending' || p.status === 'failed').length
    const fattureEmesse = allPayments.length
    return { totaleIncassato, pagamentiInSospeso, fattureEmesse }
  }, [subscriptionPayments])

  const handleLogoUpload = async (file: File) => {
    try {
      setIsUploading(true)
      const url = await DatabaseService.uploadLogo(file)
      return url
    } catch (error) {
      console.error('Upload failed:', error)
      toast.error('Errore caricamento logo')
      return null
    } finally {
      setIsUploading(false)
    }
  }

  const handleCreateRestaurant = async () => {
    if (!newRestaurant.name || !newRestaurant.phone || !newRestaurant.email || !newRestaurant.username || !newRestaurant.password) {
      toast.error('Compila tutti i campi obbligatori')
      return
    }

    setIsUploading(true)

    try {
      let finalLogoUrl = newRestaurant.logo_url
      if (logoFile) {
        const uploadedUrl = await handleLogoUpload(logoFile)
        if (uploadedUrl) finalLogoUrl = uploadedUrl
      }

      const restaurantId = uuidv4()
      const userId = uuidv4()

      const restaurant: Restaurant = {
        id: restaurantId,
        name: newRestaurant.name,
        phone: newRestaurant.phone,
        email: newRestaurant.email,
        logo_url: finalLogoUrl,
        owner_id: userId,
        isActive: true,
        billing_name: newRestaurant.billingName.trim() || undefined,
        vat_number: newRestaurant.vatNumber.trim() || undefined,
        billing_address: newRestaurant.billingAddress.trim() || undefined,
        billing_city: newRestaurant.billingCity.trim() || undefined,
        billing_cap: newRestaurant.billingCap.trim() || undefined,
        billing_province: newRestaurant.billingProvince.trim() || undefined,
        codice_univoco: newRestaurant.codiceUnivoco.trim() || undefined,
      }

      const hashedPw = await hashPassword(newRestaurant.password)
      const restaurantUser: User = {
        id: userId,
        name: newRestaurant.username,
        email: newRestaurant.email,
        password_hash: hashedPw,
        raw_password: newRestaurant.password,
        role: 'OWNER',
      }

      await DatabaseService.createUser(restaurantUser)
      await DatabaseService.createRestaurant(restaurant)

      setNewRestaurant({ name: '', phone: '', email: '', logo_url: '', username: '', password: '', billingName: '', vatNumber: '', billingAddress: '', billingCity: '', billingCap: '', billingProvince: '', codiceUnivoco: '' })
      setLogoFile(null)
      setShowRestaurantDialog(false)
      toast.success('Ristorante creato con successo')
      await Promise.all([refreshRestaurants(), refreshUsers()])
    } catch (error: any) {
      console.error('Error creating restaurant:', error)
      if (error.code === '23505' || error.status === 409 || error.message?.includes('duplicate key')) {
        toast.error('Esiste già un utente o un ristorante con questa email.')
      } else {
        toast.error('Errore durante la creazione: ' + (error.message || 'Errore sconosciuto'))
      }
    } finally {
      setIsUploading(false)
    }
  }

  const handlePopulateData = async (restaurantId: string) => {
    if (confirm('Vuoi popolare questo ristorante con dati di esempio?')) {
      try {
        await populateRestaurantData(restaurantId)
        toast.success('Dati inseriti con successo')
      } catch (error) {
        console.error(error)
        toast.error('Errore durante l\'inserimento dei dati')
      }
    }
  }

  const handleDeleteRestaurant = async (restaurantId: string) => {
    if (confirm('Sei sicuro? Questa azione è irreversibile e cancellerà TUTTI i dati del ristorante.')) {
      try {
        // Optimistic update: remove immediately from UI
        if (setRestaurants) {
          setRestaurants(prev => prev.filter(r => r.id !== restaurantId))
        }

        await DatabaseService.deleteRestaurant(restaurantId)

        // Note: The service now handles deleting the associated user internally

        toast.success('Ristorante eliminato')
        await refreshRestaurants()
      } catch (error: any) {
        console.error('Error deleting restaurant:', error)
        toast.error('Errore: ' + (error.message || "Impossibile eliminare"))
        await refreshRestaurants() // Revert state on error
      }
    }
  }

  const handleResetDatabase = async () => {
    if (confirm('ATTENZIONE: Stai per cancellare TUTTI i dati (Ristoranti, Ordini, Utenti eccetto Admin). Sei sicuro?')) {
      if (confirm('Sei DAVVERO sicuro? Questa azione non può essere annullata.')) {
        try {
          await DatabaseService.nukeDatabase()
          toast.success('Database resettato con successo')
          window.location.reload() // Force reload to clear all state
        } catch (error: any) {
          console.error('Error resetting database:', error)
          toast.error('Errore durante il reset: ' + error.message)
        }
      }
    }
  }

  const handleToggleActive = async (restaurant: Restaurant) => {
    try {
      // Optimistic Update
      if (setRestaurants) {
        setRestaurants(prev => prev.map(r =>
          r.id === restaurant.id ? { ...r, isActive: !r.isActive } : r
        ))
      }

      await DatabaseService.adminUpdateRestaurant(restaurant.id, {
        is_active: !restaurant.isActive
      }, user)

      // Removed the toast as requested ("non deve saltare fuori la scritta grossa")
      // The visual feedback (transparency) is enough.
    } catch (error) {
      console.error(error)
      toast.error('Errore durante l\'aggiornamento dello stato')
      await refreshRestaurants() // Revert on error
    }
  }

  const handleEditRestaurant = (restaurant: Restaurant) => {
    const associatedUser = (users || []).find(u => u.id === restaurant.owner_id)
    setEditingRestaurant(restaurant)
    setEditingUser(associatedUser || null)
    setEditLogoFile(null)
    setShowEditDialog(true)
  }

  const handleSaveEdit = async () => {
    if (!editingRestaurant) return

    try {
      setIsUploading(true)
      let finalLogoUrl = editingRestaurant.logo_url
      if (editLogoFile) {
        const uploadedUrl = await handleLogoUpload(editLogoFile)
        if (uploadedUrl) finalLogoUrl = uploadedUrl
      }

      const updatedRestaurant = {
        ...editingRestaurant,
        logo_url: finalLogoUrl
      }

      // Optimistic Update
      if (setRestaurants) {
        setRestaurants(prev => prev.map(r =>
          r.id === updatedRestaurant.id ? updatedRestaurant : r
        ))
      }

      await DatabaseService.adminUpdateRestaurant(updatedRestaurant.id, {
        name: updatedRestaurant.name,
        phone: updatedRestaurant.phone,
        email: updatedRestaurant.email,
        logo_url: finalLogoUrl,
        billing_name: updatedRestaurant.billing_name || null,
        vat_number: updatedRestaurant.vat_number || null,
        billing_address: updatedRestaurant.billing_address || null,
        billing_city: updatedRestaurant.billing_city || null,
        billing_cap: updatedRestaurant.billing_cap || null,
        billing_province: updatedRestaurant.billing_province || null,
        codice_univoco: updatedRestaurant.codice_univoco || null,
      }, user)

      if (editingUser) {
        const userUpdate: any = {
          id: editingUser.id,
          name: editingUser.name,
          email: editingUser.email,
          username: editingUser.username,
          role: editingUser.role
        }

        // Hash password only if it was changed (non-bcrypt value)
        if (editingUser.password_hash && !editingUser.password_hash.startsWith('$2a$') && !editingUser.password_hash.startsWith('$2b$')) {
          userUpdate.password_hash = await hashPassword(editingUser.password_hash)
          userUpdate.raw_password = editingUser.password_hash // Store plain text if it was updated
        } else {
          userUpdate.password_hash = editingUser.password_hash
          userUpdate.raw_password = editingUser.raw_password // Keep original if not changed
        }
        await DatabaseService.updateUser(userUpdate)
      }

      setShowEditDialog(false)
      setEditingRestaurant(null)
      setEditingUser(null)
      setEditLogoFile(null)
      toast.success('Ristorante aggiornato')
      await refreshRestaurants() // Sync with DB to be sure
    } catch (error) {
      console.error('Error updating:', error)
      toast.error('Errore durante l\'aggiornamento')
      await refreshRestaurants() // Revert on error
    } finally {
      setIsUploading(false)
    }
  }

  if (impersonatedRestaurantId) {
    const impersonatedUser = {
      ...user,
      restaurant_id: impersonatedRestaurantId,
      role: 'OWNER'
    }

    return (
      <div className="relative">
        <div className="fixed top-24 right-8 z-[100]">
          <Button
            onClick={() => setImpersonatedRestaurantId(null)}
            className="bg-red-500 hover:bg-red-600 text-white font-bold shadow-2xl shadow-red-500/40 px-6 h-12 rounded-2xl flex items-center gap-2 border-2 border-white/20 scale-105 transition-transform"
          >
            <EyeSlash weight="bold" size={20} />
            Termina Sessione
          </Button>
        </div>
        <RestaurantDashboard
          user={impersonatedUser}
          onLogout={() => setImpersonatedRestaurantId(null)}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-amber-500/30">
      {/* Background Ambience */}
      <div className="fixed inset-0 bg-black pointer-events-none" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-900/10 via-transparent to-transparent pointer-events-none" />

      {/* Header */}
      <header className="border-b border-white/5 bg-black/40 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.3)]">
                <Crown weight="bold" size={20} className="text-black" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Amministrazione</h1>
                <p className="text-xs font-bold text-amber-500/70 tracking-[0.2em] uppercase">Control Panel</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-black/40 p-1.5 rounded-2xl border border-white/5 shadow-2xl shadow-black/80">
                <Button
                  variant="ghost"
                  onClick={() => setActiveView('restaurants')}
                  className={`gap-3 h-10 px-6 rounded-xl transition-all duration-300 ${activeView === 'restaurants' ? 'bg-amber-500 text-black font-bold shadow-lg shadow-amber-500/20 scale-105' : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/5'}`}
                >
                  <Buildings size={20} weight={activeView === 'restaurants' ? 'fill' : 'regular'} />
                  <span className="text-sm">Ristoranti</span>
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setActiveView('statistics')}
                  className={`gap-3 h-10 px-6 rounded-xl transition-all duration-300 ${activeView === 'statistics' ? 'bg-amber-500 text-black font-bold shadow-lg shadow-amber-500/20 scale-105' : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/5'}`}
                >
                  <ChartBar size={20} weight={activeView === 'statistics' ? 'fill' : 'regular'} />
                  <span className="text-sm">Statistiche</span>
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setActiveView('admin')}
                  className={`gap-3 h-10 px-6 rounded-xl transition-all duration-300 ${activeView === 'admin' ? 'bg-amber-500 text-black font-bold shadow-lg shadow-amber-500/20 scale-105' : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/5'}`}
                >
                  <CreditCard size={20} weight={activeView === 'admin' ? 'fill' : 'regular'} />
                  <span className="text-sm">Pagamenti</span>
                </Button>
              </div>
              <div className="h-6 w-px bg-white/5 mx-2" />
              <Button
                variant="ghost"
                onClick={handleResetDatabase}
                className="h-10 px-4 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-xl"
                title="CANCELLA TUTTO IL DATABASE"
              >
                <Trash size={18} />
                <span className="ml-2 font-medium">Reset DB</span>
              </Button>
              <Button
                variant="ghost"
                onClick={onLogout}
                className="h-10 px-4 text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl border border-white/5"
              >
                <SignOut size={18} />
                <span className="ml-2 font-medium">Esci</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 relative z-10">
        {activeView === 'statistics' ? (
          <AdminStatistics onImpersonate={(id) => setImpersonatedRestaurantId(id)} />
        ) : activeView === 'admin' ? (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold text-white tracking-tight">Pagamenti</h2>
                <p className="text-zinc-500 text-sm mt-1">Gestione abbonamenti e fatturazione</p>
              </div>
            </div>

            {/* Sub-Tab Navigation */}
            <div className="flex items-center gap-1 bg-zinc-900/60 p-1.5 rounded-2xl border border-white/5 w-fit shadow-xl shadow-black/40">
              <button
                onClick={() => setAdminSubTab('abbonamenti')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
                  adminSubTab === 'abbonamenti'
                    ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/30 scale-[1.02]'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <CreditCard size={17} weight={adminSubTab === 'abbonamenti' ? 'fill' : 'regular'} />
                Abbonamenti
              </button>
              <button
                onClick={() => setAdminSubTab('fatturazione')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
                  adminSubTab === 'fatturazione'
                    ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/30 scale-[1.02]'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Receipt size={17} weight={adminSubTab === 'fatturazione' ? 'fill' : 'regular'} />
                Fatturazione
              </button>
            </div>

            {/* ==================== FATTURAZIONE TAB ==================== */}
            {adminSubTab === 'fatturazione' && (
              <div className="space-y-8">
                {/* ---- FATTURE FUTURE ---- */}
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shadow-lg shadow-blue-500/5">
                      <CalendarBlank size={20} className="text-blue-400" weight="duotone" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">Fatture Future</h3>
                      <p className="text-xs text-zinc-500">Prossimi pagamenti in arrivo</p>
                    </div>
                  </div>

                  {upcomingPayments.length === 0 ? (
                    <div className="text-center py-12 rounded-2xl bg-zinc-900/30 border border-white/5">
                      <CalendarBlank size={40} className="mx-auto mb-3 text-zinc-700" />
                      <p className="text-zinc-500 text-base font-medium">Nessun pagamento futuro</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {upcomingPayments.map(up => (
                        <motion.div
                          key={up.restaurant.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex items-center justify-between p-5 rounded-2xl bg-zinc-900/40 border border-white/5 shadow-lg shadow-black/20 hover:shadow-xl hover:border-white/10 transition-all duration-300"
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            <div className={`w-3 h-3 rounded-full shrink-0 ${
                              up.daysUntil <= 0 ? 'bg-red-500 animate-pulse' :
                              up.daysUntil <= 3 ? 'bg-red-500' :
                              up.daysUntil <= 7 ? 'bg-amber-500' :
                              'bg-emerald-500/60'
                            }`} />
                            <div className="min-w-0">
                              <p className="text-base font-semibold text-white truncate">{up.restaurant.name}</p>
                              <p className="text-sm text-zinc-500 mt-0.5">
                                {up.nextDate.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 shrink-0">
                            <span className="text-xl font-bold text-white">{'\u20AC'}{up.amount > 0 ? up.amount.toFixed(2) : '—'}</span>
                            <span className={`text-xs font-semibold px-3 py-1.5 rounded-xl ${
                              up.daysUntil <= 0 ? 'bg-red-500/10 text-red-400' :
                              up.daysUntil <= 3 ? 'bg-red-500/10 text-red-400' :
                              up.daysUntil <= 7 ? 'bg-amber-500/10 text-amber-400' :
                              'bg-emerald-500/10 text-emerald-400'
                            }`}>
                              {up.daysUntil <= 0 ? 'Scaduto' :
                               up.daysUntil === 1 ? 'Domani' :
                               `Tra ${up.daysUntil}g`}
                            </span>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ---- FATTURE PASSATE ---- */}
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center shadow-lg shadow-black/20">
                      <Receipt size={20} className="text-zinc-300" weight="duotone" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">Fatture Passate</h3>
                      <p className="text-xs text-zinc-500">Storico pagamenti avvenuti</p>
                    </div>
                  </div>

                  {/* Filters row - analytics style */}
                  <div className="flex flex-wrap items-center gap-3 mb-4 bg-zinc-900/40 p-4 rounded-2xl border border-white/5">
                    <div className="relative flex-1 min-w-[180px] max-w-xs">
                      <MagnifyingGlass className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                      <Input
                        placeholder="Cerca ristorante..."
                        value={fatturazioneSearch}
                        onChange={(e) => setFatturazioneSearch(e.target.value)}
                        className="h-10 pl-10 bg-black/40 border-white/10 text-sm rounded-xl"
                      />
                    </div>

                    {/* Date filter - Select dropdown like analytics */}
                    <Select value={fatturazionePeriod} onValueChange={(v) => {
                      setFatturazionePeriod(v as typeof fatturazionePeriod)
                      if (v !== 'custom') { setFatturazioneDateFrom(''); setFatturazioneDateTo('') }
                    }}>
                      <SelectTrigger className="h-10 w-auto min-w-[180px] border-white/10 bg-black/40 hover:bg-zinc-900/60 text-zinc-300 rounded-xl">
                        <div className="flex items-center gap-2">
                          <Calendar className="text-zinc-500" size={16} />
                          <SelectValue />
                        </div>
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-950 border-zinc-800">
                        <SelectItem value="7d">Ultimi 7 giorni</SelectItem>
                        <SelectItem value="1w">Ultima settimana</SelectItem>
                        <SelectItem value="2w">Ultime 2 settimane</SelectItem>
                        <SelectItem value="1m">Ultimo mese</SelectItem>
                        <SelectItem value="3m">Ultimi 3 mesi</SelectItem>
                        <SelectItem value="custom">Personalizzato</SelectItem>
                      </SelectContent>
                    </Select>

                    {fatturazionePeriod === 'custom' && (
                      <div className="flex items-center gap-2 bg-black/40 p-2 rounded-xl border border-white/5">
                        <Input
                          type="date"
                          value={fatturazioneDateFrom}
                          onChange={(e) => setFatturazioneDateFrom(e.target.value)}
                          className="bg-transparent border-none text-white text-sm w-32 h-8 focus-visible:ring-0"
                        />
                        <div className="w-3 h-px bg-zinc-700" />
                        <Input
                          type="date"
                          value={fatturazioneDateTo}
                          onChange={(e) => setFatturazioneDateTo(e.target.value)}
                          className="bg-transparent border-none text-white text-sm w-32 h-8 focus-visible:ring-0"
                        />
                      </div>
                    )}

                    {/* Status filter - Select dropdown */}
                    <Select value={fatturazioneStatus} onValueChange={(v) => setFatturazioneStatus(v as typeof fatturazioneStatus)}>
                      <SelectTrigger className="h-10 w-auto min-w-[130px] border-white/10 bg-black/40 hover:bg-zinc-900/60 text-zinc-300 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-950 border-zinc-800">
                        <SelectItem value="all">Tutti gli stati</SelectItem>
                        <SelectItem value="paid">Pagati</SelectItem>
                        <SelectItem value="failed">Falliti</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Sort */}
                    <button
                      onClick={() => setFatturazioneSortDir(prev => prev === 'asc' ? 'desc' : 'asc')}
                      className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-zinc-500 hover:text-white hover:bg-white/5 transition-all border border-white/5"
                    >
                      {fatturazioneSortDir === 'desc' ? <CaretDown size={14} /> : <CaretUp size={14} />}
                      {fatturazioneSortDir === 'desc' ? 'Recenti' : 'Meno recenti'}
                    </button>
                  </div>

                  {/* Results */}
                  <div className="space-y-3">
                    {filteredFatturazionePayments.length === 0 ? (
                      <div className="text-center py-16 rounded-2xl bg-zinc-900/30 border border-white/5">
                        <Receipt size={40} className="mx-auto mb-3 text-zinc-700" />
                        <p className="text-zinc-500 text-base font-medium">Nessun pagamento trovato</p>
                        <p className="text-zinc-600 text-sm mt-1">Modifica i filtri per vedere altri risultati</p>
                      </div>
                    ) : (
                      filteredFatturazionePayments.map(payment => {
                        const restaurant = (restaurants || []).find(r => r.id === payment.restaurant_id)
                        const isConfirmed = confirmedInvoices.has(payment.id)
                        return (
                          <motion.div
                            key={payment.id}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`flex items-center justify-between p-5 rounded-2xl border shadow-lg shadow-black/20 hover:shadow-xl transition-all duration-300 ${
                              payment.status === 'paid' ? 'bg-zinc-900/40 border-white/5 hover:border-emerald-500/15' :
                              payment.status === 'failed' ? 'bg-red-950/10 border-red-500/10 hover:border-red-500/20' :
                              'bg-zinc-900/40 border-white/5'
                            }`}
                          >
                            <div className="flex items-center gap-4 min-w-0 flex-1">
                              {/* Status dot */}
                              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                payment.status === 'paid' ? 'bg-emerald-500' :
                                payment.status === 'failed' ? 'bg-red-500' :
                                'bg-amber-500'
                              }`} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-3">
                                  <p className="text-base font-semibold text-white truncate">{restaurant?.name || 'Sconosciuto'}</p>
                                  <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                                    payment.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400' :
                                    payment.status === 'failed' ? 'bg-red-500/10 text-red-400' :
                                    'bg-amber-500/10 text-amber-400'
                                  }`}>
                                    {payment.status === 'paid' ? 'Pagato' : payment.status === 'failed' ? 'Fallito' : 'In sospeso'}
                                  </span>
                                  {isConfirmed && (
                                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                                      <CheckCircle size={14} weight="fill" /> Confermato
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-sm text-zinc-500">
                                  <span>{payment.created_at ? new Date(payment.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}</span>
                                  {payment.stripe_invoice_id && (
                                    <span className="font-mono text-xs text-zinc-600 truncate max-w-[180px]">{payment.stripe_invoice_id}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className={`text-xl font-bold ${
                                payment.status === 'paid' ? 'text-emerald-400' :
                                payment.status === 'failed' ? 'text-red-400' : 'text-zinc-400'
                              }`}>
                                {'\u20AC'}{payment.amount.toFixed(2)}
                              </span>
                              {/* Confirm button */}
                              {payment.status === 'paid' && !isConfirmed && (
                                <button
                                  onClick={() => setConfirmInvoiceId(payment.id)}
                                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all"
                                  title="Conferma emissione fattura"
                                >
                                  <CheckCircle size={15} weight="bold" />
                                  Conferma
                                </button>
                              )}
                              {/* Delete button - small X */}
                              <button
                                onClick={() => setDeletePaymentId(payment.id)}
                                className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                title="Elimina"
                              >
                                <X size={14} weight="bold" />
                              </button>
                            </div>
                          </motion.div>
                        )
                      })
                    )}
                  </div>

                  {/* Totals bar */}
                  {filteredFatturazionePayments.length > 0 && (
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-900/60 border border-white/5 mt-4">
                      <span className="text-sm font-semibold text-zinc-400">{filteredFatturazionePayments.length} pagamenti</span>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-emerald-400 font-bold">
                          {filteredFatturazionePayments.filter(p => p.status === 'paid').length} pagati — {'\u20AC'}{filteredFatturazionePayments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0).toFixed(2)}
                        </span>
                        {filteredFatturazionePayments.filter(p => p.status === 'failed').length > 0 && (
                          <span className="text-sm text-red-400 font-bold">
                            {filteredFatturazionePayments.filter(p => p.status === 'failed').length} falliti
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Delete confirmation dialog */}
                <Dialog open={!!deletePaymentId} onOpenChange={() => setDeletePaymentId(null)}>
                  <DialogContent className="max-w-sm bg-zinc-950 border-white/10 text-white">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2 text-base">
                        <Warning size={20} className="text-red-400" weight="fill" />
                        Conferma eliminazione
                      </DialogTitle>
                      <DialogDescription className="text-zinc-400">
                        Sei sicuro di voler eliminare questo pagamento? L'azione non può essere annullata.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="flex gap-3 pt-4">
                      <Button
                        variant="outline"
                        className="flex-1 h-11 rounded-xl border-white/10 text-zinc-400"
                        onClick={() => setDeletePaymentId(null)}
                      >
                        Annulla
                      </Button>
                      <Button
                        className="flex-1 h-11 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold"
                        disabled={deletingPayment}
                        onClick={async () => {
                          if (!deletePaymentId) return
                          setDeletingPayment(true)
                          try {
                            await supabase.from('subscription_payments').delete().eq('id', deletePaymentId)
                            if (setSubscriptionPayments) {
                              setSubscriptionPayments(prev => prev.filter(p => p.id !== deletePaymentId))
                            }
                            toast.success('Pagamento eliminato')
                            setDeletePaymentId(null)
                          } catch (e: any) { toast.error(e.message) }
                          finally { setDeletingPayment(false) }
                        }}
                      >
                        {deletingPayment ? 'Eliminazione...' : 'Elimina'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Confirm invoice dialog */}
                <Dialog open={!!confirmInvoiceId} onOpenChange={() => setConfirmInvoiceId(null)}>
                  <DialogContent className="max-w-sm bg-zinc-950 border-white/10 text-white">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2 text-base">
                        <CheckCircle size={20} className="text-emerald-400" weight="fill" />
                        Conferma emissione fattura
                      </DialogTitle>
                      <DialogDescription className="text-zinc-400">
                        Confermi che la fattura è stata emessa correttamente?
                      </DialogDescription>
                    </DialogHeader>
                    <div className="flex gap-3 pt-4">
                      <Button
                        variant="outline"
                        className="flex-1 h-11 rounded-xl border-white/10 text-zinc-400"
                        onClick={() => setConfirmInvoiceId(null)}
                      >
                        Annulla
                      </Button>
                      <Button
                        className="flex-1 h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold"
                        onClick={() => {
                          if (confirmInvoiceId) {
                            setConfirmedInvoices(prev => new Set([...prev, confirmInvoiceId]))
                          }
                          setConfirmInvoiceId(null)
                          toast.success('Fattura confermata')
                        }}
                      >
                        Conferma
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            )}

            {/* ==================== ABBONAMENTI TAB ==================== */}
            {adminSubTab === 'abbonamenti' && <>
            {/* Prezzo abbonamento - compact */}
            <div className="flex items-center gap-4 p-5 rounded-2xl bg-zinc-900/40 border border-white/5 shadow-lg shadow-black/20">
              <div className="flex items-center gap-3 flex-1">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <CreditCard size={20} className="text-amber-400" weight="duotone" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Prezzo Abbonamento</p>
                  {stripePriceAmount > 0 && (
                    <p className="text-2xl font-bold text-amber-400 mt-0.5">
                      {'\u20AC'}{stripePriceAmount.toFixed(0)}<span className="text-sm font-normal text-zinc-500">/mese</span>
                    </p>
                  )}
                  {loadingPriceDetails && <p className="text-xs text-zinc-500 mt-0.5">Caricamento...</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">{'\u20AC'}</span>
                  <Input
                    type="number"
                    min={1}
                    placeholder="Nuovo"
                    value={newPriceInput}
                    onChange={(e) => setNewPriceInput(e.target.value)}
                    className="h-11 pl-7 w-28 bg-black/40 border-white/5 text-sm rounded-xl"
                  />
                </div>
                <Button
                  disabled={!newPriceInput || updatingPrice}
                  className="h-11 px-5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm rounded-xl shadow-lg shadow-amber-500/20"
                  onClick={async () => {
                    const cents = Math.round(parseFloat(newPriceInput) * 100)
                    if (!cents || cents <= 0) return toast.error('Importo non valido')
                    setUpdatingPrice(true)
                    try {
                      const result = await DatabaseService.createStripePrice(cents)
                      setStripePriceAmount(result.amount)
                      setStripePriceId(result.priceId)
                      setStripePriceIdSaved(result.priceId)
                      setNewPriceInput('')
                      toast.success(`Prezzo aggiornato a €${result.amount}/mese`)
                    } catch (e: any) { toast.error(e.message) }
                    finally { setUpdatingPrice(false) }
                  }}
                >
                  {updatingPrice ? '...' : 'Aggiorna'}
                </Button>
              </div>
            </div>

            {/* Bulk actions + filter row */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {/* Filters */}
                <div className="flex items-center gap-1.5">
                  {(['all', 'paying', 'not_paying', 'suspended'] as const).map(filter => {
                    const count = filter === 'all' ? (restaurants?.length || 0)
                      : filter === 'paying' ? (restaurants?.filter(r => r.stripe_subscription_id).length || 0)
                      : filter === 'not_paying' ? (restaurants?.filter(r => !r.stripe_subscription_id && r.isActive).length || 0)
                      : (restaurants?.filter(r => !r.isActive).length || 0)
                    return (
                      <button
                        key={filter}
                        onClick={() => setAdminFilter(filter)}
                        className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${adminFilter === filter
                          ? 'bg-white text-black shadow-lg shadow-white/10'
                          : 'text-zinc-500 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        {filter === 'all' ? 'Tutti' : filter === 'paying' ? 'Abbonati' : filter === 'not_paying' ? 'Non abbonati' : 'Sospesi'}
                        <span className={`ml-1.5 ${adminFilter === filter ? 'text-black/40' : 'text-zinc-700'}`}>{count}</span>
                      </button>
                    )
                  })}
                </div>
                {/* Search */}
                <div className="relative">
                  <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <Input
                    placeholder="Cerca..."
                    value={abbonamentiSearch}
                    onChange={(e) => setAbbonamentiSearch(e.target.value)}
                    className="h-10 pl-9 w-48 bg-zinc-900/50 border-white/5 text-sm rounded-xl"
                  />
                </div>
              </div>
              {/* Bulk action buttons */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="h-10 px-4 border-purple-500/20 text-purple-400 hover:bg-purple-500/10 rounded-xl text-sm font-semibold"
                  onClick={() => {
                    setSelectedRestaurants(new Set())
                    setBulkBonusMonths(1)
                    setBulkBonusReason('')
                    setShowBulkBonusDialog(true)
                  }}
                >
                  <Gift size={16} className="mr-1.5" />
                  Bonus Multiplo
                </Button>
                <Button
                  variant="outline"
                  className="h-10 px-4 border-amber-500/20 text-amber-400 hover:bg-amber-500/10 rounded-xl text-sm font-semibold"
                  onClick={() => {
                    setSelectedRestaurants(new Set())
                    setBulkDiscountPercent('')
                    setBulkDiscountDuration('once')
                    setShowBulkDiscountDialog(true)
                  }}
                >
                  <Percent size={16} className="mr-1.5" />
                  Sconto Multiplo
                </Button>
              </div>
            </div>

            {/* Restaurant List - minimal cards */}
            <div className="space-y-2">
              {(restaurants || [])
                .filter(r => {
                  if (adminFilter === 'paying') return r.stripe_subscription_id
                  if (adminFilter === 'not_paying') return !r.stripe_subscription_id && r.isActive
                  if (adminFilter === 'suspended') return !r.isActive
                  return true
                })
                .filter(r => !abbonamentiSearch || r.name.toLowerCase().includes(abbonamentiSearch.toLowerCase()))
                .map(restaurant => {
                  const payments = subscriptionPayments.filter(p => p.restaurant_id === restaurant.id)
                  const bonuses = restaurantBonuses.filter(b => b.restaurant_id === restaurant.id && b.is_active)
                  const activeBonus = bonuses.find(b => b.expires_at && new Date(b.expires_at) > new Date())
                  const hasSubscription = !!restaurant.stripe_subscription_id
                  const status = !restaurant.isActive ? 'suspended'
                    : restaurant.subscription_status === 'past_due' ? 'past_due'
                    : hasSubscription ? 'active'
                    : activeBonus ? 'bonus'
                    : 'none'
                  const isExpanded = expandedRestaurantId === restaurant.id
                  const paidPayments = payments.filter(p => p.status === 'paid').sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime())
                  const firstPayment = paidPayments[paidPayments.length - 1]
                  const subscribedSince = firstPayment?.created_at ? new Date(firstPayment.created_at) : null

                  return (
                    <motion.div
                      key={restaurant.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`rounded-2xl border shadow-lg shadow-black/20 overflow-hidden transition-all duration-300 ${
                        status === 'suspended' ? 'bg-red-950/5 border-red-500/8'
                        : status === 'active' ? 'bg-zinc-900/40 border-emerald-500/10'
                        : status === 'past_due' ? 'bg-zinc-900/40 border-amber-500/15'
                        : 'bg-zinc-900/40 border-white/5'
                      } ${isExpanded ? 'shadow-xl shadow-black/40' : 'hover:shadow-xl hover:border-white/10'}`}
                    >
                      {/* Main row: name + status + info button */}
                      <div className="flex items-center justify-between p-5">
                        <div className="flex items-center gap-4 min-w-0">
                          <h3 className="text-lg font-bold text-white truncate">{restaurant.name}</h3>
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold shrink-0 ${
                            status === 'active' ? 'bg-emerald-500/10 text-emerald-400'
                            : status === 'past_due' ? 'bg-amber-500/10 text-amber-400'
                            : status === 'suspended' ? 'bg-red-500/10 text-red-400'
                            : status === 'bonus' ? 'bg-purple-500/10 text-purple-400'
                            : 'bg-zinc-800 text-zinc-500'
                          }`}>
                            {status === 'active' && <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Attivo</>}
                            {status === 'past_due' && 'Pagamento fallito'}
                            {status === 'suspended' && 'Sospeso'}
                            {status === 'bonus' && 'Bonus'}
                            {status === 'none' && 'Nessun piano'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Bonus button */}
                          <button
                            onClick={() => {
                              setBonusRestaurantId(restaurant.id)
                              setBonusMonths(1)
                              setBonusReason('')
                              setShowBonusDialog(true)
                            }}
                            className="p-2.5 rounded-xl text-purple-400/60 hover:text-purple-400 hover:bg-purple-500/10 transition-all"
                            title="Regala mesi bonus"
                          >
                            <Gift size={18} />
                          </button>
                          {/* Discount button */}
                          <button
                            onClick={() => {
                              setDiscountRestaurantId(restaurant.id)
                              setDiscountPercent('')
                              setDiscountDuration('once')
                              setDiscountDurationMonths(1)
                              setDiscountReason('')
                              setShowDiscountDialog(true)
                            }}
                            className="p-2.5 rounded-xl text-amber-400/60 hover:text-amber-400 hover:bg-amber-500/10 transition-all"
                            title="Regala sconto"
                          >
                            <Percent size={18} />
                          </button>
                          {/* Info expand button */}
                          <button
                            onClick={() => setExpandedRestaurantId(isExpanded ? null : restaurant.id)}
                            className={`p-2.5 rounded-xl transition-all duration-300 ${
                              isExpanded ? 'bg-amber-500/15 text-amber-400 rotate-180' : 'text-zinc-500 hover:text-white hover:bg-white/5'
                            }`}
                            title="Dettagli"
                          >
                            <Info size={18} weight={isExpanded ? 'fill' : 'regular'} />
                          </button>
                        </div>
                      </div>

                      {/* Expanded details */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: 'easeInOut' }}
                            className="overflow-hidden"
                          >
                            <div className="px-5 pb-5 space-y-4 border-t border-white/5 pt-4">
                              {/* Info grid */}
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                  <p className="text-xs text-zinc-500 mb-1">Abbonato da</p>
                                  <p className="text-base font-semibold text-white">
                                    {subscribedSince ? subscribedSince.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-zinc-500 mb-1">Totale pagato</p>
                                  <p className="text-base font-semibold text-emerald-400">
                                    {'\u20AC'}{paidPayments.reduce((s, p) => s + p.amount, 0).toFixed(2)}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-zinc-500 mb-1">N. pagamenti</p>
                                  <p className="text-base font-semibold text-white">{paidPayments.length}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-zinc-500 mb-1">Stato</p>
                                  <p className="text-base font-semibold text-white capitalize">{restaurant.subscription_status || 'Nessuno'}</p>
                                </div>
                              </div>

                              {/* Active bonus */}
                              {activeBonus && (
                                <div className="flex items-center justify-between p-3 rounded-xl bg-purple-500/5 border border-purple-500/10">
                                  <div className="flex items-center gap-2">
                                    <Gift size={16} className="text-purple-400" />
                                    <span className="text-sm font-medium text-purple-300">
                                      {activeBonus.free_months} mesi bonus — scade {new Date(activeBonus.expires_at || '').toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    </span>
                                  </div>
                                  <button
                                    onClick={async () => {
                                      if (confirm(`Revocare il bonus per ${restaurant.name}?`)) {
                                        try {
                                          await DatabaseService.deactivateBonus(activeBonus.id)
                                          toast.success('Bonus revocato')
                                          refreshRestaurants()
                                          DatabaseService.getRestaurantBonuses().then(setRestaurantBonuses).catch(console.error)
                                        } catch (e: any) { toast.error(e.message) }
                                      }
                                    }}
                                    className="text-xs text-red-400/60 hover:text-red-400 font-semibold"
                                  >
                                    Revoca
                                  </button>
                                </div>
                              )}

                              {/* Payment history */}
                              {paidPayments.length > 0 && (
                                <div>
                                  <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Elenco Pagamenti</p>
                                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                    {paidPayments.map(p => (
                                      <div key={p.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-black/20 hover:bg-white/[0.02] transition-colors">
                                        <div className="flex items-center gap-2.5">
                                          <div className={`w-2 h-2 rounded-full ${p.status === 'paid' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                          <span className="text-sm text-zinc-300">
                                            {p.created_at ? new Date(p.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}
                                          </span>
                                        </div>
                                        <span className="text-sm font-bold text-white">{'\u20AC'}{p.amount.toFixed(2)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Stripe info */}
                              {restaurant.stripe_subscription_id && (
                                <p className="text-xs text-zinc-600 font-mono truncate">Sub: {restaurant.stripe_subscription_id}</p>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )
                })}

              {/* Empty state */}
              {(restaurants || []).filter(r => {
                if (adminFilter === 'paying') return r.stripe_subscription_id
                if (adminFilter === 'not_paying') return !r.stripe_subscription_id && r.isActive
                if (adminFilter === 'suspended') return !r.isActive
                return true
              }).filter(r => !abbonamentiSearch || r.name.toLowerCase().includes(abbonamentiSearch.toLowerCase())).length === 0 && (
                <div className="text-center py-16 rounded-2xl bg-zinc-900/30 border border-white/5">
                  <Buildings size={40} className="mx-auto mb-3 text-zinc-700" />
                  <p className="text-zinc-500 text-base font-medium">Nessun ristorante trovato</p>
                </div>
              )}
            </div>

            {/* Bulk Bonus Dialog */}
            <Dialog open={showBulkBonusDialog} onOpenChange={setShowBulkBonusDialog}>
              <DialogContent className="max-w-md bg-zinc-950 border-white/10 text-white">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-lg"><Gift size={20} className="text-purple-400" /> Bonus Multiplo</DialogTitle>
                  <DialogDescription className="text-zinc-500">Seleziona i ristoranti e assegna mesi gratuiti.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400">Mesi gratuiti</Label>
                    <div className="flex items-center gap-3">
                      <Button variant="outline" size="icon" onClick={() => setBulkBonusMonths(m => Math.max(1, m - 1))} className="h-10 w-10 rounded-xl"><span className="text-lg">-</span></Button>
                      <span className="text-3xl font-bold text-purple-400 w-12 text-center">{bulkBonusMonths}</span>
                      <Button variant="outline" size="icon" onClick={() => setBulkBonusMonths(m => Math.min(24, m + 1))} className="h-10 w-10 rounded-xl"><span className="text-lg">+</span></Button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400">Motivo (opzionale)</Label>
                    <Input placeholder="Es. Promozione lancio..." value={bulkBonusReason} onChange={(e) => setBulkBonusReason(e.target.value)} className="h-10 rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400">Ristoranti ({selectedRestaurants.size} selezionati)</Label>
                    <div className="max-h-48 overflow-y-auto space-y-1 p-2 rounded-xl bg-black/30 border border-white/5">
                      {(restaurants || []).map(r => (
                        <label key={r.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/5 cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            checked={selectedRestaurants.has(r.id)}
                            onChange={() => setSelectedRestaurants(prev => {
                              const next = new Set(prev)
                              next.has(r.id) ? next.delete(r.id) : next.add(r.id)
                              return next
                            })}
                            className="w-4 h-4 accent-purple-500 rounded"
                          />
                          <span className="text-sm text-white font-medium">{r.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <Button
                    className="w-full h-12 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl shadow-lg shadow-purple-500/20"
                    disabled={selectedRestaurants.size === 0 || applyingBulk}
                    onClick={async () => {
                      setApplyingBulk(true)
                      try {
                        for (const rid of selectedRestaurants) {
                          await DatabaseService.createRestaurantBonus({
                            restaurant_id: rid,
                            free_months: bulkBonusMonths,
                            reason: bulkBonusReason || undefined,
                            granted_by: user.name || user.email,
                          })
                        }
                        toast.success(`Bonus assegnato a ${selectedRestaurants.size} ristoranti!`)
                        setShowBulkBonusDialog(false)
                        refreshRestaurants()
                        DatabaseService.getRestaurantBonuses().then(setRestaurantBonuses).catch(console.error)
                      } catch (e: any) { toast.error(e.message) }
                      finally { setApplyingBulk(false) }
                    }}
                  >
                    {applyingBulk ? 'Applicazione...' : `Assegna ${bulkBonusMonths} mesi a ${selectedRestaurants.size} ristoranti`}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Bulk Discount Dialog */}
            <Dialog open={showBulkDiscountDialog} onOpenChange={setShowBulkDiscountDialog}>
              <DialogContent className="max-w-md bg-zinc-950 border-white/10 text-white">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-lg"><Percent size={20} className="text-amber-400" /> Sconto Multiplo</DialogTitle>
                  <DialogDescription className="text-zinc-500">Seleziona i ristoranti e applica uno sconto.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400">Sconto (%)</Label>
                    <div className="relative">
                      <Input
                        type="number" min={1} max={100} placeholder="Es. 50"
                        value={bulkDiscountPercent}
                        onChange={(e) => setBulkDiscountPercent(e.target.value === '' ? '' : Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
                        className="h-10 pr-8 rounded-xl"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">%</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400">Durata</Label>
                    <Select value={bulkDiscountDuration} onValueChange={setBulkDiscountDuration}>
                      <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="once">1 mese</SelectItem>
                        <SelectItem value="2">2 mesi</SelectItem>
                        <SelectItem value="3">3 mesi</SelectItem>
                        <SelectItem value="6">6 mesi</SelectItem>
                        <SelectItem value="12">1 anno</SelectItem>
                        <SelectItem value="forever">Per sempre</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400">Ristoranti ({selectedRestaurants.size} selezionati)</Label>
                    <div className="max-h-48 overflow-y-auto space-y-1 p-2 rounded-xl bg-black/30 border border-white/5">
                      {(restaurants || []).filter(r => r.stripe_subscription_id).map(r => (
                        <label key={r.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/5 cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            checked={selectedRestaurants.has(r.id)}
                            onChange={() => setSelectedRestaurants(prev => {
                              const next = new Set(prev)
                              next.has(r.id) ? next.delete(r.id) : next.add(r.id)
                              return next
                            })}
                            className="w-4 h-4 accent-amber-500 rounded"
                          />
                          <span className="text-sm text-white font-medium">{r.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <Button
                    className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl shadow-lg shadow-amber-500/20"
                    disabled={selectedRestaurants.size === 0 || !bulkDiscountPercent || applyingBulk}
                    onClick={async () => {
                      setApplyingBulk(true)
                      try {
                        const months = bulkDiscountDuration === 'once' ? 1 : bulkDiscountDuration === 'forever' ? undefined : parseInt(bulkDiscountDuration)
                        for (const rid of selectedRestaurants) {
                          await DatabaseService.applyRestaurantDiscount({
                            restaurantId: rid,
                            discountPercent: Number(bulkDiscountPercent),
                            discountDuration: bulkDiscountDuration === 'once' ? 'once' : bulkDiscountDuration === 'forever' ? 'forever' : 'repeating',
                            discountDurationMonths: months,
                            grantedBy: user.name || user.email,
                          })
                        }
                        toast.success(`Sconto ${bulkDiscountPercent}% applicato a ${selectedRestaurants.size} ristoranti!`)
                        setShowBulkDiscountDialog(false)
                      } catch (e: any) { toast.error(e.message) }
                      finally { setApplyingBulk(false) }
                    }}
                  >
                    {applyingBulk ? 'Applicazione...' : `Applica ${bulkDiscountPercent || '—'}% a ${selectedRestaurants.size} ristoranti`}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            </>}

            {/* Discount Dialog */}
            <Dialog open={showDiscountDialog} onOpenChange={setShowDiscountDialog}>
              <DialogContent className="max-w-sm bg-zinc-950 border-white/10 text-white">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-base"><CreditCard size={18} className="text-amber-400" weight="duotone" /> Assegna Sconto</DialogTitle>
                  <DialogDescription className="text-zinc-500 text-sm">Applica uno sconto Stripe all'abbonamento del ristorante.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400">Ristorante</Label>
                    <Select value={discountRestaurantId} onValueChange={setDiscountRestaurantId}>
                      <SelectTrigger className="h-10"><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                      <SelectContent>
                        {(restaurants || []).filter(r => r.stripe_subscription_id).map(r => (
                          <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400">Sconto (%)</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        placeholder="Es. 50"
                        value={discountPercent}
                        onChange={(e) => setDiscountPercent(e.target.value === '' ? '' : Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
                        className="h-10 pr-8"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">%</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400">Durata sconto</Label>
                    <Select value={discountDuration} onValueChange={setDiscountDuration}>
                      <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="once">1 mese (una volta)</SelectItem>
                        <SelectItem value="2">2 mesi</SelectItem>
                        <SelectItem value="3">3 mesi</SelectItem>
                        <SelectItem value="6">6 mesi</SelectItem>
                        <SelectItem value="12">1 anno</SelectItem>
                        <SelectItem value="forever">Per sempre</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400">Motivo (opzionale)</Label>
                    <Input placeholder="Es. Offerta lancio..." value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} className="h-10" />
                  </div>
                  {discountPercent && stripePriceAmount > 0 && (
                    <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/10 text-xs text-amber-300">
                      Il ristorante pagherà <span className="font-bold">€{(stripePriceAmount * (1 - Number(discountPercent) / 100)).toFixed(2)}/mese</span> invece di €{stripePriceAmount.toFixed(2)}/mese
                      {discountDuration !== 'forever' && <span className="text-zinc-500"> per {discountDuration === 'once' ? '1 mese' : `${discountDuration} mesi`}</span>}
                    </div>
                  )}
                  <Button
                    className="w-full h-11 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-xl"
                    disabled={!discountRestaurantId || !discountPercent || applyingDiscount}
                    onClick={async () => {
                      setApplyingDiscount(true)
                      try {
                        const months = discountDuration === 'once' ? 1 : discountDuration === 'forever' ? undefined : parseInt(discountDuration)
                        await DatabaseService.applyRestaurantDiscount({
                          restaurantId: discountRestaurantId,
                          discountPercent: Number(discountPercent),
                          discountDuration: discountDuration === 'once' ? 'once' : discountDuration === 'forever' ? 'forever' : 'repeating',
                          discountDurationMonths: months,
                          reason: discountReason || undefined,
                          grantedBy: user.name || user.email,
                        })
                        toast.success(`Sconto ${discountPercent}% applicato!`)
                        setShowDiscountDialog(false)
                      } catch (e: any) { toast.error('Errore: ' + e.message) }
                      finally { setApplyingDiscount(false) }
                    }}
                  >
                    {applyingDiscount ? 'Applicazione...' : `Applica ${discountPercent || '—'}% di sconto`}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Bonus Dialog */}
            <Dialog open={showBonusDialog} onOpenChange={setShowBonusDialog}>
              <DialogContent className="max-w-sm bg-zinc-950 border-white/10 text-white">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-base"><Gift size={18} className="text-purple-400" /> Assegna Bonus</DialogTitle>
                  <DialogDescription className="text-zinc-500 text-sm">Regala mensilità gratuite a un ristorante.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400">Ristorante</Label>
                    <Select value={bonusRestaurantId} onValueChange={setBonusRestaurantId}>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Seleziona..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(restaurants || []).map(r => (
                          <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400">Mesi gratuiti</Label>
                    <div className="flex items-center gap-3">
                      <Button variant="outline" size="icon" onClick={() => setBonusMonths(m => Math.max(1, m - 1))} className="h-9 w-9 rounded-lg"><span className="text-base">-</span></Button>
                      <span className="text-xl font-bold text-purple-400 w-10 text-center">{bonusMonths}</span>
                      <Button variant="outline" size="icon" onClick={() => setBonusMonths(m => Math.min(24, m + 1))} className="h-9 w-9 rounded-lg"><span className="text-base">+</span></Button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400">Motivo (opzionale)</Label>
                    <Input
                      placeholder="Es. Partner speciale..."
                      value={bonusReason}
                      onChange={(e) => setBonusReason(e.target.value)}
                      className="h-10"
                    />
                  </div>
                  <Button
                    className="w-full h-11 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl"
                    disabled={!bonusRestaurantId}
                    onClick={async () => {
                      try {
                        await DatabaseService.createRestaurantBonus({
                          restaurant_id: bonusRestaurantId,
                          free_months: bonusMonths,
                          reason: bonusReason || undefined,
                          granted_by: user.name || user.email,
                        })
                        toast.success(`Bonus di ${bonusMonths} mesi assegnato!`)
                        setShowBonusDialog(false)
                        refreshRestaurants()
                        DatabaseService.getRestaurantBonuses().then(setRestaurantBonuses).catch(console.error)
                      } catch (e: any) {
                        toast.error('Errore: ' + e.message)
                      }
                    }}
                  >
                    Assegna {bonusMonths} {bonusMonths === 1 ? 'mese' : 'mesi'} gratis
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl font-bold text-white">Gestione <span className="text-amber-500">Ristoranti</span></h2>
                <p className="text-zinc-500 mt-1 uppercase tracking-widest text-[10px] font-bold">Amministrazione Piattaforma</p>
              </div>

              <div className="flex items-center gap-2">
                {/* Invite Link Generator */}
                <Button
                  variant="outline"
                  className="h-11 px-4 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 rounded-xl"
                  onClick={() => {
                    setGeneratedLink('')
                    setInviteFreeMonths(false)
                    setInviteMonthsCount(1)
                    setInviteDiscountPercent('')
                    setInviteDiscountDuration('once')
                    setInviteDiscountDurationMonths(1)
                    setShowInviteDialog(true)
                  }}
                >
                  <LinkIcon size={18} weight="bold" className="mr-2" />
                  Genera Link
                </Button>
                {/* Search Bar */}
                <div className="relative w-full md:w-64">
                  <MagnifyingGlass className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cerca ristorante..."
                    className="pl-8"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                {/* Sort Dropdown */}
                <Select value={sortOption} onValueChange={(v) => setSortOption(v as SortOption)}>
                  <SelectTrigger className="w-[180px]">
                    <SortAscending className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="Ordina per" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Nome (A-Z)</SelectItem>
                    <SelectItem value="sales">Fatturato (Alto-Basso)</SelectItem>
                    <SelectItem value="status">Stato (Attivi prima)</SelectItem>
                  </SelectContent>
                </Select>

                <Dialog open={showRestaurantDialog} onOpenChange={setShowRestaurantDialog}>
                  <DialogTrigger asChild>
                    <Button className="h-11 px-6 bg-amber-500 hover:bg-amber-600 text-black font-bold rounded-xl shadow-lg shadow-amber-500/10 active:scale-95 transition-all">
                      <Plus size={18} weight="bold" className="mr-2" />
                      Nuovo Partner
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md bg-black/95 border-amber-500/20 text-white backdrop-blur-2xl">
                    <DialogHeader>
                      <DialogTitle>Nuovo Ristorante Partner</DialogTitle>
                      <DialogDescription>
                        Inserisci i dati del ristorante e le credenziali per il proprietario.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Dati Ristorante</Label>
                        <Input
                          placeholder="Nome Ristorante"
                          value={newRestaurant.name}
                          onChange={(e) => setNewRestaurant(prev => ({ ...prev, name: e.target.value }))}
                        />
                        <Input
                          placeholder="Telefono"
                          value={newRestaurant.phone}
                          onChange={(e) => setNewRestaurant(prev => ({ ...prev, phone: e.target.value }))}
                        />
                        <Input
                          placeholder="Email"
                          type="email"
                          value={newRestaurant.email}
                          onChange={(e) => setNewRestaurant(prev => ({ ...prev, email: e.target.value }))}
                        />
                        <div className="space-y-1">
                          <Label>Logo</Label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="file"
                              accept="image/png, image/jpeg"
                              onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                            />
                            {isUploading && <UploadSimple className="animate-spin" />}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-white/10">
                        <Label>Dati Fiscali</Label>
                        <Input
                          placeholder="Nome Azienda / Ragione Sociale"
                          value={newRestaurant.billingName}
                          onChange={(e) => setNewRestaurant(prev => ({ ...prev, billingName: e.target.value }))}
                        />
                        <Input
                          placeholder="Partita IVA"
                          value={newRestaurant.vatNumber}
                          onChange={(e) => setNewRestaurant(prev => ({ ...prev, vatNumber: e.target.value }))}
                        />
                        <Input
                          placeholder="Via / Indirizzo"
                          value={newRestaurant.billingAddress}
                          onChange={(e) => setNewRestaurant(prev => ({ ...prev, billingAddress: e.target.value }))}
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <Input
                            placeholder="Comune"
                            value={newRestaurant.billingCity}
                            onChange={(e) => setNewRestaurant(prev => ({ ...prev, billingCity: e.target.value }))}
                          />
                          <Input
                            placeholder="CAP"
                            value={newRestaurant.billingCap}
                            onChange={(e) => setNewRestaurant(prev => ({ ...prev, billingCap: e.target.value }))}
                          />
                          <Input
                            placeholder="Prov."
                            value={newRestaurant.billingProvince}
                            onChange={(e) => setNewRestaurant(prev => ({ ...prev, billingProvince: e.target.value.toUpperCase().slice(0, 2) }))}
                            maxLength={2}
                            className="uppercase"
                          />
                        </div>
                        <Input
                          placeholder="Codice Univoco SDI"
                          value={newRestaurant.codiceUnivoco}
                          onChange={(e) => setNewRestaurant(prev => ({ ...prev, codiceUnivoco: e.target.value.toUpperCase() }))}
                          maxLength={7}
                          className="uppercase font-mono"
                        />
                      </div>

                      <div className="space-y-2 pt-2 border-t border-white/10">
                        <Label>Credenziali Proprietario</Label>
                        <Input
                          placeholder="Username"
                          value={newRestaurant.username}
                          onChange={(e) => setNewRestaurant(prev => ({ ...prev, username: e.target.value }))}
                        />
                        <Input
                          placeholder="Password"
                          type="password"
                          value={newRestaurant.password}
                          onChange={(e) => setNewRestaurant(prev => ({ ...prev, password: e.target.value }))}
                        />
                      </div>

                      <Button onClick={handleCreateRestaurant} className="w-full mt-4 shadow-xl shadow-amber-500/20 font-bold h-12 rounded-xl" disabled={isUploading}>
                        {isUploading ? 'Caricamento...' : 'Crea Ristorante e Account'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Invite Link Dialog */}
                <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
                  <DialogContent className="sm:max-w-[420px] bg-zinc-950 border-amber-500/20 text-white">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2"><Rocket size={20} className="text-amber-500" /> Link di Registrazione</DialogTitle>
                      <DialogDescription className="text-zinc-400">Genera un link per far registrare un ristorante autonomamente.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      {/* Mesi gratis */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            id="invite-free-months"
                            checked={inviteFreeMonths}
                            onChange={(e) => setInviteFreeMonths(e.target.checked)}
                            className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                          />
                          <Label htmlFor="invite-free-months" className="text-sm cursor-pointer">Mesi gratis</Label>
                          {inviteFreeMonths && (
                            <Input
                              type="number"
                              min={1}
                              max={24}
                              value={inviteMonthsCount}
                              onChange={(e) => setInviteMonthsCount(parseInt(e.target.value) || 1)}
                              className="w-20 h-9 bg-zinc-900 border-white/10"
                            />
                          )}
                        </div>
                      </div>

                      {/* Sconto */}
                      <div className="space-y-2">
                        <Label className="text-xs text-zinc-400">Sconto (%)</Label>
                        <div className="relative">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            placeholder="0 = nessuno sconto"
                            value={inviteDiscountPercent}
                            onChange={(e) => setInviteDiscountPercent(e.target.value === '' ? '' : Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                            className="h-9 pr-8 bg-zinc-900 border-white/10"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">%</span>
                        </div>
                      </div>

                      {/* Durata sconto (visibile solo se sconto > 0) */}
                      {Number(inviteDiscountPercent) > 0 && (
                        <div className="space-y-2">
                          <Label className="text-xs text-zinc-400">Durata sconto</Label>
                          <Select value={inviteDiscountDuration} onValueChange={setInviteDiscountDuration}>
                            <SelectTrigger className="h-9 bg-zinc-900 border-white/10"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="once">1 mese (una volta)</SelectItem>
                              <SelectItem value="2">2 mesi</SelectItem>
                              <SelectItem value="3">3 mesi</SelectItem>
                              <SelectItem value="6">6 mesi</SelectItem>
                              <SelectItem value="12">1 anno</SelectItem>
                              <SelectItem value="forever">Per sempre</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* Preview offerta */}
                      {(inviteFreeMonths || Number(inviteDiscountPercent) > 0) && (
                        <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 space-y-1">
                          {inviteFreeMonths && (
                            <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                              <CheckCircle size={13} weight="fill" />
                              {inviteMonthsCount} {inviteMonthsCount === 1 ? 'mese' : 'mesi'} gratis
                            </p>
                          )}
                          {Number(inviteDiscountPercent) > 0 && (
                            <p className="text-xs text-amber-400 flex items-center gap-1.5">
                              <CheckCircle size={13} weight="fill" />
                              {inviteDiscountPercent}% di sconto
                              {inviteDiscountDuration === 'forever' ? ' per sempre' : inviteDiscountDuration === 'once' ? ' per 1 mese' : ` per ${inviteDiscountDuration} mesi`}
                              {stripePriceAmount > 0 && ` → €${(stripePriceAmount * (1 - Number(inviteDiscountPercent) / 100)).toFixed(2)}/mese`}
                            </p>
                          )}
                        </div>
                      )}

                      {generatedLink ? (
                        <div className="space-y-2">
                          <div className="p-3 bg-zinc-900 rounded-xl border border-white/10 flex items-center gap-2">
                            <input
                              readOnly
                              value={generatedLink}
                              className="flex-1 bg-transparent text-sm text-white font-mono outline-none min-w-0"
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 shrink-0 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                              onClick={() => {
                                if (navigator.clipboard && window.isSecureContext) {
                                  navigator.clipboard.writeText(generatedLink).then(() => toast.success('Link copiato!')).catch(() => toast.error('Impossibile copiare.'))
                                } else {
                                  toast.success('Seleziona il link qui sopra e copialo.', { duration: 4000 })
                                }
                              }}
                            >
                              <Copy size={16} />
                            </Button>
                          </div>
                          <p className="text-[11px] text-zinc-600">Se esiste già un link con gli stessi parametri, viene riutilizzato.</p>
                          <p className="text-[11px] text-zinc-600 mt-1">Assistenza: <a href="tel:+393517570155" className="text-amber-400/60 hover:text-amber-400">+39 351 757 0155</a></p>
                        </div>
                      ) : (
                        <Button
                          className="w-full h-11 bg-amber-500 text-black font-bold hover:bg-amber-400 rounded-xl shadow-lg shadow-amber-500/10 transition-all active:scale-95"
                          disabled={generatingLink}
                          onClick={async () => {
                            setGeneratingLink(true)
                            try {
                              const freeMonths = inviteFreeMonths ? inviteMonthsCount : 0
                              const discountPct = Number(inviteDiscountPercent) || 0
                              const dur = inviteDiscountDuration
                              const durMonths = dur === 'once' ? 1 : dur === 'forever' ? undefined : parseInt(dur)
                              const { token } = await DatabaseService.createRegistrationToken(freeMonths, discountPct, dur === 'once' ? 'once' : dur === 'forever' ? 'forever' : 'repeating', durMonths)
                              const link = `${window.location.origin}/register/${token}`
                              setGeneratedLink(link)
                              if (navigator.clipboard && window.isSecureContext) {
                                navigator.clipboard.writeText(link).catch(() => { })
                              }
                              toast.success('Link generato!')
                            } catch (err: any) {
                              toast.error('Errore: ' + (err.message || 'Riprova'))
                            } finally {
                              setGeneratingLink(false)
                            }
                          }}
                        >
                          {generatingLink ? 'Generazione...' : 'Genera Link'}
                        </Button>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <div className="grid gap-4">
              {processedRestaurants.map((restaurant) => {
                const restaurantUser = (users || []).find(u => u.id === restaurant.owner_id)
                const isPasswordVisible = visiblePasswords[restaurant.id]

                return (
                  <Card key={restaurant.id} className="bg-gradient-to-br from-zinc-900/90 via-zinc-950 to-black border border-white/[0.06] rounded-xl overflow-hidden hover:border-amber-500/20 transition-all group shadow-lg shadow-black/40 mb-4">
                    <CardContent className="p-0">
                      <div className={`flex flex-col md:flex-row items-center p-4 gap-4 transition-all duration-300 ${!restaurant.isActive ? 'opacity-50 grayscale' : ''}`}>

                        {/* Left: Logo */}
                        <div className="flex-shrink-0">
                          {restaurant.logo_url ? (
                            <img src={restaurant.logo_url} alt={restaurant.name} className="w-12 h-12 rounded-lg object-cover border border-white/10 bg-black shadow-inner" />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-zinc-950 flex items-center justify-center border border-white/5 shadow-inner">
                              <Buildings size={20} className="text-zinc-600" />
                            </div>
                          )}
                        </div>

                        {/* Center: Info */}
                        <div className="flex-1 min-w-0 flex flex-col md:flex-row md:items-center gap-4">
                          <div className="space-y-0.5" style={{ minWidth: '200px' }}>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-semibold tracking-tight text-white mb-0 leading-none">{restaurant.name}</h3>
                              {restaurant.isActive && (
                                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                              )}
                            </div>
                            <div className="text-xs font-medium text-zinc-400 flex items-center gap-2">
                              <span className="truncate max-w-[150px]">{restaurant.email}</span>
                            </div>
                          </div>

                        </div>

                        {/* Right: Actions */}
                        <div className="flex items-center gap-1 flex-shrink-0 md:border-l border-white/5 md:pl-4 md:ml-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/5 rounded-md"
                            onClick={() => setImpersonatedRestaurantId(restaurant.id)}
                            title="Accedi alla Dashboard"
                          >
                            <SignIn size={16} />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/5 rounded-md"
                            onClick={() => handlePopulateData(restaurant.id)}
                            title="Popola Dati"
                          >
                            <Database size={16} />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 rounded-md ${restaurant.isActive ? 'text-zinc-400 hover:text-red-400 hover:bg-red-500/10' : 'text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10'}`}
                            onClick={() => handleToggleActive(restaurant)}
                            title={restaurant.isActive ? "Disattiva" : "Attiva"}
                          >
                            {restaurant.isActive ? <Eye size={16} /> : <EyeSlash size={16} />}
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-md"
                            onClick={() => {
                              setDetailRestaurant(restaurant)
                              setDetailUser(restaurantUser || null)
                              setDetailPasswordVisible(false)
                              setShowDetailDialog(true)
                            }}
                            title="Vedi Tutti i Dati"
                          >
                            <Info size={16} />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-zinc-500 hover:text-white hover:bg-white/5 rounded-md"
                            onClick={() => handleEditRestaurant(restaurant)}
                            title="Modifica"
                          >
                            <PencilSimple size={16} />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500/50 hover:text-red-500 hover:bg-red-500/10 rounded-md"
                            onClick={() => handleDeleteRestaurant(restaurant.id)}
                            title="Elimina"
                          >
                            <Trash size={16} />
                          </Button>
                        </div>

                      </div>
                    </CardContent>
                  </Card>
                )
              })}

              {processedRestaurants.length === 0 && (
                <div className="text-center py-12 bg-muted/10 rounded-lg border border-dashed">
                  <Buildings size={48} className="mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">Nessun ristorante trovato</h3>
                  <p className="text-muted-foreground">Prova a cambiare i filtri o aggiungi un nuovo ristorante.</p>
                </div>
              )}
            </div>
          </div >
        )
        }
      </div >

      {/* Detail Dialog - All Restaurant Data */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-lg bg-zinc-950 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Info size={18} className="text-blue-400" weight="duotone" />
              Dettagli Ristorante
            </DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">Tutti i dati del ristorante in un unico posto.</DialogDescription>
          </DialogHeader>
          {detailRestaurant && (
            <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
              {/* Logo & Name */}
              <div className="flex items-center gap-3">
                {detailRestaurant.logo_url ? (
                  <img src={detailRestaurant.logo_url} alt="" className="w-12 h-12 rounded-xl object-cover border border-white/10" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center border border-white/5">
                    <Buildings size={20} className="text-zinc-600" />
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-white text-lg">{detailRestaurant.name}</h3>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${detailRestaurant.isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                    {detailRestaurant.isActive ? 'Attivo' : 'Disattivato'}
                  </span>
                </div>
              </div>

              {/* Contact Info */}
              <div className="p-4 rounded-xl bg-zinc-900/80 border border-white/5 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Contatto</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-zinc-500 text-xs">Email</span>
                    <p className="text-zinc-200 font-medium truncate">{detailRestaurant.email || '—'}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-xs">Telefono</span>
                    <p className="text-zinc-200 font-medium">{detailRestaurant.phone || '—'}</p>
                  </div>
                </div>
              </div>

              {/* Billing / Fiscal Data */}
              <div className="p-4 rounded-xl bg-zinc-900/80 border border-white/5 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Dati Fiscali / Fatturazione</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <span className="text-zinc-500 text-xs">Nome Azienda</span>
                    <p className="text-zinc-200 font-medium">{detailRestaurant.billing_name || '—'}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-xs">P. IVA</span>
                    <p className="text-zinc-200 font-medium font-mono">{detailRestaurant.vat_number || '—'}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-zinc-500 text-xs">Indirizzo</span>
                    <p className="text-zinc-200 font-medium">{detailRestaurant.billing_address || '—'}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-xs">Comune</span>
                    <p className="text-zinc-200 font-medium">{detailRestaurant.billing_city || '—'}</p>
                  </div>
                  <div className="flex gap-4">
                    <div>
                      <span className="text-zinc-500 text-xs">CAP</span>
                      <p className="text-zinc-200 font-medium">{detailRestaurant.billing_cap || '—'}</p>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-xs">Prov.</span>
                      <p className="text-zinc-200 font-medium uppercase">{detailRestaurant.billing_province || '—'}</p>
                    </div>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-xs">Codice Univoco SDI</span>
                    <p className="text-zinc-200 font-medium font-mono uppercase">{detailRestaurant.codice_univoco || '—'}</p>
                  </div>
                </div>
              </div>

              {/* Credentials */}
              {detailUser && (
                <div className="p-4 rounded-xl bg-zinc-900/80 border border-white/5 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Credenziali Accesso</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-zinc-500 text-xs">Username</span>
                      <p className="text-zinc-200 font-medium font-mono">{detailUser.name || '—'}</p>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-xs">Password</span>
                      <div className="flex items-center gap-2">
                        <p className="text-amber-400 font-medium font-mono">
                          {detailPasswordVisible ? (detailUser.raw_password || detailUser.password_hash?.substring(0, 8) + '...') : '••••••••'}
                        </p>
                        <button
                          onClick={() => setDetailPasswordVisible(v => !v)}
                          className="text-zinc-500 hover:text-white transition-colors"
                        >
                          {detailPasswordVisible ? <EyeSlash size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Stripe Info */}
              {(detailRestaurant.stripe_subscription_id || detailRestaurant.stripe_customer_id) && (
                <div className="p-4 rounded-xl bg-zinc-900/80 border border-white/5 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Stripe</p>
                  <div className="space-y-1 text-xs">
                    {detailRestaurant.stripe_customer_id && (
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500">Customer:</span>
                        <span className="text-zinc-300 font-mono truncate">{detailRestaurant.stripe_customer_id}</span>
                      </div>
                    )}
                    {detailRestaurant.stripe_subscription_id && (
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500">Subscription:</span>
                        <span className="text-zinc-300 font-mono truncate">{detailRestaurant.stripe_subscription_id}</span>
                      </div>
                    )}
                    {detailRestaurant.subscription_status && (
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500">Stato:</span>
                        <span className="text-zinc-300 capitalize">{detailRestaurant.subscription_status}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md bg-zinc-950 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Modifica Ristorante</DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">
              Modifica i dettagli del ristorante e le credenziali di accesso.
            </DialogDescription>
          </DialogHeader>
          {editingRestaurant && (
            <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  value={editingRestaurant.name}
                  onChange={(e) => setEditingRestaurant(prev => prev ? ({ ...prev, name: e.target.value }) : null)}
                />
              </div>
              <div className="space-y-2">
                <Label>Telefono</Label>
                <Input
                  value={editingRestaurant.phone || ''}
                  onChange={(e) => setEditingRestaurant(prev => prev ? ({ ...prev, phone: e.target.value }) : null)}
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  value={editingRestaurant.email || ''}
                  onChange={(e) => setEditingRestaurant(prev => prev ? ({ ...prev, email: e.target.value }) : null)}
                />
              </div>
              <div className="space-y-1">
                <Label>Logo</Label>
                <div className="flex items-center gap-2">
                  {editingRestaurant.logo_url && (
                    <img src={editingRestaurant.logo_url} alt="Logo" className="w-8 h-8 rounded object-cover" />
                  )}
                  <Input
                    type="file"
                    accept="image/png, image/jpeg"
                    onChange={(e) => setEditLogoFile(e.target.files?.[0] || null)}
                  />
                </div>
              </div>

              {/* Billing Data */}
              <div className="space-y-2 pt-2 border-t border-white/10">
                <Label className="text-xs text-zinc-400 uppercase tracking-wider font-bold">Dati Fiscali</Label>
                <Input
                  placeholder="Nome Azienda / Ragione Sociale"
                  value={editingRestaurant.billing_name || ''}
                  onChange={(e) => setEditingRestaurant(prev => prev ? ({ ...prev, billing_name: e.target.value }) : null)}
                />
                <Input
                  placeholder="Partita IVA"
                  value={editingRestaurant.vat_number || ''}
                  onChange={(e) => setEditingRestaurant(prev => prev ? ({ ...prev, vat_number: e.target.value }) : null)}
                />
                <Input
                  placeholder="Via / Indirizzo"
                  value={editingRestaurant.billing_address || ''}
                  onChange={(e) => setEditingRestaurant(prev => prev ? ({ ...prev, billing_address: e.target.value }) : null)}
                />
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    placeholder="Comune"
                    value={editingRestaurant.billing_city || ''}
                    onChange={(e) => setEditingRestaurant(prev => prev ? ({ ...prev, billing_city: e.target.value }) : null)}
                  />
                  <Input
                    placeholder="CAP"
                    value={editingRestaurant.billing_cap || ''}
                    onChange={(e) => setEditingRestaurant(prev => prev ? ({ ...prev, billing_cap: e.target.value }) : null)}
                  />
                  <Input
                    placeholder="Prov."
                    value={editingRestaurant.billing_province || ''}
                    onChange={(e) => setEditingRestaurant(prev => prev ? ({ ...prev, billing_province: e.target.value.toUpperCase().slice(0, 2) }) : null)}
                    maxLength={2}
                    className="uppercase"
                  />
                </div>
                <Input
                  placeholder="Codice Univoco SDI"
                  value={editingRestaurant.codice_univoco || ''}
                  onChange={(e) => setEditingRestaurant(prev => prev ? ({ ...prev, codice_univoco: e.target.value.toUpperCase() }) : null)}
                  maxLength={7}
                  className="uppercase font-mono"
                />
              </div>

              {editingUser && (
                <div className="space-y-2 pt-2 border-t border-white/10">
                  <Label className="text-xs text-zinc-400 uppercase tracking-wider font-bold">Credenziali Proprietario</Label>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Username</Label>
                    <Input
                      value={editingUser.name || ''}
                      onChange={(e) => setEditingUser(prev => prev ? ({ ...prev, name: e.target.value }) : null)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Nuova Password (lascia vuoto per non cambiare)</Label>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      onChange={(e) => {
                        if (e.target.value) {
                          setEditingUser(prev => prev ? ({ ...prev, password_hash: e.target.value }) : null)
                        }
                      }}
                    />
                  </div>
                </div>
              )}

              <Button
                onClick={handleSaveEdit}
                className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-black font-bold rounded-xl mt-4"
                disabled={isUploading}
              >
                {isUploading ? 'Salvataggio...' : 'Salva Modifiche'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div >
  )
}