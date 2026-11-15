/**
 * Search synonyms (doc 12.3): each group is one snack or idea under its regional names. The
 * migration loads these into catalog.search_synonyms; from there both search engines read them
 * (Elasticsearch builds its synonym filter from the table), so new groups need no code change.
 */
export const SYNONYM_GROUPS = [
  ['pani puri', 'golgappa', 'gol gappa', 'puchka', 'phuchka', 'gupchup', 'pani poori', 'paani puri'],
  ['bhel puri', 'bhel', 'jhal muri', 'churmuri'],
  ['murukku', 'chakli', 'chakri', 'murku'],
  ['laddu', 'laddoo', 'ladoo', 'ladu'],
  ['jalebi', 'jilebi', 'jilapi', 'imarti'],
  ['samosa', 'samsa', 'singara', 'shingara'],
  ['mirchi bajji', 'mirchi bhajji', 'mirapakaya bajji', 'chilli bajji', 'mirchi vada'],
  ['punugulu', 'punukulu', 'bonda'],
  ['dosa', 'dosai', 'dose'],
  ['idli', 'idly', 'iddli'],
  ['vada', 'vadai', 'wada', 'medu vada'],
  ['pongal', 'ven pongal', 'khara pongal'],
  ['upma', 'uppittu', 'uppma'],
  ['pesarattu', 'pesarattu dosa', 'moong dal dosa'],
  ['mysore pak', 'mysorepak', 'mysore paak'],
  ['rosogolla', 'rasgulla', 'rasagola', 'roshogolla'],
  ['sweet', 'sweets', 'mithai', 'mithai shop'],
  ['chips', 'wafers', 'crisps'],
  ['mixture', 'namkeen', 'farsan'],
  ['kulfi', 'kulfi falooda', 'matka kulfi'],
  ['chai', 'tea', 'irani chai'],
];
