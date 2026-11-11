// Path aliases of the test project, shared by both Jest configs.
//
// `tsconfig.spec.json` holds the only copy of the map: `tsc` reads it for `npm run typecheck`, the
// ESLint project of the specs is built from it, and the `moduleNameMapper` of Jest is derived from
// it here, so a new alias is added in one place instead of three.
//
// CommonJS: `package.json` sets `type: commonjs`, and the configs load this module with `require`
// (`jest-e2e.config.mjs` reaches it through the default export of the module it imports).
const ts = require('typescript');
const { join } = require('node:path');

const CONFIG_FILE = join(__dirname, '..', '..', 'tsconfig.spec.json');

/**
 * Reads `compilerOptions.paths` of the test project.
 *
 * The config is JSON with comments, so it is parsed by the compiler's own reader: `JSON.parse`
 * would fail on the first comment. A missing map is a broken setup, not an empty one: the specs
 * would fail to resolve their imports at run time, far from the config that caused it.
 *
 * @returns {Record<string, string[]>} alias map exactly as the config declares it
 */
function readPaths() {
  const read = ts.readConfigFile(CONFIG_FILE, ts.sys.readFile);

  if (read.error !== undefined) {
    const message = ts.flattenDiagnosticMessageText(read.error.messageText, ' ');

    throw new Error(`${CONFIG_FILE}: ${message}`);
  }

  const map = read.config.compilerOptions?.paths;

  if (map === undefined) {
    throw new Error(`${CONFIG_FILE}: compilerOptions.paths is not declared`);
  }

  return map;
}

/** Escapes a string to be used literally inside a regular expression. */
function escapeForRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/** Turns an alias target of the config into the substitution Jest expects: `<rootDir>/<path>`. */
function substitutionOf(target) {
  return `<rootDir>/${target.replace(/^\.\//u, '')}`;
}

/**
 * Builds `moduleNameMapper` of Jest from the alias map: `@src/*` becomes `^@src/(.*)$` →
 * `<rootDir>/src/$1`, an alias without a wildcard (`@lib`) matches the exact specifier only.
 *
 * @returns {Record<string, string>} mapper accepted by the `moduleNameMapper` option
 */
function moduleNameMapper() {
  const mapper = {};

  for (const [alias, targets] of Object.entries(paths)) {
    const target = targets[0];

    if (target === undefined) {
      throw new Error(`${CONFIG_FILE}: alias ${alias} has no target`);
    }

    if (alias.endsWith('/*')) {
      const prefix = alias.slice(0, -2);
      const substitution = substitutionOf(target).replace(/\/\*$/u, '');

      mapper[`^${escapeForRegExp(prefix)}/(.*)$`] = `${substitution}/$1`;
    } else {
      mapper[`^${escapeForRegExp(alias)}$`] = substitutionOf(target);
    }
  }

  return mapper;
}

const paths = readPaths();

module.exports = { paths, moduleNameMapper };
