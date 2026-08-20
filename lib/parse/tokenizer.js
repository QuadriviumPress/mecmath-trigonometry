// parse/tokenizer.js — a chapter intro or section body → structured block list.
//
// Stage order is load-bearing:
//   0. RAW protection (before comment stripping): verbatim-like environments
//      (Verbatim/verbatim/lstlisting) and tikzpicture bodies are lifted out
//      into asset slots; \input{X.tex} gnuplot figures and \includegraphics
//      images resolve to asset slots; \lstset captions attach to the next
//      lstlisting. Raw content may contain %, $, \ in any combination, so it
//      must never see later stages.
//   1. Comments stripped line-by-line.
//   2. Math protection: $...$, $$...$$ and display math environments
//      (equation, align, alignat, gather, multline, empheq, displaymath)
//      become placeholders; nested $...$ inside display spans stays inside the
//      span verbatim.
//   3. Block segmentation: text environments, theorem macros, floats
//      (figure / parpic), lists with paralist suspend/resume, paragraphs.
import {
  stripLineComment,
  extractBraceGroup,
  extractBracketGroup,
  extractEnv,
  splitTopLevel,
  skipWs,
} from './tex-utils.js';
import { preprocessMathTex } from '../render/inline.js';

export const PH_OPEN = '\uE000';
export const PH_CLOSE = '\uE001';
export const ASSET_OPEN = '\uE002';
export const ASSET_CLOSE = '\uE003';

export const PH_RE = /\uE000(\d+)\uE001/g;
export const ASSET_RE = /\uE002(\d+)\uE003/g;

// Text environments handled as blocks in stage 3.
export const TEXT_ENVS = new Set([
  'figure',
  'figure*',
  'table',
  'table*',
  'center',
  'itemize',
  'enumerate',
  'description',
  'quote',
  'quotation',
  'flushleft',
  'flushright',
  'multicols',
  'minipage',
  'tabular',
  'exmp',
  'proofbar',
]);

const SIZE_GROUPS = new Set([
  'small',
  'footnotesize',
  'scriptsize',
  'tiny',
  'large',
  'Large',
  'normalsize',
]);

/**
 * @param {string} source raw TeX of one chapter intro / section body
 * @param {{name?: string}} opts
 */
export function tokenize(source, { name = 'section' } = {}) {
  const warnings = [];
  const notices = [];
  const assets = [];
  const mathSpans = [];

  const putAsset = asset => {
    assets.push(asset);
    return assets.length - 1;
  };

  const stage0 = protectRaw(source, { warnings, name, putAsset });
  const stripped = stripComments(stage0);
  const { text } = protectMath(stripped, mathSpans, warnings, name);
  const ctx = { warnings, notices, name, mathSpans, assets };
  const blocks = parseBlocks(text, ctx);

  return { blocks, mathSpans, assets, warnings, notices };
}

// ---------------------------------------------------------------------------
// Stage 0 — raw extraction
// ---------------------------------------------------------------------------

const VERBATIM_ENVS = new Set([
  'Verbatim',
  'Verbatim*',
  'verbatim',
  'verbatim*',
  'lstlisting',
  'lstlisting*',
]);

function protectRaw(source, { warnings, name, putAsset }) {
  let pendingListing = null; // from \lstset: {caption, label} for next lstlisting

  let out = '';
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch !== '\\') {
      out += ch;
      i++;
      continue;
    }
    const begin = /^\\begin\{([a-zA-Z]+\*?)\}/.exec(source.slice(i, i + 30));
    if (begin) {
      const env = begin[1];
      if (VERBATIM_ENVS.has(env)) {
        const span = extractVerbatimEnv(source, i, env);
        if (span) {
          const asset = { kind: 'verbatim', env, content: span.inner, opts: span.opts };
          if ((env === 'lstlisting' || env === 'lstlisting*') && pendingListing) {
            asset.caption = pendingListing.caption;
            asset.label = pendingListing.label;
            pendingListing = null;
          }
          out += wrapAsset(putAsset(asset));
          i = span.end;
          continue;
        }
      }
      if (env === 'tikzpicture') {
        const span = extractEnv(source, i, env);
        if (span) {
          const asset = {
            kind: 'tikz',
            content: `\\begin{tikzpicture}${span.inner}\\end{tikzpicture}`,
          };
          out += wrapAsset(putAsset(asset));
          i = span.end;
          continue;
        }
        warnings.push(`${name}: unbalanced tikzpicture`);
      }
      out += source.slice(i, i + begin[0].length);
      i += begin[0].length;
      continue;
    }
    if (source.startsWith('\\input{', i)) {
      const group = extractBraceGroup(source, i + '\\input'.length);
      if (group) {
        const file = group.value.trim().replace(/\.tex$/, '');
        out += wrapAsset(putAsset({ kind: 'gnuplot', file }));
        i = group.end;
        continue;
      }
    }
    const inc = includegraphicsAt(source, i);
    if (inc) {
      out += wrapAsset(putAsset({ kind: 'image', file: inc.file }));
      i = inc.end;
      continue;
    }
    if (source.startsWith('\\lstset{', i)) {
      const group = extractBraceGroup(source, i + '\\lstset'.length);
      if (group) {
        const captionM = group.value.match(/caption\s*=\s*\{((?:[^{}]|\{[^{}]*\})*)\}/);
        const labelM = group.value.match(/label\s*=\s*([a-zA-Z0-9_:@.\-]+)/);
        pendingListing = {
          caption: captionM ? captionM[1] : null,
          label: labelM ? labelM[1] : null,
        };
        out += '';
        i = group.end;
        continue;
      }
    }
    out += source.slice(i, i + 2);
    i += 2;
  }
  return out;
}

