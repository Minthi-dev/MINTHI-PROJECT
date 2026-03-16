import React, { useEffect, useState, useRef, useCallback } from 'react'

interface SpotlightOverlayProps {
  targetSelector?: string
  active?: boolean
  onRectChange?: (rect: DOMRect | null) => void
}

const SpotlightOverlay: React.FC<SpotlightOverlayProps> = ({ targetSelector, active = true, onRectChange }) => {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const prevElRef = useRef<Element | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const retryCountRef = useRef(0)

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

    if (prevElRef.current && prevElRef.current !== el) {
      prevElRef.current.classList.remove('spotlight-target')
    }
    el.classList.add('spotlight-target')
    prevElRef.current = el

    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })

    requestAnimationFrame(() => {
      const newRect = el.getBoundingClientRect()
      setRect(prev => {
        if (!prev || Math.abs(prev.top - newRect.top) > 1 || Math.abs(prev.left - newRect.left) > 1 ||
            Math.abs(prev.width - newRect.width) > 1 || Math.abs(prev.height - newRect.height) > 1) {
          return newRect
        }
        return prev
      })
    })
  }, [targetSelector, cleanupPrevTarget])

  // Notify parent of rect changes
  useEffect(() => {
    onRectChange?.(rect)
  }, [rect, onRectChange])

  // Add/remove spotlight-active class on body
  useEffect(() => {
    if (active && targetSelector) {
      document.body.classList.add('spotlight-active')
    }
    return () => {
      document.body.classList.remove('spotlight-active')
    }
  }, [active, targetSelector])

  useEffect(() => {
    if (!active || !targetSelector) {
      setRect(null)
      cleanupPrevTarget()
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }

    const t = setTimeout(findAndMeasure, 150)
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
      <div
        className="fixed inset-0 transition-opacity duration-300"
        style={{ zIndex: 9997, pointerEvents: 'none' }}
      >
        <div
          className="absolute rounded-xl"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
            transition: 'all 0.3s ease-in-out',
          }}
        />
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

      <style>{`
        .spotlight-target {
          position: relative !important;
          z-index: 9998 !important;
        }
        /* Elevate Radix UI portals above the spotlight when active */
        .spotlight-active [data-radix-portal] {
          z-index: 10001 !important;
        }
        .spotlight-active [data-radix-portal] > div {
          z-index: 10001 !important;
        }
        .spotlight-active [role="dialog"] {
          z-index: 10002 !important;
        }
        .spotlight-active [data-radix-popper-content-wrapper] {
          z-index: 10003 !important;
        }
      `}</style>
    </>
  )
}

export default SpotlightOverlay
