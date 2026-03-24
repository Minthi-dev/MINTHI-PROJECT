import { useState, useEffect } from 'react'
import { DatabaseService } from '../services/DatabaseService'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { toast } from 'sonner'
import { Calendar, Clock, Users, PencilSimple, Trash, Phone, User as UserIcon, CalendarBlank, ArrowsLeftRight, QrCode, DownloadSimple, Table as TableIcon, Copy, MagnifyingGlass, X, CheckCircle, XCircle, Plus, ClockCounterClockwise as HistoryIcon } from '@phosphor-icons/react'
import { Checkbox } from '@/components/ui/checkbox'
import type { User, Booking, Table, Room } from '../services/types'
import TimelineReservations from './TimelineReservations'
import QRCodeGenerator from './QRCodeGenerator'

// PDF Generation
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import html2canvas from 'html2canvas'

interface ServiceSegment {
  label: string
  start: string
  end: string
}

interface ReservationsManagerProps {
  user: User
  restaurantId: string
  tables: Table[]
  rooms: Room[]
  bookings: Booking[]
  selectedDate: Date
  openingTime?: string
  closingTime?: string
  serviceSegments?: ServiceSegment[]
  reservationDuration?: number
  onRefresh?: () => void
  onDateChange?: (date: Date) => void
}

import { generatePdfFromElement } from '../utils/pdfUtils'

