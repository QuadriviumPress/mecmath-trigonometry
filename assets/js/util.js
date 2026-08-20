import { BookConfig } from '../js/book-config.js';

/**
 * Convenience function
 * @param {string} href
 * @returns {string}
 */
export const removeTrailingSlash = href => {
  if (BookConfig.serverAddsTrailingSlash && href[href.length - 1] === '/') {
    href = href.substring(0, href.length - 1);
  }
  return href;
};

/**
 * convenience function
 * @param {string} href
 * @returns {string}
 */
export const addTrailingSlash = href => {
  if (BookConfig.serverAddsTrailingSlash && href[href.length - 1] !== '/') {
    href += '/';
  }
  return href;
};

/**
 * Fix up the ToC links if the links to pages end in `.md`
 * @param {Element} a
 */
export const mdToHtmlFix = a => {
  let href = a.getAttribute('href');
  if (href) {
    href = href.replace(/\.md/, '.html');
    a.setAttribute('href', href);
  }
};
