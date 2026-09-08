import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { demoApi } from './core/api/demo.api';
import { enableDemoFromUrl } from './core/api/demo.mode';
import { WebSocketClient } from './core/services/ws/websocket.client';
import { socketFactoryForMode } from './core/api/demo.socket';
import { IndexedDbBackendProvider } from './core/services/offline/local-indexed-db';
import { offlineInterceptor } from './core/services/offline/offline.interceptor';
import { provideOfflineSync } from './core/services/offline/offline-sync';

// If the URL carries ?demo=1, persist it so the demo backend stays active
// across navigation. Harmless when absent.
enableDemoFromUrl();

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Demo backend (in-memory) must run before auth so it can answer login
    // without a token; auth interceptor still attaches tokens to real calls.
    // The offline interceptor is the outermost net: it only reacts to real
    // network failures (never demo/validation responses).
    provideHttpClient(withInterceptors([offlineInterceptor, demoApi, authInterceptor])),
    // Offline outbox replay: flush persisted entries on boot + reconnect.
    provideOfflineSync(),
    // PWA shell precache so the app can reload while offline (§20 subtask 2).
    // Only in production builds: the dev server does not emit ngsw-worker.js.
    provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode() }),
    {
      provide: WebSocketClient,
      useFactory: () => {
        const client = new WebSocketClient();
        client.socketFactory = socketFactoryForMode();
        return client;
      },
    },
    // Offline outbox persistence (Feature 20 subtask 5): IndexedDB in the
    // browser; falls back to the in-memory buffer when storage is blocked.
    IndexedDbBackendProvider,
  ],
};
