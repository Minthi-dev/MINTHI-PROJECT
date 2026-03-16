import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Circle, ArrowRight, ArrowLeft, X, Sparkle, Phone, Lightbulb } from '@phosphor-icons/react'
import { SETUP_STEPS } from './demoData'

interface SetupWizardProps {
  setActiveTab: (tab: string) => void
  onComplete: () => void
  tablesCount: number
  dishesCount: number
  categoriesCount: number
  setSettingsSubTab?: (tab: string) => void
}

export default function SetupWizard({
  setActiveTab,
  onComplete,
  tablesCount,
  dishesCount,
  categoriesCount,
  setSettingsSubTab,
}: SetupWizardProps) {
  const [currentStep, setCurrentStep] = useState(0)

  const steps = SETUP_STEPS

  // Navigate to the current step's tab
  const navigateToStep = useCallback((i: number) => {
    const s = steps[i]
    if (!s) return
    setActiveTab(s.tab)
    if (s.subTab && setSettingsSubTab) {
      setTimeout(() => {
        setSettingsSubTab(s.subTab!)
        const tabEl = document.querySelector(`[data-settings-tab="${s.subTab}"]`) as HTMLElement
        if (tabEl) tabEl.click()
      }, 200)
    }
  }, [steps, setActiveTab, setSettingsSubTab])

  // Navigate to first step on mount
  useEffect(() => {
    navigateToStep(0)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const isStepDone = useCallback((id: string) => {
    const ctx = { categoriesCount, dishesCount, tablesCount }
    const s = steps.find(st => st.id === id)
    return s ? s.checkFn(ctx) : false
  }, [categoriesCount, dishesCount, tablesCount, steps])

  const step = steps[currentStep]
  const completedCount = steps.filter(s => isStepDone(s.id)).length

  const handleStepClick = (i: number) => {
    setCurrentStep(i)
    navigateToStep(i)
  }

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      const next = currentStep + 1
      setCurrentStep(next)
      navigateToStep(next)
    } else {
      onComplete()
    }
  }

  const handlePrev = () => {
    if (currentStep > 0) {
      const prev = currentStep - 1
      setCurrentStep(prev)
      navigateToStep(prev)
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9998]">
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="bg-zinc-950/98 border-t border-emerald-500/20 backdrop-blur-xl shadow-[0_-20px_40px_-10px_rgba(0,0,0,0.8)]"
      >
        {/* Top bar */}
        <div className="bg-gradient-to-r from-emerald-600/20 via-emerald-500/10 to-transparent border-b border-white/5 px-4 sm:px-6 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkle size={16} weight="fill" className="text-emerald-400" />
            <span className="text-sm font-bold text-emerald-400">Configurazione Guidata</span>
            <span className="text-xs text-zinc-500">{completedCount}/{steps.length}</span>
          </div>
          <div className="flex items-center gap-3">
            <a href="tel:+393517570155" className="text-zinc-600 hover:text-amber-400 text-xs flex items-center gap-1 transition-colors">
              <Phone size={12} />
              Aiuto
            </a>
            <button
              onClick={onComplete}
              className="text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1 text-xs"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4">
          {/* Progress steps — scrollable on mobile */}
          <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
            {steps.map((s, i) => (
              <button
                key={s.id}
                onClick={() => handleStepClick(i)}
                className="flex items-center gap-1 shrink-0"
              >
                <div className={`flex items-center justify-center w-7 h-7 rounded-full shrink-0 transition-all ${
                  isStepDone(s.id)
                    ? 'bg-emerald-500 text-white'
                    : i === currentStep
                      ? 'bg-amber-500 text-black'
                      : 'bg-zinc-800 text-zinc-500'
                }`}>
                  {isStepDone(s.id) ? (
                    <CheckCircle size={18} weight="fill" />
                  ) : (
                    <span className="text-[11px] font-bold">{i + 1}</span>
                  )}
                </div>
                {i < steps.length - 1 && (
                  <div className={`h-0.5 w-4 sm:w-6 rounded-full ${
                    isStepDone(s.id) ? 'bg-emerald-500/40' : 'bg-zinc-800'
                  }`} />
                )}
              </button>
            ))}
          </div>

          {/* Current step content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Title */}
                  <div className="flex items-center gap-2 mb-1.5">
                    {isStepDone(step.id) ? (
                      <CheckCircle size={20} weight="fill" className="text-emerald-400 shrink-0" />
                    ) : (
                      <Circle size={20} className="text-zinc-600 shrink-0" />
                    )}
                    <h3 className="text-lg font-bold text-white truncate">{step.title}</h3>
                  </div>

                  {/* Short description */}
                  <p className="text-zinc-400 text-sm pl-7 mb-1.5">
                    {step.shortDescription}
                  </p>

                  {/* Action hint — clear instruction */}
                  {!isStepDone(step.id) && (
                    <div className="pl-7 flex items-start gap-1.5">
                      <Lightbulb size={14} weight="fill" className="text-amber-400 mt-0.5 shrink-0" />
                      <p className="text-amber-400 text-sm font-semibold">
                        {step.actionHint}
                      </p>
                    </div>
                  )}

                  {/* Inline explanation — collapsed by default, shown in muted text */}
                  <details className="pl-7 mt-2 group">
                    <summary className="text-xs text-zinc-600 hover:text-zinc-400 cursor-pointer transition-colors select-none">
                      Maggiori dettagli ▸
                    </summary>
                    <div className="text-zinc-500 text-xs leading-relaxed mt-2 space-y-1.5 border-l-2 border-zinc-800 pl-3">
                      {step.fullExplanation.split('\n').filter(Boolean).map((line, i) => (
                        <p key={i}>{line}</p>
                      ))}
                    </div>
                  </details>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0 pt-1">
                  {currentStep > 0 && (
                    <button
                      onClick={handlePrev}
                      className="h-9 w-9 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 text-xs font-semibold transition-all flex items-center justify-center"
                    >
                      <ArrowLeft size={16} />
                    </button>
                  )}
                  {currentStep < steps.length - 1 ? (
                    <button
                      onClick={handleNext}
                      className={`h-9 px-5 rounded-lg font-bold text-sm transition-all flex items-center gap-1.5 ${
                        isStepDone(step.id)
                          ? 'bg-emerald-500 hover:bg-emerald-400 text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                      }`}
                    >
                      {isStepDone(step.id) ? 'Avanti' : 'Salta'}
                      <ArrowRight size={14} />
                    </button>
                  ) : (
                    <button
                      onClick={onComplete}
                      className="h-9 px-5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm transition-all flex items-center gap-1.5"
                    >
                      Completa
                      <CheckCircle size={14} weight="fill" />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}
