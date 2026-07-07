// Admin moderation panel (CLAUDE.md §5, §7, §11, §12) — Stage 10.
//
// Closed route: only users present in the `admins` table reach it (the route in
// App.jsx redirects everyone else to /profile). Tabs across the top scope the
// panel to one content type at a time, each city-scoped to the active city
// (Alanya at launch):
//   • Places   — companies / specialists (the original tool).
//   • News     — short city news summaries (§4 screen 6, §11).
//   • Events   — "what's on" listings (§4 screen 5).
//   • Guides   — "Documents & life" instructions (§4 screen 4, §11).
// Each tab is the same pattern: an add / edit form on top, then the city's list
// with status + quick moderation actions (approve / reject / edit). Approving a
// row is all it takes for it to show up in the matching public section — both
// read the same approved, city-scoped base.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router-dom'
import {
  Check,
  X,
  Pencil,
  Trash2,
  Megaphone,
  BadgeCheck,
  Plus,
  ShieldCheck,
  Languages,
} from 'lucide-react'
import { useApp } from '../context/appContext.js'
import { useIsAdmin } from '../hooks/useIsAdmin.js'
import { fetchCategories, fetchAllSubcategories } from '../lib/content.js'
import {
  fetchAdminPlaces,
  createPlace,
  updatePlace,
  deletePlace,
  fetchAdminContent,
  createContent,
  updateContent,
  deleteContent,
  purgePastEvents,
  uploadPlacePhoto,
  requestTranslation,
  fetchAdminTranslations,
  saveTranslations,
  fetchMarketSchedule,
  saveMarketScheduleRow,
  deleteMarketScheduleDay,
} from '../lib/admin.js'
import { SUPPORTED_LANGUAGES } from '../i18n/index.js'

// Client-side guard on the photo upload (the bucket also enforces type/size via
// its own config, but failing fast here gives a friendlier message).
const MAX_PHOTO_BYTES = 5 * 1024 * 1024 // 5 MB

const TABS = ['places', 'news', 'events', 'guides', 'marketSchedule']

export default function Admin() {
  const { t } = useTranslation()
  const { isAdmin, loading: adminLoading } = useIsAdmin()

  if (adminLoading) {
    return (
      <main className="app-shell">
        <p className="muted">{t('common.loading')}</p>
      </main>
    )
  }
  // Closed route: non-admins never see the panel.
  if (!isAdmin) return <Navigate to="/profile" replace />

  return <AdminPanel />
}

function AdminPanel() {
  const { t } = useTranslation()
  const { selection } = useApp()
  const [tab, setTab] = useState('places')

  const sections = {
    places: <PlacesSection />,
    news: <NewsSection />,
    events: <EventsSection />,
    guides: <GuidesSection />,
    marketSchedule: <MarketScheduleSection />,
  }

  return (
    <main className="app-shell admin">
      <header className="admin__header">
        <span className="admin__badge" aria-hidden="true">
          <ShieldCheck size={20} strokeWidth={1.75} />
        </span>
        <div>
          <h1 className="admin__title">{t('admin.title')}</h1>
          <p className="admin__subtitle muted">
            {t('admin.subtitle', { city: selection?.cityName ?? '' })}
          </p>
        </div>
      </header>

      <nav className="admin-tabs" aria-label={t('admin.title')}>
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            className={`admin-tab${tab === key ? ' is-active' : ''}`}
            onClick={() => setTab(key)}
          >
            {t(`admin.tabs.${key}`)}
          </button>
        ))}
      </nav>

      {sections[tab]}
    </main>
  )
}

// ============================================================================
// Shared building blocks
// ============================================================================

