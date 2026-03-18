import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, ArrowLeft, X, Lightbulb } from '@phosphor-icons/react'
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
  const steps = DEMO_TOUR_STEPS
  const step = steps[currentStep] || steps[0]
  const isFirst = currentStep === 0
  const isLast = currentStep === steps.length - 1
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const goTo = useCallback((idx: number) => {
    const s = steps[idx]
    if (!s) return
    setCurrentStep(idx)
    setActiveTab(s.tab)
    if (s.subTab && setSettingsSubTab) {
      setTimeout(() => {
        setSettingsSubTab(s.subTab!)
        // Also click the settings tab element if it exists
        const tabEl = document.querySelector(`[data-settings-tab="${s.subTab}"]`) as HTMLElement
        if (tabEl) tabEl.click()
      }, 200)
    }
  }, [steps, setCurrentStep, setActiveTab, setSettingsSubTab])

  const handleNext = () => {
    if (isLast) onExit()
    else goTo(currentStep + 1)
  }

  const handlePrev = () => {
    if (!isFirst) goTo(currentStep - 1)
  }

  const handleRectChange = useCallback((rect: DOMRect | null) => {
    setTargetRect(rect)
  }, [])

  const hasSpotlight = !!step.highlightSelector && !step.isSummary

  // Calculate floating card position near the highlighted element
  const getCardPosition = (): React.CSSProperties => {
    if (!targetRect || !hasSpotlight) {
      // Position bottom-right so page content stays visible
      return {
        position: 'fixed',
        bottom: '24px',
        right: '24px',
      }
    }

    const cardWidth = 380
    const cardHeight = 280
    const gap = 20
    const vw = window.innerWidth
    const vh = window.innerHeight

    // Try below the target first
    const belowTop = targetRect.bottom + gap
    if (belowTop + cardHeight < vh - 20) {
      let left = Math.max(16, Math.min(targetRect.left, vw - cardWidth - 16))
      return { position: 'fixed', top: `${belowTop}px`, left: `${left}px` }
    }

    // Try above the target
    const aboveBottom = vh - targetRect.top + gap
    if (targetRect.top - gap - cardHeight > 20) {
      let left = Math.max(16, Math.min(targetRect.left, vw - cardWidth - 16))
      return { position: 'fixed', bottom: `${aboveBottom}px`, left: `${left}px` }
    }

    // Try to the right
    const rightLeft = targetRect.right + gap
    if (rightLeft + cardWidth < vw - 16) {
      let top = Math.max(60, Math.min(targetRect.top, vh - cardHeight - 16))
      return { position: 'fixed', top: `${top}px`, left: `${rightLeft}px` }
    }

    // Fallback: bottom center
    return {
      position: 'fixed',
      bottom: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
    }
  }

  // Non-summary steps count (for progress)
  const contentSteps = steps.filter(s => !s.isSummary)
  const currentContentIdx = contentSteps.findIndex(s => s.id === step.id)

  return (
    <>
      {/* Spotlight overlay */}
      {hasSpotlight && (
        <SpotlightOverlay
          targetSelector={step.highlightSelector}
          active={true}
          onRectChange={handleRectChange}
        />
      )}

      {/* Top banner — subtle, not intrusive */}
      <div className="fixed top-0 left-0 right-0 z-[10000] pointer-events-none" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="pointer-events-auto bg-violet-600 text-white px-4 py-2.5 flex items-center justify-between shadow-lg">
          <span className="text-sm font-bold tracking-wide">
            ● DEMO — Dati di esempio
          </span>
          <button
            onClick={onExit}
            className="flex items-center gap-1.5 text-sm font-bold bg-white/20 hover:bg-white/30 rounded-xl px-4 py-2 transition-colors"
          >
            <X size={14} weight="bold" />
            Esci
          </button>
        </div>
      </div>

      {/* Welcome summary overlay */}
      <AnimatePresence>
        {step.isSummary && (
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
              className="bg-zinc-950 border border-violet-500/20 rounded-3xl p-6 sm:p-10 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="text-center mb-6 sm:mb-8">
                <h1 className="text-3xl sm:text-4xl font-black text-white mb-2">Minthi</h1>
                <p className="text-zinc-400 text-base sm:text-lg">Gestione completa del tuo ristorante</p>
                <div className="mt-3 inline-block bg-violet-500/15 border border-violet-500/25 rounded-full px-4 py-1.5">
                  <span className="text-violet-300 text-sm font-semibold">Demo Interattiva</span>
                </div>
              </div>

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

              <p className="text-zinc-500 text-sm text-center mb-6">
                Questa demo usa dati finti. Le modifiche <strong className="text-zinc-300">non vengono salvate</strong>.
                <br />Dopo la demo potrai configurare tutto per il tuo ristorante.
              </p>

              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={handleNext}
                  className="bg-violet-600 hover:bg-violet-500 text-white font-bold text-base sm:text-lg px-8 sm:px-10 py-3 sm:py-4 rounded-2xl transition-all shadow-lg shadow-violet-500/20 flex items-center gap-2"
                >
                  Inizia la Demo
                  <ArrowRight size={20} weight="bold" />
                </button>
                <button
                  onClick={onExit}
                  className="text-zinc-500 hover:text-white text-sm font-medium transition-colors py-2 px-4"
                >
                  Salta e configura direttamente →
                </button>
                <p className="text-zinc-600 text-xs text-center mt-2">
                  Puoi sempre riavviare la demo da <strong className="text-zinc-400">Impostazioni</strong>
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating guide card — positioned near the highlighted element */}
      {!step.isSummary && (
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            ref={cardRef}
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="w-[380px] max-w-[calc(100vw-32px)]"
            style={{
              ...getCardPosition(),
              zIndex: 10000,
            }}
          >
            <div className="bg-zinc-950 border border-violet-500/30 rounded-2xl shadow-2xl overflow-hidden">
              {/* Progress bar */}
              <div className="h-1.5 bg-zinc-800">
                <div
                  className="h-full bg-violet-500 transition-all duration-500"
                  style={{ width: `${((currentContentIdx + 1) / contentSteps.length) * 100}%` }}
                />
              </div>

              <div className="p-4 sm:p-5">
                {/* Step counter + title + exit */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-xs font-bold text-violet-300 bg-violet-500/15 px-2.5 py-1 rounded-full shrink-0">
                    {currentContentIdx + 1}/{contentSteps.length}
                  </span>
                  <button onClick={onExit} className="text-zinc-400 hover:text-white text-xs font-medium flex items-center gap-1.5 bg-white/5 hover:bg-white/10 rounded-lg px-3 py-1.5 transition-colors">
                    <X size={12} weight="bold" />
                    Esci
                  </button>
                </div>
                <h3 className="text-xl font-bold text-white leading-tight mb-2">
                  {step.title}
                </h3>

                {/* Description */}
                <p className="text-zinc-300 text-[15px] leading-relaxed mb-3">
                  {step.description}
                </p>

                {/* Tip */}
                {step.tip && (
                  <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl px-3 py-2.5 mb-3">
                    <p className="text-violet-300 text-sm font-medium flex items-start gap-2">
                      <Lightbulb size={16} weight="fill" className="mt-0.5 shrink-0" />
                      <span>{step.tip}</span>
                    </p>
                  </div>
                )}

                {/* Navigation */}
                <div className="flex items-center justify-between gap-2 pt-1">
                  {/* Progress dots */}
                  <div className="flex items-center gap-1 flex-wrap max-w-[140px]">
                    {contentSteps.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => goTo(i + 1)}
                        className={`rounded-full transition-all duration-300 ${
                          i === currentContentIdx
                            ? 'w-5 h-2.5 bg-violet-500'
                            : i < currentContentIdx
                              ? 'w-2.5 h-2.5 bg-violet-500/40'
                              : 'w-2.5 h-2.5 bg-zinc-700 hover:bg-zinc-500'
                        }`}
                      />
                    ))}
                  </div>

                  {/* Buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    {currentContentIdx > 0 && (
                      <button
                        onClick={handlePrev}
                        className="h-9 px-3 rounded-xl border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-all text-sm font-semibold flex items-center gap-1"
                      >
                        <ArrowLeft size={14} />
                      </button>
                    )}
                    <button
                      onClick={handleNext}
                      className="h-9 px-5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm transition-all flex items-center gap-1.5"
                    >
                      {isLast ? 'Fine Demo' : 'Avanti'}
                      {!isLast && <ArrowRight size={14} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </>
  )
}
