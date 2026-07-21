// Emergency phrasebook for the SOS screen (CLAUDE.md §4, §8).
//
// The point of this block is a screen you can SHOW to a doctor, a taxi driver
// or a passer-by. So the TURKISH sentence is the payload: it is a constant
// baked into the code (never machine-translated at runtime, never fetched), it
// is always visible, and tapping a phrase blows it up to fill the card.
//
// Each entry carries:
//   key      — i18n key; the MEANING of the phrase in the user's own language
//              lives at sos.phrases.<key> (ru + en filled by hand; the other 11
//              are filled by `npm run i18n:sync`, §8).
//   tr       — the Turkish sentence, everyday spoken register. CONSTANT.
//   translit — a diacritic-free reading aid for someone who has to say it out
//              loud and can't pronounce ç / ş / ğ / ı / ü / ö. Not a language:
//              c→j, ç→ch, ş→sh, ğ→(lengthens), ı→i, ü→u, ö→o.
//
// Order matters — most urgent first, same principle as the screen's blocks.
export const SOS_PHRASES = [
  { key: 'ambulance', tr: 'Ambulansa ihtiyacım var.', translit: 'Ambulansa ihtiyajim var.' },
  { key: 'childFever', tr: 'Çocuğumun ateşi çok yüksek.', translit: 'Chojumun ateshi chok yuksek.' },
  { key: 'police', tr: 'Polis çağırın, lütfen.', translit: 'Polis chagirin, lutfen.' },
  { key: 'lostDocuments', tr: 'Belgelerimi kaybettim.', translit: 'Belgelerimi kaybettim.' },
  { key: 'allergy', tr: 'Alerjim var.', translit: 'Alerjim var.' },
  { key: 'noTurkish', tr: 'Türkçe bilmiyorum.', translit: 'Turkche bilmiyorum.' },
  { key: 'interpreter', tr: 'Tercümana ihtiyacım var.', translit: 'Terjumana ihtiyajim var.' },
]
