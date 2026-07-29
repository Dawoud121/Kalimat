import { useEffect } from 'react'
import { createPortal } from 'react-dom'

/**
 * Renders children into document.body via a portal.
 * - Removes the modal from the page's DOM tree, so no scroll-into-view fires.
 * - Locks body scroll while mounted.
 * - Fixes position:fixed containment on any overflow:hidden/clip ancestor.
 */
export default function ModalPortal({ children }) {
  useEffect(() => {
    const prev = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    return () => { document.documentElement.style.overflow = prev }
  }, [])
  return createPortal(children, document.body)
}
