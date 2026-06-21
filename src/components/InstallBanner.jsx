import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Download, Plus, Share, X } from 'lucide-react'
import { usePwaInstall } from '../hooks/usePwaInstall.js'

// Soft "install the app" banner (CLAUDE.md §3; Stage 11C).
//
// Sits above the tab bar. On Chromium it offers a one-tap install button backed
// by the captured `beforeinstallprompt`. On iOS Safari (no such event) there is
// no programmatic install, so the banner is itself tappable and opens a small
// bottom sheet with the manual "Share → Add to Home Screen" steps. Either way
// the user can dismiss the banner for good (remembered in localStorage), and it
// never appears once installed.
export default function InstallBanner() {
  const { t } = useTranslation()
  const { canPrompt, isIOS, dismissed, promptInstall, dismiss } = usePwaInstall()
  const [sheetOpen, setSheetOpen] = useState(false)

  if (dismissed) return null
  if (!canPrompt && !isIOS) return null

  return (
    <>
      <div className="install-banner" role="region" aria-label={t('install.title')}>
        {isIOS ? (
          // No programmatic install on iOS — the whole banner opens the how-to sheet.
          <button
            type="button"
            className="install-banner__main"
            onClick={() => setSheetOpen(true)}
          >
            <span className="install-banner__icon" aria-hidden="true">
              <Download size={20} strokeWidth={1.75} />
            </span>
            <span className="install-banner__body">
              <span className="install-banner__title">{t('install.title')}</span>
              <span className="install-banner__hint">
                <Share size={15} strokeWidth={1.75} aria-hidden="true" />
                {t('install.iosHint')}
              </span>
            </span>
            <ChevronRight
              className="install-banner__chevron"
              size={18}
              aria-hidden="true"
            />
          </button>
        ) : (
          <>
            <span className="install-banner__icon" aria-hidden="true">
              <Download size={20} strokeWidth={1.75} />
            </span>
            <div className="install-banner__body">
              <span className="install-banner__title">{t('install.title')}</span>
              <span className="install-banner__hint">{t('install.subtitle')}</span>
            </div>
            {canPrompt && (
              <button
                type="button"
                className="install-banner__cta"
                onClick={promptInstall}
              >
                {t('install.button')}
              </button>
            )}
          </>
        )}
        <button
          type="button"
          className="install-banner__close"
          onClick={dismiss}
          aria-label={t('install.dismiss')}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      {sheetOpen && <IosInstallSheet onClose={() => setSheetOpen(false)} />}
    </>
  )
}

// Bottom sheet with the iOS "Add to Home Screen" walkthrough. Closes via the X,
// a tap on the dimmed backdrop, a swipe down, or Escape.
function IosInstallSheet({ onClose }) {
  const { t } = useTranslation()
  const [dragY, setDragY] = useState(0)
  const startY = useRef(null)

  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function onTouchStart(event) {
    startY.current = event.touches[0].clientY
  }
  function onTouchMove(event) {
    if (startY.current == null) return
    const dy = event.touches[0].clientY - startY.current
    // Follow the finger downward only; an upward drag does nothing.
    if (dy > 0) setDragY(dy)
  }
  function onTouchEnd() {
    if (dragY > 80) onClose()
    else setDragY(0)
    startY.current = null
  }

  return (
    <div
      className="install-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={t('install.iosSheetTitle')}
      onClick={onClose}
    >
      <div
        className="install-sheet__panel"
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
        onClick={(event) => event.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <span className="install-sheet__grabber" aria-hidden="true" />
        <button
          type="button"
          className="install-sheet__close"
          onClick={onClose}
          aria-label={t('install.close')}
        >
          <X size={18} aria-hidden="true" />
        </button>

        <div className="install-sheet__head">
          <span className="install-sheet__icon" aria-hidden="true">
            <Download size={26} strokeWidth={1.75} />
          </span>
          <h2 className="install-sheet__title">{t('install.iosSheetTitle')}</h2>
          <p className="install-sheet__intro">{t('install.iosSheetIntro')}</p>
        </div>

        <ol className="install-sheet__steps">
          <li className="install-sheet__step">
            <span className="install-sheet__num" aria-hidden="true">
              1
            </span>
            <span className="install-sheet__text">{t('install.iosStep1')}</span>
            <span className="install-sheet__badge" aria-hidden="true">
              <Share size={18} strokeWidth={2} />
            </span>
          </li>
          <li className="install-sheet__step">
            <span className="install-sheet__num" aria-hidden="true">
              2
            </span>
            <span className="install-sheet__text">{t('install.iosStep2')}</span>
            <span className="install-sheet__badge" aria-hidden="true">
              <Plus size={18} strokeWidth={2} />
            </span>
          </li>
          <li className="install-sheet__step">
            <span className="install-sheet__num" aria-hidden="true">
              3
            </span>
            <span className="install-sheet__text">{t('install.iosStep3')}</span>
          </li>
        </ol>
      </div>
    </div>
  )
}
