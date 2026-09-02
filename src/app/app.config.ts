import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { demoApi } from './core/api/demo.api';
import { enableDemoFromUrl } from './core/api/demo.mode';
import { WebSocketClient } from './core/services/ws/websocket.client';
import { socketFactoryForMode } from './core/api/demo.socket';

// If the URL carries ?demo=1, persist it so the demo backend stays active
// across navigation. Harmless when absent.
enableDemoFromUrl();

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Demo backend (in-memory) must run before auth so it can answer login
    // without a token; auth interceptor still attaches tokens to real calls.
    provideHttpClient(withInterceptors([demoApi, authInterceptor])),
    {
      provide: WebSocketClient,
      useFactory: () => {
        const client = new WebSocketClient();
        client.socketFactory = socketFactoryForMode();
        return client;
      },
    },
  ],
};
