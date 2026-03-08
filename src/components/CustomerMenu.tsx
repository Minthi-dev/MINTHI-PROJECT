import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSession } from '../context/SessionContext'

// Error Boundary Component
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Critical Menu Crash:", error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 text-center" style={{ backgroundColor: 'var(--menu-dialog-bg, #09090b)', color: 'var(--menu-text-primary, #ffffff)' }}>
          <div className="max-w-md">
            <h2 className="text-xl font-bold text-red-500 mb-4">Errore Critico</h2>
            <p className="mb-4">Si è verificato un errore durante il caricamento del menu.</p>
            <p className="text-xs mb-6 font-mono p-2 rounded text-left overflow-auto max-h-32" style={{ color: 'var(--menu-text-muted, #52525b)', backgroundColor: 'var(--menu-card-bg, rgba(24,24,27,0.9))' }}>
              {this.state.error?.message}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 text-black font-bold rounded-full transition-colors"
              style={{ backgroundColor: 'var(--menu-primary, #f59e0b)' }}
            >
              Ricarica Pagina
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
import { useSupabaseData } from '../hooks/useSupabaseData'
import { DatabaseService } from '../services/DatabaseService'
import { supabase } from '../lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger, DrawerDescription } from '@/components/ui/drawer'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
// Icons
import { Minus, Plus, ShoppingCart, Trash, User, Info, X, Clock, Wallet, Check, Warning, ForkKnife, Note, Storefront, Rocket, ListNumbers, CheckCircle, CreditCard, Users, Receipt } from '@phosphor-icons/react'
import {
  ShoppingBasket, Utensils, ChefHat, Search,
  RefreshCw, AlertCircle, ChevronUp, ChevronDown, Layers, ArrowLeft, Send,
  ChevronRight, GripVertical, ArrowUp, ArrowDown, Menu, Bell
} from 'lucide-react'
import {
  DndContext, DragOverlay, useSensor, useSensors, PointerSensor,
  closestCenter, useDroppable, DragStartEvent, DragEndEvent, DragOverEvent,
  defaultDropAnimationSideEffects, DropAnimation
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { motion, AnimatePresence } from 'framer-motion'
import type { Category, Dish, Order, TableSession, Restaurant } from '../services/types'
import { getCurrentCopertoPrice } from '../utils/pricingUtils'
import { isRestaurantOpen } from '../utils/timeUtils'

// Fixed amber dark theme — no color customization
const MENU_COLORS = {
  primary: '#f59e0b',
  primaryLight: '#fbbf24',
  primaryDark: '#d97706',
  primaryAlpha: (o: number) => `rgba(245, 158, 11, ${o})`,
  headerFont: 'system-ui, -apple-system, sans-serif',
  bodyFont: 'system-ui, -apple-system, sans-serif',
  pageBg: '#09090b',
  pageBgGradient: 'linear-gradient(to bottom, #09090b, #171717, #18181b)',
  cardBg: 'rgba(24, 24, 27, 0.9)',
  cardBorder: 'rgba(255, 255, 255, 0.06)',
  cardRadius: '12px',
  cardShadow: '0 10px 15px -3px rgba(0,0,0,0.3)',
  headerBg: 'rgba(9, 9, 11, 0.9)',
  dialogBg: '#09090b',
  dialogBorder: 'rgba(255, 255, 255, 0.06)',
  inputBg: 'rgba(24, 24, 27, 0.5)',
  inputBorder: 'rgba(255, 255, 255, 0.1)',
  inputFocusBorder: 'rgba(255, 255, 255, 0.3)',
  textPrimary: '#ffffff',
  textSecondary: '#a1a1aa',
  textMuted: '#52525b',
  divider: 'rgba(255, 255, 255, 0.05)',
  badgeRadius: '9999px',
  buttonRadius: '12px',
  primaryColorStyle: { color: '#f59e0b' } as React.CSSProperties,
  primaryBorderStyle: { borderColor: 'rgba(245, 158, 11, 0.2)' } as React.CSSProperties,
  primaryBgStyle: { backgroundColor: 'rgba(245, 158, 11, 0.1)' } as React.CSSProperties,
  primaryGradientStyle: { background: 'linear-gradient(to right, #f59e0b, #d97706)' } as React.CSSProperties,
  categoryActiveStyle: { backgroundColor: '#f59e0b', color: '#000000', borderColor: '#f59e0b', boxShadow: '0 10px 15px -3px rgba(245, 158, 11, 0.2)' } as React.CSSProperties,
  categoryInactiveHoverBorderStyle: { borderColor: 'rgba(245, 158, 11, 0.3)' } as React.CSSProperties,
  floatingCartStyle: { background: 'linear-gradient(to right, #f59e0b, #d97706)', boxShadow: '0 25px 50px -12px rgba(245, 158, 11, 0.4)', color: '#ffffff' } as React.CSSProperties,
  ctaButtonStyle: { backgroundColor: '#f59e0b', color: '#000000', boxShadow: '0 10px 15px -3px rgba(245, 158, 11, 0.2)' } as React.CSSProperties,
  pinActiveStyle: { borderColor: '#f59e0b', color: '#ffffff' } as React.CSSProperties,
  accentTextStyle: { color: '#f59e0b' } as React.CSSProperties,
  accentBorderStyle: { borderColor: 'rgba(245, 158, 11, 0.2)' } as React.CSSProperties,
  spinnerBorderStyle: { borderColor: '#f59e0b', borderTopColor: 'transparent' } as React.CSSProperties,
  fabStyle: { backgroundColor: '#18181b', borderColor: 'rgba(245, 158, 11, 0.5)', color: '#f59e0b' } as React.CSSProperties,
  fabHoverStyle: { backgroundColor: '#f59e0b', borderColor: '#f59e0b', color: '#ffffff' } as React.CSSProperties,
  cssVars: {
    '--background': '#09090b',
    '--foreground': '#ffffff',
    '--card': 'rgba(24, 24, 27, 0.9)',
    '--card-foreground': '#ffffff',
    '--popover': '#09090b',
    '--popover-foreground': '#ffffff',
    '--primary': '#f59e0b',
    '--primary-foreground': '#000000',
    '--secondary': 'rgba(24, 24, 27, 0.9)',
    '--secondary-foreground': '#ffffff',
    '--muted': 'rgba(24, 24, 27, 0.5)',
    '--muted-foreground': '#52525b',
    '--accent': 'rgba(245, 158, 11, 0.1)',
    '--accent-foreground': '#f59e0b',
    '--border': 'rgba(255, 255, 255, 0.06)',
    '--input': 'rgba(255, 255, 255, 0.1)',
    '--ring': '#f59e0b',
  } as React.CSSProperties,
}

// --- HELPER COMPONENTS ---

// Local interface removed, using type from services/types
import { CartItem } from '../services/types'

// Helper function for consistent course titles
const getCourseTitle = (courseNum: number): string => {
  return `Uscita ${courseNum}`
}

// Sortable Item Component with smooth animations
function SortableDishItem({ item, courseNum, theme }: { item: CartItem, courseNum: number, theme: typeof MENU_COLORS }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.id, data: { item, courseNum } })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 300ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease',
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 999 : 'auto',
    touchAction: 'none',
    scale: isDragging ? 0.98 : 1,
    ...(isDragging ? {
      borderColor: theme.primaryAlpha(0.5),
      backgroundColor: 'rgba(39, 39, 42, 0.5)',
      boxShadow: `0 10px 15px -3px ${theme.primaryAlpha(0.1)}`
    } : {})
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        backgroundColor: theme.cardBg,
        border: `1px solid ${isDragging ? theme.primaryAlpha(0.5) : theme.cardBorder}`,
        borderRadius: theme.cardRadius,
      }}
      {...attributes}
      {...listeners}
      className="flex items-center justify-between p-3 group relative cursor-grab active:cursor-grabbing touch-none select-none transition-all duration-300"
    >
      <div className="flex items-center gap-3 pointer-events-none">
        <div
          className="p-1.5 rounded-lg transition-colors duration-200"
          style={isDragging ? { color: theme.primary, backgroundColor: theme.primaryAlpha(0.1) } : { color: theme.textMuted }}
        >
          <GripVertical className="w-4 h-4" />
        </div>
        <div>
          <p className="font-bold text-sm" style={{ color: theme.textPrimary }}>{item.dish?.name}</p>
          <p className="text-xs" style={{ color: theme.textMuted }}>{item.quantity}x · €{((item.dish?.price || 0) * item.quantity).toFixed(2)}</p>
        </div>
      </div>
    </div>
  )
}

// Extract DishCard outside to prevent re-renders - Themed Design + React.memo
const DishCard = React.memo(({
  dish,
  index,
  onSelect,
  onAdd,
  isViewOnly,
  theme,
  cookingTime
}: {
  dish: Dish,
  index: number,
  onSelect: (dish: Dish) => void,
  onAdd: (dish: Dish) => void,
  isViewOnly?: boolean,
  theme: typeof MENU_COLORS,
  cookingTime?: number
}) => (
  <motion.div
    layout
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -20 }}
    transition={{ duration: 0.3, delay: index * 0.03 }}
    className="flex items-center gap-4 p-4 backdrop-blur-sm shadow-lg transition-all duration-500 cursor-pointer group active:scale-[0.98]"
    style={{
      backgroundColor: theme.cardBg,
      borderRadius: theme.cardRadius,
      border: `1px solid ${theme.primaryAlpha(0.2)}`,
      boxShadow: theme.cardShadow,
    }}
    onClick={() => onSelect(dish)}
  >
    {dish.image_url?.trim() && (
      <div className="w-18 h-18 shrink-0 relative rounded-lg overflow-hidden shadow-inner" style={{ background: `linear-gradient(to bottom right, ${theme.cardBg}, ${theme.pageBg})`, border: `1px solid ${theme.cardBorder}` }}>
        <img src={dish.image_url} alt={dish.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none' }} />
        {dish.allergens && dish.allergens.length > 0 && (
          <div className="absolute bottom-1 right-1 p-0.5 rounded-full shadow-sm" style={{ backgroundColor: 'rgba(9,9,11,0.9)', border: `1px solid ${theme.primaryAlpha(0.2)}` }}>
            <Info className="w-2.5 h-2.5" style={{ color: theme.primary }} />
          </div>
        )}
      </div>
    )}

    <div className="flex-1 min-w-0 py-0.5">
      <h3 className="font-normal text-base leading-tight line-clamp-1 mb-1 tracking-wide" style={{ color: theme.textPrimary, fontFamily: theme.headerFont }}>{dish.name}</h3>
      {dish.description && (
        <p className="text-xs line-clamp-1 leading-snug font-light" style={{ color: `${theme.textPrimary}99` }}>{dish.description}</p>
      )}
      {cookingTime != null && cookingTime > 0 && (
        <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: theme.textMuted }}>
          <Clock className="w-3 h-3" />
          ~{cookingTime} min
        </p>
      )}
      <div className="flex items-center justify-between mt-2">
        <span className="font-medium text-sm tracking-wide" style={{ color: theme.primary }}>€ {dish.price.toFixed(2)}</span>
      </div>
    </div>

    {!isViewOnly && (
      <Button
        size="icon"
        className="rounded-full transition-all duration-300 hover:scale-110 shrink-0 flex items-center justify-center"
        style={{
          backgroundColor: theme.primaryAlpha(0.1),
          border: `1px solid ${theme.primaryAlpha(0.4)}`,
          color: theme.primary,
        }}
        onClick={(e) => { e.stopPropagation(); onAdd(dish); }}
      >
        <Plus className="w-5 h-5" strokeWidth={2} />
      </Button>
    )}
  </motion.div>
))

// Helper for empty course drop zone
function DroppableCoursePlaceholder({ id, theme }: { id: string, theme: typeof MENU_COLORS }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className="text-center py-4 text-xs border-2 border-dashed rounded-xl transition-colors"
      style={isOver
        ? { borderColor: theme.primary, backgroundColor: theme.primaryAlpha(0.1), color: theme.primary }
        : { borderColor: theme.cardBorder, color: theme.textMuted }
      }
    >
      Trascina qui i piatti
    </div>
  )
}

// Helper for new course drop zone
function NewCourseDropZone({ onClick, theme }: { onClick: () => void, theme: typeof MENU_COLORS }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'new-course-zone' })
  return (
    <div ref={setNodeRef} className="relative">
      <Button
        variant="outline"
        className={`w-full py-6 border-dashed rounded-2xl gap-2 transition-all ${isOver ? 'scale-105' : ''}`}
        style={isOver
          ? { borderColor: theme.primary, backgroundColor: theme.primaryAlpha(0.1), color: theme.primary }
          : { borderColor: theme.cardBorder, color: theme.textMuted }
        }
        onClick={onClick}
      >
        <Plus className="w-5 h-5" />
        {isOver ? 'Rilascia per creare Nuova Portata' : 'Aggiungi Nuova Portata'}
      </Button>
    </div>
  )
}

// Helper for course container drop zone
function DroppableCourse({ id, children, className, style }: { id: string, children: React.ReactNode, className?: string, style?: React.CSSProperties }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={`${className} transition-all duration-300 ease-out ${isOver
        ? 'scale-[1.01]'
        : ''
        }`}
      style={style}
    >
      {children}
    </div>
  )
}

// Helper for sortable items
function SortableItem({ id, children }: { id: string, children: React.ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.3 : 1
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  )
}

