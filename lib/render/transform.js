// render/transform.js — annotated blocks → HTML.
//
// Rendering rules follow the print book's visual language:
//   statethm/statecor/statedefn → shaded theorem boxes (shadethm colors)
//   exmp                         → "Example N.k" boxes with orange rule
//   statecomment                 → green rounded note boxes
//   proofbar                     → left-bar proof blocks
//   figure / parpic              → numbered figure floats / wrapped images
//   exercises                    → the fbox'd "Exercises" divider
import { renderInline, escapeHtml, mathSpanHtml, texToPlain } from './inline.js';

/**
 * @param {Array} blocks  annotated blocks of one page
 * @param {object} ctx    { page, anchors, warnings, footnotes, indexEntries,
 *                          nextIndexId, unknown, mathSpans, assets,
 *                          figureSrc(asset), name }
 */
export function renderBlocks(blocks, ctx) {
  const out = [];
  for (const block of blocks) out.push(renderBlock(block, ctx));
  return out.filter(Boolean).join('\n');
}

function renderBlock(block, ctx) {
  switch (block.type) {
    case 'p':
      return `<p>${renderInline(block.text, ctx)}</p>`;

    case 'displayMath': {
      const span = ctx.mathSpans[block.span];
      const id = span.firstLabelId ? ` id="${escapeHtml(span.firstLabelId)}"` : '';
      const cls = span.boxed ? 'equation-block boxed' : 'equation-block';
      const extra = (span.allLabelIds ?? [])
        .filter(l => l !== span.firstLabelId)
        .map(l => `<span id="${escapeHtml(l)}" class="visually-hidden"></span>`)
        .join('');
      return `<div class="${cls}"${id}>${extra}${mathSpanHtml(span)}</div>`;
    }

    case 'figureRow': {
      const figs = block.figures.map(f => renderBlock(f, ctx)).join('\n');
      return `<div class="figure-row">\n${figs}\n</div>`;
    }

    case 'figure':
      return renderFigure(block, ctx);

    case 'parpic':
      return renderParpic(block, ctx);

    case 'tableFloat':
      return renderTableFloat(block, ctx);

    case 'tabular':
      return renderTabular(block, ctx);

    case 'center':
      return `<div class="center">\n${renderBlocks(block.children, ctx)}\n</div>`;

    case 'centerline':
      return `<div class="centerline">${renderInline(block.text, ctx)}</div>`;

    case 'subheading': {
      const tag = `h${block.level}`;
      return `<${tag} class="subheading">${renderInline(block.title, ctx)}</${tag}>`;
    }

    case 'theorem':
      return renderTheorem(block, ctx);

    case 'example':
      return renderExample(block, ctx);

    case 'note':
      return `<div class="statecomment" role="note">\n${renderBlocks(block.children, ctx)}\n</div>`;

    case 'proof':
      return `<div class="proofbar">\n${renderBlocks(block.children, ctx)}\n</div>`;

    case 'list':
      return renderList(block, ctx);

    case 'descList': {
      const items = block.items
        .map(
          it =>
            `<div class="desc-item"><dt>${renderInline(it.label ?? '', ctx)}</dt><dd>${renderBlocks(it.children, ctx)}</dd></div>`
        )
        .join('\n');
      return `<dl class="desc-list">\n${items}\n</dl>`;
    }

    case 'multicols':
      return `<div class="multicols" style="--cols:${block.cols}">\n${renderBlocks(block.children, ctx)}\n</div>`;

    case 'sizeGroup':
      return `<div class="size-${escapeHtml(block.size)}">\n${renderBlocks(block.children, ctx)}\n</div>`;

    case 'quote':
      return `<blockquote>\n${renderBlocks(block.children, ctx)}\n</blockquote>`;

    case 'flushleft':
      return `<div class="flushleft">\n${renderBlocks(block.children, ctx)}\n</div>`;

    case 'flushright':
      return `<div class="flushright">\n${renderBlocks(block.children, ctx)}\n</div>`;

    case 'exercises':
      return (
        `<div class="exercises-start"${block.id ? ` id="${escapeHtml(block.id)}"` : ''}>` +
        `<span class="exercises-title">Exercises</span></div>`
      );

    case 'divider':
      return '<hr class="divider" />';

    case 'asset':
      return renderAssetImg(block.idx, ctx, block.scaled);

    case 'verbatim':
      return renderVerbatim(block, ctx);

    default:
      ctx.warnings.push(`${ctx.name}: renderer missing for block type ${block.type}`);
      return '';
  }
}

function renderTheorem(block, ctx) {
  const head = block.number
    ? `<p class="theorem-title">${escapeHtml(block.kindName)} ${escapeHtml(block.number)}</p>`
    : '';
  return (
    `<div class="theorem thm-${escapeHtml(block.kind)}"${block.id ? ` id="${escapeHtml(block.id)}"` : ''}>\n` +
    head +
    renderBlocks(block.children, ctx) +
    '\n</div>'
  );
}

function renderExample(block, ctx) {
  const head = block.number
    ? `<p class="example-title">Example ${escapeHtml(block.number)}</p>`
    : '';
  return `<div class="example">\n${head}${renderBlocks(block.children, ctx)}\n</div>`;
}

