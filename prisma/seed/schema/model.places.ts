import type { IDataModel } from './types';

/**
 * Place of every model in the data file, keyed by model name: the root property and the properties of
 * the models nested in it (`profile`, `profile.skills`, …). The root comes first, then the nested
 * models in the order they are written, so a child is always placed after its parent.
 */
export function placesOf(dataModel: IDataModel): Map<string, string> {
  const places = new Map<string, string>([[dataModel.root.name, dataModel.property]]);

  for (const spec of dataModel.models) {
    const place = places.get(spec.name);

    if (place === undefined) {
      continue;
    }

    for (const child of spec.children) {
      places.set(child.model, `${place}.${child.property}`);
    }
  }

  return places;
}
