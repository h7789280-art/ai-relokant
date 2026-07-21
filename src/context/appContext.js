// App-wide selection context (CLAUDE.md §4): the active country, city and
// interface language chosen on the welcome screen. The active `cityId` is the
// scoping key every content read uses (see src/lib/content.js).
//
// Kept separate from the provider component so the provider file can export
// only a component (react-refresh / fast-refresh friendliness).
import { createContext, useContext } from 'react'

// localStorage key holding the persisted selection. Bumping the version resets
// onboarding for everyone if the stored shape ever changes.
export const STORAGE_KEY = 'citymate.selection.v1'

// localStorage key for the user's CITIZENSHIP (ISO alpha-2), set in the profile
// and read by the SOS screen to pick their consulate (§4 SOS). Kept in its own
// key, not inside the selection record: the selection is rewritten wholesale on
// every country/city change (confirmSelection), and citizenship must survive
// that — it is a fact about the person, not about where they currently are. It
// is deliberately NOT inferred from the interface language.
export const CITIZENSHIP_KEY = 'citymate.citizenship.v1'

export const AppContext = createContext(null)

/** Access the active selection + scoping helpers. Must be inside <AppProvider>. */
export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) {
    throw new Error('useApp must be used within <AppProvider>')
  }
  return ctx
}
