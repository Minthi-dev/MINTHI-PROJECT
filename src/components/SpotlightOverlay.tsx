import React, { useEffect, useState, useRef, useCallback } from 'react'

interface SpotlightOverlayProps {
  targetSelector?: string  // CSS selector e.g. '[data-tour="add-table-btn"]'
  active?: boolean
}

/**
 * Full-screen dark overlay with a "spotlight" cutout on the target element.
 * Re-measures the target every 500ms so the highlight follows layout changes.
 */
const SpotlightOverlay: React.FC<SpotlightOverlayProps> = ({ targetSelector, active = true }) => {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const prevElRef = useRef<Element | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const retryCountRef = useRef(0)

  // Cleanup any leftover spotlight-target classes
  const cleanupPrevTarget = useCallback(() => {
    if (prevElRef.current) {
      prevElRef.current.classList.remove('spotlight-target')
      prevElRef.current = null
    }
    document.querySelectorAll('.spotlight-target').forEach(el => {
      el.classList.remove('spotlight-target')
    })
  }, [])

  const findAndMeasure = useCallback(() => {
    if (!targetSelector) { setRect(null); cleanupPrevTarget(); return }
    const el = document.querySelector(targetSelector)
    if (!el) {
      if (retryCountRef.current < 15) {
        retryCountRef.current++
        retryRef.current = setTimeout(findAndMeasure, 200)
      } else {
        setRect(null)
      }
      return
    }
    retryCountRef.current = 0

    // Elevate element
    if (prevElRef.current && prevElRef.current !== el) {
      prevElRef.current.classList.remove('spotlight-target')
    }
    el.classList.add('spotlight-target')
    prevElRef.current = el

    // Scroll into view if needed
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })

    // Measure after scroll
    requestAnimationFrame(() => {
      const newRect = el.getBoundingClientRect()
      setRect(prev => {
        // Only update if position actually changed (avoids unnecessary re-renders)
        if (!prev || Math.abs(prev.top - newRect.top) > 1 || Math.abs(prev.left - newRect.left) > 1 ||
            Math.abs(prev.width - newRect.width) > 1 || Math.abs(prev.height - newRect.height) > 1) {
          return newRect
        }
        return prev
      })
    })
  }, [targetSelector, cleanupPrevTarget])

  useEffect(() => {
    if (!active || !targetSelector) {
      setRect(null)
      cleanupPrevTarget()
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }

    // Initial find with delay for tab transitions
    const t = setTimeout(findAndMeasure, 150)

    // Periodic re-measurement every 500ms — catches layout changes from user interaction
    intervalRef.current = setInterval(findAndMeasure, 500)

    const handleResize = () => findAndMeasure()
    window.addEventListener('resize', handleResize)
    window.addEventListener('scroll', handleResize, true)

    return () => {
      clearTimeout(t)
      if (retryRef.current) clearTimeout(retryRef.current)
      if (intervalRef.current) clearInterval(intervalRef.current)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleResize, true)
      cleanupPrevTarget()
    }
  }, [active, targetSelector, findAndMeasure, cleanupPrevTarget])

  if (!active) return null
  if (!rect) return null

  const pad = 10

  return (
    <>
      {/* Dark overlay with cutout */}
      <div
        className="fixed inset-0 transition-opacity duration-300"
        style={{ zIndex: 9997, pointerEvents: 'none' }}
      >
        {/* The spotlight cutout */}
        <div
          className="absolute rounded-xl"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)',
            transition: 'all 0.3s ease-in-out',
          }}
        />

        {/* Amber border */}
        <div
          className="absolute rounded-xl"
          style={{
            top: rect.top - pad - 1,
            left: rect.left - pad - 1,
            width: rect.width + pad * 2 + 2,
            height: rect.height + pad * 2 + 2,
            border: '2px solid rgba(245, 158, 11, 0.6)',
            transition: 'all 0.3s ease-in-out',
          }}
        />
      </div>

      {/* Global CSS for spotlight target */}
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
