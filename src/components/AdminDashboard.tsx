import { useState, useMemo, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSupabaseData } from '../hooks/useSupabaseData'
import { DatabaseService } from '../services/DatabaseService'
import { toast } from 'sonner'
import { User, Restaurant } from '../services/types'
import { supabase } from '../lib/supabase'
import { Plus, Buildings, SignOut, Trash, ChartBar, PencilSimple, Eye, EyeSlash, Database, MagnifyingGlass, SortAscending, UploadSimple, SignIn, CreditCard, Gift, CheckCircle, Link as LinkIcon, Copy, Rocket, Info } from '@phosphor-icons/react'
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
  const [users, , refreshUsers] = useSupabaseData<User>(
    'users_safe',
    [],
    undefined,
    undefined,
    undefined,
    { realtimeEnabled: false }
  )
  const [salesByRestaurant, setSalesByRestaurant] = useState<Record<string, number>>({})
  const [activeView, setActiveView] = useState<'restaurants' | 'statistics' | 'admin'>('restaurants')

  // Admin commercial state. Stripe billing toward MINTHI is disabled; this only keeps local access bonuses.
  const [showBonusDialog, setShowBonusDialog] = useState(false)
  const [bonusRestaurantId, setBonusRestaurantId] = useState('')
  const [bonusMonths, setBonusMonths] = useState(1)
  const [bonusReason, setBonusReason] = useState('')

  // Registration Link Generator
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [inviteFreeMonths, setInviteFreeMonths] = useState(false)
  const [inviteMonthsCount, setInviteMonthsCount] = useState(1)
  const [generatedLink, setGeneratedLink] = useState('')
  const [generatingLink, setGeneratingLink] = useState(false)

  // Clear generated link when params change so user can generate a new one
  useEffect(() => {
    setGeneratedLink('')
  }, [inviteFreeMonths, inviteMonthsCount])

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

  // Fetch aggregated sales per restaurant (server-side RPC, no unbounded client query)
  useEffect(() => {
    DatabaseService.getSalesByRestaurant()
      .then(sales => setSalesByRestaurant(sales))
      .catch(console.error)
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
        } else {
          userUpdate.password_hash = editingUser.password_hash
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
              <img src="/minthi-logo.png" alt="MINTHI" className="h-14 w-auto" />
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
                <h2 className="text-2xl font-bold text-white">Gestione ristoratori</h2>
                <p className="text-zinc-500 text-sm mt-0.5">Stripe resta solo per i pagamenti clienti verso i ristoratori.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10 rounded-lg h-9"
                  onClick={() => setShowBonusDialog(true)}
                >
                  <Gift size={15} className="mr-1.5" />
                  Assegna Bonus
                </Button>
              </div>
            </div>

            <div className="rounded-2xl bg-zinc-900/70 border border-white/10 p-6">
              <div className="flex items-start gap-3">
                <CheckCircle size={22} weight="fill" className="text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-lg font-semibold text-white">Abbonamenti Stripe MINTHI disattivati</h3>
                  <p className="text-sm text-zinc-400 mt-1 leading-relaxed">
                    La piattaforma non genera piu checkout, coupon o portali di fatturazione per incassare da MINTHI.
                    I ristoratori collegano solo il proprio Stripe Connect per ricevere pagamenti dai clienti.
                  </p>
                </div>
              </div>
            </div>
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

                      {/* Preview offerta */}
                      {inviteFreeMonths && (
                        <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 space-y-1">
                          <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                            <CheckCircle size={13} weight="fill" />
                            {inviteMonthsCount} {inviteMonthsCount === 1 ? 'mese' : 'mesi'} gratis
                          </p>
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
                              const { token } = await DatabaseService.createRegistrationToken(freeMonths)
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
                        <p className="text-zinc-400 font-medium font-mono">••••••••</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Stripe Connect Info */}
              {(detailRestaurant.stripe_connect_account_id || detailRestaurant.enable_stripe_payments) && (
                <div className="p-4 rounded-xl bg-zinc-900/80 border border-white/5 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Stripe Connect ristoratore</p>
                  <div className="space-y-1 text-xs">
                    {detailRestaurant.stripe_connect_account_id && (
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500">Account:</span>
                        <span className="text-zinc-300 font-mono truncate">{detailRestaurant.stripe_connect_account_id}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500">Pagamenti online:</span>
                      <span className="text-zinc-300">{detailRestaurant.enable_stripe_payments ? 'abilitati' : 'disabilitati'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500">Stato Connect:</span>
                      <span className="text-zinc-300">{detailRestaurant.stripe_connect_enabled ? 'pronto' : 'da completare'}</span>
                    </div>
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
