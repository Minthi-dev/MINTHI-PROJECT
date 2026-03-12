import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, ArrowLeft, X, CaretUp, CaretDown, Eye, Lightbulb } from '@phosphor-icons/react'
import { DEMO_TOUR_STEPS } from './demoData'
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
    // Navigate to settings sub-tab if specified
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

  return (
    <>
      {/* Spotlight overlay on highlighted element */}
      <SpotlightOverlay
        targetSelector={step.highlightSelector}
        active={!collapsed && !!step.highlightSelector}
      />

      {/* Top banner */}
      <div className="sticky top-0 left-0 right-0 z-[9998] bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 text-black px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-2 text-base font-bold">
          <Eye size={18} weight="bold" />
          <span>MODALIT\u00c0 DEMO</span>
          <span className="font-normal opacity-80 hidden sm:inline">\u2014 Stai navigando con dati di esempio</span>
        </div>
        <button
          onClick={onExit}
          className="flex items-center gap-1.5 text-sm font-bold bg-black/20 hover:bg-black/30 rounded-lg px-3 py-1.5 transition-colors"
        >
          <X size={14} weight="bold" />
          Esci dal Demo
        </button>
      </div>

      {/* Bottom guide panel */}
      <div className="fixed bottom-0 left-0 right-0 z-[9998]">
        <AnimatePresence mode="wait">
          {!collapsed ? (
            <motion.div
              key="panel-open"
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="bg-zinc-950/98 border-t border-amber-500/30 backdrop-blur-xl shadow-[0_-20px_40px_-10px_rgba(0,0,0,0.8)]"
            >
              {/* Collapse button */}
              <button
                onClick={() => setCollapsed(true)}
                className="absolute -top-8 right-4 bg-zinc-900 border border-white/10 rounded-t-lg px-3 py-1 text-zinc-500 hover:text-white transition-colors text-xs flex items-center gap-1"
              >
                <CaretDown size={12} />
                Nascondi
              </button>

              <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 sm:py-5">
                {/* Step content */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentStep}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-amber-500 font-bold text-[10px] tracking-widest uppercase">
                            Passo {currentStep + 1} di {steps.length}
                          </span>
                        </div>
                        <h3 className="text-base sm:text-lg font-bold text-white leading-tight">
                          {step.title}
                        </h3>
                      </div>
                    </div>

                    <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed mb-2 max-h-32 overflow-y-auto pr-2">
                      {step.description}
                    </p>

                    {step.tip && (
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-3">
                        <p className="text-amber-400 text-xs font-medium flex items-start gap-1.5">
                          <Lightbulb size={14} weight="fill" className="mt-0.5 shrink-0" />
                          {step.tip}
                        </p>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>

                {/* Navigation */}
                <div className="flex items-center justify-between gap-3">
                  {/* Dots */}
                  <div className="flex items-center gap-1 flex-wrap">
                    {steps.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => goTo(i)}
                        className={`rounded-full transition-all duration-300 ${
                          i === currentStep
                            ? 'w-4 h-2 bg-amber-500'
                            : i < currentStep
                              ? 'w-2 h-2 bg-amber-500/40'
                              : 'w-2 h-2 bg-zinc-700 hover:bg-zinc-500'
                        }`}
                      />
                    ))}
                  </div>

                  {/* Buttons */}
                  <div className="flex items-center gap-2">
                    {!isFirst && (
                      <button
                        onClick={handlePrev}
                        className="h-9 px-4 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-all text-sm font-medium flex items-center gap-1.5"
                      >
                        <ArrowLeft size={14} />
                        <span className="hidden sm:inline">Indietro</span>
                      </button>
                    )}
                    <button
                      onClick={handleNext}
                      className="h-9 px-5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-all flex items-center gap-1.5 shadow-[0_4px_12px_-4px_rgba(245,158,11,0.5)]"
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
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex justify-center pb-3"
            >
              <button
                onClick={() => setCollapsed(false)}
                className="bg-zinc-900/95 border border-amber-500/30 backdrop-blur-xl rounded-full px-5 py-2.5 shadow-lg flex items-center gap-2 hover:bg-zinc-800/95 transition-colors"
              >
                <CaretUp size={14} className="text-amber-500" />
                <span className="text-sm font-bold text-white">{step.title}</span>
                <span className="text-xs text-zinc-500">{currentStep + 1}/{steps.length}</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
