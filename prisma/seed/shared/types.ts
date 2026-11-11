/**
 * Contract of a seed failure: an `Error` whose `name` names the engine. A caller declares what it
 * propagates with this interface instead of the class, so the type of a failure does not have to be
 * the implementation that raised it.
 */
export interface ISeedError extends Error {
  readonly name: string;
}
