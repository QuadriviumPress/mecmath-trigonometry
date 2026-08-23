MathJax = {
  loader: { load: ['[tex]/cancel', '[tex]/ams'] },
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
    packages: { '[+]': ['cancel', 'ams'] },
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
      Degrees: '^\\circ',
      abs: ['\\lvert#1\\rvert', 1],
      norm: ['\\lVert#1\\rVert', 1],
      Reals: '\\mathbb{R}',
      Complex: '\\mathbb{C}',
      Rationals: '\\mathbb{Q}',
      Naturals: '\\mathbb{N}',
      Integers: '\\mathbb{Z}',
      ival: ['\\lbrack #1,#2 \\rbrack', 2],
      ssub: ['#1_{\\scriptscriptstyle #2}', 2],
      bm: ['\\boldsymbol{#1}', 1],
    },
  },
  chtml: {
    displayOverflow: 'overflow',
    scale: 1.0,
    minScale: 0.5,
  },
};
