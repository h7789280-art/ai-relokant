// Admin moderation panel — places/services (CLAUDE.md §5, §7, §12) — Stage 10.
//
// Closed route: only users present in the `admins` table reach it (the route in
// App.jsx redirects everyone else to /profile). Two tools, both city-scoped to
// the active city (Alanya at launch):
//   1. A form to add / edit a place by the §5 fields.
//   2. The city's place list with status + quick moderation actions (approve /
//      reject / edit / toggle promoted / toggle verified).
// Approving a place is all it takes for it to show up in the public Catalog and
// to be picked up by the AI chat — both read the same approved, city-scoped base.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router-dom'
import {
  Check,
  X,
  Pencil,
  Megaphone,
  BadgeCheck,
  Plus,
  ShieldCheck,
} from 'lucide-react'
import { useApp } from '../context/appContext.js'
import { useIsAdmin } from '../hooks/useIsAdmin.js'
import { fetchCategories, fetchAllSubcategories } from '../lib/content.js'
import {
  fetchAdminPlaces,
  createPlace,
  updatePlace,
  uploadPlacePhoto,
} from '../lib/admin.js'
import { SUPPORTED_LANGUAGES } from '../i18n/index.js'

// Client-side guard on the photo upload (the bucket also enforces type/size via
// its own config, but failing fast here gives a friendlier message).
const MAX_PHOTO_BYTES = 5 * 1024 * 1024 // 5 MB

// Empty form (a new place defaults to approved so the owner's own additions go
// live immediately — §7 lets the owner publish directly).
const emptyForm = () => ({
  id: null,
  name: '',
  description: '',
  address: '',
  phone: '',
  whatsapp: '',
  hours: '',
  languages: [],
  category_id: '',
  subcategory_id: '',
  photo: '',
  status: 'approved',
  is_promoted: false,
  is_verified: false,
})

// Map a place row → form state for editing.
function formFromPlace(p) {
  return {
    id: p.id,
    name: p.name ?? '',
    description: p.description ?? '',
    address: p.address ?? '',
    phone: p.phone ?? '',
    whatsapp: p.whatsapp ?? '',
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
  const { cityId, selection } = useApp()

  const [cats, setCats] = useState([])
  const [subs, setSubs] = useState([])
  const [places, setPlaces] = useState({ status: 'loading', rows: [] })
  const [form, setForm] = useState(emptyForm)
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

  // Subcategories of the currently selected category (for the dependent select).
  const formSubs = useMemo(
    () => subs.filter((s) => s.category_id === form.category_id),
    [subs, form.category_id],
  )

  const setField = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  // Picking a new category clears a now-mismatched subcategory.
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
    setForm(emptyForm())
    setError('')
  }

  // Upload a picked image to Supabase Storage and drop its public URL into the
  // same `photo` field the manual URL input writes to.
  async function handlePhotoFile(e) {
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
    if (!cityId) return

    // Build the row from the form. Empty optional fields are stored as null so
    // we don't litter the table with empty strings; photo becomes a 1-item array.
    const payload = {
      city_id: cityId,
      name,
      description: form.description.trim() || null,
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      whatsapp: form.whatsapp.trim() || null,
      hours: form.hours.trim() || null,
      languages: form.languages,
      category_id: form.category_id || null,
      subcategory_id: form.subcategory_id || null,
      photos: form.photo.trim() ? [form.photo.trim()] : [],
      status: form.status,
      is_promoted: form.is_promoted,
      is_verified: form.is_verified,
      // Stamp the moderation check date whenever the owner publishes (§5).
      verified_at: form.status === 'approved' ? new Date().toISOString() : null,
    }

    const wasEditing = Boolean(form.id)
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      if (wasEditing) {
        await updatePlace(form.id, payload)
      } else {
        await createPlace(payload)
      }
      resetForm()
      // Confirm the save (named, so it's obvious what landed) and re-load the
      // list. The form is now empty and ready for the next place.
      setSuccess(
        t(wasEditing ? 'admin.form.savedEdit' : 'admin.form.savedCreate', { name }),
      )
      loadPlaces()
    } catch (err) {
      setError(err?.message || t('admin.form.error'))
    } finally {
      setSaving(false)
    }
  }

  // Quick actions on a list row — optimistic-free: just re-fetch after the write.
  async function patch(place, changes) {
    try {
      await updatePlace(place.id, changes)
      loadPlaces()
    } catch (err) {
      setError(err?.message || t('admin.form.error'))
    }
  }

  const editing = Boolean(form.id)

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

      {/* ---- Add / edit form ---- */}
      <section className="card admin__form-card">
        <h2 className="admin__section-title">
          {editing ? t('admin.form.editTitle') : t('admin.form.addTitle')}
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

          <label className="admin-field">
            <span className="admin-field__label">{t('admin.form.status')}</span>
            <select
              className="admin-field__input"
              value={form.status}
              onChange={(e) => setField('status', e.target.value)}
            >
              <option value="approved">{t('admin.status.approved')}</option>
              <option value="pending">{t('admin.status.pending')}</option>
              <option value="rejected">{t('admin.status.rejected')}</option>
            </select>
          </label>

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

          {error && <p className="admin-form__error">{error}</p>}
          {success && (
            <p className="admin-form__success" role="status">
              <Check size={15} aria-hidden="true" />
              {success}
            </p>
          )}

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

      {/* ---- Places list ---- */}
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
                    {place.address && (
                      <span className="admin-row__meta">{place.address}</span>
                    )}
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
                    <button
                      type="button"
                      className="admin-action"
                      onClick={() => startEdit(place)}
                    >
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
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </main>
  )
}
