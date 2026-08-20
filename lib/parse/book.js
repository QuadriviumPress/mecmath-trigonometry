// parse/book.js — trigbook.tex → chapter/section structure.
//
// The master file drives everything via \include{}: preface, chapters 1-6,
// appendices A/B, the GNU FDL, then an inline \addchap{History}. Cover, title
// page and TOC machinery in the master are print-only and skipped.
import fs from 'node:fs';
import { bookFile, srcFile } from '../paths.js';
import { stripLineComment, extractBraceGroup, extractBracketGroup } from './tex-utils.js';

/**
 * @returns {{
 *   chapters: Array<{
 *     mode: 'front'|'main'|'appendix'|'back',
 *     number: string|null,           // '1'..'6' for main chapters
 *     title: string,                 // raw TeX display title
 *     file: string,                  // source file base name (diagnostics)
 *     introTex: string,              // chapter body before the first \section
 *     sections: Array<{title: string, tex: string}>,
 *   }>,
 *   warnings: string[],
 * }}
 */
export function parseBook(root) {
  const warnings = [];
  const master = fs.readFileSync(bookFile(root), 'utf8');
  const body = sliceDocumentBody(master);

  // Ordered include list from the master, with the mode active at that point.
  const includes = [];
  let mode = 'front';
  for (const line of body.split('\n')) {
    const clean = stripLineComment(line);
    if (/^\\mainmatter\b/.test(clean.trim())) mode = 'main';
    const inc = clean.match(/\\include\{([^}]+)\}/);
    if (inc) includes.push({ name: inc[1], mode });
  }

  const chapters = [];
  let mainCounter = 0;
  for (const { name, mode: chapterMode } of includes) {
    let source;
    try {
      source = fs.readFileSync(srcFile(root, name), 'utf8');
    } catch {
      warnings.push(`missing include file: ${name}.tex`);
      continue;
    }
    const chapter = parseChapterFile(source, name, chapterMode, warnings);
    if (chapterMode === 'main' && chapter.isNumbered) {
      mainCounter += 1;
      chapter.number = String(mainCounter);
    }
    chapters.push(chapter);
  }

  // Inline History chapter from the master body.
  const histStart = body.indexOf('\\addchap{History}');
  if (histStart !== -1) {
    let tex = body.slice(histStart + '\\addchap{History}'.length);
    const backIdx = tex.indexOf('\\backmatter');
    if (backIdx !== -1) tex = tex.slice(0, backIdx);
    chapters.push({
      mode: 'back',
      number: null,
      title: 'History',
      file: 'trigbook',
      introTex: tex.trim(),
      sections: [],
    });
  } else {
    warnings.push('trigbook.tex: inline History chapter not found');
  }

  return { chapters, warnings };
}

function sliceDocumentBody(master) {
  const start = master.indexOf('\\begin{document}');
  const end = master.indexOf('\\end{document}');
  if (start === -1 || end === -1) {
    throw new Error('trigbook.tex: missing \\begin{document}/\\end{document}');
  }
  return master.slice(start + '\\begin{document}'.length, end);
}

/** Split one included file at its chapter heading and then at \section{}. */
function parseChapterFile(source, name, mode, warnings) {
  const stripped = source
    .split('\n')
    .filter(line => !line.trimStart().startsWith('%'))
    .map(stripLineComment)
    .join('\n');

  let title = null;
  let isNumbered = false;
  let headingEnd = 0;
  const chapIdx = stripped.search(/\\(chapter|addchap)\s*[\[{]/);
  if (chapIdx === -1) {
    warnings.push(`${name}: no \\chapter/\\addchap heading`);
    title = name;
  } else {
    const isAdd = stripped[chapIdx + 1] === 'a'; // addchap
    const cmdLen = isAdd ? '\\addchap'.length : '\\chapter'.length;
    const pos = chapIdx + cmdLen;
    const opt = extractBracketGroup(stripped, pos);
    const group = extractBraceGroup(stripped, opt ? opt.end : pos);
    if (!group) {
      warnings.push(`${name}: unbalanced chapter title`);
      title = name;
      headingEnd = stripped.length;
    } else if (isAdd) {
      // \addchap[toc title]{running head}: display the toc title when given.
      title = (opt ? opt.value : group.value).trim();
      headingEnd = group.end;
    } else {
      isNumbered = true;
      title = group.value.trim();
      headingEnd = group.end;
    }
  }

  // Split at \section{} (NOT \section*{} — starred headings stay in-flow and
  // render as subheadings, e.g. Appendix A's "Chapter 1" answer groups).
  const marks = [];
  let searchFrom = 0;
  for (;;) {
    const idx = stripped.indexOf('\\section{', searchFrom);
    if (idx === -1) break;
    const group = extractBraceGroup(stripped, idx + '\\section'.length);
    if (!group) {
      warnings.push(`${name}: unbalanced \\section title`);
      break;
    }
    marks.push({ title: group.value.trim(), end: group.end, start: idx });
    searchFrom = group.end;
  }

  const introTex = stripped.slice(headingEnd, marks.length ? marks[0].start : stripped.length).trim();
  const sections = marks.map((mark, k) => ({
    title: mark.title,
    tex: stripped.slice(mark.end, k + 1 < marks.length ? marks[k + 1].start : stripped.length).trim(),
  }));

  return { mode, number: null, title, file: name, isNumbered, introTex, sections };
}
