import { validateApiFields } from '../src/graphql/contract/api-fields.validator';

/**
 * Build step of `npm run build`, run right after `prisma generate`: the config is checked against the
 * schema the generator wrote, so a broken file fails the build before anything reads the allowlist.
 *
 * The application repeats the check on start (`src/main.ts`), where the mounted config is read.
 */
try {
  validateApiFields();
  console.log('api-fields: config/api-fields.yml matches the generated schema');
} catch (error) {
  console.error(`api-fields: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
