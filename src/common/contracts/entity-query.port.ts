/**
 * Nest token of the port: the provider is bound and injected by this value, because an interface
 * leaves no runtime value behind to name a provider with. The contract itself is `IEntityQueryPort`
 * of `contracts/types.ts`.
 */
export const ENTITY_QUERY_PORT = Symbol('ENTITY_QUERY_PORT');
