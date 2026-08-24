// MathJax configuration for the rendered book.
//
// `macros` mirrors the author's preamble in mecmath-trigonometry/trigbook.tex
// (the \providecommand block) plus the package commands the text uses.
// MathJax only knows what is listed here: anything missing reaches the reader
// as red LaTeX source rather than math.
// scripts/check-math.js typesets the built HTML with this exact file and fails
// the build on any control sequence MathJax cannot resolve — so when the
// upstream preamble grows a macro, add it here too.

// MathJax resolves fonts against loader.paths.fonts, which defaults to the
// jsdelivr CDN. npm run update:vendor copies the newcm font next to the
// MathJax bundle, so point the loader there: a blocked or offline CDN
// otherwise aborts typesetting for the whole page and every equation on it
// falls back to raw LaTeX source. Derived from this script's own URL, since
// GitHub Pages serves the site under a path prefix and Vercel does not.
var MATHJAX_ASSETS = (function () {
  var self = typeof document !== 'undefined' && document.currentScript;
  return self ? new URL('.', self.src).href : '';
})();

MathJax = {
  loader: {
    load: ['[tex]/cancel', '[tex]/ams', '[tex]/mathtools', '[tex]/textmacros'],
    paths: { fonts: MATHJAX_ASSETS + 'mathjax/fonts' },
  },
  options: {
    ignoreHtmlClass: 'mathjax-skip',
    enableMenu: true,
    menuOptions: {
      settings: {
        enrich: true,
        speech: true,
        braille: true,
        help: true,
        inTabOrder: true,
        assistiveMml: false,
      },
    },
    a11y: {
      subtitles: true,
      viewBraille: false,
      voicing: false,
    },
  },
  tex: {
    packages: { '[+]': ['cancel', 'ams', 'mathtools', 'textmacros'] },
    inlineMath: [
      ['$', '$'],
      ['\\(', '\\)'],
    ],
    displayMath: [
      ['$$', '$$'],
      ['\\[', '\\]'],
    ],
    processEscapes: true,
    processEnvironments: true,
    tags: 'none',
    macros: {
      // --- delimiters ----------------------------------------------------
      abs: ['\\lvert\\mspace{1mu}#1\\mspace{1mu}\\rvert', 1],
      Abs: ['\\bigl\\lvert\\mspace{1mu}#1\\mspace{1mu}\\bigr\\rvert', 1],
      norm: ['\\lVert\\mspace{1mu}#1\\mspace{1mu}\\rVert', 1],
      Norm: ['\\bigl\\lVert\\mspace{1mu}#1\\mspace{1mu}\\bigr\\rVert', 1],
      NORM: ['\\Biggl\\lVert\\mspace{1mu}#1\\mspace{1mu}\\Biggr\\rVert', 1],
      ssub: ['#1_{\\scriptscriptstyle #2}', 2],
      ssubsum: ['#1_{\\scriptscriptstyle #3} + #2_{\\scriptscriptstyle #3}', 3],
      ival: ['\\lbrack #1,#2 \\rbrack', 2],
      Degrees: '^\\circ',

      // --- number systems ------------------------------------------------
      Reals: '\\mathbb{R}',
      Complex: '\\mathbb{C}',
      Rationals: '\\mathbb{Q}',
      Naturals: '\\mathbb{N}',
      Integers: '\\mathbb{Z}',

      // --- package commands MathJax does not ship -------------------------
      bm: ['\\boldsymbol{#1}', 1], // bm
      enskip: '\\mskip9mu', // 0.5em, as in plain TeX
      wideparen: ['\\overparen{#1}', 1], // yhmath
      thickspace: '\\;',
    },
  },
  chtml: {
    displayOverflow: 'overflow',
    scale: 1.0,
    minScale: 0.5,
  },
};
