import { useCallback, useEffect, useState } from 'react'

// PWA install state (CLAUDE.md §3 "Тип: PWA"; Stage 11C).
//
// Two install paths exist and they differ by platform:
//  · Chromium (Android/desktop) fires `beforeinstallprompt`. We capture and stash
//    that event, then replay it from a button the user taps (the event can only
//    be used inside a user gesture).
//  · iOS Safari has no such event — the only way to install is the native
//    Share → "Add to Home Screen". There we show a short text hint instead.
//
// `canPrompt` → show the install button. `isIOS` → show the Safari hint.
// Both are hidden once the app is already running installed (standalone).
const DISMISS_KEY = 'citymate.installDismissed'

function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari exposes this non-standard flag when launched from the home screen.
    window.navigator.standalone === true
  )
}

function detectIOS() {
  const ua = window.navigator.userAgent || ''
  const iOSDevice = /iphone|ipad|ipod/i.test(ua)
  // iPadOS 13+ reports as Mac; detect it by touch support.
  const iPadOS = /macintosh/i.test(ua) && navigator.maxTouchPoints > 1
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua)
  return (iOSDevice || iPadOS) && isSafari
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [installed, setInstalled] = useState(false)
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === '1',
  )

  const standalone = typeof window !== 'undefined' && isStandalone()
  const isIOS = typeof window !== 'undefined' && detectIOS()

  useEffect(() => {
    function onBeforeInstall(event) {
      // Stop Chrome's mini-infobar; we drive the prompt from our own UI.
      event.preventDefault()
      setDeferredPrompt(event)
    }
    function onInstalled() {
      setInstalled(true)
      setDeferredPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    // The event is single-use — drop it whichever way the user chose.
    setDeferredPrompt(null)
    if (outcome === 'accepted') setInstalled(true)
  }, [deferredPrompt])

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }, [])

  return {
    canPrompt: !!deferredPrompt && !standalone && !installed,
    isIOS: isIOS && !standalone && !installed,
    standalone,
    dismissed,
    promptInstall,
    dismiss,
  }
}
