// render/inline.js — inline-level LaTeX → HTML.
//
// Recursive descent over text runs, {groups}, \commands, math placeholders
// (\uE000 n \uE001) and raw-asset placeholders (\uE002 n \uE003). HTML
// escaping applies ONLY to text runs and math source, never to generated
// markup. Unknown commands record via ctx.unknown() — the build fails CI if
// that report is non-empty (loud, never silent).
import { extractBraceGroup } from '../parse/tex-utils.js';

const INTERTEXT_CMD = /\\(?:intertext|shortintertext)\b/;

const PH_OPEN = '\uE000';
const PH_CLOSE = '\uE001';
const ASSET_OPEN = '\uE002';
const ASSET_CLOSE = '\uE003';

export function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** LaTeX ligatures/typography on an (already HTML-escaped) text run. */
function typography(s) {
  return s
    .replace(/---/g, '—')
    .replace(/--/g, '–')
    .replace(/``/g, '“')
    .replace(/''/g, '”')
    .replace(/`/g, '‘')
    .replace(/'/g, '’')
    .replace(/~/g, ' ');
}

/**
 * Plain-text projection (slugs, <title>, sidebar labels, img alt, search).
 * Math placeholders are restored to their TeX text, then commands dropped.
 */
export function texToPlain(tex, mathSpans) {
  let s = tex;
  if (mathSpans) {
    s = s.replace(new RegExp(`${PH_OPEN}(\\d+)${PH_CLOSE}`, 'g'), (_, n) => {
      const span = mathSpans[n];
      return span ? span.tex : '';
    });
    s = s.replace(/\\begin\{([a-zA-Z*]+)\}|\\end\{([a-zA-Z*]+)\}|\\tag\{[^}]*\}/g, '');
  }
  return s
    .replace(/\$\$?([^$]*)\$\$?/g, '$1')
    .replace(/\\(textbf|textsf|textsc|textsl|texttt|textrm|textmd|textup|textnormal|emph|underline|text|mathrm|mathbf|mathsf)\b/g, '')
    .replace(/\\(bf|it|em|tt|rm|sc|sf|sl|md)\b\s*/g, '')
    .replace(/\\(scriptsize|footnotesize|tiny|small|normalsize|large|Large)\b\s*/g, '')
    .replace(/\\([%&_#$])/g, '$1')
    .replace(/~/g, ' ')
    .replace(/``|''/g, '"')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Restore math placeholders to their original TeX. */
export function resolvePlaceholders(text, mathSpans) {
  if (!mathSpans) return text;
  return text.replace(new RegExp(`${PH_OPEN}(\\d+)${PH_CLOSE}`, 'g'), (_, n) => {
    const span = mathSpans[n];
    return span ? `$${span.tex}$` : '';
  });
}

/** Preprocess math TeX for MathJax (applied to span.tex at protect time). */
export function preprocessMathTex(tex) {
  return tex
    // \fbox{$X$} / \widefbox{$X$} inside math → \boxed{X}
    .replace(/\\(?:widefbox|fbox)\s*\{\s*\$([^$]*)\$\s*\}/g, '\\boxed{$1}')
    // babel Greek text commands used in math ($\othertau\otherrho...$)
    .replace(/\\other([a-zA-Z]+)/g, (_, name) => {
      const greek = OTHER_GREEK[name];
      return greek ? `\\text{${greek}}` : `\\text{?}`;
    })
    // \qed inside math → textual qed mark (matches the print's smallcaps "qed")
    .replace(/\\qed\b/g, '\\text{qed}')
    // \acute{\otheriota} was rewritten to \acute{\text{ί}} above; a bare
    // \acute over \text renders poorly — map the one composed form used.
    .replace(/\\acute\{\\text\{ί\}\}/g, '\\text{ί}');
}

/**
 * Post-annotation pass: resolve cross-refs, normalize \intertext bodies, and
 * convert displaymath envs to MathJax-friendly \[ ... \] form. Called once all
 * anchors exist (after annotateContent).
 */
export function finalizeMathSpans(pages, anchors, warnings) {
  for (const page of pages) {
    for (const span of page.mathSpans ?? []) {
      const src = span.rendered ?? span.tex;
      span.rendered = finalizeMathTex(src, anchors, warnings, page.name);
    }
  }
}

/** MathJax-ready TeX for one span (refs resolved, intertext/$ fixed). */
export function finalizeMathTex(tex, anchors, warnings, pageName) {
  let s = tex;
  s = unwrapDisplayMath(s);
  s = resolveMathRefs(s, anchors, warnings, pageName);
  s = normalizeIntertextBlocks(s);
  s = s.replace(/\\symbol\{(\d+)\}/g, (_, n) => {
    const code = Number(n);
    return Number.isFinite(code) ? String.fromCharCode(code) : `[${n}]`;
  });
  return s;
}

/** displaymath is not a MathJax environment — unwrap to bare display content. */
function unwrapDisplayMath(tex) {
  return tex.replace(
    /\\begin\{displaymath\*?\}([\s\S]*?)\\end\{displaymath\*?\}/g,
    (_, body) => body.trim()
  );
}

function resolveMathRefs(tex, anchors, warnings, pageName) {
  const where = pageName ?? 'math';
  return tex
    .replace(/\\ref\{([^}]+)\}/g, (_, label) => {
      const target = anchors.get(label);
      if (!target) {
        warnings.push(`${where}: unresolved \\ref{${label}} in math`);
        return '?';
      }
      return String(target.number ?? '?');
    })
    .replace(/\\pageref\{([^}]+)\}/g, (_, label) => {
      const target = anchors.get(label);
      if (!target) {
        warnings.push(`${where}: unresolved \\pageref{${label}} in math`);
        return '?';
      }
      return String(target.number ?? '?');
    });
}

/**
 * MathJax has no \\intertext — rewrite to \\text{...} rows inside align/gather.
 * Nested $...$ (LaTeX text-mode math) becomes \\(...\\) for MathJax.
 */
function normalizeIntertextBlocks(tex) {
  let out = '';
  let i = 0;
  while (i < tex.length) {
    const m = INTERTEXT_CMD.exec(tex.slice(i));
    if (!m) {
      out += tex.slice(i);
      break;
    }
    const idx = i + m.index;
    out += tex.slice(i, idx);
    const group = extractBraceGroup(tex, idx + m[0].length);
    if (!group) {
      out += m[0];
      i = idx + m[0].length;
      continue;
    }
    const body = group.value.replace(/\$([^$]+)\$/g, '\\($1\\)');
    out += `\\text{${body}}`;
    i = group.end;
  }
  return out;
}

const OTHER_GREEK = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ',
  eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν',
  xi: 'ξ', omicron: 'ο', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ',
  upsilon: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
};

/** Render one protected math span as MathJax-ready text. */
export function mathSpanHtml(span) {
  if (span.kind === 'inline') {
    return `\\(${escapeHtml(span.rendered ?? span.tex)}\\)`;
  }
  const tex = span.rendered ?? span.tex;
  if (span.kind === 'display') return `\\[${escapeHtml(tex)}\\]`;
  // env: numbered \tag injection + finalizeMathTex; MathJax processEnvironments
  // handles \begin{align} etc.; bare content (ex-displaymath) needs \[ \].
  if (/^\\begin\{/.test(tex.trim())) return escapeHtml(tex);
  return `\\[${escapeHtml(tex)}\\]`;
}

// Style switches valid at the start of a {group}: {\bf E} -> <strong>E</strong>.
const GROUP_STYLES = {
  bf: ['<strong>', '</strong>'],
  it: ['<em>', '</em>'],
  em: ['<em>', '</em>'],
  tt: ['<code>', '</code>'],
  sc: ['<span class="smallcaps">', '</span>'],
  sf: ['<span class="sans">', '</span>'],
  sl: ['<em>', '</em>'],
  md: ['', ''],
  rm: ['', ''],
  up: ['', ''],
  small: ['<small>', '</small>'],
  scriptsize: ['<small>', '</small>'],
  footnotesize: ['<small>', '</small>'],
  tiny: ['<small>', '</small>'],
  large: ['', ''],
  Large: ['', ''],
  normalsize: ['', ''],
};

// Zero-argument commands that render as fixed text.
const SYMBOLS = {
  copyright: '©',
  ldots: '…',
  dots: '…',
  cdots: '⋯',
  vdots: '⋮',
  ddots: '⋱',
  S: '§',
  textbackslash: '\\',
  textasciitilde: '~',
  quad: ' ',
  qquad: '  ',
  Degrees: '°',
  dag: '†',
  ddag: '‡',
  pounds: '£',
  textbullet: '•',
  qed: '<span class="qed-mark">qed</span>',
  newline: '<br />',
  hrule: '<hr class="rule" />',
  lineacross: '<hr class="rule" />',
  textwidth: '',
  linewidth: '',
  columnwidth: '',
  fboxsep: '',
  arraystretch: '',
};

// Commands dropped entirely (layout-only; no arguments consumed).
const DROP = new Set([
  'vfill', 'hfill', 'break', 'newpage', 'clearpage', 'cleardoublepage',
  'myclearpage', 'noindent', 'indent', 'raggedright', 'raggedleft',
  'bigskip', 'medskip', 'smallskip', 'centering', 'relax', 'protect',
  'strut', 'mathstrut', 'allowdisplaybreaks', 'displaybreak', 'stretch',
  'columnbreak', 'pagebreak', 'linebreak', 'flushbottom', 'sloppy',
  'scriptsize', 'footnotesize', 'tiny', 'small', 'normalsize', 'large',
  'Large', 'LARGE', 'huge', 'Huge', 'par', 'item', 'enskip', 'enspace',
  'thinspace', 'hrulefill', 'leftfill', 'nopagebreak', 'nointerlineskip',
  'sffamily', 'rmfamily', 'ttfamily', 'mdseries', 'bfseries', 'itshape',
  'upshape', 'scshape', 'slshape', 'normalfont', 'em', 'hline',
  'lstset', 'piccaption', 'parpic', 'subfigure', 'caption',
  'displaystyle', 'textstyle', 'scriptstyle', 'limits', 'nolimits',
  'Re', 'Im',
]);

// Commands whose argument groups are consumed and dropped.
const DROP_WITH_ARGS = {
  vspace: 1,
  hspace: 1,
  thispagestyle: 1,
  pagestyle: 1,
  setlength: 2,
  addtolength: 2,
  setcounter: 2,
  addcontentsline: 3,
  markboth: 2,
  markright: 1,
  phantomsection: 0,
  vglue: 1,
  hglue: 1,
  clig: 1,
  definecolor: 3,
  providecommand: 2,
  renewcommand: 2,
  newcommand: 2,
  hyphenpenalty: 1,
  unitlength: 1,
  picskip: 1,
  rowcolor: 1,
  columncolor: 1,
  hyphenation: 1,
};

export function renderInline(text, ctx) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === PH_OPEN || ch === ASSET_OPEN) {
      const closeCh = ch === PH_OPEN ? PH_CLOSE : ASSET_CLOSE;
      const end = text.indexOf(closeCh, i);
      const n = Number(text.slice(i + 1, end));
      if (ch === PH_OPEN) {
        out += mathSpanHtml(ctx.mathSpans[n]);
      } else {
        out += ctx.renderAsset ? ctx.renderAsset(n) : '';
      }
      i = end + 1;
      continue;
    }
    if (ch === '\\') {
      const res = renderCommand(text, i, ctx);
      out += res.html;
      i = res.end;
      continue;
    }
    if (ch === '{') {
      const group = extractBraceGroup(text, i);
      if (!group) {
        notice(ctx, 'unbalanced { in text');
        i++;
        continue;
      }
      out += renderGroup(group.value, ctx);
      i = group.end;
      continue;
    }
    if (ch === '}') {
      // This corpus opens groups inside math/lists that close after a
      // wrapper's matching brace (e.g. the exercises' {\small ...}} tails);
      // brace noise is a notice, not a build failure.
      notice(ctx, 'stray } in text');
      i++;
      continue;
    }
    let j = i;
    while (j < text.length && !`\\{}${PH_OPEN}${PH_CLOSE}${ASSET_OPEN}${ASSET_CLOSE}`.includes(text[j])) j++;
    out += typography(escapeHtml(text.slice(i, j)));
    i = j;
  }
  return out;
}

function renderGroup(inner, ctx) {
  const styleMatch = inner.match(/^\s*\\([a-zA-Z]+)\s*/);
  if (styleMatch && GROUP_STYLES[styleMatch[1]]) {
    const [open, close] = GROUP_STYLES[styleMatch[1]];
    return open + renderInline(inner.slice(styleMatch[0].length), ctx) + close;
  }
  const colorMatch = inner.match(/^\s*\\color\{([a-zA-Z]+)\}\s*/);
  if (colorMatch) {
    return (
      `<span class="tex-color-${escapeHtml(colorMatch[1])}">` +
      renderInline(inner.slice(colorMatch[0].length), ctx) +
      '</span>'
    );
  }
  return renderInline(inner, ctx);
}

function getGroup(text, pos, ctx, cmd) {
  let i = pos;
  while (i < text.length && /\s/.test(text[i])) i++;
  if (text[i] !== '{') return null;
  const group = extractBraceGroup(text, i);
  if (!group) {
    ctx.warnings.push(`${ctx.name}: unbalanced argument of \\${cmd}`);
    return null;
  }
  return group;
}

function getOptional(text, pos) {
  let i = pos;
  while (i < text.length && /\s/.test(text[i])) i++;
  if (text[i] !== '[') return null;
  const from = i;
  let depth = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === ']' && depth === 0) return { value: text.slice(from + 1, i), end: i + 1 };
    i++;
  }
  return null;
}

function renderCommand(text, i, ctx) {
  const m = /^\\([a-zA-Z]+)(\*?)/.exec(text.slice(i));
  if (!m) {
    const c = text[i + 1];
    switch (c) {
      case '\\':
        return { html: '<br />', end: i + 2 };
      case '&':
        return { html: '&amp;', end: i + 2 };
      case '%':
      case '_':
      case '#':
      case '$':
      case '{':
      case '}':
        return { html: c, end: i + 2 };
      case ',':
      case ';':
      case ':':
        return { html: ' ', end: i + 2 };
      case ' ':
      case '\n':
        return { html: ' ', end: i + 2 };
      case "'":
      case '`':
      case '^':
      case '"': {
        const combining = { "'": '\u0301', '`': '\u0300', '^': '\u0302', '"': '\u0308' }[c];
        let base = text[i + 2] ?? '';
        let end = i + 3;
        if (base === '{') {
          const group = extractBraceGroup(text, i + 2);
          if (group) {
            base = group.value;
            end = group.end;
          }
        }
        return { html: escapeHtml((base + combining).normalize('NFC')), end };
      }
      default:
        ctx.unknown(`\\${c ?? '<eof>'}`);
        return { html: '', end: i + 2 };
    }
  }

  const cmd = m[1];
  let pos = i + m[0].length;

  if (SYMBOLS[cmd] !== undefined) return { html: SYMBOLS[cmd], end: pos };
  if (DROP.has(cmd)) return { html: '', end: pos };
  if (DROP_WITH_ARGS[cmd] !== undefined) {
    const opt = getOptional(text, pos);
    if (opt) pos = opt.end;
    for (let k = 0; k < DROP_WITH_ARGS[cmd]; k++) {
      const g = getGroup(text, pos, ctx, cmd);
      if (!g) break;
      pos = g.end;
    }
    return { html: '', end: pos };
  }

  switch (cmd) {
    case 'emph':
    case 'textit':
    case 'textsl': {
      const g = getGroup(text, pos, ctx, cmd);
      if (!g) return { html: '', end: pos };
      return { html: `<em>${renderInline(g.value, ctx)}</em>`, end: g.end };
    }
    case 'textbf': {
      const g = getGroup(text, pos, ctx, cmd);
      if (!g) return { html: '', end: pos };
      return { html: `<strong>${renderInline(g.value, ctx)}</strong>`, end: g.end };
    }
    case 'texttt':
    case 'path': {
      const g = getGroup(text, pos, ctx, cmd);
      if (!g) return { html: '', end: pos };
      return { html: `<code>${renderInline(g.value, ctx)}</code>`, end: g.end };
    }
    case 'textsc': {
      const g = getGroup(text, pos, ctx, cmd);
      if (!g) return { html: '', end: pos };
      return { html: `<span class="smallcaps">${renderInline(g.value, ctx)}</span>`, end: g.end };
    }
    case 'textsf': {
      const g = getGroup(text, pos, ctx, cmd);
      if (!g) return { html: '', end: pos };
      return { html: `<span class="sans">${renderInline(g.value, ctx)}</span>`, end: g.end };
    }
    case 'textmd':
    case 'textrm':
    case 'textup':
    case 'textnormal':
    case 'mbox': {
      const g = getGroup(text, pos, ctx, cmd);
      if (!g) return { html: '', end: pos };
      return { html: renderInline(g.value, ctx), end: g.end };
    }
    case 'textsuperscript': {
      const g = getGroup(text, pos, ctx, cmd);
      if (!g) return { html: '', end: pos };
      return { html: `<sup>${renderInline(g.value, ctx)}</sup>`, end: g.end };
    }
    case 'textsubscript': {
      const g = getGroup(text, pos, ctx, cmd);
      if (!g) return { html: '', end: pos };
      return { html: `<sub>${renderInline(g.value, ctx)}</sub>`, end: g.end };
    }
    case 'underline': {
      const g = getGroup(text, pos, ctx, cmd);
      if (!g) return { html: '', end: pos };
      return { html: `<u>${renderInline(g.value, ctx)}</u>`, end: g.end };
    }
    case 'fbox':
    case 'widefbox': {
      const g = getGroup(text, pos, ctx, cmd);
      if (!g) return { html: '', end: pos };
      return { html: `<span class="tex-fbox">${renderInline(g.value, ctx)}</span>`, end: g.end };
    }
    case 'symbol': {
      const g = getGroup(text, pos, ctx, cmd);
      if (!g) return { html: '', end: pos };
      const code = parseInt(g.value, 10);
      return { html: escapeHtml(String.fromCharCode(code)), end: g.end };
    }
    case 'scalebox': {
      const g1 = getGroup(text, pos, ctx, cmd);
      const g2 = g1 && getGroup(text, g1.end, ctx, cmd);
      if (!g2) return { html: '', end: pos };
      return { html: renderInline(g2.value, ctx), end: g2.end };
    }
    case 'href': {
      const gUrl = getGroup(text, pos, ctx, cmd);
      const gText = gUrl && getGroup(text, gUrl.end, ctx, cmd);
      if (!gUrl || !gText) return { html: '', end: pos };
      const url = gUrl.value.replace(/\\([%#&_])/g, '$1');
      return {
        html: `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${renderInline(gText.value, ctx)}</a>`,
        end: gText.end,
      };
    }
    case 'url': {
      const g = getGroup(text, pos, ctx, cmd);
      if (!g) return { html: '', end: pos };
      let url = g.value.replace(/\\([%#&_])/g, '$1').trim();
      if (url.startsWith('<') && url.endsWith('>')) url = url.slice(1, -1);
      return {
        html: `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>`,
        end: g.end,
      };
    }
    case 'ref': {
      const g = getGroup(text, pos, ctx, cmd);
      if (!g) return { html: '', end: pos };
      const target = ctx.anchors && ctx.anchors.get(g.value);
      if (!target) {
        ctx.warnings.push(`${ctx.name}: unresolved \\ref{${g.value}}`);
        return { html: '<span class="missing-ref" title="unresolved reference">?</span>', end: g.end };
      }
      return {
        html: `<a href="${anchorHref(target, ctx)}">${escapeHtml(String(target.number ?? '?'))}</a>`,
        end: g.end,
      };
    }
    case 'pageref': {
      const g = getGroup(text, pos, ctx, cmd);
      if (!g) return { html: '', end: pos };
      const target = ctx.anchors && ctx.anchors.get(g.value);
      if (!target) {
        ctx.warnings.push(`${ctx.name}: unresolved \\pageref{${g.value}}`);
        return { html: '<span class="missing-ref" title="unresolved reference">?</span>', end: g.end };
      }
      // Print shows a page number; the web edition links the section instead.
      return {
        html: `<a href="${anchorHref(target, ctx)}">§ ${escapeHtml(String(target.number ?? '?'))}</a>`,
        end: g.end,
      };
    }
    case 'label': {
      const g = getGroup(text, pos, ctx, cmd);
      if (!g) return { html: '', end: pos };
      return { html: `<span id="${escapeHtml(g.value)}" class="label-anchor"></span>`, end: g.end };
    }
    case 'index': {
      const g = getGroup(text, pos, ctx, cmd);
      if (!g) return { html: '', end: pos };
      const id = `idx-${ctx.nextIndexId()}`;
      ctx.indexEntries.push({
        raw: resolvePlaceholders(g.value, ctx.mathSpans),
        id,
        page: ctx.page,
      });
      return { html: `<span id="${id}" class="index-anchor"></span>`, end: g.end };
    }
    case 'footnote': {
      const g = getGroup(text, pos, ctx, cmd);
      if (!g) return { html: '', end: pos };
      const n = ctx.footnotes.length + 1;
      ctx.footnotes.push(renderInline(g.value, ctx));
      return {
        html: `<sup class="footnote-ref" id="fnref-${n}"><a href="#fn-${n}">[${n}]</a></sup>`,
        end: g.end,
      };
    }
    case 'text': {
      const g = getGroup(text, pos, ctx, cmd);
      if (!g) return { html: '', end: pos };
      return { html: renderInline(g.value, ctx), end: g.end };
    }
    case 'sfrac': {
      const g1 = getGroup(text, pos, ctx, cmd);
      const g2 = g1 && getGroup(text, g1.end, ctx, cmd);
      if (!g1 || !g2) return { html: '', end: pos };
      return { html: `<span class="sfrac">${renderInline(g1.value, ctx)}⁄${renderInline(g2.value, ctx)}</span>`, end: g2.end };
    }
    case 'ovalbox':
    case 'cornersize': {
      const g = getGroup(text, pos, ctx, cmd);
      if (!g) return { html: '', end: pos };
      return { html: `<span class="calc-button">${renderInline(g.value, ctx)}</span>`, end: g.end };
    }
    case 'phantom':
    case 'hphantom':
    case 'vphantom': {
      const g = getGroup(text, pos, ctx, cmd);
      if (!g) return { html: '', end: pos };
      return { html: `<span class="tex-phantom">${renderInline(g.value, ctx)}</span>`, end: g.end };
    }
    case 'footnotemark': {
      let p = pos;
      const opt = getOptional(text, p);
      if (opt) p = opt.end;
      const n = ctx.footnotes.length + 1;
      ctx.footnotes.push('');
      return {
        html: `<sup class="footnote-ref" id="fnref-${n}"><a href="#fn-${n}">[${n}]</a></sup>`,
        end: p,
      };
    }
    case 'footnotetext': {
      const g = getGroup(text, pos, ctx, cmd);
      if (!g) return { html: '', end: pos };
      const rendered = renderInline(g.value, ctx);
      const lastIdx = ctx.footnotes.length - 1;
      if (lastIdx >= 0 && ctx.footnotes[lastIdx] === '') ctx.footnotes[lastIdx] = rendered;
      else ctx.footnotes.push(rendered);
      return { html: '', end: g.end };
    }
    case 'rule': {
      const opt = getOptional(text, pos);
      let p = opt ? opt.end : pos;
      for (let k = 0; k < 2; k++) {
        const g = getGroup(text, p, ctx, cmd);
        if (!g) break;
        p = g.end;
      }
      return { html: '<hr class="rule" />', end: p };
    }
    case 'bf':
    case 'it':
    case 'tt':
    case 'sc':
    case 'sf':
    case 'sl': {
      // Bare style switch outside a group (gnufdl license text): style the
      // rest of this text run.
      const style = { bf: 'strong', it: 'em', sl: 'em', tt: 'code', sc: 'smallcaps', sf: 'sans' }[cmd];
      const isTag = ['strong', 'em', 'code'].includes(style);
      const open = isTag ? `<${style}>` : `<span class="${style}">`;
      const close = isTag ? `</${style}>` : '</span>';
      return { html: `${open}${renderInline(text.slice(pos), ctx)}${close}`, end: text.length };
    }
    default: {
      ctx.unknown(`\\${cmd}`);
      const g = getGroup(text, pos, ctx, cmd);
      if (g) return { html: renderInline(g.value, ctx), end: g.end };
      return { html: '', end: pos };
    }
  }
}

function notice(ctx, msg) {
  const line = `${ctx.name}: ${msg}`;
  if (ctx.notices) ctx.notices.push(line);
  else ctx.warnings.push(line);
}

function anchorHref(target, ctx) {
  const samePage = ctx.page && target.url === ctx.page.url;
  const fragment = target.id ? `#${target.id}` : '';
  return samePage && fragment ? fragment : `${target.url}${fragment}`;
}
