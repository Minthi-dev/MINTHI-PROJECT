import React, { useEffect, useState, Suspense, lazy } from 'react'
import { motion } from 'framer-motion'
import { Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { Toaster } from 'sonner'
import { SessionProvider } from './context/SessionContext'
import { supabase } from './lib/supabase'
import { DatabaseService } from './services/DatabaseService'

import { lazyImportRetry } from './utils/lazyImportRetry'

// Lazy loaded components for code splitting (with auto-retry on chunk error)
const LoginPage = lazyImportRetry(() => import('./components/LoginPage'))
const RestaurantDashboard = lazyImportRetry(() => import('./components/RestaurantDashboard'))
const AdminDashboard = lazyImportRetry(() => import('./components/AdminDashboard'))
const WaiterDashboard = lazyImportRetry(() => import('./components/waiter/WaiterDashboard'))
const WaiterOrderPage = lazyImportRetry(() => import('./components/waiter/WaiterOrderPage'))
const CustomerMenu = lazyImportRetry(() => import('./components/CustomerMenu'))
const PublicReservationPage = lazyImportRetry(() => import('./components/reservations/PublicReservationPage'))
const RestaurantOnboarding = lazyImportRetry(() => import('./components/RestaurantOnboarding'))
const RegisterSuccessPage = lazyImportRetry(() => import('./components/RegisterSuccessPage'))
const LandingPage = lazyImportRetry(() => import('./components/LandingPage'))

// Loading spinner component
const LoadingSpinner = () => (
  <div className="flex flex-col items-center justify-center h-screen gap-6 bg-black text-amber-50 px-4 relative overflow-hidden">
    {/* Ambient Background */}
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute top-[20%] left-[50%] -translate-x-1/2 w-[60%] h-[60%] bg-amber-500/5 rounded-full blur-[150px] opacity-40" />
    </div>

    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="relative z-10 flex flex-col items-center gap-6"
    >
      <motion.div
        initial={{ rotate: -20 }}
        animate={{ rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.2 }}
        className="w-24 h-24 rounded-full bg-zinc-900/50 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shadow-[0_0_50px_-10px_rgba(52,211,153,0.3)] backdrop-blur-md"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="48" height="48" fill="currentColor">
          <path d="M240,32a16,16,0,0,0-16-16A168.21,168.21,0,0,0,55.77,65.23L44.47,53.94A8,8,0,0,0,33.16,65.25L46.61,78.7A168.16,168.16,0,0,0,16.21,247.45a8,8,0,0,0,.3,11.3,8,8,0,0,0,5.65,2.35,8.15,8.15,0,0,0,5.66-2.35l50.88-50.86A168.16,168.16,0,0,0,247.45,39.66a8,8,0,0,0,2.35-5.65A16.06,16.06,0,0,0,240,32Zm-44,82.34L113.66,196.69a152.17,152.17,0,0,1-81-81L115,33.34A152.17,152.17,0,0,1,196,114.34Z"></path>
        </svg>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="text-3xl font-light tracking-[0.25em] text-white uppercase flex items-center justify-center gap-1"
      >
        min<span className="font-bold text-emerald-400">thi</span>
      </motion.h1>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="flex flex-col items-center gap-4 mt-2"
      >
        <div className="flex gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "0ms" }} />
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "150ms" }} />
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
        <p className="text-xs text-zinc-500 uppercase tracking-widest mt-2">Caricamento in corso...</p>
      </motion.div>
    </motion.div>
  </div>
)

// Route Guard for Admin/Staff
const ProtectedRoute = ({ children, user, loading, requiredRoles }: { children: React.ReactNode, user: any, loading: boolean, requiredRoles?: string[] }) => {
  if (loading) return <LoadingSpinner />
  if (!user) return <Navigate to="/" replace />
  if (requiredRoles && !requiredRoles.includes(user.role)) return <Navigate to="/" replace />

  return React.cloneElement(children as React.ReactElement<any>, { user })
}

// Redirect wrapper for legacy QR Codes that hit `/menu?tableId=XYZ`
const LegacyCustomerMenuRedirect = () => {
  const [searchParams] = useSearchParams()
  const tableId = searchParams.get('tableId')
  if (tableId) {
    return <Navigate to={`/client/table/${tableId}`} replace />
  }
  return <Navigate to="/" replace />
}

