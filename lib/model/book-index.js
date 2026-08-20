// model/book-index.js — \index{...} entries → alphabetical back-of-book index.
// This corpus uses plain terms and one level of `!` subentries only.
import { texToPlain, resolvePlaceholders } from '../render/inline.js';

export function buildBookIndex(indexEntries, warnings) {
  // term -> { display, subs: Map(term -> display), refs: [{url,id,label}] }
  const byTerm = new Map();

  for (const entry of indexEntries) {
    const raw = texToPlain(resolvePlaceholders(entry.raw, null));
    const [topRaw, subRaw] = raw.split('!', 2);
    const top = topRaw.trim();
    const sub = subRaw ? subRaw.trim() : null;
    if (!top) continue;

    let item = byTerm.get(top.toLowerCase());
    if (!item) {
      item = { display: top, subs: new Map(), refs: [] };
      byTerm.set(top.toLowerCase(), item);
    }
    if (sub) {
      let subItem = item.subs.get(sub.toLowerCase());
      if (!subItem) {
        subItem = { display: sub, refs: [] };
        item.subs.set(sub.toLowerCase(), subItem);
      }
      if (subItem.refs.length === 0 || subItem.refs[0].url !== entry.page.url) {
        subItem.refs.push({ url: entry.page.url, id: entry.id, label: refLabel(entry.page) });
      }
    } else {
      if (item.refs.length === 0 || item.refs[0].url !== entry.page.url) {
        item.refs.push({ url: entry.page.url, id: entry.id, label: refLabel(entry.page) });
      }
    }
  }

  const sorted = [...byTerm.values()].sort((a, b) => a.display.localeCompare(b.display, 'en'));
  const letters = new Map();
  for (const item of sorted) {
    const letter = (item.display[0]?.toUpperCase?.() ?? '#').match(/[A-Z]/) ? item.display[0].toUpperCase() : '#';
    if (!letters.has(letter)) letters.set(letter, []);
    letters.get(letter).push({
      display: item.display,
      refs: item.refs,
      subs: [...item.subs.values()]
        .sort((a, b) => a.display.localeCompare(b.display, 'en'))
        .map(s => ({ display: s.display, refs: s.refs })),
    });
  }
  if (indexEntries.length === 0) warnings.push('no \\index entries collected');
  return [...letters.entries()].map(([letter, entries]) => ({ letter, entries }));
}

function refLabel(page) {
  if (page.kind === 'chapter' && page.chapter?.number) return `Ch. ${page.chapter.number}`;
  return page.number ? String(page.number) : page.displayTitle;
}
