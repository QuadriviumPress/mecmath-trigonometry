/**
 * Search UI Module for Physics Book PWA
 *
 * This module provides the user interface for the search functionality.
 * It creates a search input field and results display that integrates
 * with the existing book viewer layout.
 */

import searchManager from './search.js';
import { getIcon } from '../js/icons.js';

class SearchUI {
  constructor() {
    this.searchInput = null;
    this.resultsContainer = null;
    this.isInitialized = false;
    this.debounceTimer = null;
  }

  /**
   * Initialize the search UI
   * Creates search input and results container
   */
  init() {
    if (this.isInitialized) {
      return;
    }

    // Wait for book-summary to be ready
    const checkInterval = setInterval(() => {
      const bookSummary = document.querySelector('.book-summary');
      if (bookSummary) {
        clearInterval(checkInterval);
        this.createSearchUI(bookSummary);
        this.isInitialized = true;
      }
    }, 100);

    // Timeout after 5 seconds
    setTimeout(() => clearInterval(checkInterval), 5000);
  }

  /**
   * Create the search UI elements
   * @param {HTMLElement} container - The container to add the search UI to
   */
  createSearchUI(container) {
    // Create search container
    const searchContainer = document.createElement('div');
    searchContainer.className = 'book-search';
    const searchHTML = `
      <div class="search-input-wrapper">
        <input
          type="search"
          id="book-search-input"
          class="search-input"
          placeholder="Search the book..."
          aria-label="Search"
          autocomplete="off"
        />
        <button class="search-clear" aria-label="Clear search" style="display: none;">
          ${getIcon('times', '1em')}
        </button>
      </div>
      <div id="search-results" class="search-results" style="display: none;"></div>
    `;
    searchContainer.innerHTML = searchHTML;

    // Insert at the top of the book summary
    container.insertBefore(searchContainer, container.firstChild);

    // Store references
    this.searchInput = document.getElementById('book-search-input');
    this.resultsContainer = document.getElementById('search-results');
    this.clearButton = searchContainer.querySelector('.search-clear');

    // Attach event listeners
    this.attachEventListeners();
  }

  /**
   * Attach event listeners to search UI elements
   */
  attachEventListeners() {
    // Search input event
    this.searchInput.addEventListener('input', e => {
      const query = e.target.value.trim();

      // Show/hide clear button
      if (query.length > 0) {
        this.clearButton.style.display = 'block';
      } else {
        this.clearButton.style.display = 'none';
      }

      // Debounce search
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.performSearch(query);
      }, 300);
    });

    // Clear button event
    this.clearButton.addEventListener('click', () => {
      this.searchInput.value = '';
      this.clearButton.style.display = 'none';
      this.clearResults();
    });

    // Close results when clicking outside
    document.addEventListener('click', e => {
      if (!e.target.closest('.book-search')) {
        this.hideResults();
      }
    });

    // Focus input on keyboard shortcut (Ctrl+K or Cmd+K)
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        this.searchInput.focus();
      }
      // Escape to close results
      if (e.key === 'Escape') {
        this.hideResults();
        this.searchInput.blur();
      }
    });
  }

  /**
   * Perform search and display results
   * @param {string} query - The search query
   */
  performSearch(query) {
    if (!query || query.length < 2) {
      this.clearResults();
      return;
    }

    // Check if search is ready
    if (!searchManager.ready()) {
      this.showMessage('Search is loading... Please wait.');
      return;
    }

    // Perform search
    const results = searchManager.search(query, 10);

    // Display results
    if (results.length === 0) {
      this.showMessage('No results found.');
    } else {
      this.displayResults(results, query);
    }
  }

  /**
   * Display search results
   * @param {Array} results - Array of search results
   * @param {string} query - The search query (for highlighting)
   */
  displayResults(results, query) {
    this.resultsContainer.style.display = 'block';

    const resultsHTML = results
      .map((result, index) => {
        // Highlight query in title
        const highlightedTitle = this.highlightText(result.title, query);
        const highlightedPreview = this.highlightText(result.preview, query);

        return `
        <div class="search-result-item" data-index="${index}">
          <a href="${result.url}" class="search-result-link">
            <div class="search-result-title">${highlightedTitle}</div>
            <div class="search-result-preview">${highlightedPreview}</div>
          </a>
        </div>
      `;
      })
      .join('');

    this.resultsContainer.innerHTML = `
      <div class="search-results-header">
        Found ${results.length} result${results.length !== 1 ? 's' : ''}
      </div>
      ${resultsHTML}
    `;
  }

  /**
   * Highlight query terms in text
   * @param {string} text - The text to highlight
   * @param {string} query - The query to highlight
   * @returns {string} HTML with highlighted terms
   */
  highlightText(text, query) {
    if (!text) return '';

    const terms = query.split(/\s+/).filter(t => t.length > 1);
    let highlightedText = text;

    terms.forEach(term => {
      const regex = new RegExp(`(${this.escapeRegex(term)})`, 'gi');
      highlightedText = highlightedText.replace(regex, '<mark>$1</mark>');
    });

    return highlightedText;
  }

  /**
   * Escape special regex characters
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Show a message in the results container
   * @param {string} message - The message to display
   */
  showMessage(message) {
    this.resultsContainer.style.display = 'block';
    this.resultsContainer.innerHTML = `
      <div class="search-message">${message}</div>
    `;
  }

  /**
   * Clear search results
   */
  clearResults() {
    this.resultsContainer.style.display = 'none';
    this.resultsContainer.innerHTML = '';
  }

  /**
   * Hide search results
   */
  hideResults() {
    this.resultsContainer.style.display = 'none';
  }
}

// Create singleton instance
const searchUI = new SearchUI();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for book-viewer to set up the layout
    setTimeout(() => searchUI.init(), 500);
  });
} else {
  setTimeout(() => searchUI.init(), 500);
}

export default searchUI;
