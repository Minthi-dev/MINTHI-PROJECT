import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Circle, ArrowRight, X, Sparkle, Info, Phone } from '@phosphor-icons/react'
import { SETUP_STEPS } from './demoData'

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
  const [showDetail, setShowDetail] = useState(false)

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

  const step = steps[currentStep]
  const completedCount = steps.filter(s => isStepDone(s.id)).length

  const handleStepClick = (i: number) => {
    setCurrentStep(i)
    setActiveTab(steps[i].tab)
    setShowDetail(false)
  }

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
      setActiveTab(steps[currentStep + 1].tab)
      setShowDetail(false)
    } else {
      onComplete()
    }
  }

  return (
    <>
      {/* Detail popup — NOT blocking, positioned center but dismissible */}
      <AnimatePresence>
        {showDetail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            style={{ zIndex: 9999 }}
            onClick={() => setShowDetail(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', damping: 25 }}
              className="bg-zinc-950 border border-emerald-500/20 rounded-2xl p-6 max-w-md w-full shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="bg-emerald-500/10 text-emerald-400 text-xs font-bold px-2.5 py-1 rounded-full">
                  Passo {currentStep + 1}/{steps.length}
                </span>
              </div>
              <h2 className="text-xl font-bold text-white mb-3">{step.title}</h2>
              <div className="text-zinc-300 text-sm leading-relaxed space-y-2 max-h-[40vh] overflow-y-auto">
                {step.fullExplanation.split('\n').map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
              <button
                onClick={() => setShowDetail(false)}
                className="mt-5 w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm px-6 py-2.5 rounded-xl transition-all"
              >
                Ho capito
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom panel — always visible, non-blocking */}
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
            {/* Progress steps */}
            <div className="flex items-center gap-1.5 mb-4">
              {steps.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => handleStepClick(i)}
                  className="flex items-center gap-1 flex-1"
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
                      <span className="text-sm font-bold">{i + 1}</span>
                    )}
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`h-1 flex-1 rounded-full ${
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
                  <div className="flex-1">
                    {/* Title */}
                    <div className="flex items-center gap-2 mb-1">
                      {isStepDone(step.id) ? (
                        <CheckCircle size={20} weight="fill" className="text-emerald-400" />
                      ) : (
                        <Circle size={20} className="text-zinc-600" />
                      )}
                      <h3 className="text-lg font-bold text-white">{step.title}</h3>
                    </div>
                    {/* Short description */}
                    <p className="text-zinc-400 text-sm pl-7 mb-1">
                      {step.shortDescription}
                    </p>
                    {/* Action hint — clear instruction */}
                    {!isStepDone(step.id) && (
                      <p className="text-amber-400 text-sm font-semibold pl-7">
                        {step.actionHint}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 pt-1">
                    <button
                      onClick={() => setShowDetail(true)}
                      className="h-9 w-9 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 text-xs font-semibold transition-all flex items-center justify-center"
                      title="Maggiori informazioni"
                    >
                      <Info size={16} />
                    </button>
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
    </>
  )
}
