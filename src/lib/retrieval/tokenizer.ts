/**
 * Lexical tokenizer shared by the BM25 index and the query path.
 *
 * Both sides must tokenize identically or the index is silently wrong, so this
 * is one function rather than two similar ones.
 */

// Deliberately short. Regulation text is dense with words a general-purpose
// stoplist would drop but which carry meaning here — "shall", "must", "not",
// "may" are the difference between a requirement and a permission.
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "to", "in", "for", "on", "at", "by",
  "with", "as", "is", "are", "was", "were", "be", "been", "that", "this",
  "these", "those", "it", "its", "from", "which", "such", "any",
]);

/** Light suffix stripping. Full Porter stemming costs more than it returns on
 *  a corpus this size, but plural and participle collapse measurably helps. */
function stem(token: string): string {
  if (token.length <= 3) return token;
  for (const suffix of ["ations", "ation", "ing", "ies", "ed", "es", "s"]) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 3) {
      const base = token.slice(0, -suffix.length);
      return suffix === "ies" ? `${base}y` : base;
    }
  }
  return token;
}

export function tokenize(text: string): string[] {
  const out: string[] = [];
  // Keeps citation forms intact: "99.31", "164.308(a)(1)" -> "164.308", "a", "1".
  for (const raw of text.toLowerCase().match(/[a-z0-9]+(?:\.[a-z0-9]+)*/g) ?? []) {
    if (STOPWORDS.has(raw)) continue;
    out.push(stem(raw));
  }
  return out;
}
