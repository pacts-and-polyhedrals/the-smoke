// A short fingerprint of a journal page's words (letters and digits only, so markup, spacing, punctuation and
// entity changes made by Foundry on save don't count). Used to tell a page the GM has edited from one that is still
// exactly as the system shipped it, so updates refresh only the untouched pages.
export function textHash(html) {
  const s = String(html ?? '').replace(/<[^>]*>/g, '').replace(/&[#a-z0-9]+;/gi, '').replace(/[^\p{L}\p{N}]/gu, '');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return `${s.length.toString(36)}-${h.toString(36)}`;
}
