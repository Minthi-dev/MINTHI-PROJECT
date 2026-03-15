import React, { useEffect, useState, useRef, useCallback } from 'react'

interface SpotlightOverlayProps {
  targetSelector?: string
  active?: boolean
}

const SpotlightOverlay: React.FC<SpotlightOverlayProps> = ({ targetSelector, active = true }) => {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const prevElRef = useRef<Element | null>(null)
  const rafRef = useRef<number>(0)

  const cleanup = useCallback(() => {
    document.querySelectorAll('.spotlight-target').forEach(el => {
      el.classList.remove('spotlight-target')
    })
    prevElRef.current = null
  }, [])

  const measure = useCallback(() => {
    if (!targetSelector || !active) {
      setRect(null)
      cleanup()
      return
    }

    const el = document.querySelector(targetSelector)
    if (!el) {
      setRect(null)
      return
    }

    // Add class for z-index elevation
    if (prevElRef.current && prevElRef.current !== el) {
      prevElRef.current.classList.remove('spotlight-target')
    }
    el.classList.add('spotlight-target')
    prevElRef.current = el

    const r = el.getBoundingClientRect()
    setRect(prev => {
      if (!prev || Math.abs(prev.top - r.top) > 1 || Math.abs(prev.left - r.left) > 1 ||
          Math.abs(prev.width - r.width) > 1 || Math.abs(prev.height - r.height) > 1) {
        return r
      }
      return prev
    })
  }, [targetSelector, active, cleanup])

  useEffect(() => {
    if (!active || !targetSelector) {
      setRect(null)
      cleanup()
      return
    }

    // Initial measure with delay for tab transitions
    const t = setTimeout(() => {
      measure()
      // Scroll target into view
      const el = document.querySelector(targetSelector)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 200)

    // Continuous re-measurement via rAF for smooth tracking
    let running = true
    const tick = () => {
      if (!running) return
      measure()
      rafRef.current = requestAnimationFrame(tick)
    }
    // Start polling after initial delay
    const pollTimer = setTimeout(() => { tick() }, 300)

    // Also listen for resize/scroll
    const handleChange = () => measure()
    window.addEventListener('resize', handleChange)
    window.addEventListener('scroll', handleChange, true)

    return () => {
      running = false
      clearTimeout(t)
      clearTimeout(pollTimer)
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', handleChange)
      window.removeEventListener('scroll', handleChange, true)
      cleanup()
    }
  }, [active, targetSelector, measure, cleanup])

  if (!active || !rect) return null

  const pad = 10

  return (
    <>
      {/* Dark overlay with cutout */}
      <div
        className="fixed inset-0"
        style={{ zIndex: 9997, pointerEvents: 'none' }}
      >
        {/* Box-shadow cutout */}
        <div
          className="absolute rounded-xl"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)',
            transition: 'top 0.3s, left 0.3s, width 0.3s, height 0.3s',
          }}
        />

        {/* Pulsing amber border */}
        <div
          className="absolute rounded-xl animate-pulse"
          style={{
            top: rect.top - pad - 2,
            left: rect.left - pad - 2,
            width: rect.width + pad * 2 + 4,
            height: rect.height + pad * 2 + 4,
            border: '2px solid rgba(245, 158, 11, 0.6)',
            transition: 'top 0.3s, left 0.3s, width 0.3s, height 0.3s',
          }}
        />
      </div>

      <style>{`
        .spotlight-target {
          position: relative !important;
          z-index: 9998 !important;
        }
      `}</style>
    </>
  )
}

export default SpotlightOverlay
