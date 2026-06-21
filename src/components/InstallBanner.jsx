import { useTranslation } from 'react-i18next'
import { Download, Share, X } from 'lucide-react'
import { usePwaInstall } from '../hooks/usePwaInstall.js'

// Soft "install the app" banner (CLAUDE.md §3; Stage 11C).
//
// Sits above the tab bar. On Chromium it offers a one-tap install button backed
// by the captured `beforeinstallprompt`. On iOS Safari (no such event) it shows
// the manual "Share → Add to Home Screen" hint. Either way the user can dismiss
// it for good (remembered in localStorage), and it never appears once installed.
export default function InstallBanner() {
  const { t } = useTranslation()
  const { canPrompt, isIOS, dismissed, promptInstall, dismiss } = usePwaInstall()

  if (dismissed) return null
  if (!canPrompt && !isIOS) return null

  return (
    <div className="install-banner" role="region" aria-label={t('install.title')}>
      <span className="install-banner__icon" aria-hidden="true">
        <Download size={20} strokeWidth={1.75} />
      </span>
      <div className="install-banner__body">
        <span className="install-banner__title">{t('install.title')}</span>
        {isIOS ? (
          <span className="install-banner__hint">
            <Share size={15} strokeWidth={1.75} aria-hidden="true" />
            {t('install.iosHint')}
          </span>
        ) : (
          <span className="install-banner__hint">{t('install.subtitle')}</span>
        )}
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
      <button
        type="button"
        className="install-banner__close"
        onClick={dismiss}
        aria-label={t('install.dismiss')}
      >
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  )
}
