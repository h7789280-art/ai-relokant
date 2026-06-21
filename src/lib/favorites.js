// Per-user favorites helpers (CLAUDE.md §3, §4). Favorites live in Supabase so
// they survive a device change; RLS guarantees a user only ever touches their
// own rows (see supabase/favorites.sql). For now everything is item_type
// 'place', but the table leaves room to favorite other content later.
//
// Use these helpers instead of calling `supabase.from('favorites')` directly.
import { supabase } from './supabase'

// Read the signed-in user's id from the locally-cached session (no network).
// Returns null when signed out — callers should soft-prompt for sign-in.
async function currentUserId() {
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.id ?? null
}

/**
 * Favorite item ids for the current user, newest first. Empty array when signed
 * out or with no favorites.
 * @param {string} [itemType]
 * @returns {Promise<string[]>}
 */
export async function listFavoriteIds(itemType = 'place') {
  const userId = await currentUserId()
  if (!userId) return []
  const { data, error } = await supabase
    .from('favorites')
    .select('item_id')
    .eq('user_id', userId)
    .eq('item_type', itemType)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => row.item_id)
}

/**
 * Is a given item in the current user's favorites? False when signed out.
 * @param {string} itemId
 * @param {string} [itemType]
 * @returns {Promise<boolean>}
 */
export async function isFavorite(itemId, itemType = 'place') {
  const userId = await currentUserId()
  if (!userId || !itemId) return false
  const { data, error } = await supabase
    .from('favorites')
    .select('item_id')
    .eq('user_id', userId)
    .eq('item_type', itemType)
    .eq('item_id', itemId)
    .maybeSingle()
  if (error) throw error
  return Boolean(data)
}

/**
 * Add an item to the current user's favorites. Idempotent (re-adding is a no-op
 * via the primary key). Throws if signed out — callers gate on auth first.
 * @param {string} itemId
 * @param {string} [itemType]
 */
export async function addFavorite(itemId, itemType = 'place') {
  const userId = await currentUserId()
  if (!userId) throw new Error('addFavorite: not signed in')
  const { error } = await supabase
    .from('favorites')
    .upsert(
      { user_id: userId, item_type: itemType, item_id: itemId },
      { onConflict: 'user_id,item_type,item_id', ignoreDuplicates: true },
    )
  if (error) throw error
}

/**
 * Remove an item from the current user's favorites. No-op when signed out.
 * @param {string} itemId
 * @param {string} [itemType]
 */
export async function removeFavorite(itemId, itemType = 'place') {
  const userId = await currentUserId()
  if (!userId) return
  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('user_id', userId)
    .eq('item_type', itemType)
    .eq('item_id', itemId)
  if (error) throw error
}
