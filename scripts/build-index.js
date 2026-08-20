#!/usr/bin/env node

/**
 * Build Search Index Script — Trigonometry web edition.
 */
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import * as cheerio from 'cheerio';
import MiniSearch from 'minisearch';
import { printHeader, printDivider, printSuccess, printSummary } from './lib/reporter.js';
import { runCli } from './lib/cli.js';
import { getBaseDir, readFile, writeFile } from './lib/files.js';

const DEFAULT_BASE_URL = process.env.VERCEL ? '/' : '/mecmath-trigonometry/';

class SearchIndexBuilder {
  constructor(options = {}) {
    this.baseDir = getBaseDir(import.meta.url);
    this.siteDir = options.siteDir || '_site';
    this.outputFile = options.output || 'search_index.json';
    this.baseUrl = options.baseUrl || DEFAULT_BASE_URL;
    this.stats = { filesFound: 0, filesIndexed: 0, filesSkipped: 0, errors: 0 };
    this.documents = [];
    this.errorFiles = [];
  }

  async run() {
    printHeader('🔍', 'Search Index Builder');
    const sitePath = path.join(this.baseDir, this.siteDir);
    if (!fs.existsSync(sitePath)) {
      console.error(`Error: Site directory not found: ${sitePath}`);
      console.error('Run Eleventy build first: npm run build');
      this.stats.errors++;
      return false;
    }

    const htmlFiles = await glob(`${this.siteDir}/**/*.html`, {
      cwd: this.baseDir,
      ignore: [
        '**/assets/**',
        '**/offline.html',
        '**/404.html',
        '**/SUMMARY.html',
        '**/book-index.html',
        `${this.siteDir}/index.html`,
        `${this.siteDir}/print/**`,
      ],
    });

    this.stats.filesFound = htmlFiles.length;
    console.log(`Found ${htmlFiles.length} HTML files to index\n`);

    let docId = 1;
    for (const filePath of htmlFiles) {
      const fullPath = path.join(this.baseDir, filePath);
      const result = await this.processFile(fullPath, filePath, docId);
      if (result) docId++;
    }

    if (this.documents.length === 0) {
      console.error('No documents to index');
      this.stats.errors++;
      return false;
    }

    const miniSearch = new MiniSearch({
      fields: ['title', 'content'],
      storeFields: ['title', 'url', 'preview'],
      searchOptions: { boost: { title: 2 }, fuzzy: 0.2, prefix: true },
    });
    miniSearch.addAll(this.documents);

    const indexData = {
      index: miniSearch.toJSON(),
      documents: this.documents.map(doc => ({
        id: doc.id,
        title: doc.title,
        url: doc.url,
        preview: doc.preview,
      })),
    };

    const outputPath = path.join(this.baseDir, this.siteDir, this.outputFile);
    writeFile(outputPath, JSON.stringify(indexData));
    this.printResults(outputPath, JSON.stringify(indexData).length);
    return this.stats.errors === 0;
  }

  async processFile(fullPath, relativePath, docId) {
    try {
      const html = readFile(fullPath);
      const $ = cheerio.load(html);
      $('script, style, nav, footer').remove();
      $('.equation-block').remove();

      const title =
        $('h1.page-title').first().text().trim() ||
        $('title').first().text().trim() ||
        $('h1').first().text().trim() ||
        'Untitled';

      const bodyText = $('body').text().replace(/\\\((?:[^\\]|\\[^)])*\\\)/g, ' ');
      const content = bodyText.replace(/\s+/g, ' ').trim();
      if (!content || content.length < 50) {
        this.stats.filesSkipped++;
        return null;
      }

      let url = path.relative(this.siteDir, relativePath);
      url = `${this.baseUrl}${url}`;

      this.documents.push({
        id: docId,
        title,
        content: content.substring(0, 5000),
        url,
        preview: `${content.substring(0, 200).trim()}...`,
      });
      this.stats.filesIndexed++;
      return true;
    } catch (error) {
      console.error(`  Error: ${relativePath} - ${error.message}`);
      this.errorFiles.push({ file: relativePath, error: error.message });
      this.stats.errors++;
      return null;
    }
  }

  printResults(outputPath, indexSize) {
    printDivider();
    console.log(`\nFiles found:     ${this.stats.filesFound}`);
    console.log(`Files indexed:   ${this.stats.filesIndexed}`);
    console.log(`Files skipped:   ${this.stats.filesSkipped}`);
    console.log(`Output file:     ${outputPath}`);
    console.log(`Index size:      ${(indexSize / 1024).toFixed(2)} KB`);
    if (this.stats.errors === 0) printSuccess('Search index created successfully!');
    printDivider();
    printSummary(this.stats.errors, 0);
  }
}

runCli({
  name: 'build-index',
  description: 'Creates a searchable index for the Trigonometry site.',
  flags: {
    siteDir: { flag: '--site-dir', description: 'Site directory (default: _site)', type: 'string', default: '_site' },
    output: { flag: '--output', description: 'Output file (default: search_index.json)', type: 'string', default: 'search_index.json' },
    baseUrl: { flag: '--base-url', description: `Base URL for links (default: ${DEFAULT_BASE_URL})`, type: 'string', default: DEFAULT_BASE_URL },
  },
  examples: ['node scripts/build-index.js'],
  run: async options => {
    const builder = new SearchIndexBuilder(options);
    return builder.run();
  },
});
