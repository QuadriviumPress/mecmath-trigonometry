/**
 * Shared reporting utilities for physics book scripts.
 *
 * This module provides consistent output formatting using chalk
 * for terminal styling across all validation and fixing scripts.
 */

import chalk from 'chalk';

/**
 * Print a styled header for a script.
 * @param {string} emoji - Emoji to display
 * @param {string} title - Script title
 */
export function printHeader(emoji, title) {
  console.log(chalk.blue.bold(`${emoji} ${title}`));
  console.log(chalk.gray('─'.repeat(60)));
}

/**
 * Print a divider line.
 */
export function printDivider() {
  console.log(chalk.gray('─'.repeat(60)));
}

/**
 * Print file count information.
 * @param {number} count - Number of files
 * @param {string} type - File type (default: 'markdown')
 */
export function printFileCount(count, type = 'markdown') {
  console.log(chalk.gray(`Found ${count} ${type} files\n`));
}

/**
 * Print dry run mode notice.
 * @param {string} applyFlag - The flag to use for applying changes
 */
export function printDryRunNotice(applyFlag = '--apply') {
  console.log(chalk.yellow('DRY RUN MODE - No files will be modified'));
  console.log(chalk.gray(`Use ${applyFlag} to actually modify files\n`));
}

/**
 * Print strict mode notice.
 */
export function printStrictModeNotice() {
  console.log(chalk.gray('(Strict mode enabled)\n'));
}

/**
 * Print errors section.
 * @param {Array} errors - Array of error objects
 * @param {number} maxShow - Maximum number of errors to show
 */
export function printErrors(errors, maxShow = 20) {
  if (errors.length === 0) return;

  console.log(chalk.red.bold(`\n❌ Errors: ${errors.length}`));

  const toShow = errors.slice(0, maxShow);
  toShow.forEach(error => {
    const location = error.line ? `${error.file}:${error.line}` : error.file;
    console.log(chalk.red(`  ${location}`));

    if (error.code) {
      console.log(chalk.gray(`    [${error.code}] ${error.message}`));
    } else {
      console.log(chalk.gray(`    ${error.message}`));
    }

    if (error.text) {
      const truncated = error.text.length > 80 ? `${error.text.substring(0, 80)}...` : error.text;
      console.log(chalk.gray(`    "${truncated}"`));
    }
  });

  if (errors.length > maxShow) {
    console.log(chalk.gray(`  ... and ${errors.length - maxShow} more errors`));
  }
}

/**
 * Print warnings section.
 * @param {Array} warnings - Array of warning objects
 * @param {number} maxShow - Maximum number of warnings to show
 */
export function printWarnings(warnings, maxShow = 20) {
  if (warnings.length === 0) return;

  console.log(chalk.yellow.bold(`\n⚠️  Warnings: ${warnings.length}`));

  const toShow = warnings.slice(0, maxShow);
  toShow.forEach(warning => {
    const location = warning.line ? `${warning.file}:${warning.line}` : warning.file;
    console.log(chalk.yellow(`  ${location}`));

    if (warning.code) {
      console.log(chalk.gray(`    [${warning.code}] ${warning.message}`));
    } else {
      console.log(chalk.gray(`    ${warning.message}`));
    }

    if (warning.text) {
      const truncated =
        warning.text.length > 80 ? `${warning.text.substring(0, 80)}...` : warning.text;
      console.log(chalk.gray(`    "${truncated}"`));
    }
  });

  if (warnings.length > maxShow) {
    console.log(chalk.gray(`  ... and ${warnings.length - maxShow} more warnings`));
  }
}

/**
 * Print fixes section.
 * @param {Array} fixes - Array of fix objects
 * @param {number} filesModified - Number of files modified
 * @param {boolean} applied - Whether fixes were applied
 * @param {number} maxShow - Maximum number of fixes to show
 */
