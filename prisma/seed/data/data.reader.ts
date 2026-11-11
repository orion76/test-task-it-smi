import { loadConfig } from 'yaml-loader';

import { toDisplayPath } from '../shared/path';
import type { IDataReader } from './types';

/**
 * Reads and parses the YAML data file. The reader knows nothing about the content: schema checks
 * live in `DataValidator`, database writes in `DataWriter`, and `yaml-loader` names the file in its
 * own errors.
 */
export class DataReader implements IDataReader {
  private readonly filePath: string;
  private readonly displayPath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.displayPath = toDisplayPath(filePath);
  }

  /** Path of the data file as it appears in diagnostics, e.g. `data/profile.yml`. */
  get path(): string {
    return this.displayPath;
  }

  /** Reads and parses the file; a missing file or broken YAML fails with the file path. */
  read(): unknown {
    return loadConfig<unknown>(this.filePath, { searchFrom: __dirname });
  }
}
