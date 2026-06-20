// Maps a category's `icon` string (stored in Supabase, see supabase/seed-categories.sql)
// to a lucide-react component. Keep the keys in sync with the seed file. Unknown
// or missing icons fall back to a neutral folder glyph so the grid never breaks.
import {
  Stethoscope,
  Stamp,
  Wrench,
  ShoppingBag,
  Pill,
  Landmark,
  FolderOpen,
} from 'lucide-react'

const ICONS = {
  Stethoscope,
  Stamp,
  Wrench,
  ShoppingBag,
  Pill,
  Landmark,
}

/** Resolve a stored icon name to a lucide component (FolderOpen if unknown). */
export function categoryIcon(name) {
  return ICONS[name] ?? FolderOpen
}