function wrapAsset(idx) {
  return ASSET_OPEN + idx + ASSET_CLOSE;
}

function includegraphicsAt(source, i) {
  const rest = source.slice(i);
  const m = /^\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/.exec(rest);
  if (!m) return null;
  return { file: m[1].trim(), end: i + m[0].length };
}

function extractVerbatimEnv(source, start, env) {
  const open = `\\begin{${env}}`;
  const close = `\\end{${env}}`;
  const openEnd = start + open.length;
  const end = source.indexOf(close, openEnd);
  if (end === -1) return null;
  let opts = null;
  let innerStart = openEnd;
  if (env.startsWith('Verbatim') || env.startsWith('lstlisting')) {
    const br = extractBracketGroup(source, openEnd);
    if (br && source.slice(openEnd, br.from).trim() === '') {
      opts = br.value;
      innerStart = br.end;
    }
  }
  return { inner: source.slice(innerStart, end), end: end + close.length, opts };
}

function stripComments(source) {
  const out = [];
  for (const line of source.split('\n')) {
    if (line.trimStart().startsWith('%')) continue;
    out.push(stripLineComment(line));
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Stage 2 — math protection
// ---------------------------------------------------------------------------

export function protectMath(text, mathSpans, warnings, name) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      if (text[i + 1] === '[') {
        // \[ ... \] display math
        const end = text.indexOf('\\]', i + 2);
        if (end === -1) {
          warnings.push(`${name}: unterminated \\[ display math`);
          out += '\\[';
          i += 2;
          continue;
        }
        mathSpans.push({ kind: 'display', tex: preprocessMathTex(text.slice(i + 2, end)) });
        out += PH_OPEN + (mathSpans.length - 1) + PH_CLOSE;
        i = end + 2;
        continue;
      }
      const begin =
        /^\\begin\{(equation\*?|align\*?|alignat\*?|gather\*?|multline\*?|empheq|displaymath|split)\}/.exec(
          text.slice(i, i + 30)
        );
      if (begin) {
        const env = begin[1];
        const span = extractMathEnv(text, i, env, warnings, name);
        if (span) {
          mathSpans.push(span.span);
          out += PH_OPEN + (mathSpans.length - 1) + PH_CLOSE;
          i = span.end;
          continue;
        }
      }
      out += text.slice(i, i + 2); // escaped char (\$ etc.) stays verbatim
      i += 2;
      continue;
    }
    if (ch === '$') {
      const isDisplay = text[i + 1] === '$';
      const delimLen = isDisplay ? 2 : 1;
      let j = i + delimLen;
      let found = -1;
      while (j < text.length) {
        if (text[j] === '\\') {
          j += 2;
          continue;
        }
        if (text[j] === '$' && (!isDisplay || text[j + 1] === '$')) {
          found = j;
          break;
        }
        j++;
      }
      if (found === -1) {
        warnings.push(`${name}: unterminated ${isDisplay ? '$$' : '$'} math`);
        out += ch;
        i++;
        continue;
      }
      mathSpans.push({
        kind: isDisplay ? 'display' : 'inline',
        tex: preprocessMathTex(text.slice(i + delimLen, found)),
      });
      out += PH_OPEN + (mathSpans.length - 1) + PH_CLOSE;
      i = found + delimLen;
      continue;
    }
    out += ch;
    i++;
  }
  return { text: out, mathSpans };
}

/** Whole display env → span. empheq is unwrapped to its inner environment. */
function extractMathEnv(text, start, env, warnings, name) {
  const span = extractEnv(text, start, env);
  if (!span) {
    warnings.push(`${name}: unbalanced \\begin{${env}}`);
    return null;
  }
  const whole = text.slice(start, span.end);

  if (env !== 'empheq') {
    return { end: span.end, span: { kind: 'env', env, innerEnv: env, boxed: false, tex: preprocessMathTex(whole) } };
  }

  // \begin{empheq}[box=\widefbox]{equation|alignat=3} body \end{empheq}
  const opt = extractBracketGroup(span.inner, 0);
  const grp = extractBraceGroup(span.inner, opt ? opt.end : 0);
  if (!grp) {
    warnings.push(`${name}: malformed empheq`);
    return null;
  }
  const boxed = /\bbox\s*=/.test(opt ? opt.value : '');
  const spec = grp.value;
  const m = spec.match(/^([a-zA-Z]+)(?:=(\d+))?$/);
  if (!m) {
    warnings.push(`${name}: empheq env spec "${spec}"`);
    return null;
  }
  const innerEnv = m[1];
  const cols = m[2] ? `{${m[2]}}` : '';
  const tex =
    `\\begin{${innerEnv}}${cols}` + preprocessMathTex(span.inner.slice(grp.end)) + `\\end{${innerEnv}}`;
  return { end: span.end, span: { kind: 'env', env, innerEnv, boxed, tex } };
}

