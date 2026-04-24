import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { User } from '../services/types'
import { Users, Eye, EyeSlash } from '@phosphor-icons/react'
import { Checkbox } from '@/components/ui/checkbox'
import { supabase } from '../lib/supabase'

interface Props {
  onLogin: (user: User) => void
}

export default function LoginPage({ onLogin }: Props) {
  const [isLoading, setIsLoading] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
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
    setIsLoading(true)

    try {
      const { data, error } = await supabase.functions.invoke('login', {
        body: { username: username.trim(), password }
      })

      if (error || !data?.user) {
        // Extract error message: try data.error, then error.message
        let errorMsg = 'Credenziali non valide'
        if (data?.error) {
          errorMsg = data.error
        } else if (error?.message && !error.message.includes('non-2xx')) {
          errorMsg = error.message
        }
        toast.error(errorMsg)
      } else {
        const loggedUser: User = data.user
        localStorage.setItem('minthi_user', JSON.stringify(loggedUser))
        if (data.sessionToken) localStorage.setItem('minthi_session_token', data.sessionToken)
        if (data.sessionExpiresAt) localStorage.setItem('minthi_session_expires_at', data.sessionExpiresAt)
        onLogin(loggedUser)
        toast.success(data.restaurant_name ? `Benvenuto, ${data.restaurant_name}` : `Benvenuto ${loggedUser.name || 'Utente'}`)
      }
    } catch (error: any) {
      console.error('Login error:', error)
      if (error.message?.includes('Failed to fetch') || error.name === 'TypeError') {
        toast.error('Errore di connessione al server. Verifica la tua connessione internet.')
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
        <div className="text-center mb-10 space-y-3">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.1 }}
            className="mb-4"
          >
            <img
              src="/minthi-logo.png"
              alt="MINTHI"
              className="h-20 w-auto mx-auto drop-shadow-[0_0_30px_rgba(52,211,153,0.25)]"
            />
          </motion.div>
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
