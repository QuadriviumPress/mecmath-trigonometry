/**
 * Client-Side Search Module for Physics Book PWA
 *
 * This module provides offline-capable search functionality using MiniSearch.
 * It loads the pre-built search index and enables real-time fuzzy search.
 *
 * Features:
 * - Offline search using cached index
 * - Fuzzy matching with 0.2 tolerance
 * - Title boost for better relevance
 * - Real-time search as you type
 */

// Self-hosted MiniSearch, copied from node_modules by `npm run update:minisearch`
import MiniSearch from './vendor/minisearch.js';
import { BookConfig } from './book-config.js';

class SearchManager {
  constructor() {
    this.miniSearch = null;
    this.documents = [];
    this.isReady = false;
    this.baseUrl = `${BookConfig.rootUrl || ''}/`;
  }

  /**
   * Initialize the search index
   * Loads and deserializes the search_index.json file
   */
  async init() {
    try {
      const response = await fetch(`${this.baseUrl}search_index.json`);

      if (!response.ok) {
        throw new Error(`Failed to load search index: ${response.status}`);
      }

      const data = await response.json();

      // Load MiniSearch instance from serialized data
      // Note: loadJSON expects the raw JSON object, not a stringified version
      this.miniSearch = MiniSearch.loadJS(data.index, {
        fields: ['title', 'content'],
        storeFields: ['title', 'url', 'preview'],
      });

      this.documents = data.documents;
      this.isReady = true;

      return true;
    } catch (error) {
      console.error('Failed to initialize search:', error);
      this.isReady = false;
      return false;
    }
  }

  /**
   * Perform a search query
   * @param {string} query - The search query
   * @param {number} maxResults - Maximum number of results to return
   * @returns {Array} Array of search results
   */
  search(query, maxResults = 10) {
    if (!this.isReady || !query || query.trim().length === 0) {
      return [];
    }

    try {
      const results = this.miniSearch.search(query, {
        boost: { title: 2 },
        fuzzy: 0.2,
        prefix: true,
      });

      // Limit results and enrich with document data
      return results.slice(0, maxResults).map(result => {
        const doc = this.documents.find(d => d.id === result.id);
        return {
          id: result.id,
          title: doc?.title || result.title,
          url: doc?.url || result.url,
          preview: doc?.preview || result.preview,
          score: result.score,
        };
      });
    } catch (error) {
      console.error('Search error:', error);
      return [];
    }
  }

  /**
   * Get autocomplete suggestions
   * @param {string} query - The partial query
   * @param {number} maxSuggestions - Maximum number of suggestions
   * @returns {Array} Array of suggestions
   */
  autoSuggest(query, maxSuggestions = 5) {
    if (!this.isReady || !query || query.trim().length < 2) {
      return [];
    }

    try {
      const suggestions = this.miniSearch.autoSuggest(query, {
        boost: { title: 2 },
        fuzzy: 0.2,
        prefix: true,
      });

      return suggestions.slice(0, maxSuggestions);
    } catch (error) {
      console.error('AutoSuggest error:', error);
      return [];
    }
  }

  /**
   * Check if search is ready
   * @returns {boolean} True if search is initialized and ready
   */
  ready() {
    return this.isReady;
  }
}

// Create and export singleton instance
const searchManager = new SearchManager();

// Auto-initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    searchManager.init();
  });
} else {
  searchManager.init();
}

// Export for use in other modules
export default searchManager;

// Also make available globally for non-module scripts
window.searchManager = searchManager;