// ---------------------------------------------------------------------------
// Stage 3 — block segmentation
// ---------------------------------------------------------------------------

function parseBlocks(text, ctx) {
  const blocks = [];
  let buf = '';
  const flush = () => {
    if (buf.trim()) blocks.push(...paragraphBlocks(buf, ctx));
    buf = '';
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    if (ch === '{' && bufCommandsOnly(buf)) {
      // Block-level {group}: {\small ...} wrappers around exercises etc. A
      // preceding run of layout commands (\vspace{5mm}\noindent...) does not
      // prevent the group from starting a block.
      const group = extractBraceGroup(text, i);
      if (group) {
        const styleMatch = group.value.match(/^\\([a-zA-Z]+)\s*/);
        if (styleMatch && SIZE_GROUPS.has(styleMatch[1])) {
          flush();
          blocks.push({
            type: 'sizeGroup',
            size: styleMatch[1],
            children: parseBlocks(group.value.slice(styleMatch[0].length), ctx),
          });
          i = group.end;
          continue;
        }
      }
      buf += ch;
      i++;
      continue;
    }

    if (ch === '\\') {
      // \par ends a paragraph.
      if (text.startsWith('\\par', i) && !/[a-zA-Z]/.test(text[i + 4] ?? '')) {
        flush();
        i += 4;
        continue;
      }

      const begin = /^\\begin\{([a-zA-Z]+\*?)\}/.exec(text.slice(i, i + 30));
      if (begin && TEXT_ENVS.has(begin[1])) {
        flush();
        const env = begin[1];
        const span = extractEnv(text, i, env);
        if (!span) {
          ctx.warnings.push(`${ctx.name}: unbalanced \\begin{${env}}`);
          i += begin[0].length;
          continue;
        }
        blocks.push(...envBlocks(env, span.inner, ctx));
        i = span.end;
        continue;
      }

      const macro = blockMacroAt(text.slice(i), ctx);
      if (macro) {
        flush();
        blocks.push(...macro.blocks);
        i += macro.end;
        continue;
      }

      const strayEnd = /^\\end\{([a-zA-Z]+\*?)\}/.exec(text.slice(i, i + 30));
      if (strayEnd) {
        if (TEXT_ENVS.has(strayEnd[1])) {
          ctx.warnings.push(`${ctx.name}: unbalanced \\end{${strayEnd[1]}}`);
        }
        i += strayEnd[0].length;
        continue;
      }

      buf += text.slice(i, i + 2);
      i += 2;
      continue;
    }

    buf += ch;
    i++;
  }
  flush();
  return blocks;
}

/**
 * Parse the tail of \parpic: up to two (dims) groups, up to two [opts]
 * groups, then the {content} group. picins syntax:
 * \parpic(width,height)(xoff,yoff)[pos][frame]{content}
 */
function parseParpicTail(text, from, ctx) {
  let pos = skipWs(text, from);
  if (!text.startsWith('\\parpic', pos)) return null;
  pos += '\\parpic'.length;
  for (let k = 0; k < 2; k++) {
    const p = skipWs(text, pos);
    if (text[p] !== '(') break;
    const close = text.indexOf(')', p);
    if (close === -1) break;
    pos = close + 1;
  }
  let side = 'right';
  const opt = extractBracketGroup(text, pos);
  if (opt) {
    if (opt.value.includes('l')) side = 'left';
    pos = opt.end;
    const opt2 = extractBracketGroup(text, pos);
    if (opt2) pos = opt2.end;
  }
  const contentG = extractBraceGroup(text, pos);
  if (!contentG) return null;
  return { side, children: parseBlocks(contentG.value, ctx), end: contentG.end };
}

/** True when a paragraph buffer holds only layout commands and whitespace. */
function bufCommandsOnly(buf) {
  return buf
    .replace(/\\[a-zA-Z]+\s*(\[[^\]]*\])?\s*(\{[^{}]*\})?/g, '')
    .trim() === '';
}

/**
 * Commands that begin a block. `text` starts at the backslash; returned `end`
 * is relative to that position.
 */
