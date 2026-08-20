/**
 * Slugify a title: "Stokes' Theorem" -> "stokes-theorem".
 */
export function slugify(title) {
  return title
    .normalize('NFKD')
    .replace(/[’']/g, '') // drop apostrophes rather than hyphenating them
    .replace(/[̀-ͯ]/g, '') // strip diacritics left by NFKD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
