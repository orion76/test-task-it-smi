import type { ApplicationConfig } from '@angular/core';
import { provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { HttpLink, InMemoryCache } from '@apollo/client';
import { provideApollo } from 'apollo-angular';

/**
 * Apollo setup of the check tool. The page talks to its own origin, so the browser never issues a
 * cross-origin request and the backend needs no CORS configuration.
 *
 * The cache is switched off for both entry points: a repeated run has to reach the server again, and
 * `errorPolicy: 'all'` keeps the partial data of a response that carries GraphQL errors.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideApollo(() => ({
      link: new HttpLink({ uri: '/graphql' }),
      cache: new InMemoryCache(),
      defaultOptions: {
        query: { fetchPolicy: 'network-only', errorPolicy: 'all' },
        watchQuery: { fetchPolicy: 'network-only', errorPolicy: 'all' },
      },
    })),
  ],
};