export function printFixes(fixes, filesModified, applied, maxShow = 20) {
  if (fixes.length === 0) {
    console.log(chalk.green('\n✅ No fixes needed - content is clean!'));
    return;
  }

  console.log(chalk.cyan.bold(`\n🔧 Fixes ${applied ? 'Applied' : 'Found'}: ${fixes.length}`));
  console.log(
    chalk.gray(`Files ${applied ? 'Modified' : 'Would Be Modified'}: ${filesModified}\n`)
  );

  const toShow = fixes.slice(0, maxShow);
  toShow.forEach(fix => {
    console.log(chalk.yellow(`  ${fix.file}:${fix.line}`));
    if (fix.before && fix.after) {
      console.log(chalk.red(`    - ${fix.before.substring(0, 70)}`));
      console.log(chalk.green(`    + ${fix.after.substring(0, 70)}`));
    } else if (fix.type) {
      console.log(chalk.gray(`    ${fix.type}`));
    }
  });

  if (fixes.length > maxShow) {
    console.log(chalk.gray(`  ... and ${fixes.length - maxShow} more fixes`));
  }

  if (!applied) {
    console.log(chalk.yellow('\n⚠️  DRY RUN - No files were actually modified'));
    console.log(chalk.gray('Run with --apply to apply these fixes'));
  } else {
    console.log(chalk.green('\n✅ Fixes have been applied to files'));
  }
}

/**
 * Print success message.
 * @param {string} message - Success message
 */
export function printSuccess(message) {
  console.log(chalk.green(`✅ ${message}`));
}

/**
 * Print final summary.
 * @param {number} errors - Number of errors
 * @param {number} warnings - Number of warnings
 */
export function printSummary(errors, warnings) {
  printDivider();
  console.log(chalk.gray(`Summary: ${errors} errors, ${warnings} warnings`));
}

/**
 * Print a complete results section.
 * @param {Object} options - Results options
 */
export function printResults({
  errors = [],
  warnings = [],
  fixes = [],
  filesModified = 0,
  applied = false,
  mode = 'check', // 'check' or 'fix'
  successMessage = 'All checks passed!',
}) {
  printDivider();

  if (mode === 'fix') {
    printFixes(fixes, filesModified, applied);
  } else {
    printErrors(errors);
    printWarnings(warnings);

    if (errors.length === 0 && warnings.length === 0) {
      printSuccess(successMessage);
    }
  }

  printDivider();

  if (mode === 'check') {
    printSummary(errors.length, warnings.length);
  }
}

/**
 * Print an overview section (e.g., chapter overview).
 * @param {string} emoji - Emoji to display
 * @param {string} title - Overview title
 * @param {Array<{label: string, value: string|number}>} items - Items to display
 */
export function printOverview(emoji, title, items) {
  console.log(chalk.blue.bold(`\n${emoji} ${title}:`));
  items.forEach(({ label, value }) => {
    console.log(chalk.gray(`  ${label}: ${value}`));
  });
}

/**
 * Print issue summary by code.
 * @param {Array} issues - Array of issues with code property
 * @param {Object} codeDescriptions - Map of code to description
 */
export function printIssueSummary(issues, codeDescriptions = {}) {
  console.log('\nIssue Summary:');
  const codeCounts = {};

  issues.forEach(issue => {
    if (issue.code) {
      codeCounts[issue.code] = (codeCounts[issue.code] || 0) + 1;
    }
  });

  const sorted = Object.entries(codeCounts).sort((a, b) => b[1] - a[1]);
  sorted.forEach(([code, count]) => {
    const description = codeDescriptions[code] || code;
    console.log(`  ${code}: ${count} (${description})`);
  });
}

/**
 * Print help text for a script.
 * @param {Object} options - Help options
 */
export function printHelp({ usage, description, options = [], examples = [] }) {
  console.log(`
${chalk.bold('Usage:')} ${usage}

${description}

${chalk.bold('Options:')}
${options.map(opt => `  ${opt.flag.padEnd(20)} ${opt.description}`).join('\n')}
${
  examples.length > 0
    ? `
${chalk.bold('Examples:')}
${examples.map(ex => `  ${ex}`).join('\n')}`
    : ''
}
`);
}