const CustomerMenuBase = () => {
  // 1. Get Table ID from URL params (via generic Route)
  const { tableId } = useParams<{ tableId: string }>()
  const navigate = useNavigate()

  // 2. Use Session Context
  const { sessionId, sessionStatus, loading: sessionLoading, joinSession, exitSession, sessionPin, savePin } = useSession()

  // Timer cleanup for this component scope
  const pinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => { return () => { if (pinTimerRef.current) clearTimeout(pinTimerRef.current) } }, [])

  // Local state for PIN entry/validation
  const [pin, setPin] = useState(['', '', '', ''])
  const [pinError, setPinError] = useState(false)
  const [inputPin, setInputPin] = useState('')

  const [activeSession, setActiveSession] = useState<TableSession | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authChecking, setAuthChecking] = useState(true)
  const [isInitLoading, setIsInitLoading] = useState(true) // Prevent PIN flicker during init
  const [isAuthenticating, setIsAuthenticating] = useState(false) // Prevent PIN flicker during submit

  // Safe timeout for initialization
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isInitLoading) {
        console.warn("Forcing init loading completion after timeout")
        setIsInitLoading(false)
      }
    }, 8000)
    return () => clearTimeout(timer)
  }, [isInitLoading])

  // Data hooks
  const [restaurantId, setRestaurantId] = useState<string | null>(() => localStorage.getItem('restaurantId')) // Init from localStorage
  const [restaurantName, setRestaurantName] = useState<string>('') // Restaurant name for PIN screen
  const [fullRestaurant, setFullRestaurant] = useState<Restaurant | null>(null)
  const [restaurantSuspended, setRestaurantSuspended] = useState(false)
  const [courseSplittingEnabled, setCourseSplittingEnabled] = useState(true) // Default to true for backwards compat
  const [isTableActive, setIsTableActive] = useState(true) // Check if table has active session
  const [isViewOnly, setIsViewOnly] = useState(false) // New state for view-only mode
  const [isClosed, setIsClosed] = useState(false) // New state for closed hours

  // Check if table is active (has ANY open session) when Not Authenticated
  // Also subscribe to real-time changes so if waiter activates after customer scans QR,
  // the customer auto-sees the PIN screen
  useEffect(() => {
    if (!tableId) return

    const checkTableActivity = async () => {
      const { data } = await supabase
        .from('table_sessions')
        .select('id')
        .eq('table_id', tableId)
        .eq('status', 'OPEN')
        .single()

      setIsTableActive(!!data)

      // If session found and not authenticated, try to join it
      if (data && !isAuthenticated && restaurantId) {
        joinSession(tableId, restaurantId)
      }
    }
    checkTableActivity()

    // Real-time subscription: detect when a session is created/updated for this table
    const channel = supabase
      .channel(`table-activity-watch:${tableId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'table_sessions',
        filter: `table_id=eq.${tableId}`
      }, async (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const session = payload.new as any
          if (session.status === 'OPEN') {
            setIsTableActive(true)
            // Auto-join the new session
            if (!isAuthenticated && restaurantId) {
              joinSession(tableId, restaurantId)
            }
          } else if (session.status === 'CLOSED' || session.status === 'PAID') {
            // Instead of immediately setting inactive, re-query for any OTHER open sessions
            // This prevents race conditions when table is closed and immediately reopened
            const { data: openSession } = await supabase
              .from('table_sessions')
              .select('id')
              .eq('table_id', tableId)
              .eq('status', 'OPEN')
              .maybeSingle()
            setIsTableActive(!!openSession)
            if (openSession && !isAuthenticated && restaurantId) {
              joinSession(tableId, restaurantId)
            }
          }
        }
        if (payload.eventType === 'DELETE') {
          // Re-query instead of assuming no sessions exist
          const { data: openSession } = await supabase
            .from('table_sessions')
            .select('id')
            .eq('table_id', tableId)
            .eq('status', 'OPEN')
            .maybeSingle()
          setIsTableActive(!!openSession)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isAuthenticated, tableId, restaurantId, joinSession])

  // Attempt joining session on mount if tableId exists and no sessionId
  useEffect(() => {
    if (tableId) {
      // Need restaurantId to join session via RPC properly or fetch tables first
      const init = async () => {
        try {
          const { data: tableData, error } = await supabase
            .from('tables')
            .select('restaurant_id, restaurants(*)')
            .eq('id', tableId)
            .single()

          if (error) {
            console.error('Error fetching table:', error)
            if (error.message?.includes('Failed to fetch')) {
              toast.error("Errore di connessione. Verifica la tua connessione internet.")
            } else if (error.code === 'PGRST116') {
              toast.error("Tavolo non trovato. QR code non valido.")
            } else {
              toast.error("Errore nel caricamento del tavolo.")
            }
            return
          }

          if (tableData) {
            // Check if restaurant is active - Supabase join returns object or array
            const restaurantsData = tableData.restaurants as unknown
            const restaurant = (Array.isArray(restaurantsData) ? restaurantsData[0] : restaurantsData) as Restaurant | null

            if (restaurant) {
              setRestaurantName(restaurant.name)
              setFullRestaurant(restaurant)
              setCourseSplittingEnabled(restaurant.enable_course_splitting !== false)
              if (restaurant.isActive === false) { // Note: types.ts uses isActive, DB uses is_active. Checking both for safety or assuming mapped
                // Check raw DB field if possible or mapped
                // Assuming raw return:
                if ((restaurant as any).is_active === false) {
                  setRestaurantId(null)
                  setRestaurantSuspended(true)
                  setIsAuthenticated(false)
                  return
                }
              }

              // View Only / Service Hours Logic
              const currentlyClosed = !isRestaurantOpen(restaurant)
              setIsClosed(currentlyClosed)

              if (restaurant.view_only_menu_enabled === true) {
                setIsViewOnly(true)
                setIsAuthenticated(true) // Bypass PIN for view-only mode only
              }
            }

            setRestaurantId(tableData.restaurant_id)
            // Attempt auto-join only if no session
            if (!sessionId) {
              joinSession(tableId, tableData.restaurant_id)
            }
          } else {
            toast.error("Tavolo non trovato.")
          }
        } catch (err: any) {
          console.error('Init error:', err)
          if (err.message?.includes('Failed to fetch') || err.name === 'TypeError') {
            toast.error("Impossibile connettersi al server. Riprova più tardi.")
          } else {
            toast.error("Errore imprevisto. Riprova.")
          }
        } finally {
          setIsInitLoading(false)
        }
      }
      init()
    } else if (tableId && sessionId && !restaurantId) {
      // Session exists but restaurantId not in state - fetch it
      const fetchRestaurantId = async () => {
        try {
          const { data: tableData } = await supabase
            .from('tables')
            .select('restaurant_id, restaurants(*)')
            .eq('id', tableId)
            .single()

          if (tableData && tableData.restaurants) {
            const restaurantsData = tableData.restaurants as unknown
            const restaurant = (Array.isArray(restaurantsData) ? restaurantsData[0] : restaurantsData) as Restaurant | null
            if (restaurant) {
              setRestaurantName(restaurant.name)
              setFullRestaurant(restaurant)
              setCourseSplittingEnabled(restaurant.enable_course_splitting !== false)
              if (restaurant.isActive === false) {
                // Check raw DB field if needed
                if ((restaurant as any).is_active === false) {
                  setRestaurantSuspended(true)
                  setIsAuthenticated(false)
                }
              }
            }
            setRestaurantId(tableData.restaurant_id)
          }
        } finally {
          setIsInitLoading(false)
        }
      }
      fetchRestaurantId()
    } else {
      // No work to do - ensure loading is false
      setIsInitLoading(false)
    }
  }, [tableId, sessionId, joinSession, restaurantId])

  // Auto-authenticate from context if session matches
  useEffect(() => {
    // Skip auto-check if we already proved authentication or if we are actively submitting
    if (isAuthenticated) {
      setAuthChecking(false)
      return
    }

    if (sessionId && restaurantId) {
      const checkSession = async () => {
        try {
          // Fetch session details to get the correct PIN
          const session = await DatabaseService.getSessionById(sessionId)

          if (session) {
            setActiveSession(session)

            // Verify session status - if CLOSED, force logout/re-auth
            if (session.status === 'CLOSED') {
              setIsAuthenticated(false)
              setAuthChecking(false)
              return
            }

            // Compare PINs as strings (DB may store as number, localStorage as string)
            if (sessionPin && String(sessionPin).trim() === String(session.session_pin).trim()) {
              // Context has a valid PIN that matches DB - auto authenticate
              setIsAuthenticated(true)
            } else {
              // Only set false if we haven't already passed auth manually
              if (!isAuthenticated && !isViewOnly) {
                setIsAuthenticated(false)
              }
            }
          } else {
            // Session query failed (RLS/network) but we have saved PIN - trust localStorage
            if (sessionPin && !isViewOnly) {
              console.log('Session query failed but PIN exists in localStorage, trusting saved PIN')
              setIsAuthenticated(true)
            } else if (!isViewOnly) {
              setIsAuthenticated(false)
            }
          }
        } catch (err) {
          console.error('Auth check error:', err)
          // On error, don't force logout if we have a saved PIN
          if (!sessionPin && !isViewOnly) setIsAuthenticated(false)
        } finally {
          setAuthChecking(false)
        }
      }
      checkSession()
    } else if (!sessionLoading) {
      // Session loading finished — no valid session found, stop checking
      setAuthChecking(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, restaurantId, sessionLoading, tableId, isViewOnly])

  // Safety timeout: ensure authChecking never stays stuck
  useEffect(() => {
    if (!authChecking) return
    const timer = setTimeout(() => {
      if (authChecking) {
        console.warn('Forcing authChecking to false after timeout')
        setAuthChecking(false)
      }
    }, 5000)
    return () => clearTimeout(timer)
  }, [authChecking])

  // Real-time subscription to detect when session is closed (table paid/emptied)
  // This ensures authenticated customers are immediately redirected to PIN screen
  useEffect(() => {
    // Only subscribe if we have an active session
    if (!tableId || !isAuthenticated || !activeSession?.id) return

    const currentSessionId = activeSession.id

    const sessionChannel = supabase
      .channel(`customer-session-watch:${currentSessionId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'table_sessions',
        // Filter by session ID, not table_id, for precise targeting
        filter: `id=eq.${currentSessionId}`
      }, async (payload) => {
        // Handle session updates (status changed or paid_amount updated)
        if (payload.eventType === 'UPDATE') {
          const updatedSession = payload.new as any
          // Double-check session ID matches
          if (updatedSession.id === currentSessionId) {
            if (updatedSession.status === 'CLOSED') {
              // Session closed - force logout handled by session context effect usually, but we sync state here
              setIsAuthenticated(false)
              setActiveSession(null)
              setPin(['', '', '', ''])
              toast.info('Il tavolo è stato chiuso. Inserisci il nuovo codice per ordinare.', {
                duration: 4000,
                style: { background: '#3b82f6', color: 'white' }
              })
            } else {
              // Valid update (e.g. paid_amount or notes changed)
              setActiveSession(updatedSession)
            }
          }
        }

        // Handle session deletion
        if (payload.eventType === 'DELETE') {
          const deletedSession = payload.old as any
          // Only log out if the deleted session is OUR session
          if (deletedSession?.id === currentSessionId) {
            setIsAuthenticated(false)
            setActiveSession(null)
            setPin(['', '', '', ''])
            toast.info('Il tavolo è stato chiuso. Inserisci il nuovo codice per ordinare.', {
              duration: 4000,
              style: { background: '#3b82f6', color: 'white' }
            })
          }
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(sessionChannel)
    }
  }, [tableId, isAuthenticated, activeSession?.id])

  // Real-time subscription for Restaurant Settings (Independent of session/auth)
  useEffect(() => {
    if (!restaurantId) return

    const restaurantChannel = supabase
      .channel(`restaurant-settings-watch:${restaurantId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'restaurants',
        filter: `id=eq.${restaurantId}`
      }, (payload) => {
        const newSettings = payload.new as Restaurant
        if (newSettings) {
          // Update full restaurant object for theme sync
          setFullRestaurant((prev: any) => ({ ...prev, ...newSettings }))
          setRestaurantName(newSettings.name)

          // Update course splitting setting immediately
          setCourseSplittingEnabled(newSettings.enable_course_splitting !== false)

          // Optionally update active status if changed
          if ((newSettings as any).is_active === false) {
            setRestaurantSuspended(true)
            setIsAuthenticated(false)
          }
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(restaurantChannel)
    }
  }, [restaurantId])

  const handlePinSubmit = async (enteredPin: string) => {
    setIsAuthenticating(true)
    const cleanEnteredPin = enteredPin.trim()

    // Always fetch the freshest session from DB to avoid React state staleness
    let latestSession: any = null

    if (sessionId) {
      latestSession = await DatabaseService.getSessionById(sessionId)
    } else if (tableId) {
      latestSession = await DatabaseService.getActiveSession(tableId)
    } else if (activeSession?.id) {
      latestSession = await DatabaseService.getSessionById(activeSession.id)
    }

    if (!latestSession) {
      // No session found at all
      toast.dismiss()
      if (tableId && restaurantId) {
        toast.loading("Tentativo di connessione al tavolo...")
        const joined = await joinSession(tableId, restaurantId)
        if (!joined) {
          toast.dismiss()
          toast.error("Impossibile connettersi. Scansiona di nuovo il QR.")
          setPinError(true)
          pinTimerRef.current = setTimeout(() => setPinError(false), 2000)
          setPin(['', '', '', ''])
          return
        }
        // joinSession found an existing open session - fetch full details
        latestSession = await DatabaseService.getActiveSession(tableId)
      } else {
        toast.error("Dati tavolo mancanti. Riprova a scansionare il QR.")
        setPinError(true)
        pinTimerRef.current = setTimeout(() => setPinError(false), 2000)
        setPin(['', '', '', ''])
        setIsAuthenticating(false)
        return
      }
    }

    if (latestSession && cleanEnteredPin === String(latestSession.session_pin).trim()) {
      toast.dismiss()
      setActiveSession(latestSession)
      setIsAuthenticated(true)
      savePin(cleanEnteredPin) // Store via context instead of raw localstorage
      toast.success("Accesso effettuato!")

      // Delay releasing the authenticating lock to let React render the menu
      setTimeout(() => setIsAuthenticating(false), 500)
      return
    } else {
      toast.dismiss()
      setPinError(true)
      toast.error("PIN errato o scaduto. Riprova.")
      pinTimerRef.current = setTimeout(() => setPinError(false), 2000)
      setPin(['', '', '', ''])
      setIsAuthenticating(false)
      return
    }
  }

  // Handle individual PIN digit input
  const handlePinDigitChange = (index: number, value: string) => {
    // Sanitize input: allow only numbers
    const sanitizedValue = value.replace(/\D/g, '').slice(-1)

    // Update state
    const newPin = [...pin]
    newPin[index] = sanitizedValue
    setPin(newPin)

    // Auto-focus logic
    if (sanitizedValue) {
      // If a digit was entered, move to next field if valid
      if (index < 3) {
        const nextInput = document.getElementById(`pin-${index + 1}`)
        nextInput?.focus()
      } else {
        // If last digit entered, try to submit
        if (newPin.every(d => d !== '')) {
          handlePinSubmit(newPin.join(''))
        }
      }
    } else {
      // Handle deletion (empty value) - stay on current or move back logic is in OnKeyDown usually
    }
  }

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      const prevInput = document.getElementById(`pin-${index - 1}`)
      prevInput?.focus()
    }
  }

  // Fixed amber dark theme
  const theme = MENU_COLORS

  // --- RENDER GATES ---

  if (restaurantSuspended) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center" style={{ background: theme.pageBgGradient, color: theme.textPrimary, ...theme.cssVars }}>
      <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 text-red-500">
        <Storefront size={40} weight="duotone" />
      </div>
      <h1 className="text-2xl font-bold mb-2" style={{ color: theme.textPrimary }}>Servizio Non Disponibile</h1>
      <p className="max-w-md" style={{ color: theme.textSecondary }}>
        Il servizio per &quot;{restaurantName || 'questo ristorante'}&quot; è momentaneamente sospeso.
        Ci scusiamo per il disagio.
      </p>
    </div>
  )

  if (!tableId) return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: theme.pageBgGradient, ...theme.cssVars }}>
      <div className="text-center" style={{ color: theme.textSecondary }}>
        <p className="text-lg font-light tracking-wide">QR Code non valido</p>
      </div>
    </div>
  )

  if (!isTableActive && !isAuthenticated && !isViewOnly) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center" style={{ background: theme.pageBgGradient, color: theme.textPrimary, ...theme.cssVars }}>
      <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6 border" style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder, color: theme.textMuted }}>
        <Storefront size={40} weight="duotone" />
      </div>
      <h1 className="text-2xl font-bold mb-2" style={{ color: theme.textPrimary }}>Tavolo Non Attivo</h1>
      <p className="max-w-md" style={{ color: theme.textSecondary }}>
        Questo tavolo non è stato ancora attivato.
        Chiedi al personale di attivarlo per ordinare.
      </p>
    </div>
  )

  if (sessionLoading || authChecking || isInitLoading || isAuthenticating) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: theme.pageBgGradient, ...theme.cssVars }}>
      <div className="flex flex-col items-center gap-6">
        <div className="relative">
          <div className="w-20 h-20 rounded-full" style={{ border: `1px solid ${theme.primaryAlpha(0.2)}` }}></div>
          <div className="absolute inset-0 w-20 h-20 rounded-full animate-spin" style={{ border: '1px solid transparent', borderTopColor: theme.primary }}></div>
          <div className="absolute inset-2 w-16 h-16 rounded-full" style={{ border: `1px solid ${theme.primaryAlpha(0.1)}` }}></div>
        </div>
        <p className="font-light tracking-[0.2em] text-sm uppercase" style={{ color: `${theme.primary}99` }}>Caricamento</p>
      </div>
    </div>
  )

  // LOGIN SCREEN (PIN) - Themed Design
  if (!isAuthenticated && !isViewOnly) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: theme.pageBgGradient, color: theme.textPrimary, fontFamily: theme.bodyFont, ...theme.cssVars }}>

        <div className="w-full max-w-sm flex flex-col items-center gap-12">

          {/* Minimal Header */}
          <div className="text-center space-y-4">
            {fullRestaurant?.logo_url ? (
              <div className="flex justify-center mb-6">
                <img
                  src={fullRestaurant.logo_url}
                  alt={restaurantName}
                  className="h-32 w-auto max-w-[200px] object-contain"
                  style={{ filter: `drop-shadow(0 0 25px ${theme.primaryAlpha(0.2)})` }}
                />
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-light tracking-[0.2em] uppercase" style={{ fontFamily: theme.headerFont, color: theme.textPrimary }}>
                  {restaurantName || 'Ristorante'}
                </h1>
                <div className="w-8 h-px mx-auto" style={{ backgroundColor: theme.primaryAlpha(0.5) }}></div>
              </>
            )}
          </div>

          {/* Minimal PIN Input */}
          <div className="w-full">
            <p className="text-center text-xs tracking-widest uppercase mb-8" style={{ color: theme.textMuted }}>Inserisci codice tavolo</p>

            <div className="flex justify-center gap-3">
              {[0, 1, 2, 3].map((index) => {
                return (
                  <input
                    key={index}
                    id={`pin-${index}`}
                    type="tel"
                    inputMode="numeric"
                    maxLength={1}
                    value={pin[index]}
                    onChange={(e) => handlePinDigitChange(index, e.target.value)}
                    onKeyDown={(e) => handlePinKeyDown(index, e)}
                    className="w-12 h-16 text-center text-2xl font-light bg-transparent border-b-2 outline-none transition-all duration-300 rounded-none"
                    style={{
                      fontFamily: theme.headerFont,
                      ...(pinError
                        ? { borderColor: '#ef4444', color: '#ef4444' }
                        : pin[index]
                          ? { borderColor: theme.primary, color: theme.textPrimary }
                          : { borderColor: theme.textMuted, color: theme.textSecondary }
                      )
                    }}
                    onClick={(e) => {
                      const firstEmptyIndex = pin.findIndex(d => d === '')
                      const targetIndex = firstEmptyIndex === -1 ? 3 : firstEmptyIndex
                      if (index !== targetIndex) {
                        const targetInput = document.getElementById(`pin-${targetIndex}`)
                        targetInput?.focus()
                      }
                    }}
                    autoFocus={index === 0}
                  />
                )
              })}
            </div>

            {/* Error Message */}
            <div className="h-6 mt-4 flex justify-center">
              {pinError && (
                <p className="text-red-500 text-xs tracking-wide animate-pulse">Codice non valido</p>
              )}
            </div>
          </div>

          {/* Footer Info */}
          <p className="text-[10px] tracking-widest uppercase mt-auto" style={{ color: theme.textMuted }}>
            Il codice è sul segnaposto
          </p>

        </div>
      </div>
    )
  }

  // MAIN MENU CONTENT
  // Pass restaurantId to hooks

  if (!activeSession?.restaurant_id && !restaurantId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: theme.pageBgGradient, color: theme.textPrimary, ...theme.cssVars }}>
        <div className="text-center">
          <div className="w-12 h-12 border-2 rounded-full animate-spin mx-auto mb-4" style={theme.spinnerBorderStyle}></div>
          <p className="text-sm opacity-70 animate-pulse">Inizializzazione menu...</p>
        </div>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <AuthorizedMenuContent
        restaurantId={activeSession?.restaurant_id || restaurantId!}
        tableId={tableId}
        sessionId={sessionId!}
        activeSession={activeSession!}
        isViewOnly={isViewOnly}
        isClosed={isClosed}
        isAuthenticated={isAuthenticated}
        fullRestaurant={fullRestaurant}
      />
    </ErrorBoundary>
  )
}



// Refactored Content Component to keep logic clean
//  -- UPDATED INTERFACE to include auth and full restaurant --
function AuthorizedMenuContent({ restaurantId, tableId, sessionId, activeSession, isViewOnly, isClosed, isAuthenticated, fullRestaurant }: { restaurantId: string, tableId: string, sessionId: string, activeSession: TableSession, isViewOnly?: boolean, isClosed?: boolean, isAuthenticated: boolean, fullRestaurant?: any }) {
  // Using passed props instead of resolving them
  const isWaiterMode = false // Or pass as prop if needed

  // NOTE: removed redundant restaurantId/tableId state since they are passed as props

  const [restaurantName, setRestaurantName] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [tableName, setTableName] = useState<string>('')
  const [dataInitialized, setDataInitialized] = useState(false) // Prevent double loading

  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [cart, setCart] = useState<CartItem[]>([])
  const [isCartOpen, setIsCartOpen] = useState(false)
  // const [activeSession, setSession] = useState<TableSession | null>(null) // Removed
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedDish, setSelectedDish] = useState<Dish | null>(null)

  // New state for course splitting modal
  const [showCourseSelectionModal, setShowCourseSelectionModal] = useState(false)
  const [showCourseDivisionModal, setShowCourseDivisionModal] = useState(false)
  const [pendingDishToAdd, setPendingDishToAdd] = useState<{ dish: Dish, quantity: number, notes: string } | null>(null)

  // Derived state for sorted cart
  const sortedCart = useMemo(() => {
    return [...cart].sort((a, b) => (a.course_number || 1) - (b.course_number || 1))
  }, [cart])
  const [previousOrders, setPreviousOrders] = useState<Order[]>([])
  const [isOrderSubmitting, setIsOrderSubmitting] = useState(false)
  const [cookingTimesMap, setCookingTimesMap] = useState<Record<string, number>>({})
  const [dishNote, setDishNote] = useState('')
  const [dishQuantity, setDishQuantity] = useState(1)

  const [maxCourse, setMaxCourse] = useState(1)
  const [currentCourse, setCurrentCourse] = useState(1)
  const dragCourseRef = useRef<Record<string, number>>({})
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [isCartAnimating, setIsCartAnimating] = useState(false)
  const timersRef = React.useRef<ReturnType<typeof setTimeout>[]>([])
  const [activeWaitCourse, setActiveWaitCourse] = useState(1) // Waiter Mode: Selected course for new items
  const [courseSplittingEnabled, setCourseSplittingEnabled] = useState(true) // Default to true
  const [isProcessingStripePayment, setIsProcessingStripePayment] = useState(false)
  const [showPaymentOptions, setShowPaymentOptions] = useState(false)
  const [stripePaymentSplitCount, setStripePaymentSplitCount] = useState(1)
  const [stripePaymentSuccess, setStripePaymentSuccess] = useState(false)

  // Bottom nav tab
  const [customerTab, setCustomerTab] = useState<'menu' | 'payment'>('menu')
  // Payment sub-step: summary -> options -> selectItems
  const [paymentStep, setPaymentStep] = useState<'summary' | 'options' | 'selectItems'>('summary')
  // Selected items for 'diviso per piatti' payment
  const [selectedPaymentItems, setSelectedPaymentItems] = useState<Set<string>>(new Set())
  // Romana count (number of people to split)
  const [romanaCount, setRomanaCount] = useState(2)
  const [showRomanaInline, setShowRomanaInline] = useState(false)
  // Show coperto/AYCE prompt
  const [showCopertoPrompt, setShowCopertoPrompt] = useState(false)

  // Cleanup all pending timers on unmount
  React.useEffect(() => {
    return () => { timersRef.current.forEach(t => clearTimeout(t)) }
  }, [])

  // Fixed amber dark theme
  const theme = MENU_COLORS

  // Scroll to category helper
  const scrollToCategory = (categoryId: string) => {
    setActiveCategory(categoryId)
    const element = document.getElementById(`category-${categoryId}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  // Call Waiter FAB state
  const [callWaiterDisabled, setCallWaiterDisabled] = useState(false)

  // Handler to call waiter - updates tables.last_assistance_request
  const handleCallWaiter = async () => {
    if (!tableId || callWaiterDisabled) return
    try {
      const { error } = await supabase
        .from('tables')
        .update({ last_assistance_request: new Date().toISOString() })
        .eq('id', tableId)

      if (error) throw error

      toast.success("Cameriere avvisato! Arriva subito 🏃", {
        duration: 3000,
        style: { background: theme.primary, color: '#fff', border: 'none' }
      })

      // 30 second cooldown to prevent spam
      setCallWaiterDisabled(true)
      timersRef.current.push(setTimeout(() => setCallWaiterDisabled(false), 30000))
    } catch (err) {
      console.error('Error calling waiter:', err)
      toast.error("Errore. Riprova.")
    }
  }

  // Helper to generate PIN
  const generatePin = () => Math.floor(1000 + Math.random() * 9000).toString()

  // Definito prima degli useEffect che lo referenziano
  const fetchOrders = React.useCallback(async () => {
    if (!sessionId) return

    const { data: orders } = await supabase
      .from('orders')
      .select('id, status, total_amount, created_at, closed_at, table_session_id, restaurant_id, items:order_items(id, order_id, dish_id, quantity, status, note, course_number, created_at, ready_at, dish:dishes(id, name, price, category_id, image_url))')
      .eq('table_session_id', sessionId)
      .order('created_at', { ascending: false })

    if (orders) setPreviousOrders(orders as any[])
  }, [sessionId])

  // --- Realtime Order Updates (unica subscription per orders + fetch iniziale) ---
  useEffect(() => {
    if (!sessionId) return

    // Fetch iniziale ordini
    fetchOrders()

    let orderDebounce: ReturnType<typeof setTimeout> | undefined
    const debouncedFetchOrders = () => {
      if (orderDebounce) clearTimeout(orderDebounce)
      orderDebounce = setTimeout(() => fetchOrders(), 300)
    }

    const orderChannel = supabase
      .channel(`orders-watch:${sessionId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `table_session_id=eq.${sessionId}`
      }, () => {
        debouncedFetchOrders()
      })
      .subscribe()

    return () => {
      if (orderDebounce) clearTimeout(orderDebounce)
      supabase.removeChannel(orderChannel)
    }
  }, [sessionId, fetchOrders])

  // Order items subscription is set up below, after fetchOrders is defined

  // --- Shared Cart Implementation ---
  const fetchCart = useCallback(async () => {
    if (!sessionId) return
    try {
      const items = await DatabaseService.getCartItems(sessionId)
      setCart(items)
      // Update max course
      const max = items.reduce((m, i) => Math.max(m, i.course_number || 1), 1)
      setMaxCourse(max)
    } catch (err) {
      console.error("Error fetching cart:", err)
    }
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return
    fetchCart()

    let cartDebounce: ReturnType<typeof setTimeout> | undefined
    const debouncedFetchCart = () => {
      if (cartDebounce) clearTimeout(cartDebounce)
      cartDebounce = setTimeout(() => fetchCart(), 300)
    }

    const cartChannel = supabase
      .channel(`cart-watch:${sessionId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'cart_items',
        filter: `session_id=eq.${sessionId}`
      }, () => {
        debouncedFetchCart()
      })
      .subscribe()

    return () => {
      if (cartDebounce) clearTimeout(cartDebounce)
      supabase.removeChannel(cartChannel)
    }
  }, [sessionId, fetchCart])

  // --- FIX DOUBLE LOADING: Consolidated data fetch ---
  const [categories, setCategories] = useState<Category[]>([])
  const [dishes, setDishes] = useState<Dish[]>([])

  const initMenu = useCallback(async () => {
    if (!tableId || !restaurantId || dataInitialized) {
      if (!tableId || !restaurantId) {
        // If missing data, stop loading so we don't show infinite spinner. 
        // Error will be shown if tableId is missing by parent check, 
        // but if restaurantId is missing we need to handle it.
        setIsLoading(false)
      }
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      // Fetch table data and restaurant info in one batch
      // Fixing query logic to be safer:
      // We already have restaurantId passed as prop which is consistent.
      // But let's re-fetch strictly by restaurant_id to be safe and consistent.
      const { data: tableData } = await supabase.from('tables').select('restaurant_id, number').eq('id', tableId).single()
      const { data: restData } = await supabase.from('restaurants').select('id, name, enable_course_splitting, all_you_can_eat, ayce_price, ayce_max_orders, cover_charge_per_person, menu_style, menu_primary_color, view_only_menu_enabled, is_active, logo_url, weekly_coperto, weekly_ayce, weekly_service_hours').eq('id', restaurantId).single()
      const { data: catsData } = await supabase.from('categories').select('id, name, restaurant_id, "order", created_at').eq('restaurant_id', restaurantId).order('order', { ascending: true })
      const { data: dishesData } = await supabase.from('dishes').select('id, name, description, price, vat_rate, category_id, restaurant_id, is_active, image_url, is_available, short_code, exclude_from_all_you_can_eat, is_ayce, allergens').eq('restaurant_id', restaurantId).eq('is_active', true)
      if (tableData) setTableName(tableData.number || '')
      if (restData) {
        setRestaurantName(restData.name || '')
        setCourseSplittingEnabled(restData.enable_course_splitting ?? true)
      }
      if (catsData) setCategories(catsData)
      if (dishesData) setDishes(dishesData)

      setDataInitialized(true)
    } catch (err: any) {
      setError(err.message || "Errore di connessione")
    } finally {
      setIsLoading(false)
    }
  }, [tableId, restaurantId, dataInitialized])

  // Single effect to initialize data - no double loading
  useEffect(() => {
    initMenu()
  }, [initMenu])

  // Safety Timeout for Loading State
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isLoading) {
        console.warn("Forcing loading completion after timeout")
        setIsLoading(false)
        if (!restaurantName && !error) {
          setError("Tempo di attesa scaduto. Riprova.")
        }
      }
    }, 10000) // 10 seconds timeout

    return () => clearTimeout(timer)
  }, [isLoading, restaurantName, error])

  // Fetch cooking times if enabled
  useEffect(() => {
    if (!restaurantId || !(fullRestaurant as any)?.show_cooking_times) return
    supabase.rpc('get_dish_avg_cooking_times', { p_restaurant_id: restaurantId })
      .then(({ data }) => {
        if (data) {
          const map: Record<string, number> = {}
          data.forEach((row: { dish_id: string, avg_minutes: number }) => {
            map[row.dish_id] = row.avg_minutes
          })
          setCookingTimesMap(map)
        }
      })
  }, [restaurantId, (fullRestaurant as any)?.show_cooking_times])

  // Sort categories by order field properly
  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) => {
      const orderA = a.order ?? 9999
      const orderB = b.order ?? 9999
      if (orderA !== orderB) return orderA - orderB
      return a.name.localeCompare(b.name)
    })
  }, [categories])

  const filteredDishes = useMemo(() => {
    let d = dishes
    // REMOVED CATEGORY FILTERING TO ALLOW SCROLLING
    // if (activeCategory !== 'all') d = d.filter(dish => dish.category_id === activeCategory)
    if (searchTerm.trim()) {
      const lowerTerm = searchTerm.toLowerCase()
      d = d.filter(dish => dish.name.toLowerCase().includes(lowerTerm) || dish.description?.toLowerCase().includes(lowerTerm))
    }
    return d
  }, [dishes, activeCategory, searchTerm])

  // Group dishes by category for dividers
  const dishesByCategory = useMemo(() => {
    // REMOVED EARLY RETURN TO ALLOW SCROLLING - ALWAYS GROUP ALL
    // if (activeCategory !== 'all') return null
    const grouped: { category: Category, dishes: Dish[] }[] = []
    sortedCategories.forEach(cat => {
      const categoryDishes = filteredDishes.filter(d => d.category_id === cat.id)
      if (categoryDishes.length > 0) {
        grouped.push({ category: cat, dishes: categoryDishes })
      }
    })
    return grouped
  }, [sortedCategories, filteredDishes, activeCategory])

  const cartTotal = useMemo(() => {
    return cart.reduce((total, item) => {
      // Check if AYCE is active for this session
      const isAyce = activeSession?.ayce_enabled ?? false
      const price = item.dish?.price || 0
      const isDishAyce = item.dish?.is_ayce

      // If AYCE is active and the dish is included in AYCE, price is 0
      const itemPrice = (isDishAyce && isAyce) ? 0 : price
      return total + (itemPrice * item.quantity)
    }, 0)
  }, [cart, activeSession])
  const cartCount = useMemo(() => cart.reduce((count, item) => count + item.quantity, 0), [cart])
  const historyTotal = useMemo(() => previousOrders.reduce((sum, order) => sum + (order.total_amount || 0), 0), [previousOrders])
  const grandTotal = cartTotal + historyTotal

  // AYCE order limit
  const ayceMaxOrders = useMemo(() => {
    if (!activeSession?.ayce_enabled) return 0
    const weeklyAyce = (fullRestaurant as any)?.weekly_ayce
    const legacyAyce = (fullRestaurant as any)?.all_you_can_eat
    return weeklyAyce?.defaultMaxOrders || legacyAyce?.maxOrders || (fullRestaurant as any)?.ayce_max_orders || 0
  }, [fullRestaurant, activeSession])
  const remainingOrders = useMemo(() => {
    if (!ayceMaxOrders || ayceMaxOrders <= 0) return Infinity
    return Math.max(0, ayceMaxOrders - previousOrders.length)
  }, [ayceMaxOrders, previousOrders])
  const orderLimitReached = remainingOrders <= 0 && remainingOrders !== Infinity

  const cartByCourse = useMemo(() => {
    const grouped: { [key: number]: CartItem[] } = {}
    cart.forEach(item => {
      const course = item.course_number || 1
      if (!grouped[course]) grouped[course] = []
      grouped[course].push(item)
    })
    return grouped
  }, [cart])

  const courseNumbers = useMemo(() => Object.keys(cartByCourse).map(Number).sort((a, b) => a - b), [cartByCourse])

  // Order Items updates (for status changes: SERVED, READY etc) — placed here since fetchOrders is now defined
  useEffect(() => {
    if (!sessionId || !restaurantId) return

    let itemsDebounce: ReturnType<typeof setTimeout> | undefined
    const debouncedFetchOrders = () => {
      if (itemsDebounce) clearTimeout(itemsDebounce)
      itemsDebounce = setTimeout(() => fetchOrders(), 500)
    }

    const itemsChannel = supabase
      .channel(`order-items-watch:${sessionId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'order_items',
        filter: `restaurant_id=eq.${restaurantId}`
      }, () => {
        debouncedFetchOrders()
      })
      .subscribe()

    return () => {
      if (itemsDebounce) clearTimeout(itemsDebounce)
      supabase.removeChannel(itemsChannel)
    }
  }, [sessionId, restaurantId, fetchOrders])

  const quickAddToCart = React.useCallback((dish: Dish) => {
    setSelectedDish(dish)
    setDishQuantity(1)
    setDishNote('')
  }, [])

  const handleAddClick = (dish: Dish, quantity: number, notes: string) => {
    // New UX: Always add to cart first, default to Course 1
    addToCart(dish, quantity, notes, 1)
  }

  const addToCart = async (dish: Dish, quantity: number = 1, notes: string = '', courseNum?: number) => {
    if (!sessionId) return
    const targetCourse = courseNum !== undefined ? courseNum : currentCourse

    try {
      await DatabaseService.addToCart({
        session_id: sessionId,
        dish_id: dish.id,
        quantity,
        notes,
        course_number: targetCourse
      })

      if (quantity > 0) {
        setIsCartAnimating(true)
        timersRef.current.push(setTimeout(() => setIsCartAnimating(false), 500))
        toast.success(`Aggiunto al carrello`, { position: 'top-center', duration: 1500, style: { background: '#10B981', color: '#fff', border: 'none' } })
      }
      setSelectedDish(null)
      setDishNote('')
      setDishQuantity(1)
      setPendingDishToAdd(null)
      setShowCourseSelectionModal(false)
    } catch (err) {
      console.error("Error adding to cart:", err)
      toast.error("Errore aggiunta al carrello")
    }
  }

  const updateCartItemQuantity = async (cartId: string, delta: number) => {
    const item = cart.find(i => i.id === cartId)
    if (!item) return
    const newQuantity = item.quantity + delta
    try {
      await DatabaseService.updateCartItem(cartId, { quantity: newQuantity })
    } catch (err) {
      console.error("Error updating cart:", err)
    }
  }

  const moveItemToCourse = async (cartId: string, newCourse: number) => {
    try {
      await DatabaseService.updateCartItem(cartId, { course_number: newCourse })
      toast.success(`Piatto spostato alla Portata ${newCourse}`, { duration: 1500 })
    } catch (err) {
      console.error("Error moving item:", err)
      toast.error("Errore spostamento piatto")
      fetchCart()
    }
  }

  const [activeDragItem, setActiveDragItem] = useState<CartItem | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 15 } })
  )

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    const item = cart.find(i => i.id === active.id)
    if (item) {
      setActiveDragItem(item)
      dragCourseRef.current[item.id] = item.course_number || 1
    }
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string
    const currentCourseForItem = dragCourseRef.current[activeId]
    if (currentCourseForItem === undefined) return

    const applyMove = (newCourse: number) => {
      if (dragCourseRef.current[activeId] === newCourse) return
      dragCourseRef.current[activeId] = newCourse
      setCart(items => items.map(item =>
        item.id === activeId ? { ...item, course_number: newCourse } : item
      ))
    }

    if (overId === 'new-course-zone') {
      applyMove(maxCourse + 1)
    } else if (overId.startsWith('course-')) {
      const courseNum = parseInt(overId.split('-')[1])
      if (!isNaN(courseNum)) applyMove(courseNum)
    } else {
      const overItem = cart.find(i => i.id === overId)
      if (overItem) applyMove(overItem.course_number || 1)
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    const draggedItemOriginalState = activeDragItem
    setActiveDragItem(null)

    const activeId = active.id as string

    if (!over) {
      if (draggedItemOriginalState) {
        setCart(items => items.map(item => item.id === activeId ? { ...item, course_number: draggedItemOriginalState.course_number } : item))
      }
      delete dragCourseRef.current[activeId]
      return
    }

    const overId = over.id as string

    let finalCourse: number | null = null

    if (overId === 'new-course-zone') {
      finalCourse = maxCourse + 1
    } else if (overId.startsWith('course-')) {
      finalCourse = parseInt(overId.split('-')[1])
    } else {
      const overItem = cart.find(i => i.id === overId)
      if (overItem) {
        finalCourse = overItem.course_number || 1
      }
    }

    delete dragCourseRef.current[activeId]

    if (finalCourse !== null && !isNaN(finalCourse)) {
      if (finalCourse > maxCourse) {
        setMaxCourse(finalCourse)
      }
      await moveItemToCourse(activeId, finalCourse)
    }
  }

  const removeCourse = async (courseNumToDelete: number) => {
    const itemsToUpdate = cart.filter(i => (i.course_number || 1) > courseNumToDelete)

    // Optimistic UI updates
    setCart(items => items.map(item => {
      if ((item.course_number || 1) > courseNumToDelete) {
        return { ...item, course_number: (item.course_number || 1) - 1 }
      }
      return item
    }))
    setMaxCourse(prev => prev > 1 ? prev - 1 : 1)

    // DB updates (batch)
    try {
      await Promise.all(
        itemsToUpdate.map(item =>
          DatabaseService.updateCartItem(item.id, { course_number: (item.course_number || 1) - 1 })
        )
      )
      toast.success(`Portata ${courseNumToDelete} rimossa e le successive scalate.`, { duration: 2000 })
    } catch (err) {
      console.error("Error updating courses after deletion", err)
      toast.error("Errore durante la rimozione della portata")
    }
  }

  const dropAnimation: DropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
      styles: {
        active: {
          opacity: '0.5',
        },
      },
    }),
  }

  const addNewCourse = () => {
    const newCourseNum = maxCourse + 1
    setMaxCourse(newCourseNum)
    toast.success(`Portata ${newCourseNum} aggiunta`, { position: 'top-center', duration: 1500 })
  }

  const handleSubmitClick = () => {
    // In Waiter Mode, we allow "Auto-Start" of the activeSession if it doesn't exist.
    // In Customer Mode (QR), activeSession MUST exist (via PIN login or scan).
    if (!activeSession && !isWaiterMode) {
      toast.error("Nessuna activeSessione attiva. Apri prima il tavolo.")
      return
    }
    if (cart.length === 0) return

    setShowConfirmDialog(true)
  }

  const submitOrder = async () => {
    if (isOrderSubmitting) return // Prevent double-submit
    if (orderLimitReached) {
      toast.error('Hai raggiunto il limite massimo di ordini per questa sessione', { duration: 3000 })
      return
    }
    if ((!activeSession && !isWaiterMode) || cart.length === 0 || !restaurantId) return

    setIsOrderSubmitting(true)
    try {
      let activeSessionId = activeSession?.id

      // AUTO-ACTIVATE SESSION IF MISSING (Waiter Mode Only)
      if (!activeSession && isWaiterMode) {
        try {
          // Close ALL open sessions for this table directly to avoid duplicate key constraint
          await DatabaseService.closeAllOpenSessionsForTable(tableId)

          const newSession = await DatabaseService.createSession({
            restaurant_id: restaurantId,
            table_id: tableId,
            status: 'OPEN',
            opened_at: new Date().toISOString(),
            session_pin: generatePin(),
            customer_count: 1 // Default to 1 for quick auto-start
          })
          activeSessionId = newSession.id
          // setSession removed - reliance on Context subscription
          fetchOrders()
        } catch (err) {
          console.error("Error auto-creating activeSession:", err)
          toast.error("Impossibile attivare il tavolo automaticamente.")
          setIsOrderSubmitting(false)
          return
        }
      }

      if (!activeSessionId) {
        toast.error("Errore sessione mancante. Riprova ad accedere.")
        setIsOrderSubmitting(false)
        return
      }

      const orderItems = cart.map(item => ({
        dish_id: item.dish_id,
        quantity: item.quantity,
        note: item.notes || '',
        status: 'PENDING' as const,
        course_number: item.course_number || 1
      }))

      await DatabaseService.createOrder({
        restaurant_id: restaurantId,
        table_session_id: activeSessionId,
        status: 'OPEN',
        total_amount: cartTotal
      }, orderItems)

      // Clear Cart from DB
      await DatabaseService.clearCart(activeSessionId)

      // Local state update
      setCart([])
      setMaxCourse(1)
      setCurrentCourse(1)
      setIsCartOpen(false)
      setShowConfirmDialog(false)
      toast.success('Ordine inviato! 👨‍🍳', { duration: 2000, style: { background: theme.primary, color: 'white' } })
    } catch (error) {
      console.error(error)
      toast.error('Errore invio ordine.')
    } finally {
      setIsOrderSubmitting(false)
    }
  }


  // Check for payment success/cancel from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('payment') === 'success') {
      setStripePaymentSuccess(true)
      setCustomerTab('payment') // Auto-switch to payment tab to show success
      toast.success('Pagamento completato con successo!', { duration: 5000 })
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname)
      // Refresh orders — session will update via realtime listener when webhook processes
      if (sessionId) fetchOrders()
    } else if (params.get('payment') === 'cancelled') {
      toast.error('Pagamento annullato', { duration: 3000 })
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // Helper: get all payable items (not PAID, not CANCELLED)
  const payableItems = useMemo(() => {
    const items: { id: string, name: string, price: number, quantity: number, orderId: string }[] = []
    previousOrders.forEach(order => {
      order.items?.forEach((item: any) => {
        if (item.status === 'PAID' || item.status === 'CANCELLED') return
        const dishName = item.dish?.name || dishes.find(d => d.id === item.dish_id)?.name || 'Piatto'
        items.push({
          id: `${order.id}_${item.dish_id}_${item.id || items.length}`,
          name: dishName,
          price: item.dish?.price || 0,
          quantity: item.quantity || 1,
          orderId: order.id,
        })
      })
    })
    return items
  }, [previousOrders, dishes])

  // Helper: get coperto info
  const copertoInfo = useMemo(() => {
    const isCopertoEnabled = activeSession?.coperto_enabled ?? true
    if (!isCopertoEnabled || !fullRestaurant) return { enabled: false, price: 0, count: 0 }
    const currentCoperto = getCurrentCopertoPrice(
      fullRestaurant,
      fullRestaurant.lunch_time_start || '12:00',
      fullRestaurant.dinner_time_start || '19:00'
    ).price
    return { enabled: currentCoperto > 0, price: currentCoperto, count: activeSession?.customer_count || 1 }
  }, [activeSession, fullRestaurant])

  // Helper: check if AYCE is enabled for the session
  const ayceInfo = useMemo(() => {
    if (!activeSession?.ayce_enabled || !fullRestaurant) return { enabled: false, price: 0 }
    return { enabled: true, price: (fullRestaurant as any).ayce_price_per_person || 0 }
  }, [activeSession, fullRestaurant])

  // Total for all unpaid items, minus any partial payments already registered in the session
  const unpaidTotal = useMemo(() => {
    let total = payableItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
    if (copertoInfo.enabled) total += copertoInfo.price * copertoInfo.count
    if (ayceInfo.enabled && ayceInfo.price > 0) total += ayceInfo.price * (activeSession?.customer_count || 1)

    // Subtract any amount already paid for this session (e.g. from partial or split payments)
    const paidAmount = activeSession?.paid_amount || 0;
    return Math.max(0, total - paidAmount);
  }, [payableItems, copertoInfo, ayceInfo, activeSession])

  // Handle Stripe payment — supports full, split (alla romana), and items (diviso per piatti)
  const handleStripePayment = async (mode: 'full' | 'split' | 'items', splitCount?: number) => {
    if (!fullRestaurant || !activeSession || previousOrders.length === 0) return
    setIsProcessingStripePayment(true)

    try {
      const orderIds = previousOrders.filter(o => o.status !== 'PAID' && o.status !== 'CANCELLED').map(o => o.id)

      if (orderIds.length === 0) {
        toast.error('Nessun ordine da pagare')
        return
      }

      const items: { name: string, price: number, quantity: number }[] = []
      let splitLabel = 'Pagamento completo'

      if (mode === 'split' && splitCount && splitCount > 1) {
        // Alla romana: divide total by split count
        const perPerson = Math.ceil((unpaidTotal / splitCount) * 100) / 100
        items.push({ name: `Quota alla romana (1/${splitCount})`, price: perPerson, quantity: 1 })
        splitLabel = `Alla romana (1/${splitCount})`
      } else if (mode === 'items') {
        // Diviso per piatti: only selected items
        payableItems.filter(pi => selectedPaymentItems.has(pi.id)).forEach(pi => {
          items.push({ name: pi.name, price: pi.price, quantity: pi.quantity })
        })
        // Check if coperto items were selected
        if (selectedPaymentItems.has('coperto') && copertoInfo.enabled) {
          // Count how many coperti are selected (stored as coperto_1, coperto_2, etc.)
          const selectedCopertiCount = Array.from(selectedPaymentItems).filter(id => id.startsWith('coperto')).length
          items.push({ name: 'Coperto', price: copertoInfo.price, quantity: selectedCopertiCount })
        }
        if (selectedPaymentItems.has('ayce') && ayceInfo.enabled && ayceInfo.price > 0) {
          const selectedAyceCount = Array.from(selectedPaymentItems).filter(id => id.startsWith('ayce')).length
          items.push({ name: 'All You Can Eat', price: ayceInfo.price, quantity: selectedAyceCount })
        }
        splitLabel = 'Pagamento parziale (per piatti)'
      } else {
        // Full payment: all items + coperto + AYCE
        payableItems.forEach(pi => {
          items.push({ name: pi.name, price: pi.price, quantity: pi.quantity })
        })
        if (copertoInfo.enabled) {
          items.push({ name: 'Coperto', price: copertoInfo.price, quantity: copertoInfo.count })
        }
        if (ayceInfo.enabled && ayceInfo.price > 0) {
          items.push({ name: 'All You Can Eat', price: ayceInfo.price, quantity: activeSession.customer_count || 1 })
        }
      }

      if (items.length === 0) {
        toast.error('Nessun articolo da pagare')
        return
      }

      const totalToPay = items.reduce((sum, i) => sum + i.price * i.quantity, 0)

      toast.loading('Reindirizzamento a Stripe...', { id: 'stripe-pay' })

      const { url } = await DatabaseService.createStripeCustomerPayment({
        restaurantId: fullRestaurant.id,
        tableSessionId: activeSession.id,
        orderIds,
        items,
        totalAmount: totalToPay,
        splitLabel,
        tableId: tableId || '',
      })

      if (url) {
        window.location.href = url
      } else {
        toast.error('Errore: nessun link di pagamento ricevuto', { id: 'stripe-pay' })
      }
    } catch (error: any) {
      console.error('Stripe payment error:', error)
      toast.error('Errore durante il pagamento: ' + (error.message || 'Riprova'), { id: 'stripe-pay' })
    } finally {
      setIsProcessingStripePayment(false)
    }
  }

  // Handle 'Diviso per piatti' payment with coperto/AYCE prompt
  const handleItemsPayment = () => {
    if (selectedPaymentItems.size === 0) {
      toast.error('Seleziona almeno un piatto')
      return
    }
    // Check if any coperto or AYCE items were selected
    const hasCopertoSelected = Array.from(selectedPaymentItems).some(id => id.startsWith('coperto'))
    const hasAyceSelected = Array.from(selectedPaymentItems).some(id => id.startsWith('ayce'))
    const hasCopertoOrAyce = (copertoInfo.enabled || (ayceInfo.enabled && ayceInfo.price > 0))

    if (!hasCopertoSelected && !hasAyceSelected && hasCopertoOrAyce) {
      setShowCopertoPrompt(true)
      return
    }
    handleStripePayment('items')
  }

  // RENDER HELPERS - LUXURY THEME
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: theme.pageBgGradient, ...theme.cssVars }}>
      <div className="w-10 h-10 border-2 rounded-full animate-spin" style={theme.spinnerBorderStyle}></div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: theme.pageBgGradient, color: theme.textPrimary, ...theme.cssVars }}>
      <div className="text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <p className="text-lg mb-4">{error}</p>
        <Button onClick={() => window.location.reload()} variant="outline" style={{ borderColor: theme.primary, color: theme.primary }}>Riprova</Button>
      </div>
    </div>
  )

  return (
    <div className="h-[100dvh] select-none flex flex-col overflow-hidden" style={{ background: theme.pageBgGradient, fontFamily: theme.bodyFont, color: theme.textPrimary, ...theme.cssVars }}>
      <div className="flex-1 flex flex-col min-h-0 relative w-full">

        <header className="flex-none z-20 backdrop-blur-xl" style={{ backgroundColor: theme.headerBg, borderBottom: `1px solid ${theme.primaryAlpha(0.1)}` }}>
          <div className="w-full px-4 py-3">
            {/* Restaurant Name - Compact Header */}
            {restaurantName && (
              <div className="text-center mb-2 pb-2" style={{ borderBottom: `1px solid ${theme.divider}` }}>
                <h1 className="text-base font-light tracking-widest uppercase" style={{ fontFamily: theme.headerFont, color: theme.textPrimary }}>
                  {restaurantName}
                </h1>
              </div>
            )}

            {/* Menu Header & Search - Compact */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ border: `1px solid ${theme.primaryAlpha(0.3)}`, backgroundColor: theme.cardBg }}>
                    <Utensils className="w-3.5 h-3.5" strokeWidth={1.5} style={{ color: theme.primary }} />
                  </div>
                  {activeSession && <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full" style={{ backgroundColor: theme.primary, border: `2px solid ${theme.pageBg}` }} />}
                </div>
                <div>
                  <h2 className="text-sm font-medium tracking-wide" style={{ color: theme.textPrimary }}>Tavolo {tableName}</h2>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: theme.textMuted }} />
                  <input
                    type="text"
                    placeholder="Cerca..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-28 rounded-full pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:w-36 transition-all duration-300"
                    style={{ backgroundColor: theme.inputBg, border: `1px solid ${theme.inputBorder}`, color: theme.textPrimary }}
                  />
                </div>
              </div>
            </div>

            {/* Service Closed Banner */}
            {!isViewOnly && isClosed && (
              <div className="mx-4 mb-3 p-3 rounded-xl flex items-center gap-3 shadow-md border"
                style={{ backgroundColor: `${theme.primary}15`, borderColor: `${theme.primary}40`, color: theme.textPrimary }}>
                <div className="p-2 rounded-full" style={{ backgroundColor: `${theme.primary}30` }}>
                  <Clock className="w-5 h-5 shrink-0" style={{ color: theme.primary }} weight="duotone" />
                </div>
                <p className="text-sm font-medium leading-tight" style={{ color: `${theme.textPrimary}e6` }}>
                  <span className="font-bold block mb-0.5" style={{ color: theme.primary }}>Ristorante Chiuso</span>
                  Gli ordini sono temporaneamente disattivati.
                </p>
              </div>
            )}

            {/* Categories - Horizontally Scrollable */}
            <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
              <div className="flex space-x-2 w-max">
                <button
                  onClick={() => scrollToCategory('all')}
                  className="px-3 py-1.5 text-xs font-medium transition-all duration-300 border flex-shrink-0"
                  style={{
                    borderRadius: theme.badgeRadius,
                    ...(activeCategory === 'all'
                      ? theme.categoryActiveStyle
                      : { backgroundColor: theme.inputBg, color: theme.textSecondary, borderColor: theme.cardBorder }
                    )
                  }}
                >
                  Tutto
                </button>
                {sortedCategories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => scrollToCategory(cat.id)}
                    className="px-3 py-1.5 text-xs font-medium transition-all duration-300 border flex-shrink-0 whitespace-nowrap"
                    style={{
                      borderRadius: theme.badgeRadius,
                      ...(activeCategory === cat.id
                        ? theme.categoryActiveStyle
                        : { backgroundColor: theme.inputBg, color: theme.textSecondary, borderColor: theme.cardBorder }
                      )
                    }}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto scrollbar-hide px-4 pt-4 pb-32 w-full">
          <AnimatePresence mode="popLayout" initial={false}>
            {dishesByCategory?.map((group, groupIndex) => (
              <motion.div
                key={group.category.id}
                id={`category-${group.category.id}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: groupIndex * 0.1 }}
                className="mb-8 scroll-mt-40"
              >
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] mb-4 pl-1" style={{ color: `${theme.primary}cc`, fontFamily: theme.headerFont }}>
                  {group.category.name}
                </h3>
                <div className="grid gap-4">
                  {group.dishes.map((dish, index) => (
                    <DishCard
                      key={dish.id}
                      dish={dish}
                      index={index}
                      onSelect={setSelectedDish}
                      onAdd={quickAddToCart}
                      isViewOnly={isViewOnly}
                      theme={theme}
                      cookingTime={(fullRestaurant as any)?.show_cooking_times ? cookingTimesMap[dish.id] : undefined}
                    />
                  ))}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </main>

        {/* Floating Cart / Payment Button */}
        <AnimatePresence>
          {!isViewOnly && cart.length > 0 && (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="fixed bottom-6 left-4 right-4 z-40"
            >
              <Button
                onClick={() => setIsCartOpen(true)}
                className="w-full h-14 rounded-full flex items-center justify-between px-6 transform transition-transform active:scale-95"
                style={{
                  ...theme.floatingCartStyle,
                  ...(orderLimitReached ? { opacity: 0.7 } : {})
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-sm font-bold" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>{cart.reduce((a, b) => a + b.quantity, 0)}</span>
                  <span className="font-medium text-lg tracking-wide uppercase">Vedi Ordine</span>
                  {activeSession?.ayce_enabled && ayceMaxOrders > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: orderLimitReached ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.15)' }}>
                      {previousOrders.length}/{ayceMaxOrders}
                    </span>
                  )}
                </div>
                <span className="font-bold text-xl">
                  €{(() => {
                    const isCopertoEnabled = activeSession?.coperto_enabled ?? true
                    let copertoTotal = 0
                    if (isCopertoEnabled) {
                      const currentCoperto = fullRestaurant
                        ? getCurrentCopertoPrice(
                          fullRestaurant,
                          fullRestaurant.lunch_time_start || '12:00',
                          fullRestaurant.dinner_time_start || '19:00'
                        ).price
                        : (fullRestaurant?.cover_charge_per_person || 0)
                      if (currentCoperto > 0) {
                        copertoTotal = currentCoperto * (activeSession?.customer_count || 1)
                      }
                    }
                    return (cartTotal + copertoTotal).toFixed(2)
                  })()}
                </span>
              </Button>
            </motion.div>
          )}
          {/* Pagamento button - shows when cart is empty and there are unpaid orders */}
          {!isViewOnly && cart.length === 0 && previousOrders.length > 0 && unpaidTotal > 0 && customerTab !== 'payment' && (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="fixed bottom-6 left-4 right-4 z-40"
            >
              <Button
                onClick={() => { setCustomerTab('payment'); setPaymentStep('options') }}
                className="w-full h-14 rounded-full flex items-center justify-center gap-3 px-6 transform transition-transform active:scale-95 shadow-2xl"
                style={{
                  background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryDark} 100%)`,
                  color: '#000',
                  boxShadow: `0 10px 25px -5px ${theme.primaryAlpha(0.4)}`,
                }}
              >
                <div className="flex items-center gap-2">
                  <Receipt size={22} weight="fill" />
                  <span className="font-bold text-lg tracking-wide uppercase">
                    {(fullRestaurant as any)?.enable_stripe_payments ? "Conto e Pagamento" : "Il Tuo Ordine"}
                  </span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-sm font-bold" style={{ backgroundColor: 'rgba(0,0,0,0.1)' }}>
                  €{unpaidTotal.toFixed(2)}
                </span>
              </Button>
            </motion.div>
          )}
        </AnimatePresence>


        {/* CART & HISTORY MODAL */}
        {!isViewOnly && (
          <Dialog open={isCartOpen} onOpenChange={setIsCartOpen}>
            <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden shadow-2xl rounded-3xl max-h-[90vh] min-h-0 flex flex-col w-[95vw]" style={{ backgroundColor: theme.dialogBg, borderColor: theme.primaryAlpha(0.2), color: theme.textPrimary }}>
              <DialogHeader className="p-4 backdrop-blur-xl flex-none" style={{ borderBottom: `1px solid ${theme.divider}`, backgroundColor: theme.cardBg }}>
                <DialogTitle className="text-center text-xl font-light uppercase tracking-widest" style={{ fontFamily: theme.headerFont, color: theme.textPrimary }}>Riepilogo</DialogTitle>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto scrollbar-hide p-4 pb-6 space-y-6 min-h-0">

                {/* CURRENT CART */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.primary }}>Nel Carrello</h3>
                    </div>
                    <span className="text-xs" style={{ color: theme.textMuted }}>{cart.length} articoli</span>
                  </div>

                  {cart.length === 0 ? (
                    <p className="text-sm italic text-center py-8 rounded-xl" style={{ color: theme.textMuted, backgroundColor: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}>Il carrello è vuoto</p>
                  ) : (
                    <div className="space-y-3">
                      {sortedCart.map((item, index) => {
                        // Logic for grouping headers
                        const showCourseHeader = courseSplittingEnabled && (index === 0 || (item.course_number || 1) !== (sortedCart[index - 1].course_number || 1));

                        return (
                          <React.Fragment key={item.id}>
                            {showCourseHeader && (
                              <div className="text-xs font-bold mt-2 mb-1 px-1 uppercase tracking-widest" style={{ color: theme.textSecondary }}>
                                Portata {item.course_number || 1}
                              </div>
                            )}
                            <div className="rounded-xl p-3 flex gap-3 shadow-sm relative overflow-hidden" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}>
                              {/* Image if available */}
                              {item.dish?.image_url?.trim() && (
                                <img src={item.dish.image_url} className="w-16 h-16 rounded-lg object-cover" style={{ backgroundColor: theme.inputBg }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                              )}
                              <div className="flex-1 min-w-0 flex flex-col justify-between">
                                <div className="flex justify-between items-start gap-2">
                                  <h4 className="font-medium line-clamp-1 text-sm" style={{ color: theme.textPrimary }}>{item.dish?.name}</h4>
                                  <span className="font-medium text-sm whitespace-nowrap" style={{ color: theme.primary }}>€{((item.dish?.price || 0) * item.quantity).toFixed(2)}</span>
                                </div>
                                {item.notes && <p className="text-[10px] line-clamp-1 italic" style={{ color: theme.textMuted }}>{item.notes}</p>}

                                <div className="flex items-center justify-between mt-2">
                                  {/* Quantity Controls */}
                                  <div className="flex items-center gap-3 rounded-lg p-0.5 shadow-inner shrink-0" style={{ backgroundColor: theme.inputBg, border: `1px solid ${theme.cardBorder}` }}>
                                    <button
                                      onClick={() => updateCartItemQuantity(item.id, -1)}
                                      className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
                                      style={{ color: theme.textSecondary }}
                                    >
                                      <Minus size={14} weight="bold" />
                                    </button>
                                    <span className="text-sm font-bold w-4 text-center" style={{ color: theme.textPrimary }}>{item.quantity}</span>
                                    <button
                                      onClick={() => updateCartItemQuantity(item.id, 1)}
                                      className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
                                      style={{ color: theme.textSecondary }}
                                    >
                                      <Plus size={14} weight="bold" />
                                    </button>
                                  </div>

                                </div>
                              </div>
                            </div>
                          </React.Fragment>
                        )
                      })}
                    </div>
                  )}

                  {/* DIVIDE IN PORTATE BUTTON moved to footer */}
                </div>


              </div>

              {/* FIXED SEND BUTTON AREA */}
              {cart.length > 0 && (
                <div className="flex-none p-4 backdrop-blur-xl" style={{ borderTop: `1px solid ${theme.divider}`, backgroundColor: theme.cardBg }}>
                  <div className="flex justify-between items-center text-sm mb-3" style={{ color: theme.textSecondary }}>
                    <span>Totale Carrello</span>
                    <span className="font-bold text-lg" style={{ color: theme.primary }}>€{cartTotal.toFixed(2)}</span>
                  </div>
                  {/* Coperto Display in Modal */}
                  {(() => {
                    const isCopertoEnabled = activeSession?.coperto_enabled ?? true
                    if (!isCopertoEnabled) return null;
                    const currentCoperto = fullRestaurant
                      ? getCurrentCopertoPrice(
                        fullRestaurant,
                        fullRestaurant.lunch_time_start || '12:00',
                        fullRestaurant.dinner_time_start || '19:00'
                      ).price
                      : (fullRestaurant?.cover_charge_per_person || 0)
                    if (currentCoperto <= 0) return null;

                    const personCount = activeSession?.customer_count || 1;
                    const totalCoperto = currentCoperto * personCount;
                    return (
                      <div className="flex justify-between items-center text-xs mb-3" style={{ color: theme.textMuted }}>
                        <span>Coperto ({personCount} pers.)</span>
                        <span>€{totalCoperto.toFixed(2)}</span>
                      </div>
                    )
                  })()}

                  {/* DIVIDE IN PORTATE BUTTON */}
                  {courseSplittingEnabled && (
                    <div className="mb-3">
                      <Button
                        variant="outline"
                        className="w-full font-bold h-12 rounded-xl shadow-sm border-dashed gap-2 transition-all"
                        style={{
                          borderColor: theme.primary,
                          color: theme.primary,
                          backgroundColor: theme.primaryAlpha(0.05)
                        }}
                        onClick={() => {
                          setIsCartOpen(false)
                          setShowCourseDivisionModal(true)
                        }}
                      >
                        <Layers size={20} />
                        <span className="uppercase tracking-wide text-sm">Dividi in Portate</span>
                      </Button>
                    </div>
                  )}

                  {/* AYCE order limit badge */}
                  {activeSession?.ayce_enabled && ayceMaxOrders > 0 && (
                    <div className={`flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-sm font-medium ${orderLimitReached ? 'bg-red-500/15 text-red-400 border border-red-500/30' : 'bg-amber-500/10 border border-amber-500/20'}`} style={!orderLimitReached ? { color: theme.primary } : undefined}>
                      {orderLimitReached ? (
                        <>
                          <Warning size={16} weight="bold" />
                          <span>Limite ordini raggiunto ({ayceMaxOrders}/{ayceMaxOrders})</span>
                        </>
                      ) : (
                        <>
                          <ListNumbers size={16} weight="bold" />
                          <span>Ordini: {previousOrders.length}/{ayceMaxOrders} — {remainingOrders} rimanent{remainingOrders === 1 ? 'e' : 'i'}</span>
                        </>
                      )}
                    </div>
                  )}

                  <Button
                    className="w-full font-bold h-12 rounded-xl"
                    style={{
                      ...theme.floatingCartStyle,
                      ...(orderLimitReached ? { opacity: 0.5, cursor: 'not-allowed' } : {})
                    }}
                    onClick={() => {
                      handleSubmitClick()
                    }}
                    disabled={isOrderSubmitting || orderLimitReached}
                  >
                    {isOrderSubmitting ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#ffffff' }} />
                        <span>Invio...</span>
                      </div>
                    ) : orderLimitReached ? (
                      <div className="flex items-center gap-2 text-lg">
                        <Warning weight="fill" size={20} />
                        <span>Limite Raggiunto</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-lg">
                        <Rocket weight="fill" size={20} />
                        <span>Invia Ordine</span>
                      </div>
                    )}
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        )}


        {/* Dish Detail Dialog */}
        <Dialog open={!!selectedDish} onOpenChange={(open) => !open && setSelectedDish(null)}>
          <DialogContent className="sm:max-w-[380px] p-0 gap-0 overflow-hidden shadow-2xl rounded-3xl" style={{ backgroundColor: theme.dialogBg, borderColor: theme.primaryAlpha(0.2), color: theme.textPrimary }}>
            {selectedDish && (
              <div className="flex flex-col h-full" style={{ backgroundColor: theme.dialogBg, color: theme.textPrimary }}>
                {selectedDish.image_url?.trim() ? (
                  <div className="relative h-48 w-full">
                    <img src={selectedDish.image_url} alt={selectedDish.name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none' }} />
                    <div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${theme.dialogBg}cc, transparent)` }} />
                  </div>
                ) : null}

                <div className="flex items-start justify-between p-5 pb-0">
                  <div>
                    <h2 className="text-2xl font-light leading-tight pr-4 tracking-wide" style={{ fontFamily: theme.headerFont }}>{selectedDish.name}</h2>
                    <p className="font-bold mt-2 text-xl" style={{ color: theme.primary }}>€{selectedDish.price.toFixed(2)}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedDish(null)} className="-mt-2 -mr-2 rounded-full h-10 w-10" style={{ color: theme.textSecondary }}>
                    <X className="w-6 h-6" />
                  </Button>
                </div>

                <div className="p-5 space-y-5 flex-1 overflow-y-auto scrollbar-hide">
                  {selectedDish.description && (
                    <p className="text-sm font-light leading-relaxed" style={{ color: theme.textSecondary }}>{selectedDish.description}</p>
                  )}

                  {/* Quantity, Notes, Add Button - hidden in view-only mode */}
                  {!isViewOnly && (
                    <>
                      <div className="flex items-center justify-between p-2 rounded-xl" style={{ backgroundColor: theme.inputBg, border: `1px solid ${theme.cardBorder}` }}>
                        <span className="text-sm font-medium pl-2" style={{ color: theme.textSecondary }}>Quantità</span>
                        <div className="flex items-center gap-3">
                          <Button variant="outline" size="icon" className="h-10 w-10 rounded-lg" style={{ backgroundColor: theme.inputBg, borderColor: theme.cardBorder, color: theme.textSecondary }} onClick={() => setDishQuantity(q => Math.max(1, q - 1))} disabled={dishQuantity <= 1}><Minus className="w-5 h-5" /></Button>
                          <span className="w-8 text-center font-bold text-xl" style={{ color: theme.textPrimary }}>{dishQuantity}</span>
                          <Button variant="outline" size="icon" className="h-10 w-10 rounded-lg" style={{ backgroundColor: theme.inputBg, borderColor: theme.cardBorder, color: theme.textSecondary }} onClick={() => setDishQuantity(q => q + 1)}><Plus className="w-5 h-5" /></Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.textMuted }}>Note speciali</span>
                        <Textarea
                          placeholder="Es. Senza cipolla, cottura media..."
                          className="min-h-[80px]"
                          style={{ backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.textPrimary }}
                          value={dishNote}
                          onChange={(e) => setDishNote(e.target.value)}
                        />
                      </div>
                    </>
                  )}
                </div>

                {!isViewOnly && (
                  <div className="p-5 pt-0">
                    <Button
                      className="w-full font-bold rounded-xl text-lg shadow-lg active:scale-[0.98] transition-transform h-14"
                      style={{ ...theme.ctaButtonStyle, borderRadius: theme.buttonRadius }}
                      onClick={() => handleAddClick(selectedDish, dishQuantity, dishNote)}
                    >
                      AGGIUNGI - €{(selectedDish.price * dishQuantity).toFixed(2)}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Confirm Send Dialog */}
        <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <DialogContent className="sm:max-w-sm" style={{ backgroundColor: theme.dialogBg, borderColor: theme.primaryAlpha(0.2), color: theme.textPrimary, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8)' }}>
            <DialogHeader>
              <DialogTitle style={{ color: theme.primary, fontFamily: theme.headerFont }}>Conferma invio</DialogTitle>
              <DialogDescription style={{ color: theme.textSecondary }}>Inviare l'ordine in cucina?</DialogDescription>
            </DialogHeader>
            <div className="py-3">
              <div className="rounded-xl p-3 space-y-2" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}>
                {courseNumbers.map(num => (
                  <div key={num} className="mb-2">
                    <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: theme.primary }}>• Portata {num}</p>
                    <ul className="pl-2 space-y-1">
                      {cartByCourse[num]?.map((item, idx) => (
                        <li key={idx} className="text-xs flex justify-between" style={{ color: theme.textSecondary }}>
                          <span>{item.quantity}x {item.dish?.name}</span>
                          {item.notes && <span className="text-[10px] italic max-w-[120px] truncate ml-2" style={{ color: theme.textMuted }}>({item.notes})</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <p className="text-sm font-bold pt-2 mt-2" style={{ borderTop: `1px solid ${theme.divider}`, color: theme.textPrimary }}>Totale Ordine: €{cartTotal.toFixed(2)}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" style={{ borderColor: theme.cardBorder, backgroundColor: theme.cardBg, color: theme.textSecondary }} onClick={() => setShowConfirmDialog(false)}>Annulla</Button>
              <Button className="flex-1 font-bold" style={theme.ctaButtonStyle} onClick={submitOrder} disabled={isOrderSubmitting}>{isOrderSubmitting ? 'Invio...' : 'Conferma'}</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Course Selection Modal */}
        <Dialog open={showCourseSelectionModal} onOpenChange={(open) => {
          setShowCourseSelectionModal(open)
          if (!open) {
            setPendingDishToAdd(null)
          }
        }}>
          <DialogContent className="sm:max-w-xs shadow-2xl rounded-3xl p-6" style={{ backgroundColor: theme.dialogBg, borderColor: theme.primaryAlpha(0.2), color: theme.textPrimary }}>
            <DialogHeader>
              <DialogTitle className="text-center text-xl" style={{ color: theme.primary, fontFamily: theme.headerFont }}>Scegli la Portata</DialogTitle>
              <DialogDescription className="text-center mt-1" style={{ color: theme.textSecondary }}>Quando vuoi ricevere questo piatto?</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 mt-4">
              {Array.from({ length: maxCourse }, (_, i) => i + 1).map((courseNum) => (
                <Button
                  key={courseNum}
                  variant="outline"
                  className="h-14 rounded-xl font-bold transition-all text-lg"
                  style={{ borderColor: theme.cardBorder, backgroundColor: theme.cardBg, color: theme.textPrimary }}
                  onClick={() => {
                    if (pendingDishToAdd) {
                      addToCart(pendingDishToAdd.dish, pendingDishToAdd.quantity, pendingDishToAdd.notes, courseNum)
                    }
                  }}
                >
                  <Layers className="w-5 h-5 mr-3" style={{ color: theme.primary }} />
                  Portata {courseNum}
                </Button>
              ))}
              <Button
                variant="ghost"
                className="h-14 rounded-xl font-medium mt-2"
                style={{ color: theme.primary }}
                onClick={() => setMaxCourse(prev => prev + 1)}
              >
                <Plus className="w-5 h-5 mr-2" />
                Aggiungi nuova portata
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* NEW Course Division Modal with Drag & Drop */}
        <Dialog open={showCourseDivisionModal} onOpenChange={(open) => {
          setShowCourseDivisionModal(open)
          if (!open) {
            setIsCartOpen(true) // Re-open cart when closing
          }
        }}>
          <DialogContent className="sm:max-w-md p-0 overflow-hidden shadow-2xl rounded-3xl h-[85vh] flex flex-col w-[95vw]" style={{ backgroundColor: theme.dialogBg, borderColor: theme.primaryAlpha(0.2), color: theme.textPrimary }}>
            <DialogHeader className="p-4 backdrop-blur-xl flex-none space-y-1" style={{ borderBottom: `1px solid ${theme.divider}`, backgroundColor: theme.cardBg }}>
              <div className="flex justify-between items-center">
                <DialogTitle className="text-xl font-light tracking-wide uppercase" style={{ fontFamily: theme.headerFont, color: theme.primary }}>Dividi Portate</DialogTitle>
              </div>
              <DialogDescription className="text-xs tracking-wide" style={{ color: theme.textSecondary }}>Trascina i piatti nelle portate desiderate</DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-6">
              <DndContext
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
              >
                <div className="space-y-4">
                  {Array.from({ length: maxCourse }, (_, i) => i + 1).map((courseNum) => {
                    const courseItems = cart.filter((item) => (item.course_number || 1) === courseNum)
                    return (
                      <DroppableCourse
                        key={`course-${courseNum}`}
                        id={`course-${courseNum}`}
                        className="rounded-2xl p-4 shadow-sm border"
                        style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder }}
                      >
                        <h4 className="text-sm font-bold uppercase tracking-widest mb-3 flex items-center justify-between" style={{ color: theme.textPrimary }}>
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs" style={{ backgroundColor: theme.primaryAlpha(0.1), color: theme.primary }}>{courseNum}</span>
                            Portata {courseNum}
                          </div>
                          {courseItems.length === 0 && maxCourse > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 rounded-full text-zinc-400 hover:text-red-500 hover:bg-red-500/10"
                              onClick={() => removeCourse(courseNum)}
                            >
                              <X size={14} />
                            </Button>
                          )}
                        </h4>

                        <div className="flex flex-col gap-2 min-h-[60px]">
                          {courseItems.length > 0 ? (
                            courseItems.map((item) => (
                              <SortableDishItem
                                key={item.id}
                                item={item}
                                courseNum={courseNum}
                                theme={theme}
                              />
                            ))
                          ) : (
                            <DroppableCoursePlaceholder id={`placeholder-${courseNum}`} theme={theme} />
                          )}
                        </div>
                      </DroppableCourse>
                    )
                  })}
                </div>

                <div className="mt-6 mb-8">
                  <NewCourseDropZone onClick={addNewCourse} theme={theme} />
                </div>

                <DragOverlay dropAnimation={dropAnimation}>
                  {activeDragItem ? (
                    <SortableDishItem
                      item={activeDragItem}
                      courseNum={activeDragItem.course_number || 1}
                      theme={theme}
                    />
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>

            <div className="p-4 shrink-0 shadow-lg" style={{ backgroundColor: theme.cardBg, borderTop: `1px solid ${theme.cardBorder}` }}>
              <Button
                className="w-full font-bold h-14 rounded-xl flex items-center justify-center gap-2"
                style={theme.ctaButtonStyle}
                onClick={() => {
                  setShowCourseDivisionModal(false)
                  setIsCartOpen(true)
                }}
              >
                <CheckCircle weight="fill" size={20} />
                <span>Conferma e Torna al Carrello</span>
              </Button>
            </div>

          </DialogContent>
        </Dialog>

        {/* Call Waiter FAB */}
        {/* Call Waiter FAB */}
        <Button
          onClick={handleCallWaiter}
          disabled={callWaiterDisabled}
          className={`fixed top-4 right-4 z-50 h-10 px-3 rounded-full shadow-xl border-2 transition-all duration-300 flex items-center gap-1.5 ${callWaiterDisabled ? 'cursor-not-allowed' : ''}`}
          style={callWaiterDisabled
            ? { backgroundColor: '#27272a', borderColor: '#3f3f46', color: '#71717a' }
            : theme.fabStyle
          }
          title={callWaiterDisabled ? 'Attendi 30 secondi...' : 'Chiama cameriere'}
        >
          <Bell className="w-4 h-4" fill="currentColor" />
          <span className="text-xs font-semibold tracking-wide">Cameriere</span>
        </Button>

      </div>

      {/* ===== PAYMENT TAB VIEW (full screen overlay) ===== */}
      {customerTab === 'payment' && !isViewOnly && (
        <div className="fixed inset-0 z-40 flex flex-col" style={{ background: theme.pageBgGradient, color: theme.textPrimary, ...theme.cssVars }}>
          {/* Payment Header */}
          <header className="flex-none z-20 backdrop-blur-xl px-4 py-4" style={{ backgroundColor: theme.headerBg, borderBottom: `1px solid ${theme.primaryAlpha(0.1)}` }}>
            <div className="flex items-center justify-between">
              <button onClick={() => { setCustomerTab('menu'); setPaymentStep('summary') }} className="flex items-center gap-1.5 min-w-[60px]" style={{ color: theme.textSecondary }}>
                <ArrowLeft className="w-5 h-5" />
                <span className="text-sm">Menù</span>
              </button>
              <h1 className="text-base font-semibold tracking-wide text-center flex-1" style={{ color: theme.textPrimary }}>
                {(fullRestaurant as any)?.enable_stripe_payments ? "💳 Conto e Pagamento" : "🧾 Il Tuo Ordine"}
              </h1>
              <div className="min-w-[60px] pointer-events-none" /> {/* spacer - pointer-events-none to not block touches */}
            </div>
          </header>

          {/* Payment Content */}
          <main className={`flex-1 ${paymentStep === 'options' && !stripePaymentSuccess && previousOrders.length > 0 ? 'flex flex-col min-h-0' : 'overflow-y-auto px-4 pt-4 pb-4 scrollbar-hide'}`}>
            {stripePaymentSuccess ? (
              /* === Payment Success === */
              <div className="flex flex-col items-center justify-center text-center py-12 space-y-4">
                <div className="w-20 h-20 rounded-full flex items-center justify-center mb-2"
                  style={{ backgroundColor: '#10B98120', border: '2px solid #10B98140' }}>
                  <CheckCircle size={48} weight="fill" style={{ color: '#10B981' }} />
                </div>
                <h2 className="text-xl font-bold" style={{ color: '#10B981' }}>
                  Pagamento completato!
                </h2>
                <p className="text-base font-medium" style={{ color: theme.textPrimary }}>
                  Grazie per aver scelto {fullRestaurant?.name || 'il nostro ristorante'} 🎉
                </p>
                <p className="text-sm" style={{ color: theme.textMuted }}>
                  Il pagamento è stato elaborato con successo.<br />
                  Ti auguriamo una buona serata!
                </p>
                <div className="pt-4 w-full max-w-xs space-y-3">
                  <div className="p-3 rounded-xl text-center mb-4" style={{ backgroundColor: theme.inputBg, border: `1px solid ${theme.inputBorder}` }}>
                    <p className="text-[11px]" style={{ color: theme.textMuted }}>
                      Riceverai lo scontrino direttamente dal ristorante
                    </p>
                  </div>

                  <Button
                    onClick={() => {
                      setStripePaymentSuccess(false);
                      setCustomerTab('menu');
                    }}
                    className="w-full h-12 rounded-xl font-bold shadow-lg"
                    style={{ backgroundColor: theme.primary, color: '#000' }}
                  >
                    Torna al Menù
                  </Button>

                  <Button
                    onClick={() => {
                      setStripePaymentSuccess(false);
                      setPaymentStep('options');
                      setCustomerTab('payment');
                    }}
                    variant="outline"
                    className="w-full h-12 rounded-xl font-bold"
                    style={{ borderColor: theme.primaryAlpha(0.3), color: theme.textPrimary }}
                  >
                    Effettua un altro pagamento
                  </Button>
                </div>
              </div>
            ) : previousOrders.length === 0 ? (
              /* === No Orders Yet === */
              <div className="flex flex-col items-center justify-center text-center py-16 space-y-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: theme.primaryAlpha(0.1) }}>
                  <ForkKnife size={32} weight="duotone" style={{ color: theme.primary }} />
                </div>
                <h2 className="text-lg font-medium" style={{ color: theme.textPrimary }}>Nessun ordine ancora</h2>
                <p className="text-sm" style={{ color: theme.textMuted }}>Ordina dal menù prima di procedere al pagamento</p>
                <Button onClick={() => setCustomerTab('menu')} className="mt-2 rounded-xl" style={{ backgroundColor: theme.primary, color: '#000' }}>
                  Vai al Menù
                </Button>
              </div>
            ) : paymentStep === 'selectItems' ? (
              /* === Select Items View (Diviso per Piatti) === */
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <button onClick={() => setPaymentStep('options')} className="flex items-center gap-1.5 text-sm" style={{ color: theme.textSecondary }}>
                    <ArrowLeft className="w-4 h-4" /> Indietro
                  </button>
                  <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: theme.primary }}>Seleziona Piatti</h3>
                  <div className="w-16" />
                </div>

                <p className="text-xs text-center" style={{ color: theme.textMuted }}>
                  Seleziona i piatti che vuoi pagare
                </p>

                {/* Dish items */}
                <div className="space-y-2">
                  {payableItems.map(item => {
                    const isSelected = selectedPaymentItems.has(item.id)
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          const updated = new Set(selectedPaymentItems)
                          if (isSelected) updated.delete(item.id)
                          else updated.add(item.id)
                          setSelectedPaymentItems(updated)
                        }}
                        className="w-full flex items-center justify-between p-3 rounded-xl transition-all"
                        style={{
                          backgroundColor: isSelected ? '#635BFF15' : theme.cardBg,
                          border: `1px solid ${isSelected ? '#635BFF50' : theme.cardBorder}`,
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all"
                            style={{
                              borderColor: isSelected ? '#635BFF' : theme.textMuted,
                              backgroundColor: isSelected ? '#635BFF' : 'transparent',
                            }}>
                            {isSelected && <Check size={14} weight="bold" style={{ color: '#fff' }} />}
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-medium" style={{ color: theme.textPrimary }}>{item.quantity}x {item.name}</p>
                          </div>
                        </div>
                        <span className="text-sm font-bold" style={{ color: isSelected ? '#635BFF' : theme.textSecondary }}>
                          €{(item.price * item.quantity).toFixed(2)}
                        </span>
                      </button>
                    )
                  })}

                  {/* Coperto items (one per person) */}
                  {copertoInfo.enabled && Array.from({ length: copertoInfo.count }, (_, i) => {
                    const cId = `coperto_${i}`
                    const isSelected = selectedPaymentItems.has(cId)
                    return (
                      <button
                        key={cId}
                        onClick={() => {
                          const updated = new Set(selectedPaymentItems)
                          if (isSelected) updated.delete(cId)
                          else updated.add(cId)
                          setSelectedPaymentItems(updated)
                        }}
                        className="w-full flex items-center justify-between p-3 rounded-xl transition-all"
                        style={{
                          backgroundColor: isSelected ? '#f59e0b15' : theme.cardBg,
                          border: `1px solid ${isSelected ? '#f59e0b50' : theme.cardBorder}`,
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all"
                            style={{
                              borderColor: isSelected ? '#f59e0b' : theme.textMuted,
                              backgroundColor: isSelected ? '#f59e0b' : 'transparent',
                            }}>
                            {isSelected && <Check size={14} weight="bold" style={{ color: '#fff' }} />}
                          </div>
                          <p className="text-sm font-medium" style={{ color: theme.textPrimary }}>🍽 Coperto {copertoInfo.count > 1 ? `(${i + 1}/${copertoInfo.count})` : ''}</p>
                        </div>
                        <span className="text-sm font-bold" style={{ color: isSelected ? '#f59e0b' : theme.textSecondary }}>€{copertoInfo.price.toFixed(2)}</span>
                      </button>
                    )
                  })}

                  {/* AYCE items (one per person) */}
                  {ayceInfo.enabled && ayceInfo.price > 0 && Array.from({ length: activeSession?.customer_count || 1 }, (_, i) => {
                    const aId = `ayce_${i}`
                    const isSelected = selectedPaymentItems.has(aId)
                    return (
                      <button
                        key={aId}
                        onClick={() => {
                          const updated = new Set(selectedPaymentItems)
                          if (isSelected) updated.delete(aId)
                          else updated.add(aId)
                          setSelectedPaymentItems(updated)
                        }}
                        className="w-full flex items-center justify-between p-3 rounded-xl transition-all"
                        style={{
                          backgroundColor: isSelected ? '#10B98115' : theme.cardBg,
                          border: `1px solid ${isSelected ? '#10B98150' : theme.cardBorder}`,
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all"
                            style={{
                              borderColor: isSelected ? '#10B981' : theme.textMuted,
                              backgroundColor: isSelected ? '#10B981' : 'transparent',
                            }}>
                            {isSelected && <Check size={14} weight="bold" style={{ color: '#fff' }} />}
                          </div>
                          <p className="text-sm font-medium" style={{ color: theme.textPrimary }}>🔄 All You Can Eat {(activeSession?.customer_count || 1) > 1 ? `(${i + 1}/${activeSession?.customer_count || 1})` : ''}</p>
                        </div>
                        <span className="text-sm font-bold" style={{ color: isSelected ? '#10B981' : theme.textSecondary }}>€{ayceInfo.price.toFixed(2)}</span>
                      </button>
                    )
                  })}
                </div>

                {/* Selected total */}
                {selectedPaymentItems.size > 0 && (
                  <div className="p-3 rounded-xl text-center" style={{ backgroundColor: '#635BFF10', border: '1px solid #635BFF30' }}>
                    <p className="text-sm" style={{ color: theme.textSecondary }}>Totale selezionato</p>
                    <p className="text-2xl font-bold" style={{ color: '#635BFF' }}>
                      €{(() => {
                        let total = 0
                        payableItems.filter(pi => selectedPaymentItems.has(pi.id)).forEach(pi => { total += pi.price * pi.quantity })
                        Array.from(selectedPaymentItems).filter(id => id.startsWith('coperto')).forEach(() => { total += copertoInfo.price })
                        Array.from(selectedPaymentItems).filter(id => id.startsWith('ayce')).forEach(() => { total += ayceInfo.price })
                        return total.toFixed(2)
                      })()}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              /* === Payment Options — 3-zone layout === */
              <>
                {/* Everything Paid UI — full centered message */}
                {unpaidTotal <= 0 && (activeSession?.paid_amount || 0) > 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
                    <div className="w-full max-w-sm rounded-2xl p-4 shadow-sm border border-emerald-900/40 mb-6" style={{ backgroundColor: theme.cardBg }}>
                      <div className="flex justify-between items-center text-sm mb-2" style={{ color: theme.textSecondary }}>
                        <span>Costo Totale</span>
                        <span className="font-semibold text-white">€{(() => {
                          let t = payableItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
                          if (copertoInfo.enabled) t += copertoInfo.price * copertoInfo.count
                          if (ayceInfo.enabled && ayceInfo.price > 0) t += ayceInfo.price * (activeSession?.customer_count || 1)
                          return t.toFixed(2)
                        })()}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span style={{ color: '#10B981' }}>Già Pagato</span>
                        <span className="font-bold px-2 py-0.5 rounded-md bg-emerald-500/10" style={{ color: '#10B981', border: '1px solid #10B98140' }}>
                          - €{(activeSession?.paid_amount || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="h-px w-full my-3" style={{ background: `linear-gradient(90deg, transparent, rgba(16,185,129,0.2), transparent)` }} />
                      <div className="flex justify-between items-center">
                        <span className="text-xs uppercase tracking-[0.2em] font-semibold" style={{ color: '#10B981' }}>Rimanenza</span>
                        <span className="text-xl font-black tracking-tight" style={{ color: '#10B981' }}>€0.00</span>
                      </div>
                    </div>
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: '#10B98120' }}>
                      <CheckCircle size={32} weight="fill" style={{ color: '#10B981' }} />
                    </div>
                    <p className="text-xl font-bold" style={{ color: '#10B981' }}>Conto Saldato</p>
                    <p className="text-sm mt-1" style={{ color: theme.textMuted }}>Tutti gli ordini sono stati pagati.</p>
                  </div>
                ) : (
                  <>
                    {/* ZONA 1: Riepilogo pagamento (fixed top) */}
                    <div className="flex-none px-4 pt-3 pb-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs uppercase tracking-widest font-semibold" style={{ color: theme.textMuted }}>Totale conto</span>
                        <span className="text-sm font-bold" style={{ color: theme.textPrimary }}>€{(() => {
                          let t = payableItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
                          if (copertoInfo.enabled) t += copertoInfo.price * copertoInfo.count
                          if (ayceInfo.enabled && ayceInfo.price > 0) t += ayceInfo.price * (activeSession?.customer_count || 1)
                          return t.toFixed(2)
                        })()}</span>
                      </div>
                      {(activeSession?.paid_amount || 0) > 0 && (
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs" style={{ color: '#10B981' }}>Già pagato</span>
                          <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-emerald-500/10" style={{ color: '#10B981' }}>
                            - €{(activeSession?.paid_amount || 0).toFixed(2)}
                          </span>
                        </div>
                      )}
                      <div className="h-px w-full my-2" style={{ background: `linear-gradient(90deg, transparent, ${theme.divider}, transparent)` }} />
                      <div className="flex items-center justify-between">
                        <span className="text-sm uppercase tracking-widest font-bold" style={{ color: theme.primary }}>Da pagare</span>
                        <span className="text-3xl font-black tracking-tight" style={{ color: theme.primary }}>€{unpaidTotal.toFixed(2)}</span>
                      </div>
                    </div>

                    {/* ZONA 2: Lista piatti scrollabile */}
                    <div className="flex-1 overflow-y-auto px-4 pt-2 pb-2 scrollbar-hide">
                      <p className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: theme.textMuted }}>Dettaglio ordini</p>
                      <div className="space-y-0">
                        {payableItems.map(item => (
                          <div key={item.id} className="flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${theme.divider}` }}>
                            <span className="flex-1 flex items-baseline gap-2 min-w-0">
                              <span className="font-bold text-xs shrink-0" style={{ color: theme.primary }}>{item.quantity}x</span>
                              <span className="text-sm font-medium truncate" style={{ color: theme.textPrimary }}>{item.name}</span>
                            </span>
                            <span className="text-sm font-semibold shrink-0 ml-3" style={{ color: theme.textPrimary }}>
                              €{(item.price * item.quantity).toFixed(2)}
                            </span>
                          </div>
                        ))}
                        {copertoInfo.enabled && (
                          <div className="flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${theme.divider}` }}>
                            <span className="text-sm" style={{ color: theme.textSecondary }}>🍽 Coperto × {copertoInfo.count}</span>
                            <span className="text-sm font-semibold" style={{ color: theme.textPrimary }}>€{(copertoInfo.price * copertoInfo.count).toFixed(2)}</span>
                          </div>
                        )}
                        {ayceInfo.enabled && ayceInfo.price > 0 && (
                          <div className="flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${theme.divider}` }}>
                            <span className="text-sm" style={{ color: theme.textSecondary }}>🔄 All You Can Eat × {activeSession?.customer_count || 1}</span>
                            <span className="text-sm font-semibold" style={{ color: theme.textPrimary }}>€{(ayceInfo.price * (activeSession?.customer_count || 1)).toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ZONA 3: Bottoni pagamento compatti (fixed bottom) */}
                    {(fullRestaurant as any)?.enable_stripe_payments && unpaidTotal > 0 && (
                      <div className="flex-none px-4 pt-3 pb-4" style={{ borderTop: `1px solid ${theme.divider}`, backgroundColor: theme.headerBg }}>
                        <div className="grid grid-cols-3 gap-2 mb-2">
                          {/* Paga Totale */}
                          <button
                            onClick={() => handleStripePayment('full')}
                            disabled={isProcessingStripePayment}
                            className="flex flex-col items-center justify-center p-3 rounded-xl transition-all active:scale-95"
                            style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`, color: '#000' }}
                          >
                            <Wallet size={20} weight="fill" />
                            <span className="text-[10px] font-extrabold mt-1 uppercase tracking-wide leading-tight text-center">Paga Totale</span>
                          </button>
                          {/* Alla Romana */}
                          <button
                            onClick={() => setShowRomanaInline(prev => !prev)}
                            className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all active:scale-95 ${showRomanaInline ? 'ring-1' : ''}`}
                            style={{
                              backgroundColor: theme.cardBg,
                              border: `1px solid ${showRomanaInline ? theme.primary : theme.cardBorder}`,
                              color: theme.textPrimary,
                              ...(showRomanaInline ? { ringColor: theme.primary } : {})
                            }}
                          >
                            <Users size={20} weight="fill" style={{ color: theme.primary }} />
                            <span className="text-[10px] font-extrabold mt-1 uppercase tracking-wide leading-tight text-center">Alla Romana</span>
                          </button>
                          {/* Per Piatti */}
                          <button
                            onClick={() => { setPaymentStep('selectItems'); setSelectedPaymentItems(new Set()) }}
                            className="flex flex-col items-center justify-center p-3 rounded-xl transition-all active:scale-95"
                            style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.cardBorder}`, color: theme.textPrimary }}
                          >
                            <ListNumbers size={20} weight="fill" style={{ color: theme.primary }} />
                            <span className="text-[10px] font-extrabold mt-1 uppercase tracking-wide leading-tight text-center">Per Piatti</span>
                          </button>
                        </div>

                        {/* Alla Romana inline expansion */}
                        {showRomanaInline && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="flex items-center justify-between gap-3 p-3 rounded-xl mb-2"
                            style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.primaryAlpha(0.3)}` }}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium" style={{ color: theme.textSecondary }}>Persone:</span>
                              <div className="flex items-center rounded-lg" style={{ backgroundColor: 'rgba(0,0,0,0.4)', border: `1px solid ${theme.cardBorder}` }}>
                                <button onClick={() => setRomanaCount(c => Math.max(2, c - 1))} className="w-8 h-8 rounded-l-lg flex items-center justify-center active:bg-white/10" style={{ color: theme.textSecondary }}>
                                  <Minus size={14} weight="bold" />
                                </button>
                                <span className="w-8 text-center font-bold text-base" style={{ color: theme.textPrimary }}>{romanaCount}</span>
                                <button onClick={() => setRomanaCount(c => Math.min(20, c + 1))} className="w-8 h-8 rounded-r-lg flex items-center justify-center active:bg-white/10" style={{ color: theme.textSecondary }}>
                                  <Plus size={14} weight="bold" />
                                </button>
                              </div>
                            </div>
                            <button
                              onClick={() => handleStripePayment('split', romanaCount)}
                              disabled={isProcessingStripePayment}
                              className="px-4 py-2.5 rounded-xl font-bold text-sm active:scale-95 transition-transform"
                              style={{ backgroundColor: theme.primary, color: '#000' }}
                            >
                              Paga €{(unpaidTotal / romanaCount).toFixed(2)}
                            </button>
                          </motion.div>
                        )}

                        <p className="text-[9px] text-center font-medium uppercase tracking-[0.2em]" style={{ color: theme.textMuted }}>
                          🔒 Pagamento sicuro tramite Stripe
                        </p>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </main>

          {/* Fixed Pay Button at bottom - only for selectItems step */}
          {!stripePaymentSuccess && paymentStep === 'selectItems' && previousOrders.length > 0 && unpaidTotal > 0 && (fullRestaurant as any)?.enable_stripe_payments && (
            <div className="flex-none p-4 backdrop-blur-xl" style={{ borderTop: `1px solid ${theme.divider}`, backgroundColor: theme.cardBg }}>
              <Button
                className="w-full font-bold h-14 rounded-2xl text-lg shadow-lg"
                style={{
                  background: selectedPaymentItems.size > 0 ? 'linear-gradient(135deg, #635BFF 0%, #7C3AED 100%)' : theme.inputBg,
                  color: selectedPaymentItems.size > 0 ? '#ffffff' : theme.textMuted,
                  boxShadow: selectedPaymentItems.size > 0 ? '0 10px 25px -5px rgba(99, 91, 255, 0.4)' : 'none',
                }}
                onClick={handleItemsPayment}
                disabled={isProcessingStripePayment || selectedPaymentItems.size === 0}
              >
                {isProcessingStripePayment ? (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
                    Attendi...
                  </div>
                ) : (
                  <>
                    <CreditCard size={22} className="mr-2" />
                    Paga Selezionati {selectedPaymentItems.size > 0 && `— €${(() => {
                      let total = 0
                      payableItems.filter(pi => selectedPaymentItems.has(pi.id)).forEach(pi => { total += pi.price * pi.quantity })
                      Array.from(selectedPaymentItems).filter(id => id.startsWith('coperto')).forEach(() => { total += copertoInfo.price })
                      Array.from(selectedPaymentItems).filter(id => id.startsWith('ayce')).forEach(() => { total += ayceInfo.price })
                      return total.toFixed(2)
                    })()}`}
                  </>
                )}
              </Button>
            </div>
          )}


        </div>
      )}

      {/* Coperto/AYCE Prompt Dialog */}
      <AlertDialog open={showCopertoPrompt} onOpenChange={setShowCopertoPrompt}>
        <AlertDialogContent style={{ backgroundColor: theme.dialogBg, borderColor: theme.primaryAlpha(0.2), color: theme.textPrimary }}>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: theme.textPrimary }}>Coperti e All You Can Eat</AlertDialogTitle>
            <AlertDialogDescription style={{ color: theme.textSecondary }}>
              Non hai selezionato nessun coperto{ayceInfo.enabled ? ' / All You Can Eat' : ''}. Vuoi tornare indietro per aggiungerli al pagamento?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowCopertoPrompt(false); handleStripePayment('items') }} style={{ color: theme.textSecondary }}>
              No, paga così
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => setShowCopertoPrompt(false)} style={{ backgroundColor: '#635BFF', color: '#fff' }}>
              Sì, seleziona
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div >
  )
}

export default function CustomerMenu() {
  return (
    <ErrorBoundary>
      <CustomerMenuBase />
    </ErrorBoundary>
  )
}
