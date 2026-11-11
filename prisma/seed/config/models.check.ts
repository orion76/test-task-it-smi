import type { IDataModel } from '../schema/types';
import { SeedError } from '../shared/seed.error';
import type { ISeedConfig } from './types';

/** Fails when the config names a model the schema does not define. */
export function assertModelsKnown(config: ISeedConfig, dataModel: IDataModel): void {
  const known = dataModel.models.map((model) => model.name);

  for (const name of Object.keys(config.models)) {
    if (!known.includes(name)) {
      throw new SeedError(
        `${config.configPath}: models.${name} — the JSON Schema has no such model; ` +
          `known models: ${known.join(', ')}`,
      );
    }
  }
}
