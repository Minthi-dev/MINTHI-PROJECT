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
import { User, Restaurant } from '../services/types'
import { supabase } from '../lib/supabase'
import { Crown, Plus, Buildings, SignOut, Trash, ChartBar, PencilSimple, Eye, EyeSlash, Database, MagnifyingGlass, SortAscending, UploadSimple, SignIn } from '@phosphor-icons/react'
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
  const [users] = useSupabaseData<User>('users', [])
  const [salesByRestaurant, setSalesByRestaurant] = useState<Record<string, number>>({})
  const [activeView, setActiveView] = useState<'restaurants' | 'statistics'>('restaurants')

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
    password: ''
  })
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [showRestaurantDialog, setShowRestaurantDialog] = useState(false)

  // Edit state
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editingRestaurant, setEditingRestaurant] = useState<Restaurant | null>(null)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [editLogoFile, setEditLogoFile] = useState<File | null>(null)

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

      setNewRestaurant({ name: '', phone: '', email: '', logo_url: '', username: '', password: '' })
      setLogoFile(null)
      setShowRestaurantDialog(false)
      toast.success('Ristorante creato con successo')
      await refreshRestaurants()
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
      }, user)

      if (editingUser) {
        const userUpdate: any = {
          id: editingUser.id,
          name: editingUser.name,
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
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl font-bold text-white">Gestione <span className="text-amber-500">Ristoranti</span></h2>
                <p className="text-zinc-500 mt-1 uppercase tracking-widest text-[10px] font-bold">Amministrazione Piattaforma</p>
              </div>

              <div className="flex items-center gap-2">
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

                      <div className="space-y-2 pt-2 border-t">
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
              </div>
            </div>

            <div className="grid gap-4">
              {processedRestaurants.map((restaurant) => {
                const restaurantUser = (users || []).find(u => u.id === restaurant.owner_id)
                const isPasswordVisible = visiblePasswords[restaurant.id]

                return (
                  <Card key={restaurant.id} className="bg-zinc-900 border border-white/5 rounded-xl overflow-hidden hover:border-amber-500/20 transition-all group shadow-lg mb-4 ring-1 ring-white/5">
                    <CardContent className="p-0">
                      <div className={`flex flex-col md:flex-row items-center p-6 gap-6 transition-all duration-300 ${!restaurant.isActive ? 'opacity-50 grayscale' : ''}`}>

                        {/* Left: Logo */}
                        <div className="flex-shrink-0">
                          {restaurant.logo_url ? (
                            <img src={restaurant.logo_url} alt={restaurant.name} className="w-16 h-16 rounded-xl object-cover border border-white/10 bg-black shadow-inner" />
                          ) : (
                            <div className="w-16 h-16 rounded-xl bg-zinc-950 flex items-center justify-center border border-white/5 shadow-inner">
                              <Buildings size={24} className="text-zinc-600" />
                            </div>
                          )}
                        </div>

                        {/* Center: Info */}
                        <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                          <div className="space-y-1.5 leadin-tight">
                            <div className="flex items-center gap-2.5">
                              <h3 className="text-lg font-semibold tracking-tight text-white">{restaurant.name}</h3>
                              {restaurant.isActive && (
                                <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                              )}
                            </div>
                            <div className="text-sm font-medium text-zinc-400 flex flex-col gap-0.5">
                              <span>{restaurant.email}</span>
                              <span className="text-zinc-500 text-xs">{restaurant.phone || 'N/D'}</span>
                            </div>
                          </div>

                          {/* Credentials (Compact & Clean) */}
                          {restaurantUser && (
                            <div className="flex items-center gap-4 bg-black/20 px-4 py-3 rounded-lg border border-white/5">
                              <div className="flex flex-col">
                                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Proprietario</span>
                                <span className="text-sm font-medium text-zinc-200">{restaurantUser.name}</span>
                              </div>
                              <div className="h-8 w-px bg-white/5" />
                              <div className="flex items-center gap-3 flex-1 justify-end">
                                <div className="font-mono text-xs text-amber-500 tracking-wider">
                                  {isPasswordVisible ? restaurantUser.password_hash : '••••••••'}
                                </div>
                                <button
                                  onClick={() => togglePasswordVisibility(restaurant.id)}
                                  className="text-zinc-500 hover:text-white transition-colors"
                                >
                                  {isPasswordVisible ? <EyeSlash size={14} /> : <Eye size={14} />}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Right: Actions */}
                        <div className="flex items-center gap-2 flex-shrink-0 border-l border-white/5 pl-6 ml-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg border border-transparent hover:border-white/10"
                            onClick={() => setImpersonatedRestaurantId(restaurant.id)}
                            title="Accedi alla Dashboard"
                          >
                            <SignIn size={18} />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg border border-transparent hover:border-white/10"
                            onClick={() => handlePopulateData(restaurant.id)}
                            title="Popola Dati"
                          >
                            <Database size={18} />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-9 w-9 rounded-lg border border-transparent ${restaurant.isActive ? 'text-zinc-400 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20' : 'text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/20'}`}
                            onClick={() => handleToggleActive(restaurant)}
                            title={restaurant.isActive ? "Disattiva" : "Attiva"}
                          >
                            {restaurant.isActive ? (
                              <Eye size={18} />
                            ) : (
                              <EyeSlash size={20} />
                            )}
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 text-zinc-500 hover:text-white hover:bg-white/5 rounded-xl"
                            onClick={() => handleEditRestaurant(restaurant)}
                            title="Modifica"
                          >
                            <PencilSimple size={20} />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 text-red-500/50 hover:text-red-500 hover:bg-red-500/10 rounded-xl"
                            onClick={() => handleDeleteRestaurant(restaurant.id)}
                            title="Elimina"
                          >
                            <Trash size={20} />
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
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifica Ristorante</DialogTitle>
            <DialogDescription>
              Modifica i dettagli del ristorante e le credenziali di accesso.
            </DialogDescription>
          </DialogHeader>
          {editingRestaurant && (
            <div className="space-y-4 py-4">
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

              {editingUser && (
                <div className="space-y-2 pt-2 border-t">
                  <Label>Credenziali Proprietario</Label>
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
    </div>
  )
}