// A photo input that uploads to the place-photos bucket (reused across content
// types) and writes the resulting public URL back via onChange, with a manual
// URL field as a fallback. Mirrors the original places photo field.
function PhotoField({ value, onChange }) {
  const { t } = useTranslation()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(e) {
    const file = e.target.files?.[0]
    // Let the user re-pick the same file later (onChange won't fire otherwise).
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError(t('admin.form.photoTypeError'))
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError(t('admin.form.photoSizeError'))
      return
    }
    setUploading(true)
    setError('')
    try {
      const url = await uploadPlacePhoto(file)
      onChange(url)
    } catch (err) {
      setError(err?.message || t('admin.form.photoUploadError'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="admin-field admin-photo">
      <span className="admin-field__label">{t('admin.form.photo')}</span>
      {value && <img className="admin-photo__preview" src={value} alt={t('admin.form.photoPreview')} />}
      <div className="admin-photo__controls">
        <label className="admin-btn admin-btn--ghost admin-photo__upload">
          {uploading ? t('admin.form.photoUploading') : t('admin.form.photoUpload')}
          <input type="file" accept="image/*" onChange={handleFile} disabled={uploading} hidden />
        </label>
        {value && (
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            onClick={() => onChange('')}
          >
            {t('admin.form.photoRemove')}
          </button>
        )}
      </div>
      <input
        className="admin-field__input"
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('admin.form.photoPlaceholder')}
      />
      {error && <span className="admin-field__hint admin-form__error">{error}</span>}
      <span className="admin-field__hint muted">{t('admin.form.photoHint')}</span>
    </div>
  )
}

// The status <select> shared by every form.
function StatusField({ value, onChange }) {
  const { t } = useTranslation()
  return (
    <label className="admin-field">
      <span className="admin-field__label">{t('admin.form.status')}</span>
      <select className="admin-field__input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="approved">{t('admin.status.approved')}</option>
        <option value="pending">{t('admin.status.pending')}</option>
        <option value="rejected">{t('admin.status.rejected')}</option>
      </select>
    </label>
  )
}

// Turn a Supabase / PostgREST error into a readable banner string. Supabase
// errors carry the human message in `.message`, but the actionable bit is often
// in `.details` / `.hint` / `.code` (e.g. an RLS denial is code 42501). Surface
// all of it so a failed save is never opaque — no silent or vague failures (§7).
function describeError(err) {
  if (!err) return ''
  if (typeof err === 'string') return err
  const parts = [err.message, err.details, err.hint].filter(Boolean)
  let msg = parts.join(' — ')
  if (err.code) msg += msg ? ` (${err.code})` : `(${err.code})`
  return msg.trim()
}

// The error / success banner shared by every form.
function FormBanners({ error, success }) {
  return (
    <>
      {error && <p className="admin-form__error">{error}</p>}
      {success && (
        <p className="admin-form__success" role="status">
          <Check size={15} aria-hidden="true" />
          {success}
        </p>
      )}
    </>
  )
}

// Per-row content translation editor (CLAUDE.md §8) — Stage 11D.
//
// Auto-translates a row's TEXT fields into the other 12 start languages via
// /api/translate (server-side Gemini, admin-only), lets the owner edit the
// result, and saves it to content_translations. Translation is INDEPENDENT of
// moderation status — a row can be approved with or without translations.
//
// Translations attach to an existing row id, so the panel only appears once the
// row is saved. `fields` is [{ name, label, value }] of the source-language text
// (everything else — phone/address/url/coords/hours — is intentionally excluded).
function TranslationsPanel({ entityType, entityId, fields }) {
  const { t, i18n } = useTranslation()
  const [sourceLang, setSourceLang] = useState(i18n.language)
  const [translations, setTranslations] = useState({})
  const [loading, setLoading] = useState(false)
  const [translating, setTranslating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const targetLangs = SUPPORTED_LANGUAGES.filter((l) => l !== sourceLang)
  const nativeName = (code) =>
    i18n.getResource(code, 'translation', 'languageName') || code.toUpperCase()

  // Preload any translations already saved for this row.
  useEffect(() => {
    if (!entityId) return
    let active = true
    setLoading(true)
    fetchAdminTranslations(entityType, entityId)
      .then((data) => active && setTranslations(data))
      .catch(() => {})
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [entityType, entityId])

  if (!entityId) {
    return (
      <section className="admin-tr admin-tr--locked">
        <span className="admin-field__label">
          <Languages size={15} aria-hidden="true" /> {t('admin.tr.title')}
        </span>
        <p className="admin-field__hint muted">{t('admin.tr.saveFirst')}</p>
      </section>
    )
  }

  const setValue = (lang, field, value) =>
    setTranslations((prev) => ({ ...prev, [lang]: { ...(prev[lang] ?? {}), [field]: value } }))

  // Only fields that actually carry source text are worth sending to Gemini.
  const sourceFields = Object.fromEntries(
    fields.map((f) => [f.name, (f.value ?? '').trim()]).filter(([, v]) => v),
  )

  async function handleTranslate() {
    setError('')
    setSuccess('')
    if (Object.keys(sourceFields).length === 0) {
      setError(t('admin.tr.nothingToTranslate'))
      return
    }
    setTranslating(true)
    try {
      const result = await requestTranslation(sourceFields, sourceLang)
      setTranslations((prev) => {
        const next = { ...prev }
        for (const [lang, vals] of Object.entries(result)) {
          if (lang === sourceLang) continue // the source text is the base row
          next[lang] = { ...(next[lang] ?? {}), ...vals }
        }
        return next
      })
      setSuccess(t('admin.tr.translated'))
    } catch (err) {
      setError(err?.message || t('admin.tr.error'))
    } finally {
      setTranslating(false)
    }
  }

  async function handleSave() {
    setError('')
    setSuccess('')
    setSaving(true)
    try {
      // Persist only the target languages (never the source — that's the base row).
      const subset = {}
      for (const lang of targetLangs) if (translations[lang]) subset[lang] = translations[lang]
      await saveTranslations(entityType, entityId, subset)
      setSuccess(t('admin.tr.saved'))
    } catch (err) {
      setError(err?.message || t('admin.tr.error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="admin-tr">
      <div className="admin-tr__head">
        <span className="admin-field__label">
          <Languages size={15} aria-hidden="true" /> {t('admin.tr.title')}
        </span>
        <label className="admin-tr__source">
          <span className="muted">{t('admin.tr.sourceLang')}</span>
          <select
            className="admin-field__input"
            value={sourceLang}
            onChange={(e) => setSourceLang(e.target.value)}
          >
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()} — {nativeName(l)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="admin-field__hint muted">{t('admin.tr.hint')}</p>

      <div className="admin-tr__actions">
        <button
          type="button"
          className="admin-btn admin-btn--ghost"
          onClick={handleTranslate}
          disabled={translating}
        >
          <Languages size={15} aria-hidden="true" />
          {translating ? t('admin.tr.translating') : t('admin.tr.translate')}
        </button>
        <button
          type="button"
          className="admin-btn admin-btn--primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? t('admin.form.saving') : t('admin.tr.save')}
        </button>
      </div>

      <FormBanners error={error} success={success} />

      {loading ? (
        <p className="muted">{t('admin.list.loading')}</p>
      ) : (
        <div className="admin-tr__langs">
          {targetLangs.map((lang) => (
            <details key={lang} className="admin-tr__lang">
              <summary>
                {lang.toUpperCase()} — {nativeName(lang)}
              </summary>
              {fields.map((f) => (
                <label key={f.name} className="admin-field">
                  <span className="admin-field__label">{f.label}</span>
                  <textarea
                    className="admin-field__input admin-field__textarea"
                    rows={2}
                    value={translations[lang]?.[f.name] ?? ''}
                    onChange={(e) => setValue(lang, f.name, e.target.value)}
                  />
                </label>
              ))}
            </details>
          ))}
        </div>
      )}
    </section>
  )
}

// A generic moderation list: rows with a status badge and approve / reject /
// edit actions. `titleOf` and `metaOf(row) -> string[]` adapt it per table.
function ModerationList({ state, titleOf, metaOf, onApprove, onReject, onEdit, onDelete }) {
  const { t } = useTranslation()
  if (state.status === 'loading') return <p className="muted">{t('admin.list.loading')}</p>
  if (state.status === 'error') return <p className="admin-form__error">{t('admin.list.error')}</p>
  if (state.rows.length === 0) return <p className="muted">{t('admin.list.empty')}</p>

  return (
    <ul className="admin-list">
      {state.rows.map((row) => {
        const metas = (metaOf?.(row) ?? []).filter(Boolean)
        return (
          <li key={row.id} className="admin-row">
            <div className="admin-row__main">
              <div className="admin-row__title-line">
                <span className="admin-row__name">{titleOf(row) || t('admin.form.untitled')}</span>
                <span className={`admin-status admin-status--${row.status}`}>
                  {t(`admin.status.${row.status}`)}
                </span>
              </div>
              {metas.map((m, i) => (
                <span key={i} className="admin-row__meta">
                  {m}
                </span>
              ))}
            </div>
            <div className="admin-row__actions">
              {row.status !== 'approved' && (
                <button
                  type="button"
                  className="admin-action admin-action--approve"
                  onClick={() => onApprove(row.id)}
                >
                  <Check size={15} aria-hidden="true" />
                  {t('admin.actions.approve')}
                </button>
              )}
              {row.status !== 'rejected' && (
                <button
                  type="button"
                  className="admin-action admin-action--reject"
                  onClick={() => onReject(row.id)}
                >
                  <X size={15} aria-hidden="true" />
                  {t('admin.actions.reject')}
                </button>
              )}
              <button type="button" className="admin-action" onClick={() => onEdit(row)}>
                <Pencil size={15} aria-hidden="true" />
                {t('admin.actions.edit')}
              </button>
              <button
                type="button"
                className="admin-action admin-action--delete"
                onClick={() => {
                  // Irreversible physical delete — always confirm first.
                  if (window.confirm(t('admin.actions.deleteConfirm'))) onDelete(row.id)
                }}
              >
                <Trash2 size={15} aria-hidden="true" />
                {t('admin.actions.delete')}
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// Shared state + actions for a moderated content section (news / events /
// guides). Owns the list, save (create / update), and the approve / reject
// quick actions; the per-table form lives in the section component.
function useContentSection(table) {
  const { t } = useTranslation()
  const { cityId } = useApp()
  const [state, setState] = useState({ status: 'loading', rows: [] })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  const reload = useCallback(() => {
    if (!cityId) return
    setState((s) => ({ ...s, status: 'loading' }))
    fetchAdminContent(table, cityId)
      .then((rows) => setState({ status: 'ready', rows }))
      .catch(() => setState({ status: 'error', rows: [] }))
  }, [table, cityId])

  useEffect(() => {
    reload()
  }, [reload])

  // Save a built payload. Returns true on success so the caller can reset.
  async function save({ payload, isEdit, id, name }) {
    if (saving) return false
    if (!cityId) {
      setError(t('admin.form.error'))
      return false
    }
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      if (isEdit) await updateContent(table, id, payload)
      else await createContent(table, { ...payload, city_id: cityId })
      setSuccess(t(isEdit ? 'admin.form.savedEdit' : 'admin.form.savedCreate', { name }))
      reload()
      return true
    } catch (err) {
      setError(describeError(err) || t('admin.form.error'))
      return false
    } finally {
      setSaving(false)
    }
  }

  async function patch(id, changes) {
    try {
      await updateContent(table, id, changes)
      reload()
    } catch (err) {
      setError(describeError(err) || t('admin.form.error'))
    }
  }

  // Approving stamps the moderation check date (§5), like places.
  const approve = (id) => patch(id, { status: 'approved', verified_at: new Date().toISOString() })
  const reject = (id) => patch(id, { status: 'rejected' })

  // Permanent, physical delete (removes the row + its translations). Confirmation
  // is handled at the call site (ModerationList) — this just performs it.
  async function remove(id) {
    try {
      await deleteContent(table, id)
      reload()
    } catch (err) {
      setError(describeError(err) || t('admin.form.error'))
    }
  }

  return {
    cityId,
    state,
    error,
    setError,
    success,
    setSuccess,
    saving,
    save,
    approve,
    reject,
    remove,
    reload,
  }
}

// ---- date <-> input helpers ------------------------------------------------
// `datetime-local` inputs read/write local "YYYY-MM-DDTHH:mm"; `date` inputs use
// "YYYY-MM-DD". We store ISO timestamps, so convert at the edges.
const pad = (n) => String(n).padStart(2, '0')

function toDateTimeLocal(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toDateInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Local-input value -> ISO timestamp (null when blank/invalid).
function inputToISO(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// ============================================================================
// Places (the original tool, unchanged in behaviour)
// ============================================================================

const emptyPlace = () => ({
  id: null,
  name: '',
  description: '',
  address: '',
  phone: '',
  whatsapp: '',
  instagram: '',
  telegram: '',
  website: '',
  hours: '',
  languages: [],
  category_id: '',
  subcategory_id: '',
  photo: '',
  status: 'approved',
  is_promoted: false,
  is_verified: false,
})

function formFromPlace(p) {
  return {
    id: p.id,
    name: p.name ?? '',
    description: p.description ?? '',
    address: p.address ?? '',
    phone: p.phone ?? '',
    whatsapp: p.whatsapp ?? '',
    instagram: p.instagram ?? '',
    telegram: p.telegram ?? '',
    website: p.website ?? '',
    hours: typeof p.hours === 'string' ? p.hours : p.hours ? JSON.stringify(p.hours) : '',
    languages: Array.isArray(p.languages) ? p.languages : [],
    category_id: p.category_id ?? '',
    subcategory_id: p.subcategory_id ?? '',
    photo: p.photos?.[0] ?? '',
    status: p.status ?? 'approved',
    is_promoted: Boolean(p.is_promoted),
    is_verified: Boolean(p.is_verified),
  }
}

function PlacesSection() {
  const { t } = useTranslation()
  const { cityId } = useApp()

  const [cats, setCats] = useState([])
  const [subs, setSubs] = useState([])
  const [places, setPlaces] = useState({ status: 'loading', rows: [] })
  const [form, setForm] = useState(emptyPlace)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [uploading, setUploading] = useState(false)

  // Reference data for the category/subcategory selects.
  useEffect(() => {
    let active = true
    Promise.all([fetchCategories(), fetchAllSubcategories()])
      .then(([categories, subcategories]) => {
        if (!active) return
        setCats(categories)
        setSubs(subcategories)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const loadPlaces = useCallback(() => {
    if (!cityId) return
    setPlaces((p) => ({ ...p, status: 'loading' }))
    fetchAdminPlaces(cityId)
      .then((rows) => setPlaces({ status: 'ready', rows }))
      .catch(() => setPlaces({ status: 'error', rows: [] }))
  }, [cityId])

  useEffect(() => {
    loadPlaces()
  }, [loadPlaces])

  const catLabel = (c) => t(`catalog.categories.${c.slug}`, c.name)
  const subLabel = (s) => t(`catalog.subcategories.${s.slug}`, s.name)
  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats])

  const formSubs = useMemo(
    () => subs.filter((s) => s.category_id === form.category_id),
    [subs, form.category_id],
  )

  const setField = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  const onCategoryChange = (value) =>
    setForm((f) => ({ ...f, category_id: value, subcategory_id: '' }))

  const toggleLang = (code) =>
    setForm((f) => ({
      ...f,
      languages: f.languages.includes(code)
        ? f.languages.filter((c) => c !== code)
        : [...f.languages, code],
    }))

  const startEdit = (place) => {
    setError('')
    setSuccess('')
    setForm(formFromPlace(place))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const resetForm = () => {
    setForm(emptyPlace())
    setError('')
  }

  async function handlePhotoFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError(t('admin.form.photoTypeError'))
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError(t('admin.form.photoSizeError'))
      return
    }
    setUploading(true)
    setError('')
    try {
      const url = await uploadPlacePhoto(file)
      setField('photo', url)
    } catch (err) {
      setError(err?.message || t('admin.form.photoUploadError'))
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (saving) return
    const name = form.name.trim()
    if (!name) {
      setError(t('admin.form.nameRequired'))
      return
    }
    if (!cityId) {
      setError(t('admin.form.error'))
      return
    }

    const payload = {
      city_id: cityId,
      name,
      description: form.description.trim() || null,
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      whatsapp: form.whatsapp.trim() || null,
      instagram: form.instagram.trim() || null,
      telegram: form.telegram.trim() || null,
      website: form.website.trim() || null,
      hours: form.hours.trim() || null,
      languages: form.languages,
      category_id: form.category_id || null,
      subcategory_id: form.subcategory_id || null,
      photos: form.photo.trim() ? [form.photo.trim()] : [],
      status: form.status,
      is_promoted: form.is_promoted,
      is_verified: form.is_verified,
      verified_at: form.status === 'approved' ? new Date().toISOString() : null,
    }

    const wasEditing = Boolean(form.id)
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      if (wasEditing) await updatePlace(form.id, payload)
      else await createPlace(payload)
      resetForm()
      setSuccess(t(wasEditing ? 'admin.form.savedEdit' : 'admin.form.savedCreate', { name }))
      loadPlaces()
    } catch (err) {
      setError(describeError(err) || t('admin.form.error'))
    } finally {
      setSaving(false)
    }
  }

  async function patch(place, changes) {
    try {
      await updatePlace(place.id, changes)
      loadPlaces()
    } catch (err) {
      setError(describeError(err) || t('admin.form.error'))
    }
  }

  // Permanent, physical delete (place row + its translations). Irreversible, so
  // confirm first; drop the edit form if it holds the row we're removing.
  async function removePlace(place) {
    if (!window.confirm(t('admin.actions.deleteConfirm'))) return
    try {
      await deletePlace(place.id)
      if (form.id === place.id) resetForm()
      loadPlaces()
    } catch (err) {
      setError(describeError(err) || t('admin.form.error'))
    }
  }

  const editing = Boolean(form.id)

  return (
    <>
      <section className="card admin__form-card">
        <h2 className="admin__section-title">
          {editing
            ? t('admin.form.editTitle', { name: form.name || t('admin.form.untitled') })
            : t('admin.form.addTitle')}
        </h2>
        <form className="admin-form" onSubmit={handleSubmit}>
          <label className="admin-field">
            <span className="admin-field__label">{t('admin.form.name')}</span>
            <input
              className="admin-field__input"
              type="text"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder={t('admin.form.namePlaceholder')}
              required
            />
          </label>

          <label className="admin-field">
            <span className="admin-field__label">{t('admin.form.description')}</span>
            <textarea
              className="admin-field__input admin-field__textarea"
              rows={3}
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
            />
          </label>

          <label className="admin-field">
            <span className="admin-field__label">{t('admin.form.address')}</span>
            <input
              className="admin-field__input"
              type="text"
              value={form.address}
              onChange={(e) => setField('address', e.target.value)}
            />
          </label>

          <div className="admin-form__row">
            <label className="admin-field">
              <span className="admin-field__label">{t('admin.form.phone')}</span>
              <input
                className="admin-field__input"
                type="tel"
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
              />
            </label>
            <label className="admin-field">
              <span className="admin-field__label">{t('admin.form.whatsapp')}</span>
              <input
                className="admin-field__input"
                type="tel"
                value={form.whatsapp}
                onChange={(e) => setField('whatsapp', e.target.value)}
              />
            </label>
          </div>

          <label className="admin-field">
            <span className="admin-field__label">{t('admin.form.instagram')}</span>
            <input
              className="admin-field__input"
              type="text"
              value={form.instagram}
              onChange={(e) => setField('instagram', e.target.value)}
              placeholder={t('admin.form.instagramPlaceholder')}
            />
          </label>

          <div className="admin-form__row">
            <label className="admin-field">
              <span className="admin-field__label">{t('admin.form.telegram')}</span>
              <input
                className="admin-field__input"
                type="text"
                value={form.telegram}
                onChange={(e) => setField('telegram', e.target.value)}
                placeholder={t('admin.form.telegramPlaceholder')}
              />
            </label>
            <label className="admin-field">
              <span className="admin-field__label">{t('admin.form.website')}</span>
              <input
                className="admin-field__input"
                type="text"
                value={form.website}
                onChange={(e) => setField('website', e.target.value)}
                placeholder={t('admin.form.websitePlaceholder')}
              />
            </label>
          </div>

          <label className="admin-field">
            <span className="admin-field__label">{t('admin.form.hours')}</span>
            <input
              className="admin-field__input"
              type="text"
              value={form.hours}
              onChange={(e) => setField('hours', e.target.value)}
              placeholder={t('admin.form.hoursPlaceholder')}
            />
          </label>

          <div className="admin-form__row">
            <label className="admin-field">
              <span className="admin-field__label">{t('admin.form.category')}</span>
              <select
                className="admin-field__input"
                value={form.category_id}
                onChange={(e) => onCategoryChange(e.target.value)}
              >
                <option value="">{t('admin.form.none')}</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {catLabel(c)}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              <span className="admin-field__label">{t('admin.form.subcategory')}</span>
              <select
                className="admin-field__input"
                value={form.subcategory_id}
                onChange={(e) => setField('subcategory_id', e.target.value)}
                disabled={!form.category_id || formSubs.length === 0}
              >
                <option value="">{t('admin.form.none')}</option>
                {formSubs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {subLabel(s)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="admin-field admin-photo">
            <span className="admin-field__label">{t('admin.form.photo')}</span>
            {form.photo && (
              <img
                className="admin-photo__preview"
                src={form.photo}
                alt={t('admin.form.photoPreview')}
              />
            )}
            <div className="admin-photo__controls">
              <label className="admin-btn admin-btn--ghost admin-photo__upload">
                {uploading ? t('admin.form.photoUploading') : t('admin.form.photoUpload')}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoFile}
                  disabled={uploading}
                  hidden
                />
              </label>
              {form.photo && (
                <button
                  type="button"
                  className="admin-btn admin-btn--ghost"
                  onClick={() => setField('photo', '')}
                >
                  {t('admin.form.photoRemove')}
                </button>
              )}
            </div>
            <input
              className="admin-field__input"
              type="url"
              value={form.photo}
              onChange={(e) => setField('photo', e.target.value)}
              placeholder={t('admin.form.photoPlaceholder')}
            />
            <span className="admin-field__hint muted">{t('admin.form.photoHint')}</span>
          </div>

          <fieldset className="admin-field admin-langs">
            <legend className="admin-field__label">{t('admin.form.languages')}</legend>
            <div className="admin-langs__grid">
              {SUPPORTED_LANGUAGES.map((code) => (
                <label key={code} className="admin-lang">
                  <input
                    type="checkbox"
                    checked={form.languages.includes(code)}
                    onChange={() => toggleLang(code)}
                  />
                  <span>{code.toUpperCase()}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <StatusField value={form.status} onChange={(v) => setField('status', v)} />

          <div className="admin-toggles">
            <label className="admin-toggle">
              <input
                type="checkbox"
                checked={form.is_promoted}
                onChange={(e) => setField('is_promoted', e.target.checked)}
              />
              <Megaphone size={15} aria-hidden="true" />
              <span>{t('admin.form.promoted')}</span>
            </label>
            <label className="admin-toggle">
              <input
                type="checkbox"
                checked={form.is_verified}
                onChange={(e) => setField('is_verified', e.target.checked)}
              />
              <BadgeCheck size={15} aria-hidden="true" />
              <span>{t('admin.form.verified')}</span>
            </label>
          </div>

          <FormBanners error={error} success={success} />

          <TranslationsPanel
            entityType="places"
            entityId={form.id}
            fields={[
              { name: 'name', label: t('admin.form.name'), value: form.name },
              { name: 'description', label: t('admin.form.description'), value: form.description },
            ]}
          />

          <div className="admin-form__actions">
            {editing && (
              <button type="button" className="admin-btn admin-btn--ghost" onClick={resetForm}>
                {t('admin.form.cancel')}
              </button>
            )}
            <button type="submit" className="admin-btn admin-btn--primary" disabled={saving}>
              <Plus size={16} aria-hidden="true" />
              {saving
                ? t('admin.form.saving')
                : editing
                  ? t('admin.form.submitSave')
                  : t('admin.form.submitCreate')}
            </button>
          </div>
        </form>
      </section>

      <section className="admin__list-section">
        <h2 className="admin__section-title">{t('admin.list.title')}</h2>

        {places.status === 'loading' ? (
          <p className="muted">{t('admin.list.loading')}</p>
        ) : places.status === 'error' ? (
          <p className="admin-form__error">{t('admin.list.error')}</p>
        ) : places.rows.length === 0 ? (
          <p className="muted">{t('admin.list.empty')}</p>
        ) : (
          <ul className="admin-list">
            {places.rows.map((place) => {
              const cat = place.category_id ? catById.get(place.category_id) : null
              return (
                <li key={place.id} className="admin-row">
                  <div className="admin-row__main">
                    <div className="admin-row__title-line">
                      <span className="admin-row__name">{place.name}</span>
                      <span className={`admin-status admin-status--${place.status}`}>
                        {t(`admin.status.${place.status}`)}
                      </span>
                    </div>
                    {cat && <span className="admin-row__meta">{catLabel(cat)}</span>}
                    {place.address && <span className="admin-row__meta">{place.address}</span>}
                    {(place.is_promoted || place.is_verified) && (
                      <span className="admin-row__badges">
                        {place.is_promoted && (
                          <span className="badge badge--promoted">
                            <Megaphone size={12} aria-hidden="true" />
                            {t('catalog.promoted')}
                          </span>
                        )}
                        {place.is_verified && (
                          <span className="badge badge--verified">
                            <BadgeCheck size={12} aria-hidden="true" />
                            {t('catalog.verified')}
                          </span>
                        )}
                      </span>
                    )}
                  </div>

                  <div className="admin-row__actions">
                    {place.status !== 'approved' && (
                      <button
                        type="button"
                        className="admin-action admin-action--approve"
                        onClick={() =>
                          patch(place, {
                            status: 'approved',
                            verified_at: new Date().toISOString(),
                          })
                        }
                      >
                        <Check size={15} aria-hidden="true" />
                        {t('admin.actions.approve')}
                      </button>
                    )}
                    {place.status !== 'rejected' && (
                      <button
                        type="button"
                        className="admin-action admin-action--reject"
                        onClick={() => patch(place, { status: 'rejected' })}
                      >
                        <X size={15} aria-hidden="true" />
                        {t('admin.actions.reject')}
                      </button>
                    )}
                    <button type="button" className="admin-action" onClick={() => startEdit(place)}>
                      <Pencil size={15} aria-hidden="true" />
                      {t('admin.actions.edit')}
                    </button>
                    <button
                      type="button"
                      className={`admin-action${place.is_promoted ? ' admin-action--on' : ''}`}
                      onClick={() => patch(place, { is_promoted: !place.is_promoted })}
                    >
                      <Megaphone size={15} aria-hidden="true" />
                      {t('admin.actions.promoted')}
                    </button>
                    <button
                      type="button"
                      className={`admin-action${place.is_verified ? ' admin-action--on' : ''}`}
                      onClick={() => patch(place, { is_verified: !place.is_verified })}
                    >
                      <BadgeCheck size={15} aria-hidden="true" />
                      {t('admin.actions.verified')}
                    </button>
                    <button
                      type="button"
                      className="admin-action admin-action--delete"
                      onClick={() => removePlace(place)}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                      {t('admin.actions.delete')}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}

// ============================================================================
// News
// ============================================================================

const emptyNews = () => ({
  id: null,
  title: '',
  summary: '',
  body: '',
  source_name: '',
  source_url: '',
  image_url: '',
  published_at: '',
  verified_at: '',
  status: 'approved',
})

function formFromNews(n) {
  return {
    id: n.id,
    title: n.title ?? '',
    summary: n.summary ?? '',
    body: n.body ?? '',
    source_name: n.source_name ?? '',
    source_url: n.source_url ?? '',
    image_url: n.image_url ?? '',
    published_at: toDateInput(n.published_at),
    verified_at: toDateInput(n.verified_at),
    status: n.status ?? 'approved',
  }
}

function NewsSection() {
  const { t } = useTranslation()
  const sec = useContentSection('news')
  const [form, setForm] = useState(emptyNews)
  const setField = (f, v) => setForm((s) => ({ ...s, [f]: v }))
  const editing = Boolean(form.id)

  const startEdit = (row) => {
    sec.setError('')
    sec.setSuccess('')
    setForm(formFromNews(row))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const resetForm = () => {
    setForm(emptyNews())
    sec.setError('')
  }
  // Drop the edit form if we're deleting the row it holds.
  const remove = (id) => {
    if (editing && form.id === id) resetForm()
    sec.remove(id)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const title = form.title.trim()
    if (!title) {
      sec.setError(t('admin.form.titleRequired'))
      return
    }
    const payload = {
      title,
      summary: form.summary.trim() || null,
      body: form.body.trim() || null,
      source_name: form.source_name.trim() || null,
      source_url: form.source_url.trim() || null,
      image_url: form.image_url.trim() || null,
      published_at: inputToISO(form.published_at),
      // Respect an entered check date; otherwise stamp now when publishing (§5).
      verified_at:
        inputToISO(form.verified_at) ??
        (form.status === 'approved' ? new Date().toISOString() : null),
      status: form.status,
    }
    const ok = await sec.save({ payload, isEdit: editing, id: form.id, name: title })
    if (ok) resetForm()
  }

  return (
    <>
      <section className="card admin__form-card">
        <h2 className="admin__section-title">
          {editing
            ? t('admin.form.editTitle', { name: form.title || t('admin.form.untitled') })
            : t('admin.news.addTitle')}
        </h2>
        <form className="admin-form" onSubmit={handleSubmit}>
          <label className="admin-field">
            <span className="admin-field__label">{t('admin.news.title')}</span>
            <input
              className="admin-field__input"
              type="text"
              value={form.title}
              onChange={(e) => setField('title', e.target.value)}
              placeholder={t('admin.news.titlePlaceholder')}
              required
            />
          </label>

          <label className="admin-field">
            <span className="admin-field__label">{t('admin.news.summary')}</span>
            <textarea
              className="admin-field__input admin-field__textarea"
              rows={2}
              value={form.summary}
              onChange={(e) => setField('summary', e.target.value)}
              placeholder={t('admin.news.summaryPlaceholder')}
            />
          </label>

          <label className="admin-field">
            <span className="admin-field__label">{t('admin.news.body')}</span>
            <textarea
              className="admin-field__input admin-field__textarea"
              rows={4}
              value={form.body}
              onChange={(e) => setField('body', e.target.value)}
              placeholder={t('admin.news.bodyPlaceholder')}
            />
          </label>

          <div className="admin-form__row">
            <label className="admin-field">
              <span className="admin-field__label">{t('admin.news.sourceName')}</span>
              <input
                className="admin-field__input"
                type="text"
                value={form.source_name}
                onChange={(e) => setField('source_name', e.target.value)}
              />
            </label>
            <label className="admin-field">
              <span className="admin-field__label">{t('admin.news.sourceUrl')}</span>
              <input
                className="admin-field__input"
                type="url"
                value={form.source_url}
                onChange={(e) => setField('source_url', e.target.value)}
                placeholder={t('admin.form.websitePlaceholder')}
              />
            </label>
          </div>

          <div className="admin-form__row">
            <label className="admin-field">
              <span className="admin-field__label">{t('admin.news.publishedAt')}</span>
              <input
                className="admin-field__input"
                type="date"
                value={form.published_at}
                onChange={(e) => setField('published_at', e.target.value)}
              />
            </label>
            <label className="admin-field">
              <span className="admin-field__label">{t('admin.form.verifiedAt')}</span>
              <input
                className="admin-field__input"
                type="date"
                value={form.verified_at}
                onChange={(e) => setField('verified_at', e.target.value)}
              />
            </label>
          </div>

          <PhotoField value={form.image_url} onChange={(v) => setField('image_url', v)} />

          <StatusField value={form.status} onChange={(v) => setField('status', v)} />

          <TranslationsPanel
            entityType="news"
            entityId={form.id}
            fields={[
              { name: 'title', label: t('admin.news.title'), value: form.title },
              { name: 'summary', label: t('admin.news.summary'), value: form.summary },
              { name: 'body', label: t('admin.news.body'), value: form.body },
            ]}
          />

          <FormBanners error={sec.error} success={sec.success} />

          <div className="admin-form__actions">
            {editing && (
              <button type="button" className="admin-btn admin-btn--ghost" onClick={resetForm}>
                {t('admin.form.cancel')}
              </button>
            )}
            <button type="submit" className="admin-btn admin-btn--primary" disabled={sec.saving}>
              <Plus size={16} aria-hidden="true" />
              {sec.saving
                ? t('admin.form.saving')
                : editing
                  ? t('admin.form.submitSave')
                  : t('admin.news.submitCreate')}
            </button>
          </div>
        </form>
      </section>

      <section className="admin__list-section">
        <h2 className="admin__section-title">{t('admin.news.listTitle')}</h2>
        <ModerationList
          state={sec.state}
          titleOf={(r) => r.title}
          metaOf={(r) => [r.summary, r.source_name]}
          onApprove={sec.approve}
          onReject={sec.reject}
          onEdit={startEdit}
          onDelete={remove}
        />
      </section>
    </>
  )
}

// ============================================================================
// Events
// ============================================================================

const emptyEvent = () => ({
  id: null,
  title: '',
  description: '',
  starts_at: '',
  ends_at: '',
  location: '',
  url: '',
  image_url: '',
  status: 'approved',
})

function formFromEvent(ev) {
  return {
    id: ev.id,
    title: ev.title ?? '',
    description: ev.description ?? '',
    starts_at: toDateTimeLocal(ev.starts_at),
    ends_at: toDateTimeLocal(ev.ends_at),
    location: ev.location ?? '',
    url: ev.url ?? '',
    image_url: ev.image_url ?? '',
    status: ev.status ?? 'approved',
  }
}

function EventsSection() {
  const { t } = useTranslation()
  const sec = useContentSection('events')
  const [form, setForm] = useState(emptyEvent)
  const setField = (f, v) => setForm((s) => ({ ...s, [f]: v }))
  const editing = Boolean(form.id)

  const startEdit = (row) => {
    sec.setError('')
    sec.setSuccess('')
    setForm(formFromEvent(row))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const resetForm = () => {
    setForm(emptyEvent())
    sec.setError('')
  }
  // Drop the edit form if we're deleting the row it holds.
  const remove = (id) => {
    if (editing && form.id === id) resetForm()
    sec.remove(id)
  }

  // Lazy auto-cleanup (owner rule): whenever the owner opens the Events tab,
  // physically purge events well past their date (buffer inside purgePastEvents),
  // then refresh the list so the freed rows disappear. Best-effort — a failure
  // here must never block moderating; past events are hidden from the public by
  // the query filter regardless (fetchUpcomingEvents), so this is just tidy-up.
  useEffect(() => {
    if (!sec.cityId) return
    let active = true
    purgePastEvents(sec.cityId)
      .then((n) => {
        if (active && n > 0) sec.reload()
      })
      .catch(() => {})
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sec.cityId])

  async function handleSubmit(e) {
    e.preventDefault()
    const title = form.title.trim()
    if (!title) {
      sec.setError(t('admin.form.titleRequired'))
      return
    }
    const payload = {
      title,
      description: form.description.trim() || null,
      starts_at: inputToISO(form.starts_at),
      ends_at: inputToISO(form.ends_at),
      location: form.location.trim() || null,
      url: form.url.trim() || null,
      image_url: form.image_url.trim() || null,
      status: form.status,
      verified_at: form.status === 'approved' ? new Date().toISOString() : null,
    }
    const ok = await sec.save({ payload, isEdit: editing, id: form.id, name: title })
    if (ok) resetForm()
  }

  const fmtMeta = (ev) => {
    const d = toDateTimeLocal(ev.starts_at)
    return d ? d.replace('T', ' ') : null
  }

  return (
    <>
      <section className="card admin__form-card">
        <h2 className="admin__section-title">
          {editing
            ? t('admin.form.editTitle', { name: form.title || t('admin.form.untitled') })
            : t('admin.events.addTitle')}
        </h2>
        <form className="admin-form" onSubmit={handleSubmit}>
          <label className="admin-field">
            <span className="admin-field__label">{t('admin.events.title')}</span>
            <input
              className="admin-field__input"
              type="text"
              value={form.title}
              onChange={(e) => setField('title', e.target.value)}
              placeholder={t('admin.events.titlePlaceholder')}
              required
            />
          </label>

          <label className="admin-field">
            <span className="admin-field__label">{t('admin.events.description')}</span>
            <textarea
              className="admin-field__input admin-field__textarea"
              rows={3}
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
            />
          </label>

          <div className="admin-form__row">
            <label className="admin-field">
              <span className="admin-field__label">{t('admin.events.startsAt')}</span>
              <input
                className="admin-field__input"
                type="datetime-local"
                value={form.starts_at}
                onChange={(e) => setField('starts_at', e.target.value)}
              />
            </label>
            <label className="admin-field">
              <span className="admin-field__label">{t('admin.events.endsAt')}</span>
              <input
                className="admin-field__input"
                type="datetime-local"
                value={form.ends_at}
                onChange={(e) => setField('ends_at', e.target.value)}
              />
            </label>
          </div>

          <label className="admin-field">
            <span className="admin-field__label">{t('admin.events.location')}</span>
            <input
              className="admin-field__input"
              type="text"
              value={form.location}
              onChange={(e) => setField('location', e.target.value)}
              placeholder={t('admin.events.locationPlaceholder')}
            />
          </label>

          <label className="admin-field">
            <span className="admin-field__label">{t('admin.events.url')}</span>
            <input
              className="admin-field__input"
              type="url"
              value={form.url}
              onChange={(e) => setField('url', e.target.value)}
              placeholder={t('admin.form.websitePlaceholder')}
            />
          </label>

          <PhotoField value={form.image_url} onChange={(v) => setField('image_url', v)} />

          <StatusField value={form.status} onChange={(v) => setField('status', v)} />

          <TranslationsPanel
            entityType="events"
            entityId={form.id}
            fields={[
              { name: 'title', label: t('admin.events.title'), value: form.title },
              { name: 'description', label: t('admin.events.description'), value: form.description },
            ]}
          />

          <FormBanners error={sec.error} success={sec.success} />

          <div className="admin-form__actions">
            {editing && (
              <button type="button" className="admin-btn admin-btn--ghost" onClick={resetForm}>
                {t('admin.form.cancel')}
              </button>
            )}
            <button type="submit" className="admin-btn admin-btn--primary" disabled={sec.saving}>
              <Plus size={16} aria-hidden="true" />
              {sec.saving
                ? t('admin.form.saving')
                : editing
                  ? t('admin.form.submitSave')
                  : t('admin.events.submitCreate')}
            </button>
          </div>
        </form>
      </section>

      <section className="admin__list-section">
        <h2 className="admin__section-title">{t('admin.events.listTitle')}</h2>
        <ModerationList
          state={sec.state}
          titleOf={(r) => r.title}
          metaOf={(r) => [fmtMeta(r), r.location]}
          onApprove={sec.approve}
          onReject={sec.reject}
          onEdit={startEdit}
          onDelete={remove}
        />
      </section>
    </>
  )
}

// ============================================================================
// Guides
// ============================================================================

const emptyGuide = () => ({
  id: null,
  title: '',
  body: '',
  source_url: '',
  verified_at: '',
  status: 'approved',
})

function formFromGuide(g) {
  return {
    id: g.id,
    title: g.title ?? '',
    body: g.body ?? '',
    source_url: g.source_url ?? '',
    verified_at: toDateInput(g.verified_at),
    status: g.status ?? 'approved',
  }
}

function GuidesSection() {
  const { t } = useTranslation()
  const sec = useContentSection('guides')
  const [form, setForm] = useState(emptyGuide)
  const setField = (f, v) => setForm((s) => ({ ...s, [f]: v }))
  const editing = Boolean(form.id)

  const startEdit = (row) => {
    sec.setError('')
    sec.setSuccess('')
    setForm(formFromGuide(row))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const resetForm = () => {
    setForm(emptyGuide())
    sec.setError('')
  }
  // Drop the edit form if we're deleting the row it holds.
  const remove = (id) => {
    if (editing && form.id === id) resetForm()
    sec.remove(id)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const title = form.title.trim()
    if (!title) {
      sec.setError(t('admin.form.titleRequired'))
      return
    }
    const payload = {
      title,
      body: form.body.trim() || null,
      source_url: form.source_url.trim() || null,
      verified_at:
        inputToISO(form.verified_at) ??
        (form.status === 'approved' ? new Date().toISOString() : null),
      status: form.status,
    }
    const ok = await sec.save({ payload, isEdit: editing, id: form.id, name: title })
    if (ok) resetForm()
  }

  return (
    <>
      <section className="card admin__form-card">
        <h2 className="admin__section-title">
          {editing
            ? t('admin.form.editTitle', { name: form.title || t('admin.form.untitled') })
            : t('admin.guides.addTitle')}
        </h2>
        <form className="admin-form" onSubmit={handleSubmit}>
          <label className="admin-field">
            <span className="admin-field__label">{t('admin.guides.title')}</span>
            <input
              className="admin-field__input"
              type="text"
              value={form.title}
              onChange={(e) => setField('title', e.target.value)}
              placeholder={t('admin.guides.titlePlaceholder')}
              required
            />
          </label>

          <label className="admin-field">
            <span className="admin-field__label">{t('admin.guides.body')}</span>
            <textarea
              className="admin-field__input admin-field__textarea"
              rows={10}
              value={form.body}
              onChange={(e) => setField('body', e.target.value)}
              placeholder={t('admin.guides.bodyPlaceholder')}
            />
            <span className="admin-field__hint muted">{t('admin.guides.bodyHint')}</span>
          </label>

          <div className="admin-form__row">
            <label className="admin-field">
              <span className="admin-field__label">{t('admin.guides.sourceUrl')}</span>
              <input
                className="admin-field__input"
                type="url"
                value={form.source_url}
                onChange={(e) => setField('source_url', e.target.value)}
                placeholder={t('admin.form.websitePlaceholder')}
              />
            </label>
            <label className="admin-field">
              <span className="admin-field__label">{t('admin.form.verifiedAt')}</span>
              <input
                className="admin-field__input"
                type="date"
                value={form.verified_at}
                onChange={(e) => setField('verified_at', e.target.value)}
              />
            </label>
          </div>

          <StatusField value={form.status} onChange={(v) => setField('status', v)} />

          <TranslationsPanel
            entityType="guides"
            entityId={form.id}
            fields={[
              { name: 'title', label: t('admin.guides.title'), value: form.title },
              { name: 'body', label: t('admin.guides.body'), value: form.body },
            ]}
          />

          <FormBanners error={sec.error} success={sec.success} />

          <div className="admin-form__actions">
            {editing && (
              <button type="button" className="admin-btn admin-btn--ghost" onClick={resetForm}>
                {t('admin.form.cancel')}
              </button>
            )}
            <button type="submit" className="admin-btn admin-btn--primary" disabled={sec.saving}>
              <Plus size={16} aria-hidden="true" />
              {sec.saving
                ? t('admin.form.saving')
                : editing
                  ? t('admin.form.submitSave')
                  : t('admin.guides.submitCreate')}
            </button>
          </div>
        </form>
      </section>

      <section className="admin__list-section">
        <h2 className="admin__section-title">{t('admin.guides.listTitle')}</h2>
        <ModerationList
          state={sec.state}
          titleOf={(r) => r.title}
          metaOf={(r) => [r.body ? r.body.slice(0, 80) : null]}
          onApprove={sec.approve}
          onReject={sec.reject}
          onEdit={startEdit}
          onDelete={remove}
        />
      </section>
    </>
  )
}

// ============================================================================
// Market schedule (CLAUDE.md §4 screen 1) — the weekly market rotation.
// ============================================================================
// One group per weekday (Mon→Sun, ISO 1..7 — the week starts Monday). A weekday
// can host SEVERAL markets in different districts, so each day lists any number
// of market cards plus an "add market" button. Each card is its own market:
// district/name, photo, hours, address (+ optional coords for a route) and an
// active toggle. The Home "Markets today" rail shows the ACTIVE rows for the
// current weekday in Turkey time. A day with no cards (or all toggled off, e.g.
// Sunday) simply shows no market. Names translate via the shared panel.

// ISO weekday numbers in display order (Monday first). Labels come from i18n.
const DAYS = [1, 2, 3, 4, 5, 6, 7]

// Text input value -> number or null (blank/invalid coords become null).
function toNum(value) {
  const s = (value ?? '').trim()
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function formFromMarket(row) {
  return {
    id: row?.id ?? null,
    name: row?.name ?? '',
    image_url: row?.image_url ?? '',
    hours: row?.hours ?? '',
    address: row?.address ?? '',
    latitude: row?.latitude != null ? String(row.latitude) : '',
    longitude: row?.longitude != null ? String(row.longitude) : '',
    is_active: row ? Boolean(row.is_active) : true,
  }
}

function MarketScheduleSection() {
  const { t } = useTranslation()
  const { cityId } = useApp()
  const [state, setState] = useState({ status: 'loading', rows: [] })
  // Blank, not-yet-saved cards the owner has added, keyed by a local id so each
  // keeps its own form state until saved. Shape: [{ key, dow }].
  const [drafts, setDrafts] = useState([])

  // Refetch the schedule. Resolves through the async callbacks only (no
  // synchronous setState in the mount effect); state already starts as 'loading'.
  const reload = useCallback(() => {
    if (!cityId) return
    fetchMarketSchedule(cityId)
      .then((rows) => setState({ status: 'ready', rows }))
      .catch(() => setState({ status: 'error', rows: [] }))
  }, [cityId])

  useEffect(() => {
    reload()
  }, [reload])

  // Group the saved rows by weekday so each day lists its own markets (or none).
  const byDay = useMemo(() => {
    const m = new Map()
    for (const dow of DAYS) m.set(dow, [])
    for (const row of state.rows) m.get(row.day_of_week)?.push(row)
    return m
  }, [state.rows])

  const addDraft = (dow) => setDrafts((d) => [...d, { key: crypto.randomUUID(), dow }])
  const removeDraft = (key) => setDrafts((d) => d.filter((x) => x.key !== key))

  // A saved draft becomes a real row on the next reload — drop the blank card.
  const onDraftSaved = (key) => {
    removeDraft(key)
    reload()
  }

  return (
    <>
      <section className="card admin__form-card">
        <h2 className="admin__section-title">{t('admin.marketSchedule.title')}</h2>
        <p className="admin-field__hint muted">{t('admin.marketSchedule.hint')}</p>
      </section>

      {state.status === 'loading' ? (
        <p className="muted">{t('admin.list.loading')}</p>
      ) : state.status === 'error' ? (
        <p className="admin-form__error">{t('admin.list.error')}</p>
      ) : (
        DAYS.map((dow) => {
          const dayRows = byDay.get(dow) ?? []
          const dayDrafts = drafts.filter((d) => d.dow === dow)
          return (
            <section key={dow} className="card admin__form-card admin-day">
              <div className="admin-row__title-line">
                <h3 className="admin__section-title">
                  {t(`admin.marketSchedule.days.${dow}`)}
                </h3>
                <button
                  type="button"
                  className="admin-btn admin-btn--ghost"
                  onClick={() => addDraft(dow)}
                >
                  <Plus size={15} aria-hidden="true" />
                  {t('admin.marketSchedule.addMarket')}
                </button>
              </div>

              {dayRows.length === 0 && dayDrafts.length === 0 && (
                <p className="admin-field__hint muted">{t('admin.marketSchedule.dayEmpty')}</p>
              )}

              {dayRows.map((row) => (
                <MarketCard
                  key={row.id}
                  dow={dow}
                  row={row}
                  cityId={cityId}
                  onSaved={reload}
                  onDeleted={reload}
                />
              ))}

              {dayDrafts.map((draft) => (
                <MarketCard
                  key={draft.key}
                  dow={dow}
                  row={null}
                  cityId={cityId}
                  onSaved={() => onDraftSaved(draft.key)}
                  onDeleted={() => removeDraft(draft.key)}
                />
              ))}
            </section>
          )
        })
      )}
    </>
  )
}

// One market: editable card with its own save / delete / translations. `row` is
// null for a not-yet-saved market the owner just added; saving inserts it, and
// `onSaved` lets the parent swap the blank card for the real (reloaded) row.
function MarketCard({ dow, row, cityId, onSaved, onDeleted }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(() => formFromMarket(row))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Re-sync the card when its underlying row changes (e.g. after a reload).
  useEffect(() => {
    setForm(formFromMarket(row))
  }, [row])

  const setField = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (saving) return
    const name = form.name.trim()
    if (!name) {
      setError(t('admin.marketSchedule.nameRequired'))
      return
    }
    if (!cityId) {
      setError(t('admin.form.error'))
      return
    }
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await saveMarketScheduleRow({
        // Keep the id on update so translations stay attached to the same row.
        ...(form.id ? { id: form.id } : {}),
        city_id: cityId,
        day_of_week: dow,
        name,
        image_url: form.image_url.trim() || null,
        hours: form.hours.trim() || null,
        address: form.address.trim() || null,
        latitude: toNum(form.latitude),
        longitude: toNum(form.longitude),
        is_active: form.is_active,
      })
      setSuccess(t('admin.form.savedEdit', { name }))
      onSaved()
    } catch (err) {
      setError(describeError(err) || t('admin.form.error'))
    } finally {
      setSaving(false)
    }
  }

  // Delete a saved market (physical + its translations). For an unsaved draft
  // there's nothing to delete server-side — just drop the card via onDeleted.
  async function handleDelete() {
    if (!form.id) {
      onDeleted()
      return
    }
    if (!window.confirm(t('admin.actions.deleteConfirm'))) return
    setError('')
    setSuccess('')
    try {
      await deleteMarketScheduleDay(form.id)
      onDeleted()
    } catch (err) {
      setError(describeError(err) || t('admin.form.error'))
    }
  }

  return (
    <div className="admin-market-card">
      <form className="admin-form" onSubmit={handleSubmit}>
        <div className="admin-row__title-line">
          <label className="admin-toggle">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setField('is_active', e.target.checked)}
            />
            <span>{t('admin.marketSchedule.active')}</span>
          </label>
        </div>

        <label className="admin-field">
          <span className="admin-field__label">{t('admin.marketSchedule.name')}</span>
          <input
            className="admin-field__input"
            type="text"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            placeholder={t('admin.marketSchedule.namePlaceholder')}
          />
        </label>

        <PhotoField value={form.image_url} onChange={(v) => setField('image_url', v)} />

        <div className="admin-form__row">
          <label className="admin-field">
            <span className="admin-field__label">{t('admin.marketSchedule.hours')}</span>
            <input
              className="admin-field__input"
              type="text"
              value={form.hours}
              onChange={(e) => setField('hours', e.target.value)}
              placeholder={t('admin.marketSchedule.hoursPlaceholder')}
            />
          </label>
          <label className="admin-field">
            <span className="admin-field__label">{t('admin.marketSchedule.address')}</span>
            <input
              className="admin-field__input"
              type="text"
              value={form.address}
              onChange={(e) => setField('address', e.target.value)}
            />
          </label>
        </div>

        <div className="admin-form__row">
          <label className="admin-field">
            <span className="admin-field__label">{t('admin.marketSchedule.latitude')}</span>
            <input
              className="admin-field__input"
              type="text"
              inputMode="decimal"
              value={form.latitude}
              onChange={(e) => setField('latitude', e.target.value)}
              placeholder="36.5438"
            />
          </label>
          <label className="admin-field">
            <span className="admin-field__label">{t('admin.marketSchedule.longitude')}</span>
            <input
              className="admin-field__input"
              type="text"
              inputMode="decimal"
              value={form.longitude}
              onChange={(e) => setField('longitude', e.target.value)}
              placeholder="31.9997"
            />
          </label>
        </div>

        <TranslationsPanel
          entityType="market_schedule"
          entityId={form.id}
          fields={[{ name: 'name', label: t('admin.marketSchedule.name'), value: form.name }]}
        />

        <FormBanners error={error} success={success} />

        <div className="admin-form__actions">
          <button
            type="button"
            className="admin-btn admin-btn--ghost admin-action--delete"
            onClick={handleDelete}
          >
            <Trash2 size={15} aria-hidden="true" />
            {form.id ? t('admin.actions.delete') : t('admin.marketSchedule.removeDraft')}
          </button>
          <button type="submit" className="admin-btn admin-btn--primary" disabled={saving}>
            <Plus size={16} aria-hidden="true" />
            {saving ? t('admin.form.saving') : t('admin.form.submitSave')}
          </button>
        </div>
      </form>
    </div>
  )
}
