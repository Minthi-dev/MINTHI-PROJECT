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
          className="w-[380px] max-w-[calc(100vw-24px)]"
          style={{
            ...getCardPosition(),
            zIndex: 10000,
          }}
        >
          <div className="bg-zinc-950 border border-emerald-500/25 rounded-2xl shadow-2xl overflow-hidden">
            {/* Top bar — clear exit button */}
            <div className="bg-emerald-950/50 border-b border-white/5 px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkle size={16} weight="fill" className="text-emerald-400" />
                <span className="text-sm font-bold text-emerald-400">Configurazione</span>
                <span className="text-xs text-zinc-400 font-bold">{currentStep + 1}/{steps.length}</span>
              </div>
              <button onClick={onComplete} className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-sm font-medium transition-colors bg-white/5 hover:bg-white/10 rounded-lg px-3 py-1.5">
                <X size={14} weight="bold" />
                Esci
              </button>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 bg-zinc-800">
              <div
                className="h-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
              />
            </div>

            <div className="p-4">
              {/* Title */}
              <div className="flex items-center gap-2.5 mb-2">
                {isStepDone(step.id) ? (
                  <CheckCircle size={22} weight="fill" className="text-emerald-400 shrink-0" />
                ) : (
                  <Circle size={22} className="text-zinc-600 shrink-0" />
                )}
                <h3 className="text-lg font-bold text-white leading-tight flex-1">{step.title}</h3>
                <span className="text-xs font-bold text-emerald-500/80 bg-emerald-500/10 px-2 py-1 rounded-full shrink-0">
                  {currentStep + 1}/{steps.length}
                </span>
              </div>

              {/* Short description */}
              <p className="text-zinc-300 text-sm leading-relaxed mb-3">
                {step.shortDescription}
              </p>

              {/* Action hint */}
              {!isStepDone(step.id) && (
                <div className="bg-amber-500/8 border border-amber-500/15 rounded-xl px-3 py-2.5 mb-3">
                  <p className="text-amber-400 text-sm font-medium flex items-start gap-2">
                    <Lightbulb size={16} weight="fill" className="mt-0.5 shrink-0" />
                    <span>{step.actionHint}</span>
                  </p>
                </div>
              )}

              {/* Details */}
              <details className="mb-3 group">
                <summary className="text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors select-none font-medium">
                  Maggiori dettagli ▸
                </summary>
                <div className="text-zinc-400 text-xs leading-relaxed mt-2 space-y-1 border-l-2 border-zinc-800 pl-3">
                  {step.fullExplanation.split('\n').filter(Boolean).map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              </details>

              {/* Settings note */}
              <p className="text-zinc-600 text-xs text-center mb-3">
                Puoi sempre riavviare da <strong className="text-zinc-400">Impostazioni</strong>
              </p>

              {/* Navigation */}
              <div className="flex items-center justify-between gap-2">
                {/* Progress dots */}
                <div className="flex items-center gap-1 flex-wrap max-w-[140px]">
                  {steps.map((s, i) => (
                    <button
                      key={s.id}
                      onClick={() => handleStepClick(i)}
                      className={`rounded-full transition-all duration-300 ${
                        isStepDone(s.id)
                          ? 'w-2.5 h-2.5 bg-emerald-500'
                          : i === currentStep
                            ? 'w-5 h-2.5 bg-amber-500'
                            : 'w-2.5 h-2.5 bg-zinc-700 hover:bg-zinc-500'
                      }`}
                    />
                  ))}
                </div>

                {/* Buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  {currentStep > 0 && (
                    <button
                      onClick={handlePrev}
                      className="h-9 px-3 rounded-xl border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-all text-sm font-semibold flex items-center gap-1"
                    >
                      <ArrowLeft size={14} />
                    </button>
                  )}
                  {currentStep < steps.length - 1 ? (
                    <button
                      onClick={handleNext}
                      className={`h-9 px-4 rounded-xl font-bold text-sm transition-all flex items-center gap-1.5 ${
                        isStepDone(step.id)
                          ? 'bg-emerald-500 hover:bg-emerald-400 text-white'
                          : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white'
                      }`}
                    >
                      {isStepDone(step.id) ? 'Avanti' : 'Salta'}
                      <ArrowRight size={14} />
                    </button>
                  ) : (
                    <button
                      onClick={onComplete}
                      className="h-9 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm transition-all flex items-center gap-1.5"
                    >
                      Completa
                      <CheckCircle size={16} weight="fill" />
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