function blockMacroAt(text, ctx) {
  const name = ctx.name;

  // \statethm{label}{body} (also statecor / statedefn) — theorem statements.
  let m = /^\\(statethm|statecor|statedefn)\s*\{/.exec(text);
  if (m) {
    const kind = m[1] === 'statethm' ? 'thm' : m[1] === 'statecor' ? 'cor' : 'defn';
    const labelG = extractBraceGroup(text, m[0].length - 1);
    if (!labelG) return null;
    const bodyG = extractBraceGroup(text, labelG.end);
    if (!bodyG) {
      ctx.warnings.push(`${name}: unbalanced \\${m[1]} body`);
      return { blocks: [], end: m[0].length };
    }
    return {
      blocks: [{ type: 'theorem', kind, label: labelG.value.trim(), children: parseBlocks(bodyG.value, ctx) }],
      end: bodyG.end,
    };
  }

  // \statecomment[width]{body} — green note box.
  m = /^\\statecomment\s*(?=[[{])/.exec(text);
  if (m) {
    const opt = extractBracketGroup(text, m[0].length);
    const from = opt ? opt.end : m[0].length;
    const bodyG = extractBraceGroup(text, from);
    if (!bodyG) return null;
    return { blocks: [{ type: 'note', children: parseBlocks(bodyG.value, ctx) }], end: bodyG.end };
  }

  // \startexercises (usually immediately followed by \label{secNdotM})
  if (text.startsWith('\\startexercises')) {
    let end = '\\startexercises'.length;
    const labelM = /^\s*\\label\{([^}]+)\}/.exec(text.slice(end));
    let label = null;
    if (labelM) {
      label = labelM[1];
      end += labelM[0].length;
    }
    return { blocks: [{ type: 'exercises', label }], end };
  }

  if (text.startsWith('\\divider')) {
    return { blocks: [{ type: 'divider' }], end: '\\divider'.length };
  }

  // Starred (unnumbered) section headings kept in-flow, e.g. Appendix A's
  // "Chapter 1" answer groups.
  const headM = /^\\(section|subsection)\*?\s*\{/.exec(text);
  if (headM) {
    const g = extractBraceGroup(text, headM[0].length - 1);
    if (g) {
      return {
        blocks: [
          {
            type: 'subheading',
            level: headM[1] === 'section' ? 2 : 3,
            title: g.value.trim(),
          },
        ],
        end: g.end,
      };
    }
  }

  if (text.startsWith('\\centerline')) {
    const g = extractBraceGroup(text, '\\centerline'.length);
    if (g) return { blocks: [{ type: 'centerline', text: g.value.trim() }], end: g.end };
  }

  // \piccaption[cap]{cap+label}\parpic(...)(...)[pos]{content} — wrapped figure.
  if (text.startsWith('\\piccaption')) {
    const capOpt = extractBracketGroup(text, '\\piccaption'.length);
    const capFrom = capOpt ? capOpt.end : '\\piccaption'.length;
    const capGroup = extractBraceGroup(text, capFrom);
    if (capGroup) {
      const pic = parseParpicTail(text, capGroup.end, ctx);
      if (pic) {
        let cap = capOpt ? capOpt.value : '';
        let label = null;
        const labM = capGroup.value.match(/\\label\{([^}]+)\}/);
        if (labM) {
          label = labM[1];
          cap +=
            capGroup.value.slice(0, labM.index) + capGroup.value.slice(labM.index + labM[0].length);
          cap = cap.trim();
        }
        return {
          blocks: [
            {
              type: 'parpic',
              side: pic.side,
              caption: cap.trim(),
              label,
              children: pic.children,
            },
          ],
          end: pic.end,
        };
      }
    }
    // Malformed pair — drop the \piccaption and let \parpic handle itself.
    const capG = capGroup || capOpt;
    return { blocks: [], end: capG ? capG.end : '\\piccaption'.length };
  }

  // Bare \parpic(...)...[pos]{content} — unnumbered wrapped image.
  if (text.startsWith('\\parpic')) {
    const pic = parseParpicTail(text, '\\parpic'.length, ctx);
    if (pic) {
      return {
        blocks: [
          {
            type: 'parpic',
            side: pic.side,
            caption: null,
            label: null,
            children: pic.children,
          },
        ],
        end: pic.end,
      };
    }
  }

  // \probs{title} — problem-group heading (defined in the master preamble).
  m = /^\\probs\s*\{/.exec(text);
  if (m) {
    const g = extractBraceGroup(text, m[0].length - 1);
    if (g) return { blocks: [{ type: 'p', text: `\\textbf{${g.value}}` }], end: g.end };
  }

  // \scalebox{f}{content} — pass through (asset scaling handled by renderer).
  m = /^\\scalebox\s*\{[^}]*\}\s*\{/.exec(text);
  if (m) {
    const g = extractBraceGroup(text, m[0].length - 1);
    if (g) {
      const inner = g.value.trim();
      const assetM = ASSET_RE.exec(inner);
      if (assetM && assetM[0] === inner) {
        return { blocks: [{ type: 'asset', idx: Number(assetM[1]), scaled: true }], end: g.end };
      }
      return { blocks: parseBlocks(inner, ctx), end: g.end };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Environments → blocks
// ---------------------------------------------------------------------------

function envBlocks(env, inner, ctx) {
  switch (env) {
    case 'figure':
    case 'figure*':
      return [parseFigure(skipPlacementArg(inner), ctx)];
    case 'table':
    case 'table*':
      return [parseTableFloat(skipPlacementArg(inner), ctx)];
    case 'center':
      return [{ type: 'center', children: parseBlocks(inner, ctx) }];
    case 'exmp':
      return [{ type: 'example', children: parseBlocks(inner, ctx) }];
    case 'proofbar':
      return [{ type: 'proof', children: parseBlocks(inner, ctx) }];
    case 'minipage': {
      let pos = skipWs(inner, 0);
      const opt = extractBracketGroup(inner, pos);
      if (opt) pos = opt.end;
      const widthG = extractBraceGroup(inner, pos);
      const body = widthG ? inner.slice(widthG.end) : inner;
      return parseBlocks(body, ctx);
    }
    case 'multicols': {
      const pos = skipWs(inner, 0);
      const nG = extractBraceGroup(inner, pos);
      const cols = nG ? parseInt(nG.value, 10) || 2 : 2;
      const body = nG ? inner.slice(nG.end) : inner;
      return [{ type: 'multicols', cols, children: parseBlocks(body, ctx) }];
    }
    case 'tabular':
      return [parseTabular(inner, ctx)];
    case 'itemize':
      return [{ type: 'list', ordered: false, items: parseListItems(inner, ctx) }];
    case 'enumerate':
      return parseEnumerate(inner, ctx);
    case 'description':
      return [{ type: 'descList', items: parseDescriptionItems(inner, ctx) }];
    case 'quote':
    case 'quotation':
      return [{ type: 'quote', children: parseBlocks(inner, ctx) }];
    case 'flushleft':
      return [{ type: 'flushleft', children: parseBlocks(inner, ctx) }];
    case 'flushright':
      return [{ type: 'flushright', children: parseBlocks(inner, ctx) }];
    default:
      ctx.warnings.push(`${ctx.name}: unhandled environment ${env}`);
      return [{ type: 'p', text: inner }];
  }
}

function skipPlacementArg(inner) {
  const pos = skipWs(inner, 0);
  if (inner[pos] !== '[') return inner;
  const end = inner.indexOf(']', pos);
  if (end === -1) return inner;
  return inner.slice(end + 1);
}

/** Replace \begin{minipage}[..]{..} body \end{minipage} with its body. */
function unwrapMinipages(text, ctx) {
  let out = text;
  for (;;) {
    // Innermost-last first: siblings and nested wrappers both unwrap cleanly.
    const idx = out.lastIndexOf('\\begin{minipage}');
    if (idx === -1) return out;
    const span = extractEnv(out, idx, 'minipage');
    if (!span) {
      ctx.warnings.push(`${ctx.name}: unbalanced minipage in figure`);
      return out;
    }
    let pos = skipWs(out, idx + '\\begin{minipage}'.length);
    const opt = extractBracketGroup(out, pos);
    if (opt) pos = opt.end;
    const widthG = extractBraceGroup(out, pos);
    const body = widthG
      ? out.slice(widthG.end, span.end - '\\end{minipage}'.length)
      : span.inner;
    out = out.slice(0, idx) + body + out.slice(span.end);
  }
}

/**
 * Figures: a row of \subfloat[..][cap]{content} panels, or a single image
 * asset (possibly wrapped in center), plus \caption[opt]{text} and \label.
 */
function parseFigure(inner, ctx) {
  // Multi-panel figures: sibling minipages each carrying their own \caption
  // are independently numbered figures laid out side by side in print.
  const mpCount = (inner.match(/\\begin\{minipage\}/g) || []).length;
  const capCount = (inner.match(/\\caption/g) || []).length;
  if (mpCount > 1 && capCount > 1) {
    const panels = splitMinipagePanels(inner, ctx);
    if (panels.length > 1) {
      const figures = panels.map(p => parseSingleFigure(p, ctx));
      return { type: 'figureRow', figures };
    }
  }
  return parseSingleFigure(unwrapMinipages(inner, ctx), ctx);
}

/** Top-level minipage bodies of a multi-panel figure. */
function splitMinipagePanels(text, ctx) {
  const panels = [];
  let rest = text;
  while (rest.includes('\\begin{minipage}')) {
    const idx = rest.lastIndexOf('\\begin{minipage}');
    const span = extractEnv(rest, idx, 'minipage');
    if (!span) {
      ctx.warnings.push(`${ctx.name}: unbalanced minipage panel`);
      break;
    }
    let pos = skipWs(rest, idx + '\\begin{minipage}'.length);
    const opt = extractBracketGroup(rest, pos);
    if (opt) pos = opt.end;
    const widthG = extractBraceGroup(rest, pos);
    panels.unshift(widthG ? rest.slice(widthG.end, span.end - '\\end{minipage}'.length) : span.inner);
    rest = rest.slice(0, idx) + rest.slice(span.end);
  }
  return panels;
}

function parseSingleFigure(inner, ctx) {
  const panels = [];
  let caption = null;
  let label = null;

  let i = 0;
  while (i < inner.length) {
    if (inner[i] !== '\\') {
      i++;
      continue;
    }
    if (inner.startsWith('\\subfloat', i)) {
      let pos = i + '\\subfloat'.length;
      const caps = [];
      for (;;) {
        const br = extractBracketGroup(inner, pos);
        if (!br || br.from !== pos) break;
        caps.push(br.value);
        pos = br.end;
      }
      const g = extractBraceGroup(inner, pos);
      if (!g) {
        ctx.warnings.push(`${ctx.name}: unbalanced \\subfloat`);
        i = pos;
        continue;
      }
      panels.push({
        caption: caps.length > 1 ? caps[1] : caps.length === 1 ? caps[0] : '',
        children: parseBlocks(g.value, ctx),
      });
      i = g.end;
      continue;
    }
    if (inner.startsWith('\\caption', i)) {
      const opt = extractBracketGroup(inner, i + '\\caption'.length);
      const g = extractBraceGroup(inner, opt ? opt.end : i + '\\caption'.length);
      if (g) {
        let cap = g.value;
        const labM = cap.match(/\\label\{([^}]+)\}/);
        if (labM) {
          label = labM[1];
          cap = cap.replace(labM[0], '');
        }
        caption = cap.trim().replace(/^(\\quad|\\;|~|\s)+/, '').trim();
        i = g.end;
        continue;
      }
      i += '\\caption'.length;
      continue;
    }
    if (inner.startsWith('\\label{', i)) {
      const g = extractBraceGroup(inner, i + '\\label'.length);
      if (g) {
        if (!label) label = g.value;
        i = g.end;
        continue;
      }
    }
    i += 2;
  }

  let children = [];
  if (panels.length === 0) {
    const body = inner
      .replace(/\\caption(\[[^\]]*\])?\{((?:[^{}]|\{[^{}]*\})*)\}/g, '')
      .replace(/\\label\{[^}]*\}/g, '')
      .replace(/\\centering/g, '')
      .replace(/\\centerline\{((?:[^{}]|\{[^{}]*\})*)\}/g, '$1');
    children = parseBlocks(body, ctx);
  }

  if (panels.length === 0 && !label && !caption) {
    // Unnumbered, uncaptioned figure (Appendix B screenshots): fine in print,
    // worth a notice so coverage stays auditable.
    ctx.notices.push(`${ctx.name}: figure without number or caption`);
  }
  if (caption && !label) {
    ctx.warnings.push(`${ctx.name}: captioned figure without a \\label`);
  }
  return { type: 'figure', panels, caption, label, children };
}

function parseTableFloat(inner, ctx) {
  let caption = null;
  let label = null;
  let rest = inner;
  const capIdx = inner.search(/\\caption\s*[[{]/);
  if (capIdx !== -1) {
    const opt = extractBracketGroup(inner, capIdx + '\\caption'.length);
    const g = extractBraceGroup(inner, opt ? opt.end : capIdx + '\\caption'.length);
    if (g) {
      let cap = g.value;
      const labM = cap.match(/\\label\{([^}]+)\}/);
      if (labM) {
        label = labM[1];
        cap = cap.replace(labM[0], '');
      }
      caption = cap.trim().replace(/^(\\quad|\\;|~|\s)+/, '').trim();
      rest = inner.slice(0, capIdx) + inner.slice(g.end);
    }
  }
  const children = parseBlocks(rest.replace(/\\centering/g, ''), ctx);
  return { type: 'tableFloat', caption, label, children };
}

/**
 * paralist enumerate: optional [style] after \begin{enumerate};
 * \suspend{enumerate} / \resume{enumerate}[style] split it into chunks with
 * interstitial text; continued chunks keep numbering via `start`.
 */
function parseEnumerate(inner, ctx) {
  let pos = skipWs(inner, 0);
  let style = null;
  const styleOpt = extractBracketGroup(inner, pos);
  if (styleOpt && styleOpt.from === pos) {
    style = listStyle(styleOpt.value);
    pos = styleOpt.end;
  }
  const body = inner.slice(pos);

  // Split on suspend/resume pairs.
  const parts = [];
  const suspRe = /\\suspend\{([a-zA-Z*]+)\}/g;
  let match;
  let last = 0;
  while ((match = suspRe.exec(body))) {
    parts.push({ kind: 'seg', text: body.slice(last, match.index) });
    const resumeRe = new RegExp(`\\\\resume\\{${match[1]}\\}`);
    const resumeMatch = resumeRe.exec(body.slice(suspRe.lastIndex));
    if (resumeMatch) {
      const between = body.slice(suspRe.lastIndex, suspRe.lastIndex + resumeMatch.index);
      parts.push({ kind: 'between', text: between });
      let after = suspRe.lastIndex + resumeMatch.index + resumeMatch[0].length;
      let nextStyle = style;
      const opt = extractBracketGroup(body, after);
      if (opt && opt.from === after) {
        nextStyle = listStyle(opt.value.replace(/^\{|\}$/g, ''));
        after = opt.end;
      }
      style = nextStyle;
      last = after;
      suspRe.lastIndex = after;
    } else {
      parts.push({ kind: 'between', text: '' });
      last = suspRe.lastIndex;
    }
  }
  parts.push({ kind: 'seg', text: body.slice(last) });

  const blocks = [];
  let count = 0;
  for (const part of parts) {
    if (part.kind === 'between') {
      if (part.text.trim()) blocks.push(...parseBlocks(part.text, ctx));
      continue;
    }
    const { items, prefix } = collectItems(part.text, ctx);
    if (prefix.trim()) blocks.push(...parseBlocks(prefix, ctx));
    if (items.length === 0) continue;
    count += items.length;
    blocks.push({ type: 'list', ordered: true, style, start: count - items.length + 1, items });
  }
  if (blocks.length === 0) blocks.push({ type: 'list', ordered: true, style, start: 1, items: [] });
  return blocks;
}

const LIST_ENVS = new Set(['enumerate', 'itemize', 'description', 'compactenum', 'compactitem']);
// Layout wrappers that may span \item boundaries inside a list (multicols
// groups answer-style items in this corpus); transparent to item splitting.
const TRANSPARENT_ENVS = new Set(['multicols', 'center']);

/** Parse \item entries of one list segment. */
function collectItems(segment, ctx) {
  // Pass 1: walk with a list-only environment depth. Non-list environments
  // (multicols wrappers, centers) are masked out of the text so their bodies
  // cannot confuse item splitting; list envs inside an item body keep their
  // \items attached to that item.
  let masked = '';
  let current = null;
  const raw = [];
  let listDepth = 0;
  let firstItemAt = -1;
  let i = 0;
  while (i < segment.length) {
    if (segment[i] === '\\') {
      const bm = /^\\begin\{([a-zA-Z]+\*?)\}/.exec(segment.slice(i, i + 30));
      if (bm) {
        const env = bm[1];
        if (TRANSPARENT_ENVS.has(env)) {
          masked += ' '.repeat(bm[0].length);
          i += bm[0].length;
          continue;
        }
        if (LIST_ENVS.has(env)) listDepth++;
        masked += bm[0];
        i += bm[0].length;
        continue;
      }
      const em = /^\\end\{([a-zA-Z]+\*?)\}/.exec(segment.slice(i, i + 30));
      if (em) {
        const env = em[1];
        if (TRANSPARENT_ENVS.has(env)) {
          masked += ' '.repeat(em[0].length);
          i += em[0].length;
          continue;
        }
        if (LIST_ENVS.has(env)) listDepth = Math.max(0, listDepth - 1);
        masked += em[0];
        i += em[0].length;
        continue;
      }
      if (
        listDepth === 0 &&
        segment.startsWith('\\item', i) &&
        !/[a-zA-Z]/.test(segment[i + 5] ?? '')
      ) {
        if (current) current.end = i;
        let pos = i + 5;
        let label = null;
        const br = extractBracketGroup(segment, pos);
        if (br && br.from === skipWs(segment, pos)) {
          label = br.value;
          pos = br.end;
        }
        current = { label, start: pos, end: segment.length };
        raw.push(current);
        if (firstItemAt === -1) firstItemAt = i;
        masked += ' '.repeat(pos - i); // keep masked length == segment length
        i = pos;
        continue;
      }
      masked += segment.slice(i, i + 2);
      i += 2;
      continue;
    }
    masked += segment[i];
    i++;
  }
  if (current) current.end = segment.length;

  // Content before the first \item (e.g. a parpic placed right after
  // \resume{enumerate}) becomes a sibling prefix, not list content.
  const prefix = firstItemAt === -1 ? masked : masked.slice(0, firstItemAt);

  return {
    prefix,
    items: raw.map(item => ({
      label: item.label,
      children: parseBlocks(masked.slice(item.start, item.end), ctx),
    })),
  };
}

/** Map paralist optional label syntax to a CSS list-style token. */
function listStyle(raw) {
  if (!raw) return null;
  const s = raw.replace(/\\[a-zA-Z]+|\s|\{|\}/g, '');
  if (/^\(?[a-z][).]?$/.test(s)) return 'lower-alpha';
  if (/^\(?[A-Z][).]?$/.test(s)) return 'upper-alpha';
  if (/^\(?[ivx]+[).]?$/.test(s)) return 'lower-roman';
  if (/^\(?[IVX]+[).]?$/.test(s)) return 'upper-roman';
  return 'decimal';
}

function parseListItems(inner, ctx) {
  const { items } = collectItems(inner, ctx);
  if (items.length === 0) ctx.warnings.push(`${ctx.name}: list without \\item`);
  return items;
}

function parseDescriptionItems(inner, ctx) {
  const items = [];
  let current = null;
  let depth = 0;
  let i = 0;
  const push = end => {
    if (current) {
      items.push({
        label: current.label,
        children: parseBlocks(inner.slice(current.bodyStart, end), ctx),
      });
    }
  };
  while (i < inner.length) {
    if (inner[i] === '\\') {
      if (depth === 0 && inner.startsWith('\\item', i) && !/[a-zA-Z]/.test(inner[i + 5] ?? '')) {
        push(i);
        let bodyStart = i + 5;
        let label = null;
        const br = extractBracketGroup(inner, bodyStart);
        if (br && br.from === skipWs(inner, bodyStart)) {
          label = br.value;
          bodyStart = br.end;
        }
        current = { label, bodyStart };
        i = bodyStart;
        continue;
      }
      if (/^\\begin\{/.test(inner.slice(i, i + 8))) depth++;
      if (/^\\end\{/.test(inner.slice(i, i + 6))) depth--;
      i += 2;
      continue;
    }
    i++;
  }
  push(inner.length);
  return items;
}

// ---------------------------------------------------------------------------
// Tabular
// ---------------------------------------------------------------------------

function parseTabular(inner, ctx) {
  const pos = skipWs(inner, 0);
  const specG = extractBraceGroup(inner, pos);
  if (!specG) {
    ctx.warnings.push(`${ctx.name}: tabular without column spec`);
    return { type: 'p', text: inner };
  }
  // Column spec: letters l/c/r/p{..}, with | rules and !{..} separators.
  const columns = [];
  for (const part of splitTopLevel(specG.value, '!')) {
    const noBrace = part.replace(/\{[^{}]*\}/g, '');
    for (const ch of noBrace) {
      if (ch === 'l' || ch === 'p') columns.push('left');
      else if (ch === 'c') columns.push('center');
      else if (ch === 'r') columns.push('right');
    }
  }

  const body = inner.slice(specG.end);
  const rows = [];
  let start = 0;
  let hlineForNext = 0;
  const pushRow = end => {
    let text = body.slice(start, end);
    let hlines = hlineForNext;
    hlineForNext = 0;
    let m;
    while ((m = text.match(/^\s*\\hline/))) {
      hlines++;
      text = text.slice(m[0].length);
    }
    const trailing = text.match(/(\\hline\s*)+$/);
    if (trailing) {
      hlineForNext = (trailing[0].match(/\\hline/g) || []).length;
      text = text.slice(0, trailing.index);
    }
    if (text.trim() === '') {
      hlineForNext = Math.max(hlineForNext, hlines);
      return;
    }
    const cells = splitTopLevel(text, '&').map(c => parseCell(c.trim()));
    rows.push({ cells, topline: hlines > 0 });
  };
  let i = 0;
  let depth = 0;
  while (i < body.length) {
    if (body[i] === '\\') {
      if (body[i + 1] === '\\' && depth === 0) {
        let after = i + 2;
        const br = extractBracketGroup(body, after);
        if (br && br.from === after) after = br.end;
        pushRow(i);
        start = after;
        i = after;
        continue;
      }
      if (/^\\begin\{/.test(body.slice(i, i + 8))) depth++;
      if (/^\\end\{/.test(body.slice(i, i + 6))) depth--;
      i += 2;
      continue;
    }
    if (body[i] === '{') depth++;
    if (body[i] === '}') depth--;
    i++;
  }
  pushRow(body.length);
  return { type: 'tabular', columns, rows, bottomline: hlineForNext > 0 };
}

/** One tabular cell: detects \multicolumn{span}{spec}{content}. */
function parseCell(cell) {
  const m = /^\\multicolumn\{(\d+)\}\{[^{}]*([lcr])[^{}]*\}\s*\{/.exec(cell);
  if (!m) return { content: cell, span: 1, align: null };
  const g = extractBraceGroup(cell, m[0].length - 1);
  if (!g) return { content: cell, span: 1, align: null };
  const align = { l: 'left', c: 'center', r: 'right' }[m[2]];
  return { content: g.value, span: Number(m[1]), align };
}

// ---------------------------------------------------------------------------
// Paragraphs
// ---------------------------------------------------------------------------

function paragraphBlocks(buf, ctx) {
  const blocks = [];
  for (const para of buf.split(/\n\s*\n/)) {
    let last = 0;
    const pieces = [];
    PH_RE.lastIndex = 0;
    let m;
    while ((m = PH_RE.exec(para))) {
      const span = ctx.mathSpans[Number(m[1])];
      if (span.kind === 'inline') continue;
      pieces.push({ text: para.slice(last, m.index) });
      pieces.push({ math: Number(m[1]) });
      last = m.index + m[0].length;
    }
    pieces.push({ text: para.slice(last) });
    for (const piece of pieces) {
      if (piece.math !== undefined) {
        blocks.push({ type: 'displayMath', span: piece.math });
      } else if (piece.text && piece.text.trim() !== '') {
        blocks.push({ type: 'p', text: piece.text.trim() });
      }
    }
  }
  return blocks;
}
