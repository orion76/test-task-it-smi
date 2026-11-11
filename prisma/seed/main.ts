import { PrismaClient } from '@prisma/client';

import { assertModelsKnown } from './config/models.check';
import { loadSeedConfig } from './config/seed-config.reader';
import type { ISeedConfig } from './config/types';
import { DataReader } from './data/data.reader';
import { DataValidator } from './data/data.validator';
import { DataWriter } from './data/data.writer';
import { assertExperiencePeriods } from './data/experience-periods.check';
import type { IDataValidator, ISeedSummary } from './data/types';
import { buildDataModel } from './schema/data.model';
import { readSchema } from './schema/schema.reader';
import type { IDataModel } from './schema/types';
import { withContext } from './shared/error-context';
import { toErrorMessage } from './shared/error-message';
import { toDisplayPath } from './shared/path';

/**
 * Seed entry point: config → schema → read the data file → validate → check the domain rules →
 * write. The engine knows nothing about the content, and this is the only place where the paths of
 * the inputs are known, so it prefixes the file path to the location inside the file — once per
 * failure.
 */

async function main(): Promise<void> {
  const config = loadSeedConfig();
  const schemaPath = toDisplayPath(config.schemaPath);

  logConfig(config);

  const schema = readSchema(config.schemaPath);
  let dataModel: IDataModel;

  try {
    dataModel = buildDataModel(schema);
  } catch (error) {
    throw withContext(schemaPath, error);
  }

  assertModelsKnown(config, dataModel);

  const reader = new DataReader(config.dataPath);
  const source = reader.read();

  let validator: IDataValidator;

  try {
    validator = new DataValidator(schema);
  } catch (error) {
    throw withContext(schemaPath, error);
  }

  try {
    validator.validate(source);
  } catch (error) {
    throw withContext(`${reader.path}: does not match ${schemaPath}`, error);
  }

  // The domain rules the JSON Schema cannot state run after the shape is confirmed and before a
  // single row is written, so a broken pair of values fails here and leaves the database untouched.
  try {
    assertExperiencePeriods(source);
  } catch (error) {
    throw withContext(reader.path, error);
  }

  const prisma = new PrismaClient();
  const writer = new DataWriter(prisma, config, dataModel);

  try {
    const summary = await writer.write(source);

    console.log(`Seed finished — ${describe(summary)}`);
  } catch (error) {
    throw withContext(reader.path, error);
  } finally {
    await prisma.$disconnect();
  }
}

/** One line per model: the rows it got and the strategy they were written with. */
function describe(summary: ISeedSummary): string {
  return summary.models
    .map((model) => `${model.model}: ${model.written} (${model.strategy})`)
    .join(', ');
}

/**
 * Reports which inputs the run uses and how the models are written. A missing config is a valid
 * mode, so it is announced instead of being silently replaced by defaults.
 */
function logConfig(config: ISeedConfig): void {
  // The defaults are absolute paths into `config/` at the project root: display them the way the
  // rest of the seed reports its inputs (relative to the working directory when possible).
  const configPath = toDisplayPath(config.configPath);
  const schemaPath = toDisplayPath(config.schemaPath);

  console.log(`Seed config ${configPath}: data ${config.dataPath}, schema ${schemaPath}`);

  if (config.source === 'defaults') {
    console.warn(
      `Seed config ${configPath} not found: only the JSON Schema rules apply, ` +
        'every model is written with the replace strategy (the root is replaced, not appended), ' +
        'no natural keys are used and foreign keys are derived from the parent model name',
    );
  }
}

void main().catch((error: unknown) => {
  console.error(`Seed failed: ${toErrorMessage(error)}`);
  process.exit(1);
});
