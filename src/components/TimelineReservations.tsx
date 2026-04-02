import React, { useState, useRef, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Trash, MagnifyingGlass as Search, Check, Clock, ArrowRight, Users, ChatText } from '@phosphor-icons/react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Table, Booking, User } from '../services/types'
import { DatabaseService } from '../services/DatabaseService'

interface ServiceSegment {
  label: string
  start: string
  end: string
}

interface TimelineReservationsProps {
  user: User
  restaurantId: string
  tables: Table[]
  bookings: Booking[]
  selectedDate: string // Passed from parent
  openingTime?: string
  closingTime?: string
  serviceSegments?: ServiceSegment[]
  reservationDuration?: number // Duration in minutes, default 120
  onRefresh?: () => void
  onEditBooking?: (booking: Booking) => void
  onDeleteBooking?: (bookingId: string) => void
  onDateChange?: (date: Date) => void
}

interface TimeSlot {
  time: string
  hour: number
  minute: number
}

interface ReservationBlock {
  booking: Booking
  startMinutes: number
  duration: number
  table: Table
}

const COLORS = ['#C9A152', '#8B7355', '#F4E6D1', '#E8C547', '#D4B366', '#A68B5B', '#F0D86F', '#C09853']

export default function TimelineReservations({ user, restaurantId, tables, bookings, selectedDate, openingTime = '10:00', closingTime = '23:00', serviceSegments, reservationDuration = 120, onRefresh, onEditBooking, onDeleteBooking, onDateChange }: TimelineReservationsProps) {
  const [showReservationDialog, setShowReservationDialog] = useState(false)
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<{ tableId: string, time: string } | null>(null)
  const [draggedBookingId, setDraggedBookingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ tableId: string, time: string } | null>(null)
  const [showDragConfirmDialog, setShowDragConfirmDialog] = useState(false)
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false)
  const [bookingToDelete, setBookingToDelete] = useState<Booking | null>(null)
  const [showArriveConfirmDialog, setShowArriveConfirmDialog] = useState(false)
  const [bookingToArrive, setBookingToArrive] = useState<Booking | null>(null)

  // Custom Pointer Drag states
  const [dragOffsetMinutes, setDragOffsetMinutes] = useState(0)
  const [draggedBookingDuration, setDraggedBookingDuration] = useState<number>(0)
  const [isPointerDragging, setIsPointerDragging] = useState(false)
  const [pointerDragStart, setPointerDragStart] = useState<{ x: number, y: number } | null>(null)

  // Smart table search states
  const [showSmartSearch, setShowSmartSearch] = useState(false)
  const [searchTime, setSearchTime] = useState('')
  const [searchGuests, setSearchGuests] = useState<number | string>(2)
  const [availableTables, setAvailableTables] = useState<Table[]>([])
  const [highlightedTableId, setHighlightedTableId] = useState<string | null>(null)

  // Draft reservation (ghost block) states
  const [draftSlot, setDraftSlot] = useState<{ tableId: string, startMinutes: number, duration: number, isDragging: boolean } | null>(null)

  // Auto-scroll ref
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollIntervalRef = useRef<number | null>(null)

  // Cleanup auto-scroll interval on unmount
  useEffect(() => {
    return () => {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current)
      }
    }
  }, [])

  // Table sorting/filtering state
  const [tableSortBy, setTableSortBy] = useState<'name' | 'capacity' | 'status'>('name')

  // New reservation form state
  const [newReservation, setNewReservation] = useState<{
    name: string
    phone: string
    guests: number | string
    time: string
    tableId: string
    notes: string
    duration: number
  }>({
    name: '',
    phone: '',
    guests: 2,
    time: '',
    tableId: '',
    notes: '',
    duration: reservationDuration
  })

  // Filter tables for this restaurant
  const restaurantTables = tables.filter(t => t.restaurant_id === restaurantId)

  // Filter bookings for selected date
  const localBookings = bookings.filter(b => b.restaurant_id === restaurantId && b.status !== 'CANCELLED')

  const dayBookings = localBookings?.filter(res => {
    if (!res.date_time) return false
    const bDate = new Date(res.date_time)
    const bDateStr = `${bDate.getFullYear()}-${String(bDate.getMonth() + 1).padStart(2, '0')}-${String(bDate.getDate()).padStart(2, '0')}`
    return bDateStr === selectedDate
  }) || []

  // Timeline configuration
  // Generate segments. If serviceSegments is provided and valid, use it. Otherwise, create a single segment from open to close.
  const isValidSegments = serviceSegments && serviceSegments.length > 0 && serviceSegments.every(s => s.start && s.end);

  // Default bounds
  const startHour = openingTime ? parseInt(openingTime.split(':')[0]) || 0 : 0
  const endHour = closingTime ? parseInt(closingTime.split(':')[0]) || 24 : 24

  // Compile segments in minutes
  let timelineSegments: { label: string, startMin: number, endMin: number, duration: number }[] = []

  const timeToMinutes = (time: string) => {
    if (!time) return 0
    const parts = time.split(':')
    const hours = parseInt(parts[0]) || 0
    const minutes = parseInt(parts[1]) || 0
    return hours * 60 + minutes
  }

  const minutesToTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = Math.round(minutes % 60)
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
  }

  if (isValidSegments) {
    serviceSegments!.forEach(seg => {
      const sStart = timeToMinutes(seg.start)
      const sEnd = timeToMinutes(seg.end)
      if (sEnd > sStart) {
        timelineSegments.push({ label: seg.label, startMin: sStart, endMin: sEnd, duration: sEnd - sStart })
      }
    })
    // Sort segments just in case
    timelineSegments.sort((a, b) => a.startMin - b.startMin)
  } else {
    timelineSegments.push({
      label: 'Servizio',
      startMin: startHour * 60,
      endMin: endHour * 60,
      duration: (endHour * 60) - (startHour * 60)
    })
  }

  const TIMELINE_DURATION = timelineSegments.reduce((acc, seg) => acc + seg.duration, 0)
  // Fallback if configured improperly
  const totalDurationSafe = TIMELINE_DURATION > 0 ? TIMELINE_DURATION : 1440

  // Generate time slots (every 60 mins within segments)
  const timeSlots: { time: string, hour: number, minute: number, relativeLeft: number }[] = []

  let accumulatedMinutes = 0;
  timelineSegments.forEach(seg => {
    const startH = Math.ceil(seg.startMin / 60);
    const endH = Math.floor(seg.endMin / 60);

    for (let hour = startH; hour <= endH; hour++) {
      const minInSegment = (hour * 60) - seg.startMin;
      // if it falls strictly inside or on boundaries
      if (minInSegment >= 0 && minInSegment <= seg.duration) {
        const leftPercentage = ((accumulatedMinutes + minInSegment) / totalDurationSafe) * 100;
        timeSlots.push({
          time: `${hour.toString().padStart(2, '0')}:00`,
          hour,
          minute: 0,
          relativeLeft: leftPercentage
        })
      }
    }
    accumulatedMinutes += seg.duration;
  });

  const timelineRef = useRef<HTMLDivElement>(null)

  // Calculate position and width for a reservation block taking into account the gaps
  const getBlockStyle = (startMinutes: number, durationMinutes: number) => {
    let startOffset = 0;
    let foundStart = false;
    let visualStart = startMinutes;

    // Find the relative start position
    for (const seg of timelineSegments) {
      if (startMinutes >= seg.startMin && startMinutes < seg.endMin) {
        startOffset += startMinutes - seg.startMin;
        foundStart = true;
        break;
      } else if (startMinutes < seg.startMin) {
        // Requested start is in a gap before this segment, snap to start of segment
        visualStart = seg.startMin;
        foundStart = true;
        break;
      } else {
        startOffset += seg.duration;
      }
    }

    if (!foundStart) {
      // Past the end of the last segment
      visualStart = timelineSegments[timelineSegments.length - 1].endMin;
      startOffset = totalDurationSafe;
    }

    const left = (startOffset / totalDurationSafe) * 100;

    // Width calculation (could span across gaps, but let's assume it spans visually linearly over the active duration)
    let visibleDuration = 0;
    let remainingDuration = durationMinutes;
    let currentMin = visualStart;

    for (const seg of timelineSegments) {
      if (remainingDuration <= 0) break;
      if (currentMin >= seg.endMin) continue; // Past this segment

      const startInSeg = Math.max(currentMin, seg.startMin);
      const endInSeg = Math.min(startInSeg + remainingDuration, seg.endMin);

      const durationInSeg = endInSeg - startInSeg;
      visibleDuration += durationInSeg;

      remainingDuration -= durationInSeg;
      currentMin = endInSeg;

      // If we exit a segment and still have remaining duration, we assume it jumps to the next segment's start
      if (remainingDuration > 0) {
        // find next segment
        const nextSegIndex = timelineSegments.indexOf(seg) + 1;
        if (nextSegIndex < timelineSegments.length) {
          currentMin = timelineSegments[nextSegIndex].startMin;
        } else {
          break; // No more segments
        }
      }
    }

    // In case of error
    if (visibleDuration <= 0) visibleDuration = durationMinutes; // fallback

    const width = (visibleDuration / totalDurationSafe) * 100;

    return {
      left: `${Math.max(0, Math.min(100, left))}%`,
      width: `${Math.min(100 - left, width)}%`
    }
  }

  // Helper to get raw minutes from screen X coordinate
  const getPointerMinutesFromX = (clientX: number, targetElement: HTMLElement) => {
    const scrollContainer = targetElement.closest('.timeline-scroll-container') as HTMLElement;
    const bodyContainer = scrollContainer?.querySelector('.timeline-body-container') as HTMLElement;

    if (!bodyContainer) return timelineSegments[0]?.startMin || 0;

    const rect = bodyContainer.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
    const targetMinutesInActive = (percentage / 100) * totalDurationSafe;

    let accumulated = 0;
    for (const seg of timelineSegments) {
      if (targetMinutesInActive <= accumulated + seg.duration) {
        const offsetInSeg = targetMinutesInActive - accumulated;
        return seg.startMin + offsetInSeg;
      }
      accumulated += seg.duration;
    }
    return timelineSegments[timelineSegments.length - 1]?.endMin || 0;
  }

  // Prepare reservation blocks
  const getReservationBlocks = (): ReservationBlock[] => {
    return dayBookings
      .map(booking => {
        const table = restaurantTables.find(t => t.id === booking.table_id)
        if (!table) return null // Skip if table not found

        if (!booking.date_time) return null
        const timePart = booking.date_time.split('T')[1] || ''
        const parts = timePart.split(':')
        const hours = parseInt(parts[0]) || 0
        const minutes = parseInt(parts[1]) || 0
        const startMinutes = hours * 60 + minutes

        // Use per-booking duration or global default
        let duration = booking.duration || reservationDuration

        // For "infinite" (9999), extend to end of closing time
        if (duration >= 9999) {
          const [cH, cM] = closingTime.split(':').map(Number)
          const closingMinutes = cH * 60 + cM
          duration = Math.max(60, closingMinutes - startMinutes)
        }

        // Cap duration to service segment boundary (lunch reservation can't extend into dinner)
        if (serviceSegments && serviceSegments.length > 0) {
          for (const seg of serviceSegments) {
            const [sH, sM] = seg.start.split(':').map(Number)
            const [eH, eM] = seg.end.split(':').map(Number)
            const segStart = sH * 60 + sM
            const segEnd = eH * 60 + eM
            if (startMinutes >= segStart && startMinutes < segEnd) {
              // Reservation starts in this segment — cap to segment end
              duration = Math.min(duration, segEnd - startMinutes)
              break
            }
          }
        }

        return {
          booking,
          startMinutes,
          duration,
          table
        }
      })
      .filter((block): block is ReservationBlock => block !== null)
  }

  const reservationBlocks = getReservationBlocks()

  // Sort tables based on selected filter
  const sortedTables = [...restaurantTables].sort((a, b) => {
    if (tableSortBy === 'name') {
      return a.number.localeCompare(b.number)
    } else if (tableSortBy === 'capacity') {
      return (b.seats || 4) - (a.seats || 4) // Descending
    } else if (tableSortBy === 'status') {
      // Check if tables are occupied
      const now = new Date()
      const currentMinutes = now.getHours() * 60 + now.getMinutes()
      const isToday = selectedDate === now.toISOString().split('T')[0]

      const aOccupied = isToday && reservationBlocks.some(block =>
        block.table.id === a.id &&
        currentMinutes >= block.startMinutes &&
        currentMinutes < block.startMinutes + block.duration
      )

      const bOccupied = isToday && reservationBlocks.some(block =>
        block.table.id === b.id &&
        currentMinutes >= block.startMinutes &&
        currentMinutes < block.startMinutes + block.duration
      )

      // Occupied tables first
      if (aOccupied && !bOccupied) return -1
      if (!aOccupied && bOccupied) return 1
      return 0
    }
    return 0
  })

  // Check for conflicts
  const hasConflict = (tableId: string, time: string, durationMinutes: number = reservationDuration, excludeBookingId?: string) => {
    const newStart = timeToMinutes(time)
    const newEnd = newStart + durationMinutes

    const blocksToCheck = reservationBlocks.filter(block => block.table.id === tableId && block.booking.id !== excludeBookingId)

    return blocksToCheck.some(block => {
      const blockEnd = block.startMinutes + block.duration
      return (newStart < blockEnd && newEnd > block.startMinutes)
    })
  }

  const [hoveredSlot, setHoveredSlot] = useState<{ tableId: string, time: string, startMinutes: number } | null>(null)

  // Ghost drag logic
  const startAutoScroll = (direction: 'up' | 'down') => {
    if (scrollIntervalRef.current) return;
    scrollIntervalRef.current = window.setInterval(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollBy({ top: direction === 'up' ? -15 : 15 });
      }
    }, 16);
  }

  const stopAutoScroll = () => {
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
  }

  const handleSlotPointerDown = (e: React.PointerEvent, tableId: string) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)

    const rawMinutes = getPointerMinutesFromX(e.clientX, e.currentTarget as HTMLElement);
    const roundedMinutes = Math.round(rawMinutes / 15) * 15

    setDraftSlot({
      tableId,
      startMinutes: roundedMinutes,
      duration: reservationDuration,
      isDragging: true
    })
    setHoveredSlot(null)
  }

  const handleSlotPointerMove = (e: React.PointerEvent, tableId: string) => {
    // Determine auto-scroll based on Y position
    if (draftSlot?.isDragging && scrollContainerRef.current) {
      const rect = scrollContainerRef.current.getBoundingClientRect();
      const y = e.clientY;
      const edgeThreshold = 60; // pixels from edge to start scrolling

      if (y < rect.top + edgeThreshold) {
        startAutoScroll('up');
      } else if (y > rect.bottom - edgeThreshold) {
        startAutoScroll('down');
      } else {
        stopAutoScroll();
      }
    }

    if (!draftSlot || !draftSlot.isDragging) {
      // Standard hover behavior when not dragging
      const rawMinutes = getPointerMinutesFromX(e.clientX, e.currentTarget as HTMLElement);
      const roundedMinutes = Math.round(rawMinutes / 15) * 15
      const snappedTime = minutesToTime(roundedMinutes)

      setHoveredSlot({
        tableId,
        time: snappedTime,
        startMinutes: roundedMinutes
      })
      return
    }

    // Find table below cursor
    const elBelow = document.elementFromPoint(e.clientX, e.clientY);
    const tableRow = elBelow?.closest('[data-table-id]') as HTMLElement | null;
    let targetTableId = draftSlot.tableId;

    if (tableRow) {
      targetTableId = tableRow.getAttribute('data-table-id') || targetTableId;
    }

    e.currentTarget.setPointerCapture(e.pointerId) // Ensure capture is maintained

    const rawMinutes = getPointerMinutesFromX(e.clientX, e.currentTarget as HTMLElement);
    const roundedMinutes = Math.round(rawMinutes / 15) * 15

    setDraftSlot({
      ...draftSlot,
      tableId: targetTableId,
      startMinutes: roundedMinutes
    })
  }

  const handleSlotPointerUp = (e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    stopAutoScroll();

    if (!draftSlot || !draftSlot.isDragging) return

    const finalTableId = draftSlot.tableId;
    const finalStartMinutes = draftSlot.startMinutes;
    const finalTime = minutesToTime(finalStartMinutes);

    setDraftSlot(null) // clear drag state immediately

    if (hasConflict(finalTableId, finalTime, reservationDuration)) {
      toast.error('Orario già occupato')
      return
    }

    setSelectedTimeSlot({ tableId: finalTableId, time: finalTime })
    setNewReservation(prev => ({
      ...prev,
      tableId: finalTableId,
      time: finalTime,
      duration: reservationDuration
    }))

    setShowReservationDialog(true)
  }

  const handleTimelineMouseLeave = () => {
    setHoveredSlot(null)
    // if dragging, let pointermove handle via capture
  }

  const handleCreateReservation = async () => {
    if (!newReservation.name || !newReservation.guests || !newReservation.time || !newReservation.tableId) {
      toast.error('Compila tutti i campi')
      return
    }

    try {
      // Capacity Check
      const selectedTable = restaurantTables.find(t => t.id === newReservation.tableId)
      const guests = typeof newReservation.guests === 'string' ? parseInt(newReservation.guests) || 1 : newReservation.guests
      if (selectedTable && (selectedTable.seats || 4) < guests) {
        toast.error(`Il tavolo ${selectedTable.number} può contenere massimo ${selectedTable.seats || 4} persone`)
        return
      }

      const dateTime = `${selectedDate}T${newReservation.time}:00`

      await DatabaseService.createBooking({
        restaurant_id: restaurantId,
        table_id: newReservation.tableId,
        date_time: dateTime,
        guests: Number(newReservation.guests),
        status: 'CONFIRMED',
        name: newReservation.name,
        phone: newReservation.phone,
        notes: newReservation.notes,
        // duration: newReservation.duration // Not in DB schema yet, but logic is ready
      })

      toast.success('Prenotazione creata')
      setShowReservationDialog(false)
      setNewReservation({ name: '', phone: '', guests: 2, time: '', tableId: '', notes: '', duration: reservationDuration })
      onRefresh?.()
    } catch (error) {
      console.error('Error creating reservation:', error)
      toast.error('Errore creazione prenotazione')
    }
  }

  const confirmMove = async () => {
    if (!draggedBookingId || !dropTarget) return

    try {
      const dateTime = `${selectedDate}T${dropTarget.time}:00`
      await DatabaseService.updateBooking({
        id: draggedBookingId,
        table_id: dropTarget.tableId,
        date_time: dateTime
      })
      toast.success('Prenotazione spostata')
      onRefresh?.()
    } catch (error) {
      console.error('Move error:', error)
      toast.error('Errore spostamento')
    } finally {
      setShowDragConfirmDialog(false)
      // draggedBookingId and dropTarget cleared on dialog close
    }
  }

  const handleCompleteBooking = (booking: Booking) => {
    setBookingToArrive(booking)
    setShowArriveConfirmDialog(true)
  }

  const confirmCompleteBooking = async () => {
    if (!bookingToArrive) return

    try {
      await DatabaseService.updateBooking({
        id: bookingToArrive.id,
        status: 'COMPLETED'
      })
      toast.success('Prenotazione completata! 👍')
      onRefresh?.()
    } catch (error) {
      console.error('Complete error:', error)
      toast.error('Errore completamento prenotazione')
    } finally {
      setShowArriveConfirmDialog(false)
      setBookingToArrive(null)
    }
  }

  const handleDeleteReservation = (booking: Booking) => {
    setBookingToDelete(booking)
    setShowDeleteConfirmDialog(true)
  }

  const confirmDeleteReservation = async () => {
    if (!bookingToDelete) return

    try {
      if (onDeleteBooking) {
        onDeleteBooking(bookingToDelete.id)
      } else {
        await DatabaseService.deleteBooking(bookingToDelete.id)
      }
      toast.success('Prenotazione eliminata')
      onRefresh?.()
    } catch (error) {
      console.error('Delete error:', error)
      toast.error('Errore durante l\'eliminazione')
    } finally {
      setShowDeleteConfirmDialog(false)
      setBookingToDelete(null)
    }
  }

  const handleSmartSearch = () => {
    if (!searchTime) {
      toast.error('Seleziona un orario')
      return
    }

    const available = restaurantTables.filter(table => {
      const guests = typeof searchGuests === 'string' ? parseInt(searchGuests) || 1 : searchGuests
      if ((table.seats || 0) < guests) return false
      return !hasConflict(table.id, searchTime, reservationDuration)
    })

    setAvailableTables(available)

    if (available.length === 0) {
      toast.error('Nessun tavolo disponibile per questo orario')
    } else {
      toast.success(`${available.length} tavolo/i disponibile/i`)
      if (available.length > 0) {
        setHighlightedTableId(available[0].id)
        setTimeout(() => setHighlightedTableId(null), 5000)
      }
    }
  }

  const getCurrentTimePosition = () => {
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]
    if (todayStr !== selectedDate) return -1

    const currentMinutes = now.getHours() * 60 + now.getMinutes()

    // Check if within any segment
    let accumulated = 0;
    for (const seg of timelineSegments) {
      if (currentMinutes >= seg.startMin && currentMinutes <= seg.endMin) {
        const relativeCurrent = currentMinutes - seg.startMin + accumulated;
        return (relativeCurrent / totalDurationSafe) * 100;
      } else if (currentMinutes < seg.startMin) {
        return -1; // Between segments, could return clamped or hide
      }
      accumulated += seg.duration;
    }

    return -1;
  }

  const currentTimePos = getCurrentTimePosition()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-semibold text-muted-foreground">Timeline</h3>
          <div className="text-sm text-muted-foreground">
            {dayBookings.length} prenotazioni
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-muted/50 p-1 rounded-lg">
            <Button
              variant={tableSortBy === 'name' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setTableSortBy('name')}
              className="h-8 text-xs"
            >
              A-Z
            </Button>
            <Button
              variant={tableSortBy === 'capacity' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setTableSortBy('capacity')}
              className="h-8 text-xs"
            >
              Capacità
            </Button>
            <Button
              variant={tableSortBy === 'status' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setTableSortBy('status')}
              className="h-8 text-xs"
            >
              Stato
            </Button>
          </div>
          <Button variant="outline" onClick={() => setShowSmartSearch(true)} className="gap-2">
            <Search size={16} />
            Ricerca Tavolo
          </Button>
        </div>
      </div>

      <Card className="shadow-none border-0 bg-transparent">
        <CardContent className="p-0">
          <div className="relative">

            {/* HEADER: TIMES */}
            <div className="flex h-12 sticky top-0 z-40 bg-black/95 backdrop-blur-xl border-b border-white/5 shadow-lg shadow-black/50">
              <div className="w-40 shrink-0 border-r border-white/10 flex items-center px-4">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Tavoli</span>
              </div>
              <div className="flex-1 relative timeline-scroll-container">
                <div className="absolute inset-0 timeline-body-container">
                  {timeSlots.map((slot, i) => (
                    <div
                      key={i}
                      className="absolute bottom-0 transform -translate-x-1/2 flex flex-col items-center"
                      style={{ left: `${slot.relativeLeft}%` }}
                    >
                      <span className="text-xs font-bold text-zinc-400 mb-1 px-1">{slot.time}</span>
                      <div className="h-2 w-px bg-white/10"></div>
                    </div>
                  ))}

                  {/* Segment Separators (Labels) */}
                  {timelineSegments.map((seg, i) => {
                    // don't draw separator text for first segment start if there's only one, 
                    // but rather show labels centrally or distinctly if multiple
                    if (timelineSegments.length > 1) {
                      let accBefore = 0;
                      for (let j = 0; j < i; j++) accBefore += timelineSegments[j].duration;
                      const leftStart = (accBefore / totalDurationSafe) * 100;
                      const leftEnd = ((accBefore + seg.duration) / totalDurationSafe) * 100;
                      const labelWidth = leftEnd - leftStart;

                      return (
                        <div
                          key={'seg-label-' + i}
                          className="absolute bottom-2 text-xs font-bold uppercase tracking-[0.2em] text-amber-400 flex justify-center items-center pointer-events-none"
                          style={{ left: `${leftStart}%`, width: `${labelWidth}%` }}
                        >
                          <span className="bg-zinc-950/80 px-4 py-1.5 rounded-full backdrop-blur-md border border-white/10 shadow-[0_0_15px_rgba(0,0,0,0.5)] flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]"></span>
                            {seg.label}
                          </span>
                        </div>
                      )
                    }
                    return null;
                  })}
                </div>
              </div>
            </div>

            {/* BODY: TABLES & GRID */}
            <div ref={scrollContainerRef} className="timeline-scroll-container overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-white/10 relative pt-8" style={{ maxHeight: 'calc(100vh - 280px)' }}>
              {sortedTables.map((table, tableIndex) => {
                // Status Logic
                const now = new Date()
                const currentMinutes = now.getHours() * 60 + now.getMinutes()
                const isToday = selectedDate === now.toISOString().split('T')[0]

                const isCurrentlyOccupied = isToday && reservationBlocks.some(block => {
                  if (block.table.id !== table.id) return false
                  const bookingEnd = block.startMinutes + block.duration
                  return currentMinutes >= block.startMinutes && currentMinutes < bookingEnd
                })
                const isAvailable = availableTables.some(t => t.id === table.id)

                // UPDATED COLORS: RED for Occupied, GREEN for Free (approx)
                let borderClass = 'border-l-2 border-l-zinc-800'
                let bgClass = 'bg-black/40' // Pure black/glass default

                if (isCurrentlyOccupied) {
                  borderClass = 'border-l-2 border-l-amber-500'
                  bgClass = 'bg-amber-950/20' // Subtle gold tint for occupied
                } else if (isAvailable && searchTime) {
                  borderClass = 'border-l-2 border-l-emerald-500' // Available
                  bgClass = 'bg-emerald-950/20'
                } else {
                  // Default Free
                  borderClass = 'border-l-2 border-l-zinc-800'
                  bgClass = 'bg-black' // Deep black for free
                }

                // Collision check for ghost block
                const isHoverColliding = hoveredSlot && hoveredSlot.tableId === table.id && reservationBlocks.some(block => {
                  if (block.table.id !== table.id) return false
                  const blockEnd = block.startMinutes + block.duration
                  const ghostStart = hoveredSlot.startMinutes
                  const ghostEnd = ghostStart + reservationDuration
                  return (ghostStart < blockEnd && ghostEnd > block.startMinutes)
                })

                return (
                  <div key={table.id} className={`flex h-24 border-b border-white/10 ${bgClass} ${borderClass}`}>

                    {/* LEFT COLUMN: TABLE INFO */}
                    <div className="w-40 shrink-0 flex flex-col justify-center px-4 border-r border-border/10 relative">
                      <span className="font-bold text-lg text-foreground">{table.number}</span>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        Users: {table.seats || 4}
                      </div>
                      {isCurrentlyOccupied && <Badge variant="destructive" className="mt-2 w-fit text-[10px] px-1 py-0 h-4">Occupato</Badge>}
                    </div>

                    {/* RIGHT COLUMN: TIMELINE STRIP */}
                    <div
                      data-table-id={table.id}
                      className="flex-1 relative cursor-crosshair group touch-none timeline-body-container"
                      onPointerDown={(e) => handleSlotPointerDown(e, table.id)}
                      onPointerMove={(e) => handleSlotPointerMove(e, table.id)}
                      onPointerUp={(e) => handleSlotPointerUp(e)}
                      onPointerCancel={(e) => {
                        setDraftSlot(null)
                        stopAutoScroll()
                      }}
                      onMouseLeave={handleTimelineMouseLeave}
                    >
                      {/* DRAFT SLOT BLOCK */}
                      {draftSlot && draftSlot.tableId === table.id && !draggedBookingId && (
                        <div
                          className="absolute top-2 bottom-2 rounded-md bg-emerald-500/30 border-2 border-emerald-500/70 border-solid z-50 pointer-events-none transition-none shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                          style={{
                            left: `${getBlockStyle(draftSlot.startMinutes, draftSlot.duration).left}`,
                            width: `${getBlockStyle(draftSlot.startMinutes, draftSlot.duration).width}`
                          }}
                        >
                          <div className="absolute -top-7 left-0 bg-emerald-500 text-black text-xs px-1.5 py-0.5 rounded shadow-sm font-bold whitespace-nowrap opacity-100 transition-opacity z-[60]">
                            {minutesToTime(draftSlot.startMinutes)} - {minutesToTime(draftSlot.startMinutes + draftSlot.duration)}
                          </div>
                        </div>
                      )}

                      {/* GHOST BLOCK ON HOVER - Only if no collision and not dragging */}
                      {hoveredSlot && hoveredSlot.tableId === table.id && !draggedBookingId && !draftSlot && (
                        <div
                          className="absolute top-2 bottom-2 rounded-md bg-amber-500/20 border-2 border-amber-500/50 border-dashed z-0 pointer-events-none transition-all duration-75 ease-out"
                          style={{
                            left: `${getBlockStyle(hoveredSlot.startMinutes, reservationDuration).left}`,
                            width: `${getBlockStyle(hoveredSlot.startMinutes, reservationDuration).width}`
                          }}
                        >
                          <div className="absolute -top-7 left-0 bg-amber-500 text-black text-xs px-1.5 py-0.5 rounded shadow-sm font-bold whitespace-nowrap z-[60]">
                            {hoveredSlot.time}
                          </div>
                        </div>
                      )}

                      {/* DROP TARGET PREVIEW (FOR DRAGGING EXISTING BOOKING) */}
                      {dropTarget && dropTarget.tableId === table.id && draggedBookingId && (() => {
                        const draggedBooking = bookings.find(b => b.id === draggedBookingId);
                        if (!draggedBooking) return null;

                        return (
                          <div
                            className="absolute top-2 bottom-2 rounded-md bg-amber-500/80 border-2 border-amber-400 border-dashed z-40 pointer-events-none transition-none flex flex-col justify-center px-2 overflow-hidden shadow-[0_10px_20px_-5px_rgba(245,158,11,0.5)] scale-[1.02]"
                            style={{
                              left: `${getBlockStyle(timeToMinutes(dropTarget.time), draggedBookingDuration).left}`,
                              width: `${getBlockStyle(timeToMinutes(dropTarget.time), draggedBookingDuration).width}`,
                              color: '#000',
                              fontWeight: 600,
                            }}
                          >
                            <div className="flex items-center gap-1.5 overflow-hidden opacity-90">
                              <div className="font-bold text-sm truncate leading-tight flex-1">
                                {draggedBooking.name}
                              </div>
                              {draggedBooking.notes && (
                                <ChatText size={14} weight="fill" className="text-black/60 shrink-0" />
                              )}
                            </div>
                            <div className="text-[10px] truncate font-bold uppercase tracking-wide opacity-90 mt-0.5">
                              {dropTarget.time} - {minutesToTime(timeToMinutes(dropTarget.time) + draggedBookingDuration)} • {draggedBooking.guests}p
                            </div>
                          </div>
                        );
                      })()}

                      {/* SEGMENT SEPARATORS/GAPS */}
                      <div className="absolute inset-0 pointer-events-none">
                        {timelineSegments.length > 1 && timelineSegments.map((seg, i) => {
                          if (i === 0) return null;
                          let accBefore = 0;
                          for (let j = 0; j < i; j++) accBefore += timelineSegments[j].duration;
                          const gapPos = (accBefore / totalDurationSafe) * 100;

                          return (
                            <div
                              key={'gap-' + i}
                              className="absolute top-0 bottom-0 w-8 -ml-4 flex justify-center opacity-100 z-20 pointer-events-none"
                              style={{ left: `${gapPos}%` }}
                            >
                              <div className="w-[2px] h-full bg-gradient-to-b from-transparent via-amber-500/50 to-transparent shadow-[0_0_15px_rgba(245,158,11,0.5)]"></div>
                            </div>
                          )
                        })}
                      </div>

                      {/* GRID LINES (Absolute) */}
                      <div className="absolute inset-0 pointer-events-none">
                        {timeSlots.map((slot, i) => (
                          <div
                            key={i}
                            className="absolute top-0 bottom-0 w-px bg-white/5 dashed border-r border-dashed border-white/5"
                            style={{ left: `${slot.relativeLeft}%` }}
                          ></div>
                        ))}
                      </div>

                      {/* CURRENT TIME INDICATOR */}
                      {currentTimePos >= 0 && (
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-amber-500 z-10 pointer-events-none shadow-[0_0_8px_rgba(245,158,11,0.8)]"
                          style={{ left: `${currentTimePos}%` }}
                        ></div>
                      )}

                      {/* RESERVATION BLOCKS */}
                      {reservationBlocks
                        .filter(block => block.table.id === table.id)
                        .map((block, i) => {
                          const isCompleted = block.booking.status === 'COMPLETED'
                          const colorIndex = i % COLORS.length
                          const bgColor = COLORS[colorIndex]

                          // FIXED: Opacity for completed items
                          return (
                            <div
                              key={block.booking.id}
                              className={`absolute top-2 bottom-2 rounded-md border border-white/20 px-2 flex flex-col justify-center overflow-hidden transition-all duration-300 hover:z-50 hover:scale-[1.03] hover:shadow-[0_20px_40px_rgba(0,0,0,0.8)] ${isCompleted ? 'opacity-40 grayscale scale-[0.98]' : 'shadow-[0_10px_20px_-5px_rgba(0,0,0,0.5)] cursor-move'} ${draggedBookingId === block.booking.id ? 'opacity-20 border-dashed grayscale scale-95 z-0' : ''}`}
                              style={{
                                left: `${getBlockStyle(block.startMinutes, block.duration).left}`,
                                width: `${getBlockStyle(block.startMinutes, block.duration).width}`,
                                backgroundColor: bgColor,
                                color: '#000', // Force black text for contrast on gold
                                fontWeight: 600,
                                touchAction: 'none'
                              }}
                              onPointerDown={(e) => {
                                if (isCompleted) return;
                                if ((e.target as Element).closest('button')) return
                                if (e.pointerType === 'mouse' && e.button !== 0) return

                                e.stopPropagation()
                                e.currentTarget.setPointerCapture(e.pointerId)

                                setPointerDragStart({ x: e.clientX, y: e.clientY })
                                setIsPointerDragging(false)
                                setDraggedBookingId(block.booking.id)
                                setDraggedBookingDuration(block.duration)

                                const rect = e.currentTarget.getBoundingClientRect()
                                const clickX = e.clientX - rect.left
                                const offsetPercentage = clickX / rect.width
                                const offsetMinutes = Math.round(offsetPercentage * block.duration)
                                setDragOffsetMinutes(offsetMinutes)
                              }}
                              onPointerMove={(e) => {
                                if (isCompleted) return;
                                e.stopPropagation()
                                if (draggedBookingId !== block.booking.id) return

                                if (!isPointerDragging && pointerDragStart) {
                                  const dx = e.clientX - pointerDragStart.x
                                  const dy = e.clientY - pointerDragStart.y
                                  if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                                    setIsPointerDragging(true)
                                  }
                                }

                                if (isPointerDragging) {
                                  const el = e.currentTarget as HTMLElement
                                  const originalPointerEvents = el.style.pointerEvents
                                  el.style.pointerEvents = 'none'
                                  const elementBelow = document.elementFromPoint(e.clientX, e.clientY)
                                  el.style.pointerEvents = originalPointerEvents

                                  const tableRow = elementBelow?.closest('[data-table-id]') as HTMLElement | null
                                  if (tableRow) {
                                    const tableId = tableRow.getAttribute('data-table-id')!

                                    const rect = tableRow.getBoundingClientRect()
                                    const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
                                    const rawMinutes = getPointerMinutesFromX(e.clientX, tableRow)
                                    const adjustedStartMinutes = rawMinutes - dragOffsetMinutes

                                    const roundedMinutes = Math.round(adjustedStartMinutes / 15) * 15
                                    const newTime = minutesToTime(roundedMinutes)

                                    setDropTarget({ tableId, time: newTime })
                                  } else {
                                    setDropTarget(null)
                                  }
                                }
                              }}
                              onPointerUp={(e) => {
                                if (isCompleted) return;
                                e.stopPropagation()
                                e.currentTarget.releasePointerCapture(e.pointerId)

                                if (isPointerDragging) {
                                  if (dropTarget) {
                                    const originalTime = minutesToTime(block.startMinutes)
                                    if (originalTime !== dropTarget.time || block.table.id !== dropTarget.tableId) {
                                      if (hasConflict(dropTarget.tableId, dropTarget.time, block.duration, block.booking.id)) {
                                        toast.error('Orario occupato o sovrapposto')
                                        setDraggedBookingId(null)
                                        setDropTarget(null)
                                      } else {
                                        setShowDragConfirmDialog(true)
                                      }
                                    } else {
                                      setDraggedBookingId(null)
                                      setDropTarget(null)
                                    }
                                  } else {
                                    setDraggedBookingId(null)
                                  }
                                } else {
                                  if (!(e.target as Element).closest('button')) {
                                    onEditBooking?.(block.booking)
                                  }
                                  setDraggedBookingId(null)
                                  setDropTarget(null)
                                }

                                setPointerDragStart(null)
                                setIsPointerDragging(false)
                              }}
                              onPointerCancel={(e) => {
                                if (isCompleted) return;
                                e.stopPropagation()
                                e.currentTarget.releasePointerCapture(e.pointerId)
                                setPointerDragStart(null)
                                setIsPointerDragging(false)
                                setDraggedBookingId(null)
                                setDropTarget(null)
                              }}
                              onMouseEnter={() => setHoveredSlot(null)}
                            >
                              <div className="flex items-center gap-1.5 overflow-hidden">
                                <div className="font-bold text-sm truncate leading-tight flex-1">
                                  {block.booking.name}
                                </div>
                                {block.booking.notes && (
                                  <ChatText size={14} weight="fill" className="text-black/60 shrink-0" />
                                )}
                              </div>
                              <div className="text-[10px] truncate opacity-80 mt-0.5 font-bold uppercase tracking-wide">
                                {minutesToTime(block.startMinutes)} - {minutesToTime(block.startMinutes + block.duration)} • {block.booking.guests}p
                              </div>

                              {!isCompleted && (
                                <div className="absolute top-1 right-1 flex gap-1 bg-black/40 rounded-full p-0.5 backdrop-blur-sm z-50 border border-white/10 opacity-100">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="w-7 h-7 rounded-full hover:bg-black/60 text-white/70 hover:text-white p-0 touch-none shadow-sm transition-colors md:opacity-0 md:group-hover:opacity-100 opacity-100"
                                    onPointerDown={(e) => {
                                      e.stopPropagation()
                                      e.preventDefault()
                                      handleDeleteReservation(block.booking)
                                    }}
                                    title="Elimina Prenotazione"
                                  >
                                    <Trash size={14} weight="bold" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="w-7 h-7 rounded-full bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-400 hover:text-emerald-300 p-0 touch-none shadow-sm transition-colors opacity-100"
                                    onPointerDown={(e) => {
                                      e.stopPropagation()
                                      e.preventDefault()
                                      handleCompleteBooking(block.booking)
                                    }}
                                    title="Segna Arrivato"
                                  >
                                    <Check size={16} weight="bold" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* DIALOGS */}

      {/* Search Table Dialog */}
      <Dialog open={showSmartSearch} onOpenChange={setShowSmartSearch}>
        <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Ricerca Tavolo Disponibile</DialogTitle>
            <DialogDescription>
              Trova un tavolo libero per la prenotazione.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="search-date">Data</Label>
                <Input
                  id="search-date"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    const newDate = new Date(e.target.value)
                    if (!isNaN(newDate.getTime()) && onDateChange) {
                      onDateChange(newDate)
                      setAvailableTables([]) // Reset results when date changes
                    }
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="search-time">Orario</Label>
                <Input
                  id="search-time"
                  type="time"
                  value={searchTime}
                  onChange={(e) => {
                    setSearchTime(e.target.value)
                    setAvailableTables([]) // Reset results on change
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="search-guests">Persone</Label>
                <Input
                  id="search-guests"
                  type="number"
                  min="1"
                  value={searchGuests}
                  onChange={(e) => {
                    setSearchGuests(e.target.value)
                    setAvailableTables([])
                  }}
                />
              </div>
            </div>

            <Button onClick={handleSmartSearch} className="w-full bg-amber-600 hover:bg-amber-700 text-white">
              <Search className="mr-2" size={16} /> Cerca Tavoli
            </Button>

            {availableTables.length > 0 && (
              <div className="mt-4 border rounded-md overflow-hidden animate-in fade-in slide-in-from-top-2">
                <div className="bg-muted px-4 py-2 border-b text-xs font-semibold text-muted-foreground">
                  Risultati Disponibili ({availableTables.length})
                </div>
                <div className="max-h-[200px] overflow-y-auto">
                  {availableTables.map(table => (
                    <div key={table.id} className="flex items-center justify-between p-3 border-b last:border-0 hover:bg-muted/50 transition-colors">
                      <div className="flex flex-col">
                        <span className="font-bold">Tavolo {table.number}</span>
                        <span className="text-xs text-muted-foreground">{table.seats} Posti</span>
                      </div>
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => {
                          setNewReservation({
                            name: '',
                            phone: '',
                            guests: searchGuests,
                            time: searchTime,
                            tableId: table.id,
                            notes: '',
                            duration: reservationDuration
                          })
                          setShowSmartSearch(false)
                          setShowReservationDialog(true)
                        }}
                      >
                        Prenota
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {availableTables.length === 0 && searchTime && (
              <div className="text-center text-sm text-muted-foreground mt-2">
                Clicca su "Cerca" per vedere i risultati.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>


      <Dialog open={showReservationDialog} onOpenChange={setShowReservationDialog}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Nuova Prenotazione</DialogTitle>
            <DialogDescription>
              Aggiungi una prenotazione per il {selectedDate} alle {newReservation.time}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2.5">
                <Label htmlFor="res-name" className="text-zinc-400">Nome Cliente</Label>
                <Input
                  id="res-name"
                  value={newReservation.name}
                  onChange={(e) => setNewReservation(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Nome del cliente"
                  className="bg-zinc-900 border-zinc-800"
                />
              </div>
              <div className="space-y-2.5">
                <Label htmlFor="res-phone" className="text-zinc-400">Telefono</Label>
                <Input
                  id="res-phone"
                  value={newReservation.phone}
                  onChange={(e) => setNewReservation(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="E.g. +39 333..."
                  className="bg-zinc-900 border-zinc-800"
                />
              </div>
            </div>

            <div className="space-y-2.5">
              <Label htmlFor="res-notes" className="text-zinc-400">Note / Richieste Speciali</Label>
              <Textarea
                id="res-notes"
                value={newReservation.notes}
                onChange={(e) => setNewReservation(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Allergie, tavolo preferito, compleanni..."
                className="bg-zinc-900 border-zinc-800 min-h-[100px] resize-none"
              />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2.5">
                <Label htmlFor="res-guests" className="text-zinc-400">Ospiti</Label>
                <div className="relative">
                  <Input
                    id="res-guests"
                    type="number"
                    min="1"
                    value={newReservation.guests}
                    onChange={(e) => {
                      const val = e.target.value
                      setNewReservation(prev => ({ ...prev, guests: val === '' ? '' : parseInt(val) }))
                    }}
                    className="bg-zinc-900 border-zinc-800 pl-9"
                  />
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                </div>
              </div>
              <div className="space-y-2.5">
                <Label htmlFor="res-time" className="text-zinc-400">Orario</Label>
                <div className="relative">
                  <Input
                    id="res-time"
                    type="time"
                    value={newReservation.time}
                    onChange={(e) => setNewReservation(prev => ({ ...prev, time: e.target.value }))}
                    className="bg-zinc-900 border-zinc-800 pl-9"
                  />
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                </div>
              </div>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2.5">
                <Label htmlFor="res-duration" className="text-zinc-400">Durata</Label>
                <Select
                  value={String(newReservation.duration)}
                  onValueChange={(val) => setNewReservation(prev => ({ ...prev, duration: parseInt(val) }))}
                >
                  <SelectTrigger className="bg-zinc-900 border-zinc-800">
                    <Clock className="mr-2 text-zinc-500" size={16} />
                    <SelectValue placeholder="Durata" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="60">1 ora</SelectItem>
                    <SelectItem value="90">1 ora 30 min</SelectItem>
                    <SelectItem value="120">2 ore</SelectItem>
                    <SelectItem value="150">2 ore 30 min</SelectItem>
                    <SelectItem value="180">3 ore</SelectItem>
                    <SelectItem value="240">4 ore</SelectItem>
                    <SelectItem value="9999">Fino a fine servizio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleCreateReservation} className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-black font-bold shadow-lg shadow-amber-500/10">
              Conferma Prenotazione
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDragConfirmDialog} onOpenChange={(open) => { if (!open) { setDraggedBookingId(null); setDropTarget(null); setShowDragConfirmDialog(false) } }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Sposta Prenotazione</DialogTitle>
            <DialogDescription>
              Sei sicuro di voler spostare la prenotazione alle {dropTarget?.time}?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowDragConfirmDialog(false)} className="border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800">Annulla</Button>
            <Button onClick={confirmMove} className="bg-amber-600 hover:bg-amber-700 text-white">Conferma Spostamento</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirmDialog} onOpenChange={setShowDeleteConfirmDialog}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle className="text-destructive">Elimina Prenotazione</DialogTitle>
            <DialogDescription>
              Sei sicuro di voler eliminare la prenotazione di {bookingToDelete?.name}?
              <br />L'azione è irreversibile.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowDeleteConfirmDialog(false)}>Annulla</Button>
            <Button variant="destructive" onClick={confirmDeleteReservation}>Elimina</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Arrived Confirmation Dialog */}
      <Dialog open={showArriveConfirmDialog} onOpenChange={setShowArriveConfirmDialog}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Conferma Arrivo</DialogTitle>
            <DialogDescription>
              Vuoi segnare la prenotazione di {bookingToArrive?.name} come "Arrivata"?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowArriveConfirmDialog(false)}>Annulla</Button>
            <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={confirmCompleteBooking}>Conferma</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div >
  )
}