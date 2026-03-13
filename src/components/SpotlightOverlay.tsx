import React, { useEffect, useState, useRef, useCallback } from 'react'

interface SpotlightOverlayProps {
  targetSelector?: string  // CSS selector e.g. '[data-tour="add-table-btn"]'
  active?: boolean
}

/**
 * Full-screen dark overlay with a "spotlight" cutout on the target element.
 * The target gets a subtle amber border. No pulsing ring or large shapes.
 */
const SpotlightOverlay: React.FC<SpotlightOverlayProps> = ({ targetSelector, active = true }) => {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const prevElRef = useRef<Element | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryCountRef = useRef(0)

  // Cleanup any leftover spotlight-target classes
  const cleanupPrevTarget = useCallback(() => {
    if (prevElRef.current) {
      prevElRef.current.classList.remove('spotlight-target')
      prevElRef.current = null
    }
    // Also cleanup any stale spotlight-target classes that might be left
    document.querySelectorAll('.spotlight-target').forEach(el => {
      el.classList.remove('spotlight-target')
    })
  }, [])

  const findAndMeasure = useCallback(() => {
    if (!targetSelector) { setRect(null); cleanupPrevTarget(); return }
    const el = document.querySelector(targetSelector)
    if (!el) {
      if (retryCountRef.current < 10) {
        retryCountRef.current++
        retryRef.current = setTimeout(findAndMeasure, 200)
      } else {
        // Give up - don't show anything
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
      setRect(el.getBoundingClientRect())
    })
  }, [targetSelector, cleanupPrevTarget])

  useEffect(() => {
    if (!active || !targetSelector) {
      setRect(null)
      cleanupPrevTarget()
      return
    }

    // Small delay for tab transitions
    const t = setTimeout(findAndMeasure, 150)

    const handleResize = () => findAndMeasure()
    window.addEventListener('resize', handleResize)
    window.addEventListener('scroll', handleResize, true)

    return () => {
      clearTimeout(t)
      if (retryRef.current) clearTimeout(retryRef.current)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleResize, true)
      cleanupPrevTarget()
    }
  }, [active, targetSelector, findAndMeasure, cleanupPrevTarget])

  if (!active) return null
  if (!rect) return null

  const pad = 8

  return (
    <>
      {/* Dark overlay with cutout */}
      <div
        className="fixed inset-0 transition-opacity duration-300"
        style={{ zIndex: 9997, pointerEvents: 'none' }}
      >
        {/* The spotlight cutout — uses box-shadow to darken everything except the target */}
        <div
          className="absolute rounded-xl"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.60)',
            transition: 'all 0.3s ease-in-out',
          }}
        />

        {/* Subtle amber border — thin, no pulsing, no glow */}
        <div
          className="absolute rounded-xl"
          style={{
            top: rect.top - pad - 1,
            left: rect.left - pad - 1,
            width: rect.width + pad * 2 + 2,
            height: rect.height + pad * 2 + 2,
            border: '2px solid rgba(245, 158, 11, 0.5)',
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
