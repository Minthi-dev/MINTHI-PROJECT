import { motion } from 'framer-motion'
import { verifyPassword } from '../utils/passwordUtils'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { v4 as uuidv4 } from 'uuid'
import { DatabaseService } from '../services/DatabaseService'
import { toast } from 'sonner'
import { User, Table } from '../services/types'
import { Users, Eye, EyeSlash } from '@phosphor-icons/react'
import { Checkbox } from '@/components/ui/checkbox'

interface Props {
  onLogin: (user: User) => void
}

// Costanti per rate limiting login
const MAX_LOGIN_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 5 * 60 * 1000 // 5 minuti

export default function LoginPage({ onLogin }: Props) {
  const [isLoading, setIsLoading] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [loginAttempts, setLoginAttempts] = useState(0)
  const [lockoutUntil, setLockoutUntil] = useState<Date | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  const [paymentSuccess, setPaymentSuccess] = useState(false)

  useEffect(() => {
    const paymentStatus = searchParams.get('payment')
    if (paymentStatus === 'success') {
      setPaymentSuccess(true)
      searchParams.delete('payment')
      setSearchParams(searchParams)
    } else if (paymentStatus === 'cancelled') {
      toast.error('Pagamento annullato. Riprova quando sei pronto.')
      searchParams.delete('payment')
      setSearchParams(searchParams)
    }
  }, [searchParams, setSearchParams])

  const handleAdminLogin = async () => {
    // Rate limiting check
    if (lockoutUntil && new Date() < lockoutUntil) {
      const remainingMs = lockoutUntil.getTime() - Date.now()
      const remainingMin = Math.ceil(remainingMs / 60000)
      toast.error(`Troppi tentativi falliti. Riprova tra ${remainingMin} minuto/i.`)
      return
    }

    setIsLoading(true)

    try {
      const users = await DatabaseService.getUsers()

      // Check for username or email match
      let user: User | null = null
      for (const u of users) {
        const nameMatch = u.name?.toLowerCase() === username.toLowerCase()
        const emailMatch = u.email?.toLowerCase() === username.toLowerCase()
        if (nameMatch || emailMatch) {
          const passwordMatch = await verifyPassword(password, u.password_hash || '')
          if (passwordMatch) {
            user = u
            break
          }
        }
      }

      // Check for Custom Waiter Credentials from restaurant_staff
      if (!user) {
        const staffCredentials = await DatabaseService.verifyWaiterCredentials(username, password)
        if (staffCredentials && staffCredentials.restaurant) {
          // Verify password in JS against stored hash
          const staffPasswordMatch = await verifyPassword(password, staffCredentials.password || '')
          if (staffPasswordMatch) {
            const targetRestaurant = staffCredentials.restaurant
            if (targetRestaurant.isActive === false) {
              toast.error("Ristorante temporaneamente sospeso. Contatta l'amministrazione.")
              setIsLoading(false)
              return
            }

            // Successful Custom Waiter Login
            const waiterUser: User = {
              id: staffCredentials.id, // Use staff ID for analytics
              name: staffCredentials.name,
              email: staffCredentials.username + '@local',
              role: 'STAFF',
              restaurant_id: targetRestaurant.id
            }

            localStorage.setItem('minthi_user', JSON.stringify(waiterUser))
            onLogin(waiterUser)
            toast.success(`Benvenuto ${staffCredentials.name} - ${targetRestaurant.name}`)
            setIsLoading(false)
            return
          }
        }
      }

      // Check for Legacy Waiter Login (format: restaurantSlug_cameriere)
      if (!user && username.includes('_cameriere')) {
        const restaurants = await DatabaseService.getRestaurants()
        const [slug] = username.split('_cameriere')

        const targetRestaurant = restaurants.find(r =>
          r.name.toLowerCase().replace(/\s+/g, '-') === slug.toLowerCase()
        )

        if (targetRestaurant && targetRestaurant.waiter_mode_enabled) {
          // Check if restaurant is active
          if (targetRestaurant.isActive === false) {
            toast.error('Ristorante temporaneamente sospeso. Contatta l\'amministrazione.')
            setIsLoading(false)
            return
          }

          if (await verifyPassword(password, targetRestaurant.waiter_password || '')) {
            // Successful Waiter Login
            const waiterUser: User = {
              id: uuidv4(),
              name: 'Cameriere',
              email: `waiter@${slug}.local`,
              role: 'STAFF',
              restaurant_id: targetRestaurant.id
            }

            // Always persist session to localStorage
            localStorage.setItem('minthi_user', JSON.stringify(waiterUser))

            onLogin(waiterUser)
            toast.success(`Benvenuto Staff - ${targetRestaurant.name}`)
            setIsLoading(false)
            return
          }
        }
      }

      // Reset contatore tentativi in caso di match utente trovato
      if (user) setLoginAttempts(0)

      if (user) {
        // If user is OWNER, we might want to fetch their restaurant here to ensure it exists
        if (user.role === 'OWNER') {
          const userRestaurant = await DatabaseService.getRestaurantForLogin(user.id)
          if (!userRestaurant) {
            toast.error('Nessun ristorante associato a questo account.')
            setIsLoading(false)
            return
          }

          // Check if restaurant is active
          if (userRestaurant.is_active === false) {
            toast.error('Il tuo ristorante è stato temporaneamente sospeso. Contatta l\'assistenza.')
            setIsLoading(false)
            return
          }

          // Attach restaurant_id to the user object
          const userWithRestaurant = { ...user, restaurant_id: userRestaurant.id }

          // Always persist session to localStorage
          localStorage.setItem('minthi_user', JSON.stringify(userWithRestaurant))

          onLogin(userWithRestaurant)
          toast.success(`Benvenuto, ${userRestaurant.name}`)
          return
        }

        // Always persist session to localStorage
        localStorage.setItem('minthi_user', JSON.stringify(user))

        onLogin(user)
        toast.success(`Benvenuto ${user.name || 'Utente'}`)
      } else {
        const newAttempts = loginAttempts + 1
        setLoginAttempts(newAttempts)
        if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
          const lockout = new Date(Date.now() + LOCKOUT_DURATION_MS)
          setLockoutUntil(lockout)
          setLoginAttempts(0)
          toast.error('Troppi tentativi falliti. Account bloccato per 5 minuti.')
        } else {
          toast.error(`Credenziali non valide (${newAttempts}/${MAX_LOGIN_ATTEMPTS} tentativi)`)
        }
      }
    } catch (error: any) {
      console.error('Login error:', error)
      // Provide more specific error messages based on error type
      if (error.message?.includes('Failed to fetch') || error.name === 'TypeError') {
        toast.error('Errore di connessione al server. Verifica la tua connessione internet.')
      } else if (error.message?.includes('ERR_NAME_NOT_RESOLVED')) {
        toast.error('Server non raggiungibile. Contatta il supporto.')
      } else {
        toast.error('Errore durante il login. Riprova.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  // Keyboard handling is done globally in main.tsx via focusin event

  return (
    <div id="login-container" className="min-h-[100dvh] flex flex-col items-center justify-center bg-black text-amber-50 p-4 font-sans selection:bg-amber-500/30 overflow-y-auto relative fixed inset-0" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* Subtle Gold Ambient Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-amber-500/5 rounded-full blur-[150px] opacity-40" />
      </div>

      {paymentSuccess && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-xl">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, type: 'spring' }}
            className="text-center px-6 max-w-md"
          >
            <div className="w-24 h-24 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-8 shadow-[0_0_50px_-10px_rgba(52,211,153,0.3)]">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3, type: 'spring' }}
              >
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 22C17.5 22 22 17.5 22 12C22 6.5 17.5 2 12 2C6.5 2 2 6.5 2 12C2 17.5 6.5 22 12 22Z" stroke="#34D399" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M7.75 12L10.58 14.83L16.25 9.17" stroke="#34D399" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </motion.div>
            </div>
            <h2 className="text-3xl font-bold text-white mb-4">Pagamento Completato!</h2>
            <p className="text-zinc-400 mb-8 leading-relaxed">
              Il tuo abbonamento è attivo. Inserisci subito le credenziali che hai scelto durante la registrazione per accedere al tuo nuovo ristorante.
            </p>
            <button
              onClick={() => setPaymentSuccess(false)}
              className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl transition-colors"
            >
              Vai al Login
            </button>
          </motion.div>
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-[380px] relative z-10"
      >
        <div className="text-center mb-10 space-y-4">
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.1 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-zinc-900/50 border border-emerald-500/20 text-emerald-400 mb-6 shadow-[0_0_30px_-10px_rgba(52,211,153,0.3)] backdrop-blur-md"
          >
            <svg xmlns="http://www.000webhost.com" viewBox="0 0 256 256" width="36" height="36" fill="currentColor">
              <path d="M240,32a16,16,0,0,0-16-16A168.21,168.21,0,0,0,55.77,65.23L44.47,53.94A8,8,0,0,0,33.16,65.25L46.61,78.7A168.16,168.16,0,0,0,16.21,247.45a8,8,0,0,0,.3,11.3,8,8,0,0,0,5.65,2.35,8.15,8.15,0,0,0,5.66-2.35l50.88-50.86A168.16,168.16,0,0,0,247.45,39.66a8,8,0,0,0,2.35-5.65A16.06,16.06,0,0,0,240,32Zm-44,82.34L113.66,196.69a152.17,152.17,0,0,1-81-81L115,33.34A152.17,152.17,0,0,1,196,114.34Z"></path>
            </svg>
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-3xl font-light tracking-[0.25em] text-white uppercase flex items-center justify-center gap-1"
          >
            min<span className="font-bold text-emerald-400">thi</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-sm text-zinc-500 uppercase tracking-widest font-medium"
          >
            Area Riservata Staff
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-zinc-900/30 border border-white/5 rounded-2xl p-8 backdrop-blur-md shadow-2xl relative overflow-hidden"
        >
          {/* Decorative top shimmer line */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-amber-500/50 to-transparent opacity-50" />

          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider pl-1">ID Ristorante / Utente</Label>
              <div className="group relative">
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Inserisci ID..."
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="bg-black/50 border-white/10 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 text-indigo-50 placeholder:text-zinc-700 h-12 transition-all pl-4 rounded-xl"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider pl-1 flex justify-between">
                <span>Password</span>
              </Label>
              <div className="relative group">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="bg-black/50 border-white/10 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 text-indigo-50 placeholder:text-zinc-700 h-12 pr-10 transition-all pl-4 rounded-xl"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-amber-500 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeSlash size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-3 pt-2 pl-1">
              <Checkbox
                id="remember-me"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked === true)}
                className="border-white/20 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500 data-[state=checked]:text-black rounded-[4px] w-5 h-5"
              />
              <Label htmlFor="remember-me" className="text-sm text-zinc-400 cursor-pointer font-normal hover:text-white transition-colors select-none">
                Resta collegato
              </Label>
            </div>
          </div>

          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="mt-8">
            <Button
              onClick={handleAdminLogin}
              disabled={isLoading || !username || !password}
              className="w-full bg-amber-500 hover:bg-amber-400 text-black h-12 font-bold rounded-xl transition-all shadow-[0_0_20px_-5px_rgba(245,158,11,0.3)] hover:shadow-[0_0_25px_-5px_rgba(245,158,11,0.5)] disabled:opacity-50 disabled:cursor-not-allowed border-none text-base tracking-wide"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  <span>Verifica...</span>
                </div>
              ) : 'ACCEDI'}
            </Button>
          </motion.div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-center text-[10px] text-zinc-700 mt-12 uppercase tracking-widest"
        >
          Secured by MINTHI Systems
        </motion.p>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="text-center text-[10px] text-zinc-700 mt-2"
        >
          Assistenza: <a href="tel:+393517570155" className="text-amber-500/50 hover:text-amber-400 transition-colors">+39 351 757 0155</a>
        </motion.p>
      </motion.div>
    </div>
  )
}