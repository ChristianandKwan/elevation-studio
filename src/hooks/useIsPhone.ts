'use client'

import { useSyncExternalStore } from 'react'

/** Must match the phone breakpoint in studio.css (and the portal's, in client-portal.css). */
export const PHONE_QUERY = '(max-width: 640px)'

function subscribe(onChange: () => void) {
  const query = window.matchMedia(PHONE_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/**
 * True on a phone-width screen. Follows the screen, so a phone turned on its
 * side is judged at its new width. False while rendering on the server.
 */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(PHONE_QUERY).matches, () => false)
}
