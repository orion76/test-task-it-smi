import { PrismaClient } from '@prisma/client';

import { DataReader } from './data/data.reader';
import { DataValidator } from './data/data.validator';
import { DataWriter } from './data/data.writer';
import { assertExperiencePeriods } from './data/experience-periods.check';
import type { IDataValidator, ISeedSummary } from './data/types';
import { buildDataModel } from './schema/data.model';
import { readSchema } from './schema/schema.reader';
import type { IDataModel } from './schema/types';
import { DATA_FILE, SCHEMA_FILE } from './shared/constants';
import { withContext } from './shared/error-context';
import { toErrorMessage } from './shared/error-message';
import { toDisplayPath } from './shared/path';

/**
 * Seed entry point: schema → read the data file → validate → check the domain rules → write.
 * The engine knows nothing about the content, and this is the only place where the paths of the
 * inputs are known, so it prefixes the file path to the location inside the file — once per
 * failure.
 */

async function main(): Promise<void> {
  const schemaPath = toDisplayPath(SCHEMA_FILE);
  const reader = new DataReader(DATA_FILE);

  console.log(`Seed inputs: data ${reader.path}, schema ${schemaPath}`);

  const schema = readSchema(SCHEMA_FILE);
  let dataModel: IDataModel;

  try {
    dataModel = buildDataModel(schema);
  } catch (error) {
    throw withContext(schemaPath, error);
  }

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
  const writer = new DataWriter(prisma, dataModel);

  try {
    const summary = await writer.write(source);

    console.log(`Seed finished — ${describe(summary)}`);
  } catch (error) {
    throw withContext(reader.path, error);
  } finally {
    await prisma.$disconnect();
  }
}

/** One line per model: the rows it got. */
function describe(summary: ISeedSummary): string {
  return summary.models.map((model) => `${model.model}: ${model.written}`).join(', ');
}

void main().catch((error: unknown) => {
  console.error(`Seed failed: ${toErrorMessage(error)}`);
  process.exit(1);
});
