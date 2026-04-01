import { useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowRight, ArrowLeft, X, CaretUp, CaretDown, CheckCircle,
  ClockCounterClockwise, MapPin, BookOpen, Calendar, ChartBar, Gear,
  Sparkle, RocketLaunch
} from '@phosphor-icons/react'
import { DEMO_TOUR_STEPS, FEATURE_SECTIONS } from './demoData'
import SpotlightOverlay from './SpotlightOverlay'

const ICON_MAP: Record<string, React.ElementType> = {
  ClockCounterClockwise,
  MapPin,
  BookOpen,
  Calendar,
  ChartBar,
  Gear,
}

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; icon: string; dot: string }> = {
  amber:   { bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   text: 'text-amber-400',   icon: 'text-amber-500',   dot: 'bg-amber-500' },
  emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', icon: 'text-emerald-500', dot: 'bg-emerald-500' },
  sky:     { bg: 'bg-sky-500/10',     border: 'border-sky-500/20',     text: 'text-sky-400',     icon: 'text-sky-500',     dot: 'bg-sky-500' },
  violet:  { bg: 'bg-violet-500/10',  border: 'border-violet-500/20',  text: 'text-violet-400',  icon: 'text-violet-500',  dot: 'bg-violet-500' },
  rose:    { bg: 'bg-rose-500/10',    border: 'border-rose-500/20',    text: 'text-rose-400',    icon: 'text-rose-500',    dot: 'bg-rose-500' },
  zinc:    { bg: 'bg-zinc-500/10',    border: 'border-zinc-500/20',    text: 'text-zinc-400',    icon: 'text-zinc-400',    dot: 'bg-zinc-500' },
}

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
  const isSummary = step.phase === 'summary'
  const isLast = currentStep === steps.length - 1

  // Group navigation data
  const groups = useMemo(() => {
    const seen = new Map<string, { name: string; firstIdx: number; lastIdx: number; color: string }>()
    steps.forEach((s, i) => {
      if (!s.group || s.phase === 'summary') return
      if (!seen.has(s.group)) {
        const section = FEATURE_SECTIONS.find(fs => fs.firstStepIndex === i) ||
          FEATURE_SECTIONS.find(fs => s.tab === fs.tab)
        seen.set(s.group, { name: s.group, firstIdx: i, lastIdx: i, color: section?.color || 'amber' })
      } else {
        seen.get(s.group)!.lastIdx = i
      }
    })
    return Array.from(seen.values())
  }, [steps])

  const currentGroup = useMemo(() => {
    if (!step.group) return null
    return groups.find(g => g.name === step.group) || null
  }, [step, groups])

  const goTo = useCallback((idx: number) => {
    console.log('goTo called with idx:', idx)
    const s = steps[idx]
    if (!s) return
    console.log('goTo: setting step to', idx, 'tab:', s.tab)
    setCurrentStep(idx)
    setActiveTab(s.tab)
    if (s.subTab && setSettingsSubTab) {
      setTimeout(() => setSettingsSubTab(s.subTab!), 250)
    }
  }, [steps, setCurrentStep, setActiveTab, setSettingsSubTab])

  const handleNext = () => {
    console.log('handleNext called, currentStep:', currentStep, 'isLast:', isLast)
    if (isLast) onExit()
    else goTo(currentStep + 1)
  }

  const handlePrev = () => {
    if (currentStep > 0) goTo(currentStep - 1)
  }

  // Step number within current group
  const stepInGroup = currentGroup
    ? currentStep - currentGroup.firstIdx + 1
    : 0
  const groupTotal = currentGroup
    ? currentGroup.lastIdx - currentGroup.firstIdx + 1
    : 0

  return (
    <>
      {/* Spotlight overlay — only during tour steps */}
      {!isSummary && step.highlightSelector && (
        <SpotlightOverlay
          targetSelector={step.highlightSelector}
          active={!collapsed}
        />
      )}

      {/* Top banner */}
      <div className="fixed top-0 left-0 right-0 z-[9999] pointer-events-none">
        <div className="pointer-events-auto bg-amber-500 text-black px-4 py-1.5 flex items-center justify-center gap-4 text-sm font-medium">
          <span><strong>DEMO</strong> — Dati di esempio</span>
          <button
            onClick={onExit}
            className="flex items-center gap-1 text-xs font-bold bg-black/20 hover:bg-black/30 rounded-full px-3 py-1 transition-colors"
          >
            <X size={10} weight="bold" />
            Esci
          </button>
        </div>
      </div>

      {/* Summary Page (step 0) */}
      <AnimatePresence>
        {isSummary && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[9998] bg-black/85 backdrop-blur-md overflow-y-auto"
          >
            <div className="min-h-full flex items-center justify-center p-4 py-16">
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 30 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.4, type: 'spring', bounce: 0.2 }}
                className="max-w-3xl w-full"
              >
                {/* Header */}
                <div className="text-center mb-8">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.3, type: 'spring', bounce: 0.5 }}
                    className="w-16 h-16 bg-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-500/30"
                  >
                    <Sparkle size={32} weight="fill" className="text-black" />
                  </motion.div>
                  <h1 className="text-3xl sm:text-4xl font-black text-white mb-2">
                    Benvenuto in <span className="text-amber-500">MINTHI</span>
                  </h1>
                  <p className="text-zinc-400 text-base sm:text-lg max-w-md mx-auto">
                    Il gestionale completo per il tuo ristorante. Ecco cosa puoi fare.
                  </p>
                </div>

                {/* Feature cards grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
                  {FEATURE_SECTIONS.map((section, i) => {
                    const Icon = ICON_MAP[section.icon] || Gear
                    const colors = COLOR_MAP[section.color] || COLOR_MAP.amber
                    return (
                      <motion.button
                        key={section.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 + i * 0.08 }}
                        onClick={() => goTo(section.firstStepIndex)}
                        className={`text-left p-4 rounded-2xl ${colors.bg} border ${colors.border} hover:scale-[1.02] transition-all duration-200 group cursor-pointer`}
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <div className={`w-10 h-10 rounded-xl ${colors.bg} border ${colors.border} flex items-center justify-center`}>
                            <Icon size={22} weight="duotone" className={colors.icon} />
                          </div>
                          <h3 className="text-lg font-bold text-white group-hover:text-amber-400 transition-colors">
                            {section.title}
                          </h3>
                        </div>
                        <div className="space-y-1.5">
                          {section.features.map((f, j) => (
                            <div key={j} className="flex items-start gap-2">
                              <CheckCircle size={14} weight="fill" className={`${colors.text} mt-0.5 shrink-0 opacity-60`} />
                              <span className="text-sm text-zinc-300">{f}</span>
                            </div>
                          ))}
                        </div>
                      </motion.button>
                    )
                  })}
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                    onClick={() => goTo(1)}
                    className="h-12 px-8 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-base flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all hover:scale-105"
                  >
                    <RocketLaunch size={20} weight="fill" />
                    Inizia il Tour
                  </motion.button>
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8 }}
                    onClick={onExit}
                    className="h-10 px-6 rounded-xl text-zinc-500 hover:text-zinc-300 font-medium text-sm transition-colors"
                  >
                    Salta Tour
                  </motion.button>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom guide panel — only during tour steps */}
      {!isSummary && (
        <div className="fixed bottom-0 left-0 right-0 z-[9999]">
          <AnimatePresence mode="wait">
            {!collapsed ? (
              <motion.div
                key="open"
                initial={{ y: 80, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 80, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="bg-zinc-950 border-t border-amber-500/30"
              >
                <button
                  onClick={() => setCollapsed(true)}
                  className="absolute -top-7 right-4 bg-zinc-900 border border-zinc-700 rounded-t-lg px-3 py-1 text-zinc-500 hover:text-white text-xs flex items-center gap-1"
                >
                  <CaretDown size={12} /> Nascondi
                </button>

                <div className="max-w-2xl mx-auto px-4 py-3">
                  {/* Group breadcrumbs */}
                  <div className="flex items-center gap-1 mb-3 overflow-x-auto pb-1 scrollbar-hide">
                    {groups.map((g) => {
                      const colors = COLOR_MAP[g.color] || COLOR_MAP.amber
                      const isActive = currentGroup?.name === g.name
                      return (
                        <button
                          key={g.name}
                          onClick={() => goTo(g.firstIdx)}
                          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                            isActive
                              ? `${colors.bg} ${colors.text} border ${colors.border}`
                              : 'text-zinc-600 hover:text-zinc-400'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${isActive ? colors.dot : 'bg-zinc-700'}`} />
                          {g.name}
                        </button>
                      )
                    })}
                  </div>

                  {/* Step content */}
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentStep}
                      initial={{ opacity: 0, x: 15 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -15 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="flex items-start gap-3 mb-3">
                        {currentGroup && (
                          <span className={`${COLOR_MAP[currentGroup.color]?.dot || 'bg-amber-500'} text-black text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5`}>
                            {stepInGroup}/{groupTotal}
                          </span>
                        )}
                        <div>
                          <h3 className="text-lg font-bold text-white">{step.title}</h3>
                          <p className="text-sm text-zinc-400 mt-0.5">{step.description}</p>
                        </div>
                      </div>
                    </motion.div>
                  </AnimatePresence>

                  {/* Navigation */}
                  <div className="flex items-center justify-between">
                    {/* Progress bar */}
                    <div className="flex items-center gap-0.5 flex-1 mr-4">
                      {groups.map((g) => {
                        const colors = COLOR_MAP[g.color] || COLOR_MAP.amber
                        const total = g.lastIdx - g.firstIdx + 1
                        const filled = Math.max(0, Math.min(total, currentStep - g.firstIdx + 1))
                        const pct = currentStep >= g.firstIdx ? (filled / total) * 100 : 0
                        return (
                          <div key={g.name} className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${colors.dot} rounded-full transition-all duration-500`}
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                        )
                      })}
                    </div>

                    {/* Buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                      {currentStep > 1 && (
                        <button
                          onClick={handlePrev}
                          className="h-8 px-3 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 text-xs font-semibold flex items-center gap-1"
                        >
                          <ArrowLeft size={12} />
                        </button>
                      )}
                      <button
                        onClick={handleNext}
                        className="h-8 px-5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1.5"
                      >
                        {isLast ? 'Fine Demo' : 'Avanti'}
                        {!isLast && <ArrowRight size={12} />}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="collapsed"
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 40, opacity: 0 }}
                className="flex justify-center pb-3"
              >
                <button
                  onClick={() => setCollapsed(false)}
                  className="bg-zinc-900 border border-amber-500/30 rounded-full px-5 py-2 shadow-lg flex items-center gap-2 hover:bg-zinc-800 transition-colors"
                >
                  <CaretUp size={14} className="text-amber-500" />
                  <span className="text-sm font-bold text-white">{step.title}</span>
                  <span className="text-xs text-zinc-500">{currentStep}/{steps.length - 1}</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </>
  )
}
