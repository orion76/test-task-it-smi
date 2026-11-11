/**
 * Types of the generator fixtures.
 *
 * `datamodel.ts` and `json.ts` build and read the inputs of the renderer specs: a hand-written DMMF
 * datamodel and the JSON-shaped artifacts a generator returns. The shapes those helpers exchange
 * are declared here, next to each other.
 */
import type { DMMF } from '@prisma/generator-helper';

/** What a spec says about one column; everything else is the DMMF default of a plain value column. */
export interface IFieldSpec {
  name: string;
  type: string;
  kind?: DMMF.FieldKind;
  isList?: boolean;
  isRequired?: boolean;
  hasDefaultValue?: boolean;
  documentation?: string;
  relationName?: string;
  relationFromFields?: string[];
}

/** A JSON object as the specs read it. */
export type TJsonObject = Record<string, unknown>;
