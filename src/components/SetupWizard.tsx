import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, ArrowRight, X, Sparkle, Wrench } from '@phosphor-icons/react'
import { SETUP_STEPS } from './demoData'
import SpotlightOverlay from './SpotlightOverlay'

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
  const steps = SETUP_STEPS

  // Navigate to the first step's tab on mount
  useEffect(() => {
    setActiveTab(steps[0].tab)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const isStepDone = useCallback((id: string) => {
    const ctx = { categoriesCount, dishesCount, tablesCount }
    const s = steps.find(st => st.id === id)
    return s ? s.checkFn(ctx) : false
  }, [categoriesCount, dishesCount, tablesCount, steps])

  // Auto-advance when step is completed
  useEffect(() => {
    const step = steps[currentStep]
    if (step && isStepDone(step.id)) {
      const nextIncomplete = steps.findIndex((s, i) => i > currentStep && !isStepDone(s.id))
      if (nextIncomplete >= 0) {
        setTimeout(() => {
          setCurrentStep(nextIncomplete)
          setActiveTab(steps[nextIncomplete].tab)
        }, 600)
      }
    }
  }, [categoriesCount, dishesCount, tablesCount, currentStep, isStepDone, steps, setActiveTab])

  const step = steps[currentStep]
  const done = isStepDone(step.id)
  const completedCount = steps.filter(s => isStepDone(s.id)).length

  const handleStepClick = (i: number) => {
    setCurrentStep(i)
    setActiveTab(steps[i].tab)
  }

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      const next = currentStep + 1
      setCurrentStep(next)
      setActiveTab(steps[next].tab)
    } else {
      onComplete()
    }
  }

  return (
    <>
      {/* Spotlight on the target button - active only when step is NOT done */}
      {!done && (
        <SpotlightOverlay
          targetSelector={step.highlightSelector}
          active={true}
        />
      )}

      {/* Top banner */}
      <div className="fixed top-0 left-0 right-0 z-[9998] pointer-events-none">
        <div className="pointer-events-auto bg-emerald-600 text-white px-4 py-1.5 flex items-center justify-center gap-4 text-sm font-medium">
          <Wrench size={14} weight="bold" />
          <span><strong>CONFIGURAZIONE GUIDATA</strong> — {completedCount}/{steps.length} completati</span>
          <button
            onClick={onComplete}
            className="flex items-center gap-1 text-xs font-bold bg-black/20 hover:bg-black/30 rounded-full px-3 py-1 transition-colors"
          >
            <X size={10} weight="bold" />
            Chiudi
          </button>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-[9998]">
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="bg-gradient-to-t from-zinc-950 to-zinc-950/95 border-t border-emerald-500/30"
        >
          <div className="max-w-2xl mx-auto px-4 py-5">
            {/* Progress circles */}
            <div className="flex items-center gap-1 mb-4">
              {steps.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => handleStepClick(i)}
                  className="flex items-center gap-0 flex-1"
                >
                  <motion.div
                    animate={i === currentStep ? { scale: [1, 1.15, 1] } : {}}
                    transition={{ duration: 0.4 }}
                    className={`flex items-center justify-center w-9 h-9 rounded-full shrink-0 transition-all text-sm font-bold ${
                      isStepDone(s.id)
                        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                        : i === currentStep
                          ? 'bg-amber-500 text-black ring-2 ring-amber-500/30 shadow-lg shadow-amber-500/20'
                          : 'bg-zinc-800 text-zinc-500'
                    }`}
                  >
                    {isStepDone(s.id) ? (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', bounce: 0.6 }}
                      >
                        <CheckCircle size={20} weight="fill" />
                      </motion.div>
                    ) : (
                      i + 1
                    )}
                  </motion.div>
                  {i < steps.length - 1 && (
                    <div className={`h-0.5 flex-1 mx-1 rounded-full transition-all duration-500 ${
                      isStepDone(s.id) ? 'bg-emerald-500/40' : 'bg-zinc-800'
                    }`} />
                  )}
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
                className="flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {done ? (
                      <CheckCircle size={22} weight="fill" className="text-emerald-400 shrink-0" />
                    ) : (
                      <Sparkle size={22} weight="fill" className="text-amber-500 shrink-0" />
                    )}
                    <h3 className="text-xl font-bold text-white truncate">{step.title}</h3>
                  </div>
                  <p className="text-zinc-300 text-base mt-1 pl-8">{step.instruction}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {currentStep < steps.length - 1 ? (
                    <button
                      onClick={handleNext}
                      className={`h-10 px-6 rounded-xl font-bold text-sm flex items-center gap-1.5 transition-all ${
                        done
                          ? 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/20'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                      }`}
                    >
                      {done ? 'Prossimo' : 'Salta'} <ArrowRight size={14} />
                    </button>
                  ) : (
                    <button
                      onClick={onComplete}
                      className="h-10 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm flex items-center gap-1.5 shadow-lg shadow-emerald-500/20"
                    >
                      Completa <CheckCircle size={14} weight="fill" />
                    </button>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </>
  )
}
