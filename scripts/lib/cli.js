/**
 * Shared CLI utilities for book build scripts.
 */
import { EXIT_CODES } from './constants.js';
import { printHelp } from './reporter.js';

export function parseArgs(args, config = {}) {
  const { flags = {}, defaultDirectory = '.' } = config;

  const options = {
    ...Object.fromEntries(Object.entries(flags).map(([key, def]) => [key, def.default ?? false])),
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    for (const [key, def] of Object.entries(flags)) {
      const flagNames = Array.isArray(def.flag) ? def.flag : [def.flag];
      if (flagNames.includes(arg)) {
        if (def.type === 'string' || def.type === 'number') {
          const value = args[i + 1];
          if (value && !value.startsWith('-')) {
            options[key] = def.type === 'number' ? parseInt(value, 10) : value;
            i++;
          }
        } else {
          options[key] = true;
        }
        break;
      }
    }
    if (!arg.startsWith('-') && !options.directory) {
      options.directory = arg;
    }
  }

  if (!options.directory) options.directory = defaultDirectory;
  return options;
}

export function hasHelpFlag(args) {
  return args.includes('--help') || args.includes('-h');
}

export async function runCli(config) {
  const { name, description, flags = {}, examples = [], run, defaultDirectory = '.' } = config;
  const args = process.argv.slice(2);

  if (hasHelpFlag(args)) {
    const flagOptions = Object.entries(flags).map(([, def]) => ({
      flag: Array.isArray(def.flag) ? def.flag.join(', ') : def.flag,
      description: def.description,
    }));
    flagOptions.push({ flag: '--help, -h', description: 'Show this help message' });
    printHelp({
      usage: `node scripts/${name}.js [options]`,
      description,
      options: flagOptions,
      examples,
    });
    process.exit(EXIT_CODES.SUCCESS);
  }

  const options = parseArgs(args, { flags, defaultDirectory });
  try {
    const success = await run(options);
    process.exit(success ? EXIT_CODES.SUCCESS : EXIT_CODES.FAILURE);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(EXIT_CODES.FAILURE);
  }
}