// Redirect wrapper for legacy QR Codes that hit `/menu/XYZ`
const LegacyPathRedirect = () => {
  const location = useLocation()
  const pathParts = location.pathname.split('/')
  const tableId = pathParts[pathParts.length - 1]
  if (tableId && tableId !== 'menu') {
    return <Navigate to={`/client/table/${tableId}`} replace />
  }
  return <Navigate to="/" replace />
}

const AppContent = () => {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check localStorage for saved user first
    const savedUser = localStorage.getItem('minthi_user')
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser)

        // Server-side role validation BEFORE granting access
        // This prevents localStorage manipulation attacks
        const validate = async () => {
          try {
            let valid = false
            if (parsedUser.role === 'ADMIN' || parsedUser.role === 'OWNER') {
              const { data } = await supabase.from('users').select('id, role').eq('id', parsedUser.id).single()
              valid = !!(data && data.role === parsedUser.role)
            } else if (parsedUser.role === 'STAFF') {
              valid = await DatabaseService.verifyStaffSession(parsedUser.id)
            }

            if (valid) {
              setUser(parsedUser)
            } else {
              localStorage.removeItem('minthi_user')
            }
          } catch {
            localStorage.removeItem('minthi_user')
          } finally {
            setLoading(false)
          }
        }
        validate()
        return
      } catch (e) {
        localStorage.removeItem('minthi_user')
      }
    }

    // Fallback to Supabase auth
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('minthi_user')
    supabase.auth.signOut()
    setUser(null)
  }

  const getRedirectPath = (user: any) => {
    if (!user) return '/'
    if (user.role === 'ADMIN') return '/admin'
    if (user.role === 'STAFF') return '/waiter'
    return '/dashboard'
  }

  return (
    <>
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          {/* LANDING PAGE — public, no auth */}
          <Route path="/info" element={<LandingPage />} />

          {/* PUBLIC / ADMIN LOGIN */}
          <Route
            path="/"
            element={
              !user
                ? <LoginPage onLogin={(u) => setUser(u)} />
                : <Navigate to={getRedirectPath(user)} replace />
            }
          />

          {/* ADMIN DASHBOARD (for ADMIN role - manages all restaurants) */}
          <Route
            path="/admin/*"
            element={
              <ProtectedRoute user={user} loading={loading} requiredRoles={['ADMIN']}>
                <AdminDashboard user={user} onLogout={handleLogout} />
              </ProtectedRoute>
            }
          />

          {/* RESTAURANT DASHBOARD (for OWNER role - single restaurant) */}
          <Route
            path="/dashboard/*"
            element={
              <ProtectedRoute user={user} loading={loading} requiredRoles={['OWNER', 'ADMIN']}>
                <RestaurantDashboard user={user} onLogout={handleLogout} />
              </ProtectedRoute>
            }
          />

          {/* WAITER DASHBOARD */}
          <Route
            path="/waiter"
            element={
              <ProtectedRoute user={user} loading={loading} requiredRoles={['STAFF']}>
                <WaiterDashboard user={user} onLogout={handleLogout} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/waiter/table/:tableId/order"
            element={
              <ProtectedRoute user={user} loading={loading} requiredRoles={['STAFF']}>
                <WaiterOrderPage />
              </ProtectedRoute>
            }
          />

          {/* CUSTOMER ROUTES */}
          <Route path="/client/table/:tableId" element={<CustomerMenu />} />
          {/* Support for existing physical QR codes */}
          <Route path="/menu/:tableId" element={<LegacyPathRedirect />} />
          <Route path="/menu" element={<LegacyCustomerMenuRedirect />} />
          <Route path="/book/:restaurantId" element={<PublicReservationPage />} />
          <Route path="/register/:token" element={<RestaurantOnboarding />} />
          <Route path="/register-success" element={<RegisterSuccessPage />} />
          <Route path="/register-cancelled" element={<Navigate to="/" replace />} />

          {/* Fallback for unknown routes */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>

      <Toaster position="top-center" expand={false} richColors visibleToasts={2} duration={2500} toastOptions={{ style: { marginTop: 'env(safe-area-inset-top, 0px)' } }} />
    </>
  )
}

function App() {
  const location = useLocation()

  // Landing page is fully public — no auth, no session, no loading
  if (location.pathname === '/info') {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <LandingPage />
      </Suspense>
    )
  }

  return (
    <SessionProvider>
      <AppContent />
    </SessionProvider>
  )
}

export default App