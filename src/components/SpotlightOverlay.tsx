import React, { useEffect, useState, useRef, useCallback } from 'react'

interface SpotlightOverlayProps {
  targetSelector?: string  // CSS selector e.g. '[data-tour="add-table-btn"]'
  active?: boolean
}

/**
 * Full-screen dark overlay with a "spotlight" cutout on the target element.
 * The target gets a pulsing amber ring and elevated z-index.
 */
const SpotlightOverlay: React.FC<SpotlightOverlayProps> = ({ targetSelector, active = true }) => {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const prevElRef = useRef<Element | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const findAndMeasure = useCallback(() => {
    if (!targetSelector) { setRect(null); return }
    const el = document.querySelector(targetSelector)
    if (!el) {
      // Retry — element might not be rendered yet after tab switch
      retryRef.current = setTimeout(findAndMeasure, 200)
      return
    }

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
  }, [targetSelector])

  useEffect(() => {
    if (!active || !targetSelector) { setRect(null); return }

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
      // Remove class from previous element
      if (prevElRef.current) {
        prevElRef.current.classList.remove('spotlight-target')
        prevElRef.current = null
      }
    }
  }, [active, targetSelector, findAndMeasure])

  if (!active) return null

  // If no target or not found yet, just show dark overlay
  if (!rect) {
    return (
      <div
        className="fixed inset-0 bg-black/60 transition-opacity duration-300"
        style={{ zIndex: 9997, pointerEvents: 'none' }}
      />
    )
  }

  const pad = 8 // padding around the element

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
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.70)',
            transition: 'all 0.3s ease-in-out',
          }}
        />

        {/* Pulsing amber ring */}
        <div
          className="absolute rounded-xl animate-pulse"
          style={{
            top: rect.top - pad - 2,
            left: rect.left - pad - 2,
            width: rect.width + pad * 2 + 4,
            height: rect.height + pad * 2 + 4,
            border: '2px solid rgba(245, 158, 11, 0.6)',
            boxShadow: '0 0 20px rgba(245, 158, 11, 0.3), inset 0 0 20px rgba(245, 158, 11, 0.1)',
            transition: 'all 0.3s ease-in-out',
          }}
        />
      </div>

      {/* Global CSS for spotlight target */}
      <style>{`
        .spotlight-target {
          position: relative !important;
          z-index: 9999 !important;
        }
      `}</style>
    </>
  )
}

export default SpotlightOverlay
