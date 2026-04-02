import { motion } from 'framer-motion'
import { CheckCircle, ArrowRight, Confetti, CircleNotch, WarningCircle } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Status = 'polling' | 'ready' | 'timeout'

export default function RegisterSuccessPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<Status>('polling')
  const pendingUsername = sessionStorage.getItem('minthi_pending_username')

  useEffect(() => {
    // If no username stored (e.g. direct navigation), skip polling
    if (!pendingUsername) {
      setStatus('ready')
      return
    }

    let stopped = false

    const checkReady = async () => {
      const { data } = await supabase
        .from('users')
        .select('id')
        .eq('name', pendingUsername)
        .maybeSingle()
      if (data && !stopped) {
        setStatus('ready')
        sessionStorage.removeItem('minthi_pending_username')
      }
    }

    // Poll every 2s
    checkReady()
    const interval = setInterval(checkReady, 2000)

    // After 3 minutes give up and let user try anyway
    const timeout = setTimeout(() => {
      if (!stopped) setStatus('timeout')
      clearInterval(interval)
    }, 180_000)

    return () => {
      stopped = true
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [pendingUsername])

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-[150px]" />
        <div className="absolute top-1/4 left-1/4 w-[300px] h-[300px] bg-amber-500/5 rounded-full blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="relative z-10 max-w-md w-full text-center space-y-8"
      >
        {/* Icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
          className="w-28 h-28 mx-auto rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center shadow-[0_0_60px_-10px_rgba(16,185,129,0.5)]"
        >
          <CheckCircle size={56} weight="fill" className="text-emerald-400" />
        </motion.div>

        {/* Confetti decoration */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="absolute top-8 right-8 text-amber-400 opacity-60"
        >
          <Confetti size={32} weight="fill" />
        </motion.div>

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-3"
        >
          <h1 className="text-4xl font-black text-white tracking-tight">
            Pagamento <span className="text-emerald-400">completato!</span>
          </h1>
          <p className="text-zinc-400 text-lg leading-relaxed">
            Grazie per esserti registrato su <span className="text-white font-semibold">Minthi</span>.
          </p>
        </motion.div>

        {/* Status card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="bg-zinc-900/80 border border-zinc-700/60 rounded-2xl p-6 text-left space-y-4"
        >
          {status === 'polling' && (
            <div className="flex items-center gap-3">
              <CircleNotch size={20} className="text-amber-400 animate-spin shrink-0" />
              <div>
                <p className="text-white text-sm font-semibold">Attivazione account in corso…</p>
                <p className="text-zinc-500 text-xs mt-0.5">Stiamo configurando il tuo account. Ci vorranno pochi secondi.</p>
              </div>
            </div>
          )}

          {status === 'ready' && (
            <>
              <div className="flex items-center gap-3 mb-2">
                <CheckCircle size={20} weight="fill" className="text-emerald-400 shrink-0" />
                <p className="text-emerald-400 text-sm font-semibold">Account attivo! Puoi effettuare il login.</p>
              </div>
              <p className="text-zinc-300 text-sm font-medium uppercase tracking-widest mt-3">Prossimi passi</p>
              <div className="space-y-3">
                {[
                  { step: '1', text: 'Clicca il pulsante qui sotto per accedere al login' },
                  { step: '2', text: 'Inserisci le credenziali scelte durante la registrazione' },
                  { step: '3', text: 'Una guida interattiva ti mostrerà tutte le funzionalità' },
                ].map(({ step, text }) => (
                  <div key={step} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-xs font-black text-amber-400">{step}</span>
                    </div>
                    <p className="text-zinc-400 text-sm leading-relaxed">{text}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {status === 'timeout' && (
            <div className="flex items-start gap-3">
              <WarningCircle size={20} weight="fill" className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-amber-400 text-sm font-semibold">Attivazione in ritardo</p>
                <p className="text-zinc-400 text-xs mt-1 leading-relaxed">
                  L'attivazione sta richiedendo più tempo del previsto. Prova ad effettuare il login tra qualche minuto.
                  Se il problema persiste, contatta il supporto.
                </p>
              </div>
            </div>
          )}
        </motion.div>

        {/* CTA button */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          onClick={() => navigate('/')}
          disabled={status === 'polling'}
          className="w-full h-14 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black font-black text-lg rounded-2xl flex items-center justify-center gap-3 transition-all shadow-[0_10px_30px_-10px_rgba(245,158,11,0.5)] hover:shadow-[0_15px_40px_-10px_rgba(245,158,11,0.7)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
        >
          Vai al Login
          <ArrowRight size={22} weight="bold" />
        </motion.button>

        {/* Brand */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="text-zinc-600 text-xs uppercase tracking-[0.3em]"
        >
          <img src="/minthi-logo.png" alt="MINTHI" className="h-9 w-auto inline-block mr-2" /> sistema gestione ristorante
        </motion.p>
      </motion.div>
    </div>
  )
}
