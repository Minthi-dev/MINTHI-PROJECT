import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, ArrowLeft, X, CaretUp, CaretDown, Lightbulb } from '@phosphor-icons/react'
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
  const hasSpotlight = !!step.highlightSelector

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
      <div className="fixed top-0 left-0 right-0 z-[9999] pointer-events-none">
        <div className="pointer-events-auto bg-amber-500 text-black px-4 py-2 flex items-center justify-center gap-4 shadow-lg text-sm font-medium">
          <span>
            <strong>DEMO</strong> — Dati di esempio. Il tuo ristorante si configurerà dopo.
          </span>
          <button
            onClick={onExit}
            className="flex items-center gap-1 text-xs font-bold bg-black/20 hover:bg-black/30 rounded-full px-3 py-1 transition-colors"
          >
            <X size={10} weight="bold" />
            Esci dalla Demo
          </button>
        </div>
      </div>

      {/* Bottom guide panel */}
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

              <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
                {/* Step content */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentStep}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[11px] font-bold text-amber-500/70 uppercase tracking-wider">
                        {currentStep + 1}/{steps.length}
                      </span>
                      <h3 className="text-lg font-bold text-white leading-tight">
                        {step.title}
                      </h3>
                    </div>

                    <p className="text-zinc-300 text-sm leading-relaxed mb-2">
                      {step.description}
                    </p>

                    {step.tip && (
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-2">
                        <p className="text-amber-400 text-xs font-medium flex items-start gap-2">
                          <Lightbulb size={14} weight="fill" className="mt-0.5 shrink-0" />
                          {step.tip}
                        </p>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>

                {/* Navigation */}
                <div className="flex items-center justify-between gap-3 pt-1">
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
                        className="h-8 px-4 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-all text-xs font-semibold flex items-center gap-1.5"
                      >
                        <ArrowLeft size={13} />
                        Indietro
                      </button>
                    )}
                    <button
                      onClick={handleNext}
                      className="h-8 px-5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition-all flex items-center gap-1.5"
                    >
                      {isLast ? 'Fine Demo' : 'Avanti'}
                      {!isLast && <ArrowRight size={13} />}
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
                className="bg-zinc-900/95 border border-amber-500/30 backdrop-blur-xl rounded-full px-5 py-2 shadow-lg flex items-center gap-2 hover:bg-zinc-800/95 transition-colors"
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