function renderList(block, ctx) {
  const tag = block.ordered ? 'ol' : 'ul';
  const attrs = [];
  if (block.ordered) {
    if (block.style && block.style !== 'decimal') attrs.push(`class="list-${block.style}"`);
    if (block.start && block.start > 1) attrs.push(`start="${block.start}"`);
  }
  const items = block.items
    .map(it => {
      const label = it.label ? `<span class="item-label">${renderInline(it.label, ctx)}</span> ` : '';
      return `<li>${label}${renderBlocks(it.children, ctx)}</li>`;
    })
    .join('\n');
  return `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}>\n${items}\n</${tag}>`;
}

function renderFigure(block, ctx) {
  let body = '';
  if (block.panels.length > 0) {
    const panels = block.panels
      .map((panel, k) => {
        const letter = String.fromCharCode(97 + k);
        const cap = panel.caption ? `<span class="panel-caption">(${letter})&nbsp;${renderInline(panel.caption, ctx)}</span>` : '';
        return (
          `<figure class="panel">\n${renderBlocks(panel.children, ctx)}\n${cap}\n</figure>`
        );
      })
      .join('\n');
    body = `<div class="figure-panels">\n${panels}\n</div>`;
  } else {
    body = renderBlocks(block.children, ctx);
  }

  const cap =
    block.number || block.caption
      ? `<figcaption>${
          block.number ? `<span class="figure-number">Figure ${escapeHtml(block.number)}</span>` : ''
        }${block.caption ? renderInline(block.caption, ctx) : ''}</figcaption>`
      : '';

  const id = block.id ? ` id="${escapeHtml(block.id)}"` : '';
  return `<figure class="figure-float"${id}>\n${body}\n${cap}\n</figure>`;
}

function renderParpic(block, ctx) {
  const id = block.id ? ` id="${escapeHtml(block.id)}"` : '';
  const cap =
    block.number || block.caption
      ? `<figcaption>${
          block.number ? `<span class="figure-number">Figure ${escapeHtml(block.number)}</span>` : ''
        }${block.caption ? renderInline(block.caption, ctx) : ''}</figcaption>`
      : '';
  return (
    `<figure class="parpic parpic-${block.side}"${id}>\n` +
    renderBlocks(block.children, ctx) +
    `\n${cap}\n</figure>`
  );
}

function renderTableFloat(block, ctx) {
  const id = block.id ? ` id="${escapeHtml(block.id)}"` : '';
  const cap = block.number
    ? `<figcaption><span class="table-number">Table ${escapeHtml(block.number)}</span>${block.caption ? renderInline(block.caption, ctx) : ''}</figcaption>`
    : '';
  return `<figure class="table-float"${id}>\n${cap}${renderBlocks(block.children, ctx)}\n</figure>`;
}

function renderTabular(block, ctx) {
  let col = 0;
  const align = (i, override) => `align-${override ?? block.columns[i] ?? 'left'}`;
  const rows = block.rows
    .map(row => {
      const cells = row.cells
        .map((cell, i) => {
          const cls = align(col, cell.align);
          const span = cell.span > 1 ? ` colspan="${cell.span}"` : '';
          col += cell.span;
          return `<td class="${cls}"${span}>${renderInline(cell.content, ctx)}</td>`;
        })
        .join('');
      col = 0;
      return `<tr${row.topline ? ' class="topline"' : ''}>${cells}</tr>`;
    })
    .join('\n');
  return (
    `<div class="tabular-wrap"><table class="tabular${block.bottomline ? ' bottomline' : ''}">\n` +
    `<tbody>\n${rows}\n</tbody>\n</table>\n</div>`
  );
}

function renderVerbatim(block, ctx) {
  // Verbatim assets are usually rendered through renderAsset(); kept for
  // direct block use.
  return renderAssetImg(block.idx ?? -1, ctx, false);
}

/** An asset placeholder inside inline content (image or code). */
export function makeAssetRenderer(ctx) {
  return idx => renderAssetImg(idx, ctx, false);
}

/** Public: render an asset for inline placeholders (used by book-data ctx). */
export function renderAssetImg(idx, ctx, scaled) {
  const asset = ctx.assets[idx];
  if (!asset) return '';
  const cls = scaled ? 'figure-asset scaled' : 'figure-asset';

  if (asset.kind === 'verbatim') {
    const caption =
      asset.caption !== undefined && asset.caption !== null
        ? `<figcaption><span class="figure-number">Listing</span> ${renderInline(asset.caption, ctx)}</figcaption>`
        : '';
    const id = asset.label ? ` id="${escapeHtml(asset.label)}"` : '';
    const lang = asset.env === 'lstlisting' ? 'java' : 'text';
    return `<figure class="code-float"${id}>\n<pre class="code"><code>${escapeHtml(asset.content.replace(/^\n+|\n+$/g, ''))}</code></pre>\n${caption}\n</figure>`;
  }

  const src = ctx.figureSrc(asset);
  if (!src) {
    return `<div class="figure-missing" data-asset="${escapeHtml(asset.id ?? asset.kind)}"></div>`;
  }
  const alt = asset.alt ?? altFromAsset(asset);
  return `<img class="${cls}" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" />`;
}

function altFromAsset(asset) {
  if (asset.kind === 'tikz') return texToPlain(asset.content) || 'figure';
  return asset.file || 'figure';
}
