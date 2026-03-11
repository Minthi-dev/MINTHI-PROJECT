import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Circle, ArrowRight, X, Sparkle } from '@phosphor-icons/react'

interface SetupStep {
  id: string
  title: string
  description: string
  tab: string
  ctaLabel: string
}

const STEPS: SetupStep[] = [
  {
    id: 'categories',
    title: 'Crea le Categorie',
    description: 'Crea le categorie del tuo menu: Antipasti, Primi, Secondi, Dolci, Bevande, ecc.',
    tab: 'menu',
    ctaLabel: 'Vai al Menu',
  },
  {
    id: 'dishes',
    title: 'Aggiungi i Piatti',
    description: 'Aggiungi i piatti con nome, prezzo, descrizione e allergeni. Puoi anche aggiungere foto.',
    tab: 'menu',
    ctaLabel: 'Aggiungi Piatto',
  },
  {
    id: 'tables',
    title: 'Crea i Tavoli',
    description: 'Aggiungi i tavoli del ristorante. Per ogni tavolo verrà generato un QR Code unico.',
    tab: 'tables',
    ctaLabel: 'Vai ai Tavoli',
  },
  {
    id: 'settings',
    title: 'Configura il Ristorante',
    description: 'Imposta coperto, orari di servizio, tipo di ristorante (classico o AYCE) e altre opzioni.',
    tab: 'settings',
    ctaLabel: 'Vai alle Impostazioni',
  },
]

interface SetupWizardProps {
  setActiveTab: (tab: string) => void
  onComplete: () => void
  tablesCount: number
  dishesCount: number
  categoriesCount: number
}

export default function SetupWizard({
  setActiveTab,
  onComplete,
  tablesCount,
  dishesCount,
  categoriesCount,
}: SetupWizardProps) {
  const [currentStep, setCurrentStep] = useState(0)

  const isStepDone = useCallback((id: string) => {
    switch (id) {
      case 'categories': return categoriesCount > 0
      case 'dishes': return dishesCount > 0
      case 'tables': return tablesCount > 0
      case 'settings': return false // User manually completes
      default: return false
    }
  }, [categoriesCount, dishesCount, tablesCount])

  // Auto-advance to next incomplete step
  useEffect(() => {
    const step = STEPS[currentStep]
    if (step && isStepDone(step.id)) {
      const nextIncomplete = STEPS.findIndex((s, i) => i > currentStep && !isStepDone(s.id))
      if (nextIncomplete >= 0) {
        setCurrentStep(nextIncomplete)
      }
    }
  }, [categoriesCount, dishesCount, tablesCount, currentStep, isStepDone])

  const completedCount = STEPS.filter(s => isStepDone(s.id)).length
  const step = STEPS[currentStep]

  const handleAction = () => {
    setActiveTab(step.tab)
  }

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
      setActiveTab(STEPS[currentStep + 1].tab)
    } else {
      onComplete()
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9998]">
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-zinc-950/98 border-t border-emerald-500/20 backdrop-blur-xl shadow-[0_-20px_40px_-10px_rgba(0,0,0,0.8)]"
      >
        {/* Top bar */}
        <div className="bg-gradient-to-r from-emerald-600/20 via-emerald-500/10 to-transparent border-b border-white/5 px-4 sm:px-6 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkle size={16} weight="fill" className="text-emerald-400" />
            <span className="text-sm font-bold text-emerald-400">Configurazione Guidata</span>
            <span className="text-xs text-zinc-500 hidden sm:inline">— {completedCount}/{STEPS.length} completati</span>
          </div>
          <button
            onClick={onComplete}
            className="text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1 text-xs"
          >
            <X size={14} />
            <span className="hidden sm:inline">Chiudi</span>
          </button>
        </div>

        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4">
          {/* Progress bar */}
          <div className="flex items-center gap-2 mb-4">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                onClick={() => { setCurrentStep(i); setActiveTab(s.tab) }}
                className="flex items-center gap-1.5 flex-1"
              >
                <div className={`flex items-center justify-center w-6 h-6 rounded-full shrink-0 transition-all ${
                  isStepDone(s.id)
                    ? 'bg-emerald-500 text-white'
                    : i === currentStep
                      ? 'bg-amber-500 text-black'
                      : 'bg-zinc-800 text-zinc-500'
                }`}>
                  {isStepDone(s.id) ? (
                    <CheckCircle size={16} weight="fill" />
                  ) : (
                    <span className="text-xs font-bold">{i + 1}</span>
                  )}
                </div>
                <div className={`h-1 flex-1 rounded-full ${
                  i < STEPS.length - 1
                    ? isStepDone(s.id) ? 'bg-emerald-500/40' : 'bg-zinc-800'
                    : 'hidden'
                }`} />
              </button>
            ))}
          </div>

          {/* Step content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              transition={{ duration: 0.2 }}
              className="flex items-start justify-between gap-4"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {isStepDone(step.id) ? (
                    <CheckCircle size={18} weight="fill" className="text-emerald-400" />
                  ) : (
                    <Circle size={18} className="text-zinc-600" />
                  )}
                  <h3 className="text-base font-bold text-white">{step.title}</h3>
                </div>
                <p className="text-zinc-400 text-sm leading-relaxed pl-[26px]">
                  {step.description}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {!isStepDone(step.id) && (
                  <button
                    onClick={handleAction}
                    className="h-9 px-5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-all flex items-center gap-1.5 shadow-[0_4px_12px_-4px_rgba(245,158,11,0.5)]"
                  >
                    {step.ctaLabel}
                    <ArrowRight size={14} />
                  </button>
                )}
                {isStepDone(step.id) && currentStep < STEPS.length - 1 && (
                  <button
                    onClick={handleNext}
                    className="h-9 px-5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm transition-all flex items-center gap-1.5"
                  >
                    Prossimo
                    <ArrowRight size={14} />
                  </button>
                )}
                {currentStep === STEPS.length - 1 && (
                  <button
                    onClick={onComplete}
                    className="h-9 px-5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm transition-all flex items-center gap-1.5"
                  >
                    Completa
                    <CheckCircle size={14} weight="fill" />
                  </button>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}
