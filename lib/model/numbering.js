// model/numbering.js — chapters/sections → reading-order pages with URLs and
// print-style numbers. Section numbers are "N.M" (chapter.section), figures
// are "N.M.k" (the book numbers figures within sections via
// \numberwithin{figure}{section}); everything else numbers per chapter.
import { slugify } from './slugs.js';
import { texToPlain } from '../render/inline.js';

export function buildModel(structure) {
  const chapters = [];
  const pages = [];

  for (const ch of structure.chapters) {
    const isMain = ch.mode === 'main' && ch.number !== null;
    const chapter = {
      mode: ch.mode,
      number: isMain ? ch.number : null,
      title: ch.title,
      plainTitle: texToPlain(ch.title),
      sections: [],
      file: ch.file,
    };
    chapter.slug = chapterSlug(chapter);
    chapter.url = `/${chapter.slug}/`;
    chapter.displayTitle = isMain ? `${chapter.number}. ${chapter.plainTitle}` : chapter.plainTitle;

    // Chapter landing page (intro text before the first section).
    const chapterPage = {
      kind: 'chapter',
      permalink: `${chapter.url}index.html`,
      url: chapter.url,
      title: ch.title,
      displayTitle: chapter.displayTitle,
      number: isMain ? chapter.number : null,
      chapter,
      tex: ch.introTex,
      name: ch.file,
    };
    pages.push(chapterPage);

    // Section pages.
    ch.sections.forEach((sec, k) => {
      const number = isMain ? `${chapter.number}.${k + 1}` : `${k + 1}`;
      const plainTitle = texToPlain(sec.title);
      const slug = slugify(plainTitle);
      const url = isMain ? `/${chapter.number}-${k + 1}-${slug}/` : `/${chapter.slug}-${slug}/`;
      const section = {
        number,
        title: sec.title,
        plainTitle,
        displayTitle: `${number} ${plainTitle}`,
        url,
        chapter,
        tex: sec.tex,
        name: `${ch.file} §${number}`,
      };
      chapter.sections.push(section);
      pages.push({
        kind: 'section',
        permalink: `${url}index.html`,
        url,
        title: sec.title,
        displayTitle: `${number} ${plainTitle}`,
        number,
        chapter,
        section,
        tex: sec.tex,
        name: section.name,
      });
    });

    chapters.push(chapter);
  }

  return { chapters, pages };
}

function chapterSlug(chapter) {
  if (chapter.mode === 'front') return 'preface';
  const plain = chapter.plainTitle
    .replace(/^Appendix\s+([A-Z])\s*[:.]?\s*/i, 'appendix-$1-')
    .replace(/^GNU Free Documentation License$/i, 'gnu-fdl');
  const base = slugify(plain);
  if (chapter.mode === 'main' && chapter.number) return `${chapter.number}-${base}`;
  return base || 'chapter';
}
