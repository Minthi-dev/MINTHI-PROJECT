import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Circle, ArrowRight, ArrowLeft, X, Sparkle, Phone, Lightbulb } from '@phosphor-icons/react'
import { SETUP_STEPS } from './demoData'
import SpotlightOverlay from './SpotlightOverlay'

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
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)

  const steps = SETUP_STEPS

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

  const handleRectChange = useCallback((rect: DOMRect | null) => {
    setTargetRect(rect)
  }, [])

  // Floating card position — same logic as DemoGuidePanel
  const getCardPosition = (): React.CSSProperties => {
    if (!targetRect) {
      return { position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)' }
    }

    const cardWidth = 400
    const cardHeight = 320
    const gap = 20
    const vw = window.innerWidth
    const vh = window.innerHeight

    // Below target
    const belowTop = targetRect.bottom + gap
    if (belowTop + cardHeight < vh - 20) {
      const left = Math.max(16, Math.min(targetRect.left, vw - cardWidth - 16))
      return { position: 'fixed', top: `${belowTop}px`, left: `${left}px` }
    }

    // Above target
    if (targetRect.top - gap - cardHeight > 20) {
      const left = Math.max(16, Math.min(targetRect.left, vw - cardWidth - 16))
      return { position: 'fixed', bottom: `${vh - targetRect.top + gap}px`, left: `${left}px` }
    }

    // Right of target
    const rightLeft = targetRect.right + gap
    if (rightLeft + cardWidth < vw - 16) {
      const top = Math.max(60, Math.min(targetRect.top, vh - cardHeight - 16))
      return { position: 'fixed', top: `${top}px`, left: `${rightLeft}px` }
    }

    // Fallback: bottom center
    return { position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)' }
  }

  return (
    <>
      {/* Spotlight on current step's target */}
      {step.highlightSelector && (
        <SpotlightOverlay
          targetSelector={step.highlightSelector}
          active={true}
          onRectChange={handleRectChange}
        />
      )}

      {/* Floating guide card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 10, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.97 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="w-[400px] max-w-[calc(100vw-32px)]"
          style={{
            ...getCardPosition(),
            zIndex: 10000,
          }}
        >
          <div className="bg-zinc-950/95 backdrop-blur-xl border border-emerald-500/25 rounded-2xl shadow-[0_20px_60px_-10px_rgba(0,0,0,0.8)] overflow-hidden">
            {/* Top bar */}
            <div className="bg-gradient-to-r from-emerald-600/20 via-emerald-500/10 to-transparent border-b border-white/5 px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkle size={14} weight="fill" className="text-emerald-400" />
                <span className="text-xs font-bold text-emerald-400">Configurazione</span>
                <span className="text-[10px] text-zinc-500">{completedCount}/{steps.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <a href="tel:+393517570155" className="text-zinc-600 hover:text-amber-400 text-[10px] flex items-center gap-1 transition-colors">
                  <Phone size={10} />
                  Aiuto
                </a>
                <button onClick={onComplete} className="text-zinc-600 hover:text-zinc-300 transition-colors">
                  <X size={12} />
                </button>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-1 bg-zinc-800">
              <div
                className="h-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
              />
            </div>

            <div className="p-4 sm:p-5">
              {/* Title */}
              <div className="flex items-center gap-2 mb-2">
                {isStepDone(step.id) ? (
                  <CheckCircle size={18} weight="fill" className="text-emerald-400 shrink-0" />
                ) : (
                  <Circle size={18} className="text-zinc-600 shrink-0" />
                )}
                <h3 className="text-base font-bold text-white leading-tight">{step.title}</h3>
                <span className="text-[10px] font-bold text-emerald-500/60 bg-emerald-500/10 px-1.5 py-0.5 rounded-full shrink-0 ml-auto">
                  {currentStep + 1}/{steps.length}
                </span>
              </div>

              {/* Short description */}
              <p className="text-zinc-300 text-[13px] leading-relaxed mb-2">
                {step.shortDescription}
              </p>

              {/* Action hint */}
              {!isStepDone(step.id) && (
                <div className="bg-amber-500/8 border border-amber-500/15 rounded-lg px-3 py-2 mb-2">
                  <p className="text-amber-400 text-xs font-medium flex items-start gap-2">
                    <Lightbulb size={13} weight="fill" className="mt-0.5 shrink-0" />
                    <span>{step.actionHint}</span>
                  </p>
                </div>
              )}

              {/* Details */}
              <details className="mb-3 group">
                <summary className="text-[11px] text-zinc-600 hover:text-zinc-400 cursor-pointer transition-colors select-none">
                  Maggiori dettagli ▸
                </summary>
                <div className="text-zinc-500 text-[11px] leading-relaxed mt-1.5 space-y-1 border-l-2 border-zinc-800 pl-2.5">
                  {step.fullExplanation.split('\n').filter(Boolean).map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              </details>

              {/* Navigation */}
              <div className="flex items-center justify-between gap-2 pt-1">
                {/* Progress dots */}
                <div className="flex items-center gap-1 flex-wrap max-w-[160px]">
                  {steps.map((s, i) => (
                    <button
                      key={s.id}
                      onClick={() => handleStepClick(i)}
                      className={`rounded-full transition-all duration-300 ${
                        isStepDone(s.id)
                          ? 'w-2 h-2 bg-emerald-500'
                          : i === currentStep
                            ? 'w-4 h-2 bg-amber-500'
                            : 'w-2 h-2 bg-zinc-700 hover:bg-zinc-500'
                      }`}
                    />
                  ))}
                </div>

                {/* Buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  {currentStep > 0 && (
                    <button
                      onClick={handlePrev}
                      className="h-8 px-3 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-all text-xs font-semibold flex items-center gap-1"
                    >
                      <ArrowLeft size={12} />
                    </button>
                  )}
                  {currentStep < steps.length - 1 ? (
                    <button
                      onClick={handleNext}
                      className={`h-8 px-4 rounded-lg font-bold text-xs transition-all flex items-center gap-1.5 ${
                        isStepDone(step.id)
                          ? 'bg-emerald-500 hover:bg-emerald-400 text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                      }`}
                    >
                      {isStepDone(step.id) ? 'Avanti' : 'Salta'}
                      <ArrowRight size={12} />
                    </button>
                  ) : (
                    <button
                      onClick={onComplete}
                      className="h-8 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs transition-all flex items-center gap-1.5"
                    >
                      Completa
                      <CheckCircle size={12} weight="fill" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  )
}