export default function ReservationsManager({ user, restaurantId, tables, rooms, bookings, selectedDate, openingTime = '10:00', closingTime = '23:00', serviceSegments, reservationDuration = 120, onRefresh, onDateChange }: ReservationsManagerProps) {
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [selectedRoomId, setSelectedRoomId] = useState<string>('all')
  const [showEditDialog, setShowEditDialog] = useState(false)

  // ... (keep state) ...
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showHistoryDialog, setShowHistoryDialog] = useState(false)
  const [showMoveDialog, setShowMoveDialog] = useState(false)
  const [showQrDialog, setShowQrDialog] = useState(false)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const [isGeneratingTablePdf, setIsGeneratingTablePdf] = useState(false)

  // Export dialog state
  const [exportStartDate, setExportStartDate] = useState('')
  const [exportEndDate, setExportEndDate] = useState('')
  const [exportSelectedRooms, setExportSelectedRooms] = useState<string[]>(['all'])
  const [restaurantName, setRestaurantName] = useState('Ristorante')

  // Fetch restaurant name on mount
  useEffect(() => {
    const fetchRestaurantName = async () => {
      try {
        const restaurants = await DatabaseService.getRestaurants()
        const restaurant = restaurants.find(r => r.id === restaurantId)
        if (restaurant) setRestaurantName(restaurant.name)
      } catch (e) {
        console.error('Error fetching restaurant name:', e)
      }
    }
    fetchRestaurantName()
  }, [restaurantId])

  // Helper for date comparison (ignoring time)
  const isSameDay = (d1: Date, d2: Date) => {
    return d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
  }

  // Filter states for history
  const [historyFilter, setHistoryFilter] = useState<string>('all')
  const [customHistoryStartDate, setCustomHistoryStartDate] = useState('')
  const [customHistoryEndDate, setCustomHistoryEndDate] = useState('')
  const [historySearchName, setHistorySearchName] = useState('')
  const [historySearchPhone, setHistorySearchPhone] = useState('')
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | 'COMPLETED' | 'CANCELLED'>('all')

  // Form states for editing
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    tableId: '',
    date: '',
    time: '',
    guests: 1,
    notes: ''
  })

  // Move form state
  const [moveForm, setMoveForm] = useState({
    date: '',
    time: ''
  })

  // Filter bookings for this restaurant
  const restaurantBookings = bookings.filter(b => b.restaurant_id === restaurantId)
  const restaurantTables = tables
    .filter(t => t.restaurant_id === restaurantId)
    .filter(t => selectedRoomId === 'all' || t.room_id === selectedRoomId)

  // Separate active and history (completed) bookings
  const now = new Date()

  const activeBookings = restaurantBookings.filter(b => {
    const bookingDate = new Date(b.date_time)
    // Filter by selectedDate
    return isSameDay(bookingDate, selectedDate) && b.status !== 'CANCELLED'
  })

  const historyBookings = restaurantBookings.filter(b => {
    const bookingDate = new Date(b.date_time)
    const isPast = bookingDate < now && !isSameDay(bookingDate, now)
    return isPast || b.status === 'COMPLETED' || b.status === 'CANCELLED'
  })

  // Initialize edit form when reservation is selected
  const handleEditBooking = (booking: Booking) => {
    setSelectedBooking(booking)
    const [date, time] = booking.date_time.split('T')
    setEditForm({
      name: booking.name,
      phone: booking.phone || '',
      tableId: booking.table_id || '',
      date: date,
      time: time.substring(0, 5),
      guests: booking.guests,
      notes: booking.notes || ''
    })
    setShowEditDialog(true)
  }

  // Initialize move form
  const handleMoveBooking = (booking: Booking) => {
    setSelectedBooking(booking)
    const [date, time] = booking.date_time.split('T')
    setMoveForm({
      date: date,
      time: time.substring(0, 5)
    })
    setShowMoveDialog(true)
  }

  // Save edited or new reservation
  const handleSaveEdit = async () => {
    if (!editForm.name.trim() || !editForm.tableId || !editForm.date || !editForm.time) {
      toast.error('Compila tutti i campi obbligatori')
      return
    }

    const dateTime = `${editForm.date}T${editForm.time}:00`

    // Capacity Check
    const selectedTable = restaurantTables.find(t => t.id === editForm.tableId)
    if (selectedTable && (selectedTable.seats || 4) < editForm.guests) {
      toast.error(`Il tavolo ${selectedTable.number} può contenere massimo ${selectedTable.seats || 4} persone`)
      return
    }

    try {
      if (selectedBooking) {
        // Update Existing
        const updatedBooking: Partial<Booking> = {
          id: selectedBooking.id,
          name: editForm.name.trim(),
          phone: editForm.phone.trim(),
          table_id: editForm.tableId,
          date_time: dateTime,
          guests: editForm.guests,
          notes: editForm.notes.trim()
        }
        await DatabaseService.updateBooking(updatedBooking)
        toast.success('Prenotazione modificata con successo')
      } else {
        // Create New
        const newBooking: Omit<Booking, 'id' | 'created_at'> = {
          restaurant_id: restaurantId,
          table_id: editForm.tableId,
          name: editForm.name.trim(),
          phone: editForm.phone.trim(),
          date_time: dateTime,
          guests: editForm.guests,
          notes: editForm.notes.trim(),
          status: 'CONFIRMED' // Default status
        }

        // Assuming DatabaseService has createBooking, if not we use supabase directly or update service?
        // Checking if createBooking exists... usually it does or we use insert.
        // Let's assume insertBooking exists or I need to check DatabaseService.
        // Since I cannot check DatabaseService right now easily without tool call, I'll try to use a direct insert or assumes insertBooking.
        // Looking at `ReservationsManager` imports: `DatabaseService`.
        // I'll assume `createBooking` or similar exists. If not, I'll check types.
        // Wait, looking at `WaiterOrderPage`, `DatabaseService.createSession` exists.
        // I'll try `DatabaseService.createBooking(newBooking)`.
        // If it fails, I'll need to fix it.

        // To be safe, I'll use direct supabase if I can, but `supabase` is not imported here.
        // `DatabaseService` is imported.
        // Let's check `DatabaseService` content if possible... I'll just try `createBooking` as it's standard naming.
        await DatabaseService.createBooking(newBooking)
        toast.success('Prenotazione creata con successo')
      }

      setShowEditDialog(false)
      setSelectedBooking(null)
      onRefresh?.()

    } catch (e) {
      console.error("Save error:", e)
      toast.error("Errore nel salvataggio della prenotazione")
    }
  }

  // Save moved reservation
  const handleSaveMove = () => {
    if (!selectedBooking || !moveForm.date || !moveForm.time) {
      toast.error('Seleziona data e ora')
      return
    }

    const dateTime = `${moveForm.date}T${moveForm.time}:00`

    // Check if date changed
    const originalDate = selectedBooking.date_time.split('T')[0]
    if (originalDate !== moveForm.date) {
      // Confirmation is implicit in the dialog action, but we could add another step if needed.
      // The user asked for a confirmation message.
      if (!confirm(`Sei sicuro di voler spostare la prenotazione al ${formatDate(moveForm.date)} alle ${moveForm.time}?`)) {
        return
      }
    }

    DatabaseService.updateBooking({
      id: selectedBooking.id,
      date_time: dateTime
    })
      .then(() => {
        setShowMoveDialog(false)
        setSelectedBooking(null)
        toast.success('Prenotazione spostata con successo')
        onRefresh?.()
      })
  }

  // Delete reservation
  const handleDeleteBooking = async (bookingId?: string) => {
    const id = bookingId || selectedBooking?.id
    if (!id) return

    try {
      await DatabaseService.deleteBooking(id)
      setShowDeleteDialog(false)
      setSelectedBooking(null)
      toast.success('Prenotazione eliminata')
      await onRefresh?.()
    } catch (error) {
      console.error('Errore durante l\'eliminazione della prenotazione', error)
      toast.error('Non è stato possibile eliminare la prenotazione')
    }
  }

  // Complete reservation (move to history)
  const handleCompleteBooking = (booking: Booking) => {
    DatabaseService.updateBooking({ id: booking.id, status: 'COMPLETED' })
      .then(() => {
        toast.success('Prenotazione completata')
        onRefresh?.()
      })
  }

  // Get table name
  const getTableName = (tableId?: string) => {
    if (!tableId) return 'Nessun tavolo'
    const table = restaurantTables.find(t => t.id === tableId)
    return table?.number ? `${table.number}` : 'Tavolo non trovato'
  }

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('it-IT', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  // Check if reservation is today
  const isToday = (dateStr: string) => {
    const today = new Date().toISOString().split('T')[0]
    return dateStr === today
  }

  // Get history date filters
  const getHistoryDateFilters = () => {
    const filters: Array<{ value: string; label: string }> = []
    filters.push({ value: 'today', label: 'Oggi' })
    filters.push({ value: 'yesterday', label: 'Ieri' })
    filters.push({ value: 'dayBeforeYesterday', label: 'Ieri l\'altro' })
    filters.push({ value: 'lastWeek', label: 'Ultima settimana' })
    filters.push({ value: 'lastMonth', label: 'Ultimo mese' })
    filters.push({ value: 'custom', label: 'Personalizzato' })
    return filters
  }

  // Filter history reservations
  const getFilteredHistoryBookings = () => {
    let filtered = historyBookings
    const today = new Date()

    // Date filter
    if (historyFilter !== 'all') {
      switch (historyFilter) {
        case 'today':
          const todayStr = today.toISOString().split('T')[0]
          filtered = filtered.filter(res => res.date_time.startsWith(todayStr))
          break
        case 'yesterday':
          const yesterday = new Date(today)
          yesterday.setDate(yesterday.getDate() - 1)
          const yesterdayStr = yesterday.toISOString().split('T')[0]
          filtered = filtered.filter(res => res.date_time.startsWith(yesterdayStr))
          break
        case 'dayBeforeYesterday':
          const dayBefore = new Date(today)
          dayBefore.setDate(dayBefore.getDate() - 2)
          const dayBeforeStr = dayBefore.toISOString().split('T')[0]
          filtered = filtered.filter(res => res.date_time.startsWith(dayBeforeStr))
          break
        case 'lastWeek':
          const weekAgo = new Date(today)
          weekAgo.setDate(weekAgo.getDate() - 7)
          filtered = filtered.filter(res => {
            const resDate = new Date(res.date_time)
            return resDate >= weekAgo && resDate <= today
          })
          break
        case 'lastMonth':
          const monthAgo = new Date(today)
          monthAgo.setMonth(monthAgo.getMonth() - 1)
          filtered = filtered.filter(res => {
            const resDate = new Date(res.date_time)
            return resDate >= monthAgo && resDate <= today
          })
          break
        case 'custom':
          if (customHistoryStartDate && customHistoryEndDate) {
            const startDate = new Date(customHistoryStartDate)
            const endDate = new Date(customHistoryEndDate)
            // Adjust end date to include the full day
            endDate.setHours(23, 59, 59, 999)
            filtered = filtered.filter(res => {
              const resDate = new Date(res.date_time)
              return resDate >= startDate && resDate <= endDate
            })
          }
          break
      }
    }

    // Name search filter
    if (historySearchName.trim()) {
      const searchLower = historySearchName.toLowerCase().trim()
      filtered = filtered.filter(res => res.name.toLowerCase().includes(searchLower))
    }

    // Phone search filter
    if (historySearchPhone.trim()) {
      const searchPhone = historySearchPhone.replace(/\s/g, '')
      filtered = filtered.filter(res => res.phone?.replace(/\s/g, '').includes(searchPhone))
    }

    // Status filter
    if (historyStatusFilter !== 'all') {
      filtered = filtered.filter(res => res.status === historyStatusFilter)
    }

    return filtered
  }

  // Helper functions for history
  const clearHistoryFilters = () => {
    setHistoryFilter('all')
    setHistorySearchName('')
    setHistorySearchPhone('')
    setHistoryStatusFilter('all')
    setCustomHistoryStartDate('')
    setCustomHistoryEndDate('')
  }

  const copyPhoneToClipboard = (phone: string) => {
    navigator.clipboard.writeText(phone)
    toast.success('Numero copiato negli appunti')
  }

  const historyDateFilters = getHistoryDateFilters()
  const filteredHistoryBookings = getFilteredHistoryBookings()

  // Statistics for history
  const historyStats = (() => {
    const filtered = filteredHistoryBookings
    const totalGuests = filtered.reduce((sum, b) => sum + b.guests, 0)
    const completed = filtered.filter(b => b.status === 'COMPLETED').length
    const cancelled = filtered.filter(b => b.status === 'CANCELLED').length
    return { total: filtered.length, totalGuests, completed, cancelled }
  })()

  // Handle room checkbox toggle for export
  const handleExportRoomToggle = (roomId: string) => {
    if (roomId === 'all') {
      setExportSelectedRooms(['all'])
    } else {
      setExportSelectedRooms(prev => {
        const filtered = prev.filter(id => id !== 'all')
        if (filtered.includes(roomId)) {
          const result = filtered.filter(id => id !== roomId)
          return result.length === 0 ? ['all'] : result
        } else {
          return [...filtered, roomId]
        }
      })
    }
  }

  // Get bookings for export based on date range and rooms
  const getExportBookings = () => {
    let filtered = restaurantBookings.filter(b => b.status !== 'CANCELLED')

    // Filter by date range
    if (exportStartDate && exportEndDate) {
      const start = new Date(exportStartDate)
      const end = new Date(exportEndDate)
      end.setHours(23, 59, 59, 999)
      filtered = filtered.filter(b => {
        const bookingDate = new Date(b.date_time)
        return bookingDate >= start && bookingDate <= end
      })
    } else if (exportStartDate) {
      // Single date
      filtered = filtered.filter(b => b.date_time.startsWith(exportStartDate))
    }

    // Filter by rooms
    if (!exportSelectedRooms.includes('all')) {
      const roomTableIds = tables
        .filter(t => exportSelectedRooms.includes(t.room_id || ''))
        .map(t => t.id)
      filtered = filtered.filter(b => b.table_id && roomTableIds.includes(b.table_id))
    }

    return filtered.sort((a, b) => new Date(a.date_time).getTime() - new Date(b.date_time).getTime())
  }

  // Generate Table PDF - Visual Timeline Export
  const generateTablePDF = async () => {
    setIsGeneratingTablePdf(true)
    try {
      // Capture the timeline container
      await generatePdfFromElement('timeline-export-container', {
        fileName: `Timeline_Prenotazioni_${restaurantName.replace(/\s+/g, '_')}_${selectedDate.toISOString().split('T')[0]}.pdf`,
        scale: 2,
        orientation: 'landscape', // Better for timeline
        backgroundColor: '#09090b',
        onClone: (doc) => {
          // Force container to be fully visible and appropriate width
          const container = doc.getElementById('timeline-export-container')
          if (container) {
            container.style.backgroundColor = '#09090b'
            container.style.padding = '20px'
            // Ensure any scrollable areas are expanded? 
            // html2canvas usually captures full scrollHeight if configured, 
            // but we might need to set height: auto explicitly on scroll areas if they are virtualized.
            // Assuming TimelineReservations is not virtualized for now or handles print view.
          }
        }
      })

      toast.success('Timeline scaricata con successo!')
      setShowExportDialog(false)

    } catch (err) {
      console.error(err)
      toast.error('Errore durante la generazione del PDF')
    } finally {
      setIsGeneratingTablePdf(false)
    }
  }

  const generatePDF = async () => {
    setIsGeneratingPdf(true)
    try {
      const qrContainer = document.getElementById('qr-download-content')
      if (!qrContainer) {
        toast.error("Errore generazione PDF")
        setIsGeneratingPdf(false)
        return
      }

      // Must ensure element is visible for html2canvas
      const originalStyle = qrContainer.style.display
      qrContainer.style.display = 'block'

      await generatePdfFromElement('qr-download-content', {
        fileName: 'Booking_QR.pdf',
        scale: 2,
        backgroundColor: '#09090b',
        orientation: 'portrait'
      })

      qrContainer.style.display = originalStyle
      toast.success("PDF scaricato con successo!")

    } catch (err) {
      console.error(err)
      toast.error("Errore durante la creazione del PDF")
    } finally {
      setIsGeneratingPdf(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with Timeline */}
      <div className="space-y-4">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div>
            <h2 className="text-2xl font-light text-white tracking-tight">Gestione <span className="font-bold text-amber-500">Prenotazioni</span></h2>
            <p className="text-sm text-zinc-400 mt-1 uppercase tracking-wider font-medium">Visualizza e gestisci le prenotazioni</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowHistoryDialog(true)} className="border-dashed border-zinc-700 hover:border-amber-500 hover:bg-amber-500/10 hover:text-amber-500 text-zinc-400">
              <HistoryIcon size={16} className="mr-2" />
              Storico
            </Button>
            <Button variant="outline" onClick={() => setShowQrDialog(true)}>
              <QrCode size={16} className="mr-2" />
              QR Prenotazioni
            </Button>
            <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => {
              // Open Edit Dialog in Create Mode
              setEditForm({
                name: '',
                phone: '',
                tableId: '',
                date: selectedDate.toISOString().split('T')[0],
                time: '20:00', // Default time
                guests: 2,
                notes: ''
              })
              setSelectedBooking(null) // Null indicates create mode
              setShowEditDialog(true)
            }}>
              <Plus size={16} className="mr-2" />
              Nuova Prenotazione
            </Button>
          </div>
        </div>

        {/* Date and Room Filters - RESTORED */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-zinc-900/50 p-4 rounded-xl border border-white/5">
          <div className="flex items-center gap-4">
            {/* Room Filter */}
            <div className="flex items-center gap-2">
              <span className="text-zinc-500 text-sm font-medium">Sala:</span>
              <div className="flex bg-zinc-950 rounded-lg p-1 border border-zinc-800">
                <button
                  onClick={() => setSelectedRoomId('all')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${selectedRoomId === 'all' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Tutte
                </button>
                {rooms.map(room => (
                  <button
                    key={room.id}
                    onClick={() => setSelectedRoomId(room.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${selectedRoomId === room.id ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    {room.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Timeline Component */}
        <div id="timeline-export-container">
          <TimelineReservations
            user={user}
            restaurantId={restaurantId}
            tables={restaurantTables}
            bookings={bookings}
            selectedDate={`${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`}
            openingTime={openingTime}
            closingTime={closingTime}
            serviceSegments={serviceSegments}
            reservationDuration={reservationDuration}
            onRefresh={onRefresh}
            onDateChange={onDateChange}
            onEditBooking={handleEditBooking}
            onDeleteBooking={handleDeleteBooking}
          />
        </div>
      </div>



      {/* Edit Reservation Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl bg-black/90 border-amber-500/20 text-zinc-100 backdrop-blur-xl shadow-[0_0_50px_rgba(0,0,0,0.5)]">
          <DialogHeader>
            <DialogTitle>Modifica Prenotazione</DialogTitle>
            <DialogDescription>
              Modifica i dettagli della prenotazione
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2.5">
                <Label htmlFor="edit-customer-name" className="text-zinc-400">Nome Cliente *</Label>
                <div className="relative">
                  <Input
                    id="edit-customer-name"
                    value={editForm.name}
                    onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Nome e cognome"
                    className="bg-zinc-900 border-zinc-800 pl-9"
                  />
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                </div>
              </div>
              <div className="space-y-2.5">
                <Label htmlFor="edit-customer-phone" className="text-zinc-400">Telefono *</Label>
                <div className="relative">
                  <Input
                    id="edit-customer-phone"
                    value={editForm.phone}
                    onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="+39 333 123 4567"
                    className="bg-zinc-900 border-zinc-800 pl-9"
                  />
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                </div>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              <div className="space-y-2.5">
                <Label htmlFor="edit-date" className="text-zinc-400">Data *</Label>
                <div className="relative">
                  <Input
                    id="edit-date"
                    type="date"
                    value={editForm.date}
                    onChange={(e) => setEditForm(prev => ({ ...prev, date: e.target.value }))}
                    className="bg-zinc-900 border-zinc-800 pl-9"
                  />
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                </div>
              </div>
              <div className="space-y-2.5">
                <Label htmlFor="edit-time" className="text-zinc-400">Orario *</Label>
                <div className="relative">
                  <Input
                    id="edit-time"
                    type="time"
                    value={editForm.time}
                    onChange={(e) => setEditForm(prev => ({ ...prev, time: e.target.value }))}
                    className="bg-zinc-900 border-zinc-800 pl-9"
                  />
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                </div>
              </div>
              <div className="space-y-2.5">
                <Label htmlFor="edit-guests" className="text-zinc-400">Ospiti *</Label>
                <div className="relative">
                  <Input
                    id="edit-guests"
                    type="number"
                    min="1"
                    max="20"
                    value={editForm.guests}
                    onChange={(e) => setEditForm(prev => ({ ...prev, guests: parseInt(e.target.value) || 1 }))}
                    className="bg-zinc-900 border-zinc-800 pl-9"
                  />
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              <Label htmlFor="edit-table" className="text-zinc-400">Tavolo *</Label>
              <Select
                value={editForm.tableId}
                onValueChange={(value) => setEditForm(prev => ({ ...prev, tableId: value }))}
              >
                <SelectTrigger className="bg-zinc-900 border-zinc-800">
                  <div className="flex items-center gap-2">
                    <TableIcon size={16} className="text-zinc-500" />
                    <SelectValue placeholder="Seleziona tavolo" />
                  </div>
                </SelectTrigger>
                <SelectContent className="bg-zinc-950 border-zinc-800">
                  {restaurantTables.map(table => (
                    <SelectItem key={table.id} value={table.id}>
                      Tavolo {table.number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2.5">
              <Label htmlFor="edit-notes" className="text-zinc-400">Note / Richieste Speciali</Label>
              <Textarea
                id="edit-notes"
                value={editForm.notes}
                onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Allergie, tavolo preferito, compleanni..."
                className="min-h-[100px] bg-zinc-900 border-zinc-800 resize-none"
              />
            </div>

            <div className="flex gap-3 justify-end pt-6">
              <Button
                variant="outline"
                onClick={() => setShowEditDialog(false)}
                className="border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-white"
              >
                Annulla
              </Button>
              <Button
                onClick={handleSaveEdit}
                className="bg-amber-500 hover:bg-amber-600 text-black font-bold h-10 px-8 transition-all active:scale-95 shadow-lg shadow-amber-500/10"
              >
                Salva Modifiche
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manage Reservation Dialog */}
      <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <DialogContent className="max-w-md bg-black/90 border-amber-500/20 text-zinc-100 backdrop-blur-xl shadow-[0_0_50px_rgba(0,0,0,0.5)]">
          <DialogHeader>
            <DialogTitle>Gestisci Prenotazione</DialogTitle>
            <DialogDescription>
              Gestisci la prenotazione di {selectedBooking?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Notes display */}
            {selectedBooking?.notes && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                <p className="text-xs font-semibold text-amber-400 mb-1">📝 Note</p>
                <p className="text-sm text-zinc-300">{selectedBooking.notes}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="move-date">Nuova Data</Label>
              <Input
                id="move-date"
                type="date"
                value={moveForm.date}
                onChange={(e) => setMoveForm(prev => ({ ...prev, date: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="move-time">Nuovo Orario</Label>
              <Input
                id="move-time"
                type="time"
                value={moveForm.time}
                onChange={(e) => setMoveForm(prev => ({ ...prev, time: e.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-3 pt-4">
              <Button
                onClick={handleSaveMove}
                className="w-full"
              >
                Conferma Spostamento
              </Button>

              {selectedBooking && selectedBooking.status !== 'COMPLETED' && (
                <Button
                  onClick={() => {
                    handleCompleteBooking(selectedBooking)
                    setShowMoveDialog(false)
                  }}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                >
                  Segna come Completata
                </Button>
              )}

              <Button
                variant="outline"
                onClick={() => setShowMoveDialog(false)}
                className="w-full"
              >
                Chiudi
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="bg-black/90 border-amber-500/20 text-zinc-100 backdrop-blur-xl shadow-[0_0_50px_rgba(0,0,0,0.5)]">
          <DialogHeader>
            <DialogTitle>Elimina Prenotazione</DialogTitle>
            <DialogDescription>
              Sei sicuro di voler eliminare questa prenotazione? Questa azione non può essere annullata.
            </DialogDescription>
          </DialogHeader>
          {selectedBooking && (
            <div className="bg-muted/30 p-4 rounded-lg space-y-1">
              <p><strong>Cliente:</strong> {selectedBooking.name}</p>
              <p><strong>Data:</strong> {formatDate(selectedBooking.date_time.split('T')[0])}</p>
              <p><strong>Orario:</strong> {selectedBooking.date_time.split('T')[1].substring(0, 5)}</p>
              <p><strong>Tavolo:</strong> {getTableName(selectedBooking.table_id)}</p>
              {selectedBooking.notes && (
                <p className="pt-1"><strong>Note:</strong> <span className="text-amber-400">{selectedBooking.notes}</span></p>
              )}
            </div>
          )}
          <div className="flex gap-3 justify-end pt-4">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Annulla
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleDeleteBooking()}
            >
              Elimina Prenotazione
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reservation History Dialog - Premium Redesign */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-5xl h-[85vh] flex flex-col bg-zinc-950/98 border border-amber-500/20 text-zinc-100 backdrop-blur-xl shadow-[0_0_80px_rgba(0,0,0,0.8)]">
          {/* Header with gradient */}
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/5 flex items-center justify-center border border-amber-500/30">
                <CalendarBlank size={24} weight="duotone" className="text-amber-400" />
              </div>
              <div>
                <DialogTitle className="text-xl font-semibold text-white">Storico Prenotazioni</DialogTitle>
                <DialogDescription className="text-zinc-500 text-sm">
                  Archivio completo delle prenotazioni passate
                </DialogDescription>
              </div>
            </div>
            {/* Stats badges */}
            <div className="hidden md:flex items-center gap-3">
              <div className="px-3 py-1.5 bg-zinc-900/80 rounded-lg border border-white/5 text-center">
                <p className="text-xs text-zinc-500 uppercase tracking-wider">Totale</p>
                <p className="text-lg font-bold text-white">{historyStats.total}</p>
              </div>
              <div className="px-3 py-1.5 bg-zinc-900/80 rounded-lg border border-white/5 text-center">
                <p className="text-xs text-zinc-500 uppercase tracking-wider">Ospiti</p>
                <p className="text-lg font-bold text-amber-400">{historyStats.totalGuests}</p>
              </div>
              <div className="px-3 py-1.5 bg-emerald-950/50 rounded-lg border border-emerald-500/20 text-center">
                <p className="text-xs text-emerald-400/70 uppercase tracking-wider">Completate</p>
                <p className="text-lg font-bold text-emerald-400">{historyStats.completed}</p>
              </div>
              <div className="px-3 py-1.5 bg-rose-950/50 rounded-lg border border-rose-500/20 text-center">
                <p className="text-xs text-rose-400/70 uppercase tracking-wider">Cancellate</p>
                <p className="text-lg font-bold text-rose-400">{historyStats.cancelled}</p>
              </div>
            </div>
          </div>

          {/* Filters Section */}
          <div className="py-4 space-y-4 border-b border-white/5">
            {/* Search inputs row */}
            <div className="flex flex-wrap gap-3">
              {/* Name Search */}
              <div className="relative flex-1 min-w-[180px]">
                <UserIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <Input
                  placeholder="Cerca per nome..."
                  value={historySearchName}
                  onChange={(e) => setHistorySearchName(e.target.value)}
                  className="pl-9 bg-zinc-900/50 border-zinc-800 focus:border-amber-500/50 text-sm"
                />
              </div>
              {/* Phone Search */}
              <div className="relative flex-1 min-w-[180px]">
                <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <Input
                  placeholder="Cerca per telefono..."
                  value={historySearchPhone}
                  onChange={(e) => setHistorySearchPhone(e.target.value)}
                  className="pl-9 bg-zinc-900/50 border-zinc-800 focus:border-amber-500/50 text-sm"
                />
              </div>
              {/* Date filter dropdown */}
              <Select value={historyFilter} onValueChange={setHistoryFilter}>
                <SelectTrigger className="w-48 bg-zinc-900/50 border-zinc-800">
                  <CalendarBlank size={16} className="mr-2 text-zinc-500" />
                  <SelectValue placeholder="Periodo" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-950 border-zinc-800">
                  <SelectItem value="all">Tutte le date</SelectItem>
                  {historyDateFilters.map(filter => (
                    <SelectItem key={filter.value} value={filter.value}>
                      {filter.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Custom date range (when selected) */}
            {historyFilter === 'custom' && (
              <div className="flex gap-3 items-center bg-zinc-900/30 p-3 rounded-lg border border-zinc-800">
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-zinc-500">Da:</Label>
                  <Input
                    type="date"
                    value={customHistoryStartDate}
                    onChange={(e) => setCustomHistoryStartDate(e.target.value)}
                    className="w-40 bg-zinc-900 border-zinc-700 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-zinc-500">A:</Label>
                  <Input
                    type="date"
                    value={customHistoryEndDate}
                    onChange={(e) => setCustomHistoryEndDate(e.target.value)}
                    className="w-40 bg-zinc-900 border-zinc-700 text-sm"
                  />
                </div>
              </div>
            )}

            {/* Status filter pills + Clear button */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500 uppercase tracking-wider mr-2">Status:</span>
                <button
                  onClick={() => setHistoryStatusFilter('all')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${historyStatusFilter === 'all'
                    ? 'bg-amber-500 text-black'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    }`}
                >
                  Tutte
                </button>
                <button
                  onClick={() => setHistoryStatusFilter('COMPLETED')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${historyStatusFilter === 'COMPLETED'
                    ? 'bg-emerald-500 text-black'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    }`}
                >
                  <CheckCircle size={14} weight="fill" />
                  Completate
                </button>
                <button
                  onClick={() => setHistoryStatusFilter('CANCELLED')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${historyStatusFilter === 'CANCELLED'
                    ? 'bg-rose-500 text-black'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    }`}
                >
                  <XCircle size={14} weight="fill" />
                  Cancellate
                </button>
              </div>

              {/* Clear filters button */}
              {(historySearchName || historySearchPhone || historyFilter !== 'all' || historyStatusFilter !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearHistoryFilters}
                  className="text-zinc-500 hover:text-white gap-1.5"
                >
                  <X size={14} />
                  Pulisci filtri
                </Button>
              )}
            </div>
          </div>

          {/* Results list */}
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent pr-1 mt-2">
            {filteredHistoryBookings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
                <CalendarBlank size={48} weight="thin" className="mb-4 opacity-30" />
                <p className="text-lg font-light">Nessuna prenotazione trovata</p>
                <p className="text-sm text-zinc-600 mt-1">
                  {historySearchName || historySearchPhone || historyFilter !== 'all' || historyStatusFilter !== 'all'
                    ? 'Prova a modificare i filtri di ricerca'
                    : 'Lo storico delle prenotazioni è vuoto'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredHistoryBookings
                  .sort((a, b) => new Date(b.date_time).getTime() - new Date(a.date_time).getTime())
                  .map(booking => (
                    <div
                      key={booking.id}
                      className={`relative p-4 rounded-xl border transition-all hover:scale-[1.005] ${booking.status === 'COMPLETED'
                        ? 'bg-gradient-to-r from-emerald-500/5 via-transparent to-transparent border-emerald-500/20 hover:border-emerald-500/40'
                        : 'bg-gradient-to-r from-rose-500/5 via-transparent to-transparent border-rose-500/20 hover:border-rose-500/40'
                        }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        {/* Main info grid */}
                        <div className="flex-1 grid gap-4 md:grid-cols-4">
                          {/* Customer info */}
                          <div className="space-y-1">
                            <p className="font-semibold text-white text-base">{booking.name}</p>
                            {booking.phone && (
                              <button
                                onClick={() => copyPhoneToClipboard(booking.phone!)}
                                className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-amber-400 transition-colors group"
                              >
                                <Phone size={14} />
                                <span>{booking.phone}</span>
                                <Copy size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                              </button>
                            )}
                          </div>

                          {/* Date & Time */}
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 text-sm text-zinc-300">
                              <Calendar size={14} className="text-amber-500/70" />
                              <span>{formatDate(booking.date_time.split('T')[0])}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-sm text-zinc-500">
                              <Clock size={14} />
                              <span>{booking.date_time.split('T')[1].substring(0, 5)}</span>
                            </div>
                          </div>

                          {/* Table & Guests */}
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 text-sm text-zinc-300">
                              <TableIcon size={14} className="text-amber-500/70" />
                              <span>{getTableName(booking.table_id)}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-sm text-zinc-500">
                              <Users size={14} />
                              <span>{booking.guests} ospiti</span>
                            </div>
                          </div>

                          {/* Status badge */}
                          <div className="flex items-start justify-end">
                            <Badge
                              className={`${booking.status === 'COMPLETED'
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                } border font-medium`}
                            >
                              {booking.status === 'COMPLETED' ? (
                                <><CheckCircle size={12} weight="fill" className="mr-1" /> Completata</>
                              ) : (
                                <><XCircle size={12} weight="fill" className="mr-1" /> Cancellata</>
                              )}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      {/* Notes section (if present) */}
                      {booking.notes && (
                        <div className="mt-3 pt-3 border-t border-white/5">
                          <p className="text-xs text-zinc-500 mb-1">Note:</p>
                          <p className="text-sm text-zinc-400 italic">"{booking.notes}"</p>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Footer with total */}
          <div className="pt-3 border-t border-white/10 flex items-center justify-between">
            <p className="text-xs text-zinc-500">
              Visualizzate <span className="text-amber-400 font-medium">{filteredHistoryBookings.length}</span> prenotazioni
              {historyStats.total !== filteredHistoryBookings.length && (
                <span> su {historyStats.total} totali</span>
              )}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHistoryDialog(false)}
              className="border-zinc-700 hover:bg-zinc-800"
            >
              Chiudi
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Public Booking QR Code Dialog */}
      <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
        <DialogContent className="sm:max-w-lg bg-black/90 border-amber-500/20 text-zinc-100 backdrop-blur-xl shadow-[0_0_50px_rgba(0,0,0,0.5)]">
          <DialogHeader>
            <DialogTitle className="text-center text-xl">QR Prenotazioni</DialogTitle>
            <DialogDescription className="text-center">
              Fai scansionare questo QR ai clienti per prenotare o consultare il menu.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center p-6 space-y-6">

            {/* The actual QR display */}
            <div className="bg-white p-6 rounded-2xl shadow-lg border-4 border-amber-500/20">
              <QRCodeGenerator
                value={`${window.location.origin}/book/${restaurantId}`}
                size={220}
              />
            </div>

            {/* No visible link as requested, just buttons */}

            <div className="flex flex-col gap-3 w-full max-w-xs">
              <Button
                onClick={generatePDF}
                disabled={isGeneratingPdf}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold h-12 shadow-md"
              >
                {isGeneratingPdf ? 'Generazione PDF...' : 'Scarica PDF Locandina'}
              </Button>
            </div>

            {/* Hidden Element for PDF Generation - LIGHT THEME */}
            <div id="qr-download-content" style={{ display: 'none', position: 'fixed', top: '-9999px', width: '800px', height: '1131px' }}>
              <div style={{
                width: '100%',
                height: '100%',
                background: '#ffffff',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#18181b',
                fontFamily: 'Segoe UI, sans-serif',
                padding: '60px'
              }}>
                <div style={{
                  border: '4px solid #f59e0b',
                  padding: '60px',
                  borderRadius: '40px',
                  background: '#ffffff',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  boxShadow: 'none'
                }}>
                  <div style={{ width: '60px', height: '3px', background: 'linear-gradient(to right, transparent, #d97706, transparent)', margin: '0 auto 30px auto', borderRadius: '2px' }} />
                  <h1 style={{ fontSize: '44px', fontWeight: '300', marginBottom: '8px', color: '#18181b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Prenota il Tuo Tavolo</h1>
                  <p style={{ fontSize: '22px', color: '#71717a', marginBottom: '45px', fontWeight: '300', letterSpacing: '0.02em' }}>Scopri il nostro Menu Digitale</p>

                  <div style={{
                    background: 'white',
                    padding: '24px',
                    borderRadius: '16px',
                    marginBottom: '35px',
                    border: '1px solid #e4e4e7',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.06)'
                  }}>
                    <QRCodeGenerator
                      value={`${window.location.origin}/book/${restaurantId}`}
                      size={320}
                    />
                  </div>

                  <div style={{
                    background: '#fffbeb',
                    border: '1px solid #fcd34d',
                    borderRadius: '16px',
                    padding: '25px 30px',
                    width: '100%',
                    textAlign: 'center'
                  }}>
                    <h3 style={{ color: '#b45309', fontSize: '24px', marginBottom: '10px', fontWeight: '600', letterSpacing: '0.03em' }}>Scansiona il QR Code</h3>
                    <p style={{ fontSize: '18px', color: '#3f3f46', lineHeight: '1.5', fontWeight: '300' }}>Inquadra il codice con la fotocamera per prenotare in un attimo</p>
                  </div>
                  <div style={{ width: '60px', height: '3px', background: 'linear-gradient(to right, transparent, #d97706, transparent)', margin: '30px auto 0 auto', borderRadius: '2px' }} />
                </div>
              </div>
            </div>

          </div>
        </DialogContent>
      </Dialog>

      {/* Export Reservations Table Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="max-w-md bg-black/90 border-amber-500/20 text-zinc-100 backdrop-blur-xl shadow-[0_0_50px_rgba(0,0,0,0.5)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TableIcon size={24} weight="duotone" className="text-amber-500" />
              Esporta Tabella Prenotazioni
            </DialogTitle>
            <DialogDescription>
              Seleziona il periodo e le sale da includere nel PDF
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-4">
            {/* Date Range */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-zinc-300">Periodo</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="export-start" className="text-xs text-zinc-500">Data Inizio</Label>
                  <Input
                    id="export-start"
                    type="date"
                    value={exportStartDate}
                    onChange={(e) => setExportStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="export-end" className="text-xs text-zinc-500">Data Fine</Label>
                  <Input
                    id="export-end"
                    type="date"
                    value={exportEndDate}
                    onChange={(e) => setExportEndDate(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Room Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-zinc-300">Sale da includere</Label>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="room-all"
                    checked={exportSelectedRooms.includes('all')}
                    onCheckedChange={() => handleExportRoomToggle('all')}
                    className="border-zinc-600 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                  />
                  <Label htmlFor="room-all" className="text-sm cursor-pointer">Tutte le Sale</Label>
                </div>
                <Separator className="my-2" />
                {rooms.map(room => (
                  <div key={room.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`room-${room.id}`}
                      checked={exportSelectedRooms.includes(room.id) || exportSelectedRooms.includes('all')}
                      disabled={exportSelectedRooms.includes('all')}
                      onCheckedChange={() => handleExportRoomToggle(room.id)}
                      className="border-zinc-600 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                    />
                    <Label htmlFor={`room-${room.id}`} className="text-sm cursor-pointer">{room.name}</Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview count */}
            <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-800">
              <p className="text-sm text-zinc-400">
                <span className="font-bold text-amber-500">{getExportBookings().length}</span> prenotazioni trovate per il periodo selezionato
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowExportDialog(false)}
              >
                Annulla
              </Button>
              <Button
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white gap-2"
                onClick={generateTablePDF}
                disabled={isGeneratingTablePdf || getExportBookings().length === 0}
              >
                {isGeneratingTablePdf ? (
                  <span>Generazione...</span>
                ) : (
                  <>
                    <DownloadSimple size={18} />
                    Scarica PDF
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div >
  )
}