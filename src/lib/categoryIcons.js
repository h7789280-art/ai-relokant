// Maps a category's `icon` string (stored in Supabase, see supabase/seed-categories.sql)
// to a lucide-react component. Keep the keys in sync with the seed file. Unknown
// or missing icons fall back to a neutral folder glyph so the grid never breaks.
import {
  Stethoscope,
  FileText,
  Wrench,
  ShoppingBag,
  Store,
  Utensils,
  Bus,
  Baby,
  Palmtree,
  Building2,
  PawPrint,
  FolderOpen,
} from 'lucide-react'

const ICONS = {
  Stethoscope,
  FileText,
  Wrench,
  ShoppingBag,
  Store,
  Utensils,
  Bus,
  Baby,
  Palmtree,
  Building2,
  PawPrint,
}

/** Resolve a stored icon name to a lucide component (FolderOpen if unknown). */
export function categoryIcon(name) {
  return ICONS[name] ?? FolderOpen
}
