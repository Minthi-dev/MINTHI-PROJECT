import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Circle, ArrowRight, X, Sparkle, Phone } from '@phosphor-icons/react'
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
  const [showExplanation, setShowExplanation] = useState(true)

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

  // Auto-advance to next incomplete step when current is done (without showing explanation again)
  useEffect(() => {
    const step = steps[currentStep]
    if (step && isStepDone(step.id)) {
      const nextIncomplete = steps.findIndex((s, i) => i > currentStep && !isStepDone(s.id))
      if (nextIncomplete >= 0) {
        setCurrentStep(nextIncomplete)
        setShowExplanation(false) // Don't re-show explanation on auto-advance
        setActiveTab(steps[nextIncomplete].tab)
      }
    }
  }, [categoriesCount, dishesCount, tablesCount, currentStep, isStepDone, steps, setActiveTab])

  const step = steps[currentStep]
  const completedCount = steps.filter(s => isStepDone(s.id)).length

  const handleStepClick = (i: number) => {
    setCurrentStep(i)
    setActiveTab(steps[i].tab)
    setShowExplanation(true)
  }

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
      setActiveTab(steps[currentStep + 1].tab)
      setShowExplanation(true)
    } else {
      onComplete()
    }
  }

  return (
    <>
      {/* Spotlight overlay — only when explanation is dismissed */}
      <SpotlightOverlay
        targetSelector={step.highlightSelector}
        active={!showExplanation && !isStepDone(step.id)}
      />

      {/* Central explanation overlay */}
      <AnimatePresence>
        {showExplanation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            style={{ zIndex: 9999 }}
            onClick={() => setShowExplanation(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 25 }}
              className="bg-zinc-950 border border-emerald-500/20 rounded-2xl p-6 sm:p-8 max-w-lg w-full shadow-[0_20px_60px_-15px_rgba(16,185,129,0.2)]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Step indicator */}
              <div className="flex items-center gap-2 mb-4">
                <span className="bg-emerald-500/10 text-emerald-400 text-xs font-bold px-2.5 py-1 rounded-full">
                  Passo {currentStep + 1} di {steps.length}
                </span>
                {isStepDone(step.id) && (
                  <span className="bg-emerald-500/10 text-emerald-400 text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
                    <CheckCircle size={12} weight="fill" /> Completato
                  </span>
                )}
              </div>

              {/* Title */}
              <h2 className="text-xl sm:text-2xl font-bold text-white mb-4">{step.title}</h2>

              {/* Full explanation — renders newlines properly */}
              <div className="text-zinc-300 text-sm leading-relaxed space-y-3 max-h-[50vh] overflow-y-auto pr-2">
                {step.fullExplanation.split('\n\n').map((para, i) => (
                  <p key={i} className={para.startsWith('\u2022') ? 'pl-1' : ''}>
                    {para.split('\n').map((line, j) => (
                      <span key={j}>
                        {j > 0 && <br />}
                        {line}
                      </span>
                    ))}
                  </p>
                ))}
              </div>

              {/* Action button */}
              <div className="mt-6 flex items-center justify-between">
                <p className="text-zinc-600 text-xs flex items-center gap-1.5">
                  <Phone size={12} />
                  Aiuto: <a href="tel:+393517570155" className="text-amber-400/70 hover:text-amber-400">+39 351 757 0155</a>
                </p>
                <button
                  onClick={() => setShowExplanation(false)}
                  className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm px-6 py-2.5 rounded-xl transition-all shadow-lg"
                >
                  Ho capito
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom panel */}
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
              <span className="text-xs text-zinc-500 hidden sm:inline">{'\u2014'} {completedCount}/{steps.length} completati</span>
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
              {steps.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => handleStepClick(i)}
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
                    i < steps.length - 1
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
                    {step.shortDescription}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Info button to re-read explanation */}
                  <button
                    onClick={() => setShowExplanation(true)}
                    className="h-9 px-3 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 text-xs font-semibold transition-all"
                  >
                    ?
                  </button>
                  {/* Next step button */}
                  {currentStep < steps.length - 1 ? (
                    <button
                      onClick={handleNext}
                      className={`h-9 px-5 rounded-lg font-bold text-sm transition-all flex items-center gap-1.5 ${
                        isStepDone(step.id)
                          ? 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-[0_4px_12px_-4px_rgba(16,185,129,0.5)]'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                      }`}
                    >
                      {isStepDone(step.id) ? 'Prossimo passo' : 'Salta'}
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
              </motion.div>
            </AnimatePresence>

            {/* Phone help */}
            <p className="text-zinc-600 text-[10px] text-center mt-3">
              Hai bisogno di aiuto? <a href="tel:+393517570155" className="text-amber-400/60 hover:text-amber-400">+39 351 757 0155</a>
            </p>
          </div>
        </motion.div>
      </div>
    </>
  )
}
