import { BookConfig } from '../js/book-config.js';
import { removeTrailingSlash, addTrailingSlash, mdToHtmlFix } from '../js/util.js';
import { getIcon } from '../js/icons.js';

const BOOK_TEMPLATE = `<div class="book with-summary font-size-2 font-family-1">
        <a href="#" class="btn toggle-summary" aria-label="Toggle navigation">
            <span class="menu-icon"></span>
        </a>
        <nav class="book-summary" role="navigation" aria-label="Table of contents">
        </nav>

          <main class="book-body" role="main">
            <div class="body-inner">
              <div class="page-wrapper" tabindex="-1">
                <div class="page-inner">
                  <section class="normal">
                    <!-- content -->
                  </section>
                </div>
              </div>
            </div>
          </main>
        </div>`;

function docReady(fn) {
  // see if DOM is already available
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    // call on next available tick
    setTimeout(fn, 16);
  } else {
    document.addEventListener('DOMContentLoaded', fn);
  }
}

function parser() {
  //# Squirrel the body and replace it with the template:

  // Pull out all the interesting DOM nodes from the template
  const body = document.body;

  const originalPage = Array.from(body.childNodes);

  body.innerHTML = '';
  body.insertAdjacentHTML('beforeend', BOOK_TEMPLATE);

  const book = body.querySelector('.book');
  const bookPage = book.querySelector('.page-inner > .normal');
  const bookSummary = book.querySelector('.book-summary');
  const bookBody = book.querySelector('.book-body');
  const toggleSummary = book.querySelector('.toggle-summary');

  // Populate the menu icon
  const menuIcon = toggleSummary.querySelector('.menu-icon');
  if (menuIcon) {
    menuIcon.innerHTML = getIcon('bars', '1.2em');
  }

  toggleSummary.addEventListener('click', event => {
    book.classList.toggle('with-summary');
    event.preventDefault();
  });

  // Add resize handle to sidebar
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'resize-handle';
  bookSummary.appendChild(resizeHandle);

  // Load saved sidebar width from localStorage
  const savedWidth = localStorage.getItem('sidebarWidth');
  if (savedWidth) {
    document.documentElement.style.setProperty('--sidebar-width', `${savedWidth}px`);
  }

  // Sidebar resize functionality
  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  resizeHandle.addEventListener('mousedown', e => {
    isResizing = true;
    startX = e.clientX;
    const computedStyle = getComputedStyle(document.documentElement);
    startWidth = parseInt(computedStyle.getPropertyValue('--sidebar-width'));
    resizeHandle.classList.add('resizing');
    book.classList.add('without-animation');
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!isResizing) return;

    const delta = e.clientX - startX;
    const newWidth = startWidth + delta;
    const minWidth = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--sidebar-min-width')
    );
    const maxWidth = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--sidebar-max-width')
    );

    // Constrain width between min and max
    const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
    document.documentElement.style.setProperty('--sidebar-width', `${constrainedWidth}px`);
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizeHandle.classList.remove('resizing');
      book.classList.remove('without-animation');

      // Save the new width to localStorage
      const currentWidth = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width')
      );
      localStorage.setItem('sidebarWidth', currentWidth);
    }
  });

  /**
   * render the summary on the left-hand side of the page
   */
  const renderToc = () => {
    const summary = document.createElement('ul');
    summary.className = 'summary';

    const tocChildren = Array.from(tocHelper.toc.children);
    tocChildren.forEach(li => {
      summary.appendChild(li);
    });

    // Volumes and chapters are collapsible; only the chain containing the
    // current page starts expanded (see expandTocChain).
    summary.querySelectorAll('li.volume, li.chapter').forEach(li => {
      const sublist = li.querySelector(':scope > ul, :scope > ol');
      if (!sublist) return;
      li.classList.add('collapsible');
      const toggle = document.createElement('button');
      toggle.className = 'toc-toggle';
      toggle.setAttribute('aria-label', 'Expand or collapse');
      toggle.innerHTML = getIcon('chevronRight', '0.75em');
      toggle.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        li.classList.toggle('expanded');
      });
      li.insertBefore(toggle, li.firstChild);
    });

    // Update the ToC to show which links have been visited
    // Add a "hidden" checkmark next to each item
    const visitedLinks = JSON.parse(window.localStorage.visited) || {};
    const linkElements = summary.querySelectorAll('a[href]');
    linkElements.forEach(link => {
      const href = link.getAttribute('href');
      const listItem = link.closest('li');
      const checkmarkIcon = document.createElement('i');
      checkmarkIcon.className = 'fa-check';
      checkmarkIcon.innerHTML = getIcon('check', '1em');
      // Insert at the <li> level so chapter entries (wrapped in <p>) layout
      // correctly. Only a direct-child <p> counts — volume entries contain
      // nested chapter <p>s that are not children of this li.
      const insertBefore = listItem.querySelector(':scope > p') || link;
      if (insertBefore.parentNode === listItem) {
        listItem.insertBefore(checkmarkIcon, insertBefore);
      }

      if (visitedLinks[href]) {
        listItem.classList.add('visited');
      }
    });

    const existingSummary = bookSummary.querySelector('.summary');
    if (existingSummary) {
      existingSummary.remove();
    }

    bookSummary.appendChild(summary);

    expandTocChain(new URL(window.location.href).pathname, true);

    renderNextPrev();
  };

  /**
   * Expand every collapsible sidebar ancestor of the given page and optionally
   * scroll its entry into view. Works for section links (direct <a> children)
   * and chapter/volume links (wrapped in <p>).
   * @param {string} pagePath
   * @param {boolean} scroll
   */
  const expandTocChain = (pagePath, scroll = false) => {
    const link = bookSummary.querySelector(`.summary a[href='${pagePath}']`);
    if (!link) return;
    let el = link.closest('li');
    const currentLi = el;
    while (el && !el.classList.contains('summary')) {
      if (el.tagName === 'LI' && el.classList.contains('collapsible')) {
        el.classList.add('expanded');
      }
      el = el.parentElement;
    }
    if (scroll && currentLi) {
      currentLi.scrollIntoView({ block: 'center' });
    }
  };

  const renderNextPrev = () => {
    // Remove existing navigation buttons
    const existingNavigation = bookBody.querySelectorAll('.navigation');
    existingNavigation.forEach(nav => nav.remove());

    const current = removeTrailingSlash(window.location.href);
    let prev = tocHelper.prevPageHref(current);
    let next = tocHelper.nextPageHref(current);

    if (prev) {
      prev = new URL(addTrailingSlash(prev), window.location.href).pathname;
      const prevPage = document.createElement('a');
      prevPage.className = 'navigation navigation-prev';
      prevPage.href = prev;
      prevPage.setAttribute('aria-label', 'Previous page');
      prevPage.innerHTML = getIcon('chevronLeft', '1.5em');
      bookBody.appendChild(prevPage);
    }

    if (next) {
      next = new URL(addTrailingSlash(next), window.location.href).pathname;
      const nextPage = document.createElement('a');
      nextPage.className = 'navigation navigation-next';
      nextPage.href = next;
      nextPage.setAttribute('aria-label', 'Next page');
      nextPage.innerHTML = getIcon('chevronRight', '1.5em');
      bookBody.appendChild(nextPage);
    }

    renderDarkModeToggle();
  };

  const renderDarkModeToggle = () => {
    // Remove existing dark mode toggle button
    const existingToggle = bookBody.querySelector('.dark-mode-toggle');
    if (existingToggle) {
      existingToggle.remove();
    }

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'dark-mode-toggle';
    toggleBtn.title = 'Toggle Dark Mode';
    toggleBtn.setAttribute('aria-label', 'Toggle Dark Mode');

    // Check if dark mode is already enabled from localStorage
    const isDarkMode = localStorage.getItem('darkMode') === 'enabled';
    if (isDarkMode) {
      document.body.classList.add('dark-mode');
      toggleBtn.innerHTML = getIcon('sun', '1.2em');
    } else {
      toggleBtn.innerHTML = getIcon('moon', '1.2em');
    }

    // Add click event listener to toggle dark mode
    toggleBtn.addEventListener('click', () => {
      document.body.classList.toggle('dark-mode');
      const isDarkMode = document.body.classList.contains('dark-mode');

      // Update localStorage
      if (isDarkMode) {
        localStorage.setItem('darkMode', 'enabled');
        toggleBtn.innerHTML = getIcon('sun', '1.2em');
      } else {
        localStorage.setItem('darkMode', 'disabled');
        toggleBtn.innerHTML = getIcon('moon', '1.2em');
      }
    });

    bookBody.appendChild(toggleBtn);
  };

  /**
   *
   * @param {Element} els
   * @param {string} href
   */
  const newPageBeforeRender = (els, href) => {
    els.querySelectorAll('a[href]').forEach(el => {
      mdToHtmlFix(el);
    });

    els.querySelectorAll('img[title]').forEach(img => {
      const id = img.getAttribute('id');
      img.removeAttribute('id');
      const figure = document.createElement('figure');
      img.parentNode.insertBefore(figure, img);
      figure.appendChild(img);
      const caption = document.createElement('figcaption');
      // Get title and fix double backslashes from HTML
      let captionText = img.title;
      // Convert double backslashes to single: \\theta -> \theta
      captionText = captionText.replace(/\\\\/g, '\\');
      // Match entire math pattern and convert: ( \theta_r = \theta_i ) -> $\theta_r = \theta_i$
      captionText = captionText.replace(/\(\s+([^)]+?)\s+\)/g, '$$$1$$');
      caption.innerHTML = captionText;
      figure.appendChild(caption);
      if (img.getAttribute('data-title')) {
        const title = document.createElement('div');
        title.className = 'title';
        let titleText = img.getAttribute('data-title');
        // Convert double backslashes to single
        titleText = titleText.replace(/\\\\/g, '\\');
        // Convert math delimiters
        titleText = titleText.replace(/\(\s+([^)]+?)\s+\)/g, '$$$1$$');
        title.textContent = titleText;
        figure.insertBefore(title, img);
      }
      figure.setAttribute('id', id);
    });

    els.querySelectorAll('.example, .exercise, .note').forEach(el => {
      const contents = Array.from(el.childNodes).filter(node => {
        return !node.classList || !node.classList.contains('title');
      });
      const section = document.createElement('section');
      contents.forEach(node => {
        section.appendChild(node);
      });
      el.append(section);

      const title = el.querySelector('.title');
      if (title) {
        el.insertBefore(title, el.firstChild);

        const header = document.createElement('header');
        header.append(title);
        el.insertBefore(header, el.firstChild);

        // Add an attribute for the parents' `data-label`
        // since CSS does not support `parent(attr(data-label))`.
        // When the title exists, this attribute is added before it
        const dataLabelParent = el.getAttribute('data-label');
        title.setAttribute('data-label-parent', dataLabelParent);
      }

      el.classList.toggle('ui-has-child-title', title !== null);
    });

    els.querySelectorAll('.solution').forEach(solution => {
      const section = document.createElement('section');
      while (solution.firstChild) {
        section.appendChild(solution.firstChild);
      }
      solution.appendChild(section);
      const toggleWrapper = document.createElement('div');
      toggleWrapper.className = 'ui-toggle-wrapper';
      solution.insertBefore(toggleWrapper, solution.firstChild);
      const toggleButton = document.createElement('button');
      toggleButton.className = 'btn-link ui-toggle';
      toggleButton.setAttribute('title', 'Show/Hide Solution');
      toggleButton.textContent = 'Show Solution';
      toggleWrapper.appendChild(toggleButton);

      // Mark solution section to skip MathJax processing initially
      const solutionSection = solution.querySelector('section');
      if (solutionSection) {
        solutionSection.classList.add('mathjax-skip');
        solutionSection.setAttribute('data-math-typeset', 'false');
      }

      toggleButton.addEventListener('click', e => {
        const solution = e.currentTarget.closest('.solution');
        solution.classList.toggle('ui-solution-visible');

        // Update button text
        const isVisible = solution.classList.contains('ui-solution-visible');
        e.currentTarget.textContent = isVisible ? 'Hide Solution' : 'Show Solution';

        // Typeset math when solution is first revealed
        const solutionSection = solution.querySelector('section');
        if (
          solutionSection &&
          isVisible &&
          solutionSection.getAttribute('data-math-typeset') === 'false'
        ) {
          solutionSection.setAttribute('data-math-typeset', 'true');
          solutionSection.classList.remove('mathjax-skip');
          typesetMathLazy(solutionSection);
        }
      });
    });

    els.querySelectorAll('figure:has(> figcaption)').forEach(figure => {
      figure.classList.add('ui-has-child-figcaption');
    });

    els.querySelectorAll('figcaption').forEach(figcaption => {
      figcaption.parentNode.appendChild(figcaption);
    });

    const currentPagePath = new URL(href, window.location.href).pathname;
    const visited = (window.localStorage.visited && JSON.parse(window.localStorage.visited)) || {};
    visited[currentPagePath] = new Date();
    window.localStorage.visited = JSON.stringify(visited);

    const currentLink = bookSummary.querySelector(`.summary a[href='${currentPagePath}']`);
    const listItem = currentLink ? currentLink.closest('li') : null;

    if (listItem !== null) {
      listItem.classList.add('visited');
      expandTocChain(currentPagePath, true);
    }

    const selector = 'h1, h2, h3, h4, h5, h6';
    const all = Array.from(els.querySelectorAll(selector));
    all.forEach(el => {
      const id = el.getAttribute('id');
      if (id) {
        const icon = document.createElement('i');
        icon.innerHTML = getIcon('link', '0.875em');
        const a = document.createElement('a');
        a.className = 'header-link';
        a.setAttribute('href', `#${id}`);
        a.setAttribute('aria-label', `Link to section: ${el.textContent.trim()}`);
        a.appendChild(icon);
        el.insertBefore(a, el.firstChild);
      }
    });
  };

  /**
   * Lazy typeset for a specific element (used for hidden content)
   * @param {Element} el - The element to typeset
   */
  const typesetMathLazy = el => {
    if (typeof MathJax !== 'undefined' && MathJax.startup && MathJax.startup.promise) {
      MathJax.startup.promise
        .then(() => MathJax.typesetPromise([el]))
        .catch(err => console.error('MathJax lazy typeset failed:', err.message));
    }
  };

  /**
   * Typeset MathJax content after element is in DOM
   * @param {Element} els - The element containing math to typeset
   * @param {boolean} clearFirst - Whether to clear previously typeset content
   */
  const typesetMath = (els, clearFirst = false) => {
    const doTypeset = () => {
      if (typeof MathJax !== 'undefined' && MathJax.startup && MathJax.startup.promise) {
        MathJax.startup.promise
          .then(() => {
            // Clear any previously typeset content if this is a page change
            if (clearFirst) {
              MathJax.typesetClear([els]);
            }
            // MathJax will automatically skip elements with 'mathjax-skip' class
            return MathJax.typesetPromise([els]);
          })
          .catch(err => console.error('MathJax typeset failed:', err.message));
      } else {
        setTimeout(doTypeset, 100);
      }
    };

    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(doTypeset);
  };

  /**
   *
   * @constructor
   */

  function TocHelper() {
    // {string[]}
    this._tocList = [];
    this._tocTitles = {};

    /**
     * @param {Element} toc
     * @param {string} title
     * @returns {function}
     */
    this.loadToc = function (toc, title) {
      this.toc = toc;
      this.title = title;
      const tocUrl = new URL(BookConfig.toc.url, removeTrailingSlash(window.location.href));
      const refElements = toc.querySelectorAll('a[href]');

      refElements.forEach(el => {
        mdToHtmlFix(el);
        const href = new URL(el.getAttribute('href'), tocUrl).pathname;
        el.setAttribute('href', href);
      });

      this._tocTitles = {};
      const self = this;
      this._tocList = Array.from(toc.querySelectorAll('a[href]')).map(el => {
        const href = new URL(el.getAttribute('href'), tocUrl).toString();
        self._tocTitles[href] = el.textContent;
        return href;
      });

      if (BookConfig.serverAddsTrailingSlash) {
        const aElements = toc.querySelectorAll('a');
        aElements.forEach(a => {
          let href = a.getAttribute('href');
          href = `../${href}`;
          a.setAttribute('href', href);
        });
      }

      return renderToc();
    };

    /**
     * @private
     * @param {string} currentHref
     * @returns {number}
     */
    this.currentPageIndex = function (currentHref) {
      return this._tocList.indexOf(currentHref);
    };

    /**
     * @protected
     * @param {string} currentHref
     * @returns {string|undefined}
     */
    this.prevPageHref = function (currentHref) {
      const currentIndex = this.currentPageIndex(currentHref);
      return this._tocList[currentIndex - 1]; //# returns undefined if no previous page
    };

    /**
     * @protected
     * @param {string} currentHref
     * @returns {string|undefined}
     */
    this.nextPageHref = function (currentHref) {
      const currentIndex = this.currentPageIndex(currentHref);
      return this._tocList[currentIndex + 1]; // # returns undefined if no next page
    };
  }

  const tocHelper = new TocHelper();

  fetch(BookConfig.urlFixer(BookConfig.toc.url), {
    headers: {
      Accept: 'application/xhtml+xml',
    },
  })
    .then(response => {
      return response.text();
    })
    .then(html => {
      let title;
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const root = doc.createElement('div');
      root.innerHTML = html;

      let toc = root.querySelector(BookConfig.toc.selector);
      if (toc.tagName.toLowerCase() === 'ul') {
        // HACK for collection HTML
        title = toc.firstElementChild.textContent;
        toc = toc.querySelector('ul');
      } else {
        title = doc.querySelector('title').textContent;
      }

      tocHelper.loadToc(toc, title);
    });

  //  # Fetch resources without fixing up their paths
  if (BookConfig.baseHref) {
    const baseElement = book.querySelector('base');
    if (baseElement) {
      baseElement.remove();
    }
    const baseTag = document.createElement('base');
    baseTag.setAttribute('href', BookConfig.baseHref);
    book.prepend(baseTag);
  }

  const altPage = document.createElement('div');
  altPage.className = 'contents';
  altPage.append(...originalPage);
  newPageBeforeRender(altPage, new URL(window.location.href).pathname);
  bookPage.append(altPage);
  // Typeset MathJax after content is in DOM
  typesetMath(altPage);

  /**
   *
   * @param {string} href
   * @returns {Promise<string>}
   */
  const changePage = href => {
    book.classList.add('loading');

    const requestPromise = fetch(BookConfig.urlFixer(href), {
      headers: {
        Accept: 'application/xhtml+xml',
      },
    }).then(response => response.text());

    return Promise.resolve(requestPromise).then(html => {
      //# Use `window.location.origin` to get around a <base href=""> pointing to another hostname
      if (!/https?:\/\//.test(href)) {
        href = `${window.location.origin}${href}`;
      }
      window.history.pushState(null, null, href);
      renderNextPrev();

      // Need to set the URL *before* <img> tags area created
      // Fetch resources without fixing up their paths
      if (BookConfig.baseHref) {
        const baseElement = book.querySelector('base');
        if (baseElement) {
          baseElement.remove();
        }
        const baseTag = document.createElement('base');
        baseTag.setAttribute('href', BookConfig.urlFixer(href));
        book.prepend(baseTag);
      }

      const htmlDivElement = document.createElement('div');

      htmlDivElement.innerHTML = html;
      htmlDivElement.querySelectorAll('meta, link, script').forEach(el => {
        el.remove();
      });

      bookPage.innerHTML = '';
      const altPage = document.createElement('div');
      altPage.className = 'contents';
      altPage.append(...htmlDivElement.childNodes);
      newPageBeforeRender(altPage, href);
      bookPage.append(altPage);
      // Typeset MathJax after content is in DOM (clear previous content)
      typesetMath(altPage, true);

      book.classList.remove('loading');

      // Honor a #fragment on cross-page links (cross-module references);
      // otherwise scroll to the top of the page.
      const fragment = new URL(href, window.location.href).hash;
      const target = fragment
        ? altPage.querySelector(`#${CSS.escape(decodeURIComponent(fragment.slice(1)))}`)
        : null;
      if (target) {
        target.scrollIntoView();
      } else {
        document.querySelector('.body-inner').scrollTop = 0;
      }
    });
  };

  document.body.addEventListener('keydown', event => {
    const key = event.key; // "ArrowRight", "ArrowLeft", "ArrowUp", or "ArrowDown"

    let link;
    switch (key) {
      case 'ArrowLeft':
        // Left pressed
        link = document.querySelector('.book .navigation-prev');
        break;
      case 'ArrowRight':
        // Right pressed
        link = document.querySelector('.book .navigation-next');
        break;
      case 'ArrowUp':
        // Up pressed
        link = null;
        break;
      case 'ArrowDown':
        // Down pressed
        link = null;
        break;
      default:
        link = null;
        break;
    }

    if (!document.activeElement.matches('.book-search-input')) {
      if (link !== null) {
        link.click();
      }
    }
  });

  // Swipe navigation for mobile
  let touchStartX = 0;
  let touchStartY = 0;
  let touchEndX = 0;
  let touchEndY = 0;
  let isSwiping = false;

  const MIN_SWIPE_DISTANCE = 50; // minimum distance for a swipe (pixels)
  const MAX_VERTICAL_DISTANCE = 100; // maximum vertical movement allowed (pixels)

  bookBody.addEventListener(
    'touchstart',
    event => {
      // Only track single-finger touches
      if (event.touches.length === 1) {
        touchStartX = event.touches[0].clientX;
        touchStartY = event.touches[0].clientY;
        isSwiping = false;
      }
    },
    { passive: true }
  );

  bookBody.addEventListener(
    'touchmove',
    event => {
      if (event.touches.length === 1) {
        touchEndX = event.touches[0].clientX;
        touchEndY = event.touches[0].clientY;

        const deltaX = Math.abs(touchEndX - touchStartX);
        const deltaY = Math.abs(touchEndY - touchStartY);

        // Detect horizontal swipe (more horizontal than vertical movement)
        if (deltaX > deltaY && deltaX > 10) {
          isSwiping = true;
          // Add visual feedback
          const swipeDistance = touchEndX - touchStartX;
          const pageWrapper = bookBody.querySelector('.page-wrapper');
          if (pageWrapper) {
            const transform = Math.max(-100, Math.min(100, swipeDistance * 0.2));
            pageWrapper.style.transition = 'none';
            pageWrapper.style.transform = `translateX(${transform}px)`;
            pageWrapper.style.opacity = 1 - Math.abs(transform) / 200;
          }
        }
      }
    },
    { passive: true }
  );

  bookBody.addEventListener(
    'touchend',
    _event => {
      if (isSwiping) {
        const swipeDistance = touchEndX - touchStartX;
        const verticalDistance = Math.abs(touchEndY - touchStartY);

        // Reset visual feedback
        const pageWrapper = bookBody.querySelector('.page-wrapper');
        if (pageWrapper) {
          pageWrapper.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
          pageWrapper.style.transform = '';
          pageWrapper.style.opacity = '';
        }

        // Only navigate if swipe is primarily horizontal and meets minimum distance
        if (
          verticalDistance < MAX_VERTICAL_DISTANCE &&
          Math.abs(swipeDistance) >= MIN_SWIPE_DISTANCE
        ) {
          let link = null;

          if (swipeDistance > 0) {
            // Swipe right (go to previous page)
            link = document.querySelector('.book .navigation-prev');
          } else {
            // Swipe left (go to next page)
            link = document.querySelector('.book .navigation-next');
          }

          if (link !== null) {
            // Delay navigation slightly to allow visual feedback to complete
            setTimeout(() => {
              link.click();
            }, 100);
          }
        }

        isSwiping = false;
      }

      touchStartX = 0;
      touchStartY = 0;
      touchEndX = 0;
      touchEndY = 0;
    },
    { passive: true }
  );

  document.body.addEventListener('click', event => {
    let target = event.target;
    while (target && target.tagName !== 'A') {
      target = target.parentNode;
    }

    if (
      target &&
      target.getAttribute('href') &&
      !target.getAttribute('href').startsWith('#') &&
      !target.getAttribute('href').startsWith('https')
    ) {
      const href = target.getAttribute('href');

      // Open PDFs in new tab to use browser's PDF viewer
      if (/\.pdf$/i.test(href)) {
        event.preventDefault();
        window.open(href, '_blank');
        return;
      }

      // Don't intercept other file downloads (ZIP, etc.)
      const fileExtensions = /\.(zip|tar|gz|rar|7z|doc|docx|xls|xlsx|ppt|pptx)$/i;
      if (fileExtensions.test(href)) {
        // Let the browser handle file downloads normally
        return;
      }

      event.preventDefault();
      const hrefRelative = addTrailingSlash(href);
      const hrefAbsolute = new URL(hrefRelative, window.location.href).toString();
      changePage(hrefAbsolute);
    }
  });
}

docReady(parser);
