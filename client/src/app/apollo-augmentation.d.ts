import '@apollo/client';

/**
 * Apollo Client 4 only accepts a global `errorPolicy` after the project declares it: without this
 * augmentation the `'all'` in `defaultOptions` of `app.config.ts` is rejected by the type checker,
 * even though the runtime supports it. A declaration file is the place for it: the augmentation
 * extends the library types instead of introducing runtime code.
 */
declare module '@apollo/client' {
  namespace ApolloClient {
    namespace DeclareDefaultOptions {
      interface Query {
        errorPolicy: 'all';
      }

      interface WatchQuery {
        errorPolicy: 'all';
      }
    }
  }
}
