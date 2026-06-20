import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { LogOut, Mail, UserPlus, ShieldCheck } from 'lucide-react'
import LanguageSwitcher from '../components/LanguageSwitcher.jsx'
import { useAuth } from '../context/authContext.js'
import { useIsAdmin } from '../hooks/useIsAdmin.js'

// Профиль пользователя (CLAUDE.md §4, §6). Вошёл → email + «Выйти»; не вошёл →
// «Войти / Зарегистрироваться». Сюда позже переедут язык и выбор города.
export default function Profile() {
  const { t } = useTranslation()
  const { isAuthed, user, loading, openAuth, signOut } = useAuth()
  const { isAdmin } = useIsAdmin()

  return (
    <main className="app-shell">
      <section className="card profile">
        <h1>{t('nav.profile')}</h1>

        {loading ? (
          <p className="muted">{t('common.loading')}</p>
        ) : isAuthed ? (
          <div className="profile__account">
            <span className="profile__avatar" aria-hidden="true">
              <Mail size={20} strokeWidth={1.75} />
            </span>
            <div className="profile__account-body">
              <span className="profile__label">{t('auth.signedInAs')}</span>
              <span className="profile__email">{user?.email}</span>
            </div>
            <button type="button" className="profile__signout" onClick={signOut}>
              <LogOut size={18} aria-hidden="true" />
              {t('auth.signOut')}
            </button>
          </div>
        ) : null}

        {/* Admin panel link — shown only to admins (CLAUDE.md §7). */}
        {isAuthed && isAdmin && (
          <Link to="/admin" className="profile__admin-link">
            <ShieldCheck size={18} aria-hidden="true" />
            {t('admin.link')}
          </Link>
        )}

        {!loading && !isAuthed && (
          <div className="profile__guest">
            <p className="muted">{t('auth.guestNotice')}</p>
            <button type="button" className="profile__signin" onClick={openAuth}>
              <UserPlus size={18} aria-hidden="true" />
              {t('auth.signInOrUp')}
            </button>
          </div>
        )}

        <LanguageSwitcher />
      </section>
    </main>
  )
}
