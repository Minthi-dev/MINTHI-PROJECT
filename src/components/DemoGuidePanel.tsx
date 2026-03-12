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

      {/* Top banner — compact floating pill */}
      <div className="sticky top-0 left-0 right-0 z-[9998] flex justify-center py-2 pointer-events-none">
        <div className="pointer-events-auto bg-amber-500/90 backdrop-blur-md text-black px-5 py-2 rounded-full flex items-center gap-3 shadow-lg shadow-amber-500/20">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Eye size={16} weight="bold" />
            <span>DEMO</span>
            <span className="font-normal opacity-70 hidden sm:inline">{'\u2014'} Dati di esempio</span>
          </div>
          <button
            onClick={onExit}
            className="flex items-center gap-1 text-xs font-bold bg-black/20 hover:bg-black/30 rounded-full px-3 py-1 transition-colors"
          >
            <X size={12} weight="bold" />
            Esci
          </button>
        </div>
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
              className="bg-zinc-950 border-t border-amber-500/30 backdrop-blur-xl shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.9)]"
            >
              {/* Collapse button */}
              <button
                onClick={() => setCollapsed(true)}
                className="absolute -top-9 right-4 bg-zinc-900 border border-zinc-700 rounded-t-lg px-3 py-1.5 text-zinc-500 hover:text-white transition-colors text-xs flex items-center gap-1"
              >
                <CaretDown size={12} />
                Nascondi
              </button>

              <div className="max-w-3xl mx-auto px-5 sm:px-8 py-5 sm:py-6">
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
                        <span className="text-amber-500 font-bold text-xs tracking-widest uppercase">
                          Passo {currentStep + 1} di {steps.length}
                        </span>
                        <h3 className="text-xl sm:text-2xl font-bold text-white leading-tight mt-1">
                          {step.title}
                        </h3>
                      </div>
                    </div>

                    <p className="text-zinc-300 text-sm sm:text-base leading-relaxed mb-3 max-h-36 overflow-y-auto pr-2">
                      {step.description}
                    </p>

                    {step.tip && (
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2.5 mb-4">
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
                  {/* Dots */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {steps.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => goTo(i)}
                        className={`rounded-full transition-all duration-300 ${
                          i === currentStep
                            ? 'w-5 h-2.5 bg-amber-500'
                            : i < currentStep
                              ? 'w-2.5 h-2.5 bg-amber-500/40'
                              : 'w-2.5 h-2.5 bg-zinc-700 hover:bg-zinc-500'
                        }`}
                      />
                    ))}
                  </div>

                  {/* Buttons */}
                  <div className="flex items-center gap-2.5">
                    {!isFirst && (
                      <button
                        onClick={handlePrev}
                        className="h-10 px-5 rounded-xl border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-all text-sm font-semibold flex items-center gap-2"
                      >
                        <ArrowLeft size={15} />
                        <span className="hidden sm:inline">Indietro</span>
                      </button>
                    )}
                    <button
                      onClick={handleNext}
                      className="h-10 px-6 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-all flex items-center gap-2 shadow-[0_4px_16px_-4px_rgba(245,158,11,0.5)]"
                    >
                      {isLast ? 'Fine Demo' : 'Avanti'}
                      {!isLast && <ArrowRight size={15} />}
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
              className="flex justify-center pb-4"
            >
              <button
                onClick={() => setCollapsed(false)}
                className="bg-zinc-900/95 border border-amber-500/30 backdrop-blur-xl rounded-full px-6 py-3 shadow-lg flex items-center gap-2.5 hover:bg-zinc-800/95 transition-colors"
              >
                <CaretUp size={16} className="text-amber-500" />
                <span className="text-base font-bold text-white">{step.title}</span>
                <span className="text-sm text-zinc-500">{currentStep + 1}/{steps.length}</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
