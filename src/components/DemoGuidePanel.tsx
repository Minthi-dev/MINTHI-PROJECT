import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, ArrowLeft, X, CaretUp, CaretDown, Lightbulb } from '@phosphor-icons/react'
import { DEMO_TOUR_STEPS, APP_FEATURES } from './demoData'
import SpotlightOverlay from './SpotlightOverlay'

interface DemoGuidePanelProps {
  currentStep: number
  setCurrentStep: (step: number) => void
  setActiveTab: (tab: string) => void
  onExit: () => void
  setSettingsSubTab?: (tab: string) => void
}

export default function DemoGuidePanel({
  currentStep,
  setCurrentStep,
  setActiveTab,
  onExit,
  setSettingsSubTab,
}: DemoGuidePanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const steps = DEMO_TOUR_STEPS
  const step = steps[currentStep] || steps[0]
  const isFirst = currentStep === 0
  const isLast = currentStep === steps.length - 1

  const goTo = useCallback((idx: number) => {
    const s = steps[idx]
    if (!s) return
    setCurrentStep(idx)
    setActiveTab(s.tab)
    if (s.subTab && setSettingsSubTab) {
      setTimeout(() => setSettingsSubTab(s.subTab!), 150)
    }
  }, [steps, setCurrentStep, setActiveTab, setSettingsSubTab])

  const handleNext = () => {
    if (isLast) onExit()
    else goTo(currentStep + 1)
  }

  const handlePrev = () => {
    if (!isFirst) goTo(currentStep - 1)
  }

  // Only show spotlight when step has a specific element to highlight
  const hasSpotlight = !!step.highlightSelector && !step.isSummary

  return (
    <>
      {/* Spotlight overlay — only when step targets a specific element */}
      {hasSpotlight && (
        <SpotlightOverlay
          targetSelector={step.highlightSelector}
          active={!collapsed}
        />
      )}

      {/* Top banner — always visible */}
      <div className="fixed top-0 left-0 right-0 z-[10000] pointer-events-none">
        <div className="pointer-events-auto bg-amber-500 text-black px-4 py-2 flex items-center justify-center gap-4 shadow-lg text-sm font-medium">
          <span>
            <strong>DEMO</strong> — Dati di esempio. Il tuo ristorante si configurerà dopo.
          </span>
          <button
            onClick={onExit}
            className="flex items-center gap-1 text-xs font-bold bg-black/20 hover:bg-black/30 rounded-full px-3 py-1 transition-colors"
          >
            <X size={10} weight="bold" />
            Esci
          </button>
        </div>
      </div>

      {/* Welcome summary overlay — full-screen card for step 0 */}
      <AnimatePresence>
        {step.isSummary && !collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6"
            style={{ zIndex: 9999 }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', damping: 25 }}
              className="bg-zinc-950 border border-amber-500/20 rounded-3xl p-6 sm:p-10 max-w-2xl w-full shadow-[0_20px_60px_-15px_rgba(245,158,11,0.15)] max-h-[90vh] overflow-y-auto"
            >
              {/* Logo/Title */}
              <div className="text-center mb-6 sm:mb-8">
                <h1 className="text-3xl sm:text-4xl font-black text-white mb-2">
                  Minthi
                </h1>
                <p className="text-zinc-400 text-base sm:text-lg">
                  Gestione completa del tuo ristorante
                </p>
                <div className="mt-3 inline-block bg-amber-500/10 border border-amber-500/20 rounded-full px-4 py-1.5">
                  <span className="text-amber-400 text-sm font-semibold">Demo Interattiva</span>
                </div>
              </div>

              {/* Features grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
                {APP_FEATURES.map((f, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-white/5 border border-white/10 rounded-xl p-3 sm:p-4 text-center hover:bg-white/8 transition-colors"
                  >
                    <span className="text-2xl sm:text-3xl block mb-2">{f.icon}</span>
                    <h3 className="text-white text-xs sm:text-sm font-bold mb-1 leading-tight">{f.title}</h3>
                    <p className="text-zinc-500 text-[10px] sm:text-xs leading-tight">{f.description}</p>
                  </motion.div>
                ))}
              </div>

              {/* Info */}
              <p className="text-zinc-500 text-sm text-center mb-6">
                Questa demo usa dati finti. Le modifiche <strong className="text-zinc-300">non vengono salvate</strong>.
                <br />Dopo la demo potrai configurare tutto per il tuo ristorante.
              </p>

              {/* Start button */}
              <div className="text-center">
                <button
                  onClick={handleNext}
                  className="bg-amber-500 hover:bg-amber-400 text-black font-bold text-base sm:text-lg px-8 sm:px-10 py-3 sm:py-4 rounded-2xl transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2 mx-auto"
                >
                  Inizia la Demo
                  <ArrowRight size={20} weight="bold" />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom guide panel — shown for all non-summary steps */}
      {!step.isSummary && (
        <div className="fixed bottom-0 left-0 right-0 z-[9999]">
          <AnimatePresence mode="wait">
            {!collapsed ? (
              <motion.div
                key="panel-open"
                initial={{ y: 80, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 80, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="bg-zinc-950/95 border-t border-amber-500/20 backdrop-blur-xl"
              >
                {/* Collapse button */}
                <button
                  onClick={() => setCollapsed(true)}
                  className="absolute -top-8 right-4 bg-zinc-900 border border-zinc-700 rounded-t-lg px-3 py-1 text-zinc-500 hover:text-white transition-colors text-xs flex items-center gap-1"
                >
                  <CaretDown size={12} />
                  Nascondi
                </button>

                <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 sm:py-5">
                  {/* Step content */}
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentStep}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold text-amber-500/70 bg-amber-500/10 px-2 py-0.5 rounded-full">
                          {currentStep}/{steps.length - 1}
                        </span>
                        <h3 className="text-xl font-bold text-white leading-tight">
                          {step.title}
                        </h3>
                      </div>

                      <p className="text-zinc-200 text-base leading-relaxed mb-3">
                        {step.description}
                      </p>

                      {step.tip && (
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-3">
                          <p className="text-amber-400 text-sm font-medium flex items-start gap-2">
                            <Lightbulb size={16} weight="fill" className="mt-0.5 shrink-0" />
                            {step.tip}
                          </p>
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>

                  {/* Navigation */}
                  <div className="flex items-center justify-between gap-3 pt-1">
                    {/* Progress dots */}
                    <div className="flex items-center gap-1 flex-wrap">
                      {steps.filter(s => !s.isSummary).map((_, i) => (
                        <button
                          key={i}
                          onClick={() => goTo(i + 1)}
                          className={`rounded-full transition-all duration-300 ${
                            i + 1 === currentStep
                              ? 'w-5 h-2.5 bg-amber-500'
                              : i + 1 < currentStep
                                ? 'w-2.5 h-2.5 bg-amber-500/40'
                                : 'w-2.5 h-2.5 bg-zinc-700 hover:bg-zinc-500'
                          }`}
                        />
                      ))}
                    </div>

                    {/* Buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handlePrev}
                        className="h-9 px-4 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-all text-sm font-semibold flex items-center gap-1.5"
                      >
                        <ArrowLeft size={14} />
                        Indietro
                      </button>
                      <button
                        onClick={handleNext}
                        className="h-9 px-6 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-all flex items-center gap-1.5"
                      >
                        {isLast ? 'Fine Demo' : 'Avanti'}
                        {!isLast && <ArrowRight size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="panel-collapsed"
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 40, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex justify-center pb-3"
              >
                <button
                  onClick={() => setCollapsed(false)}
                  className="bg-zinc-900/95 border border-amber-500/30 backdrop-blur-xl rounded-full px-5 py-2.5 shadow-lg flex items-center gap-2 hover:bg-zinc-800/95 transition-colors"
                >
                  <CaretUp size={14} className="text-amber-500" />
                  <span className="text-base font-bold text-white">{step.title}</span>
                  <span className="text-sm text-zinc-500">{currentStep}/{steps.length - 1}</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </>
  )
}
