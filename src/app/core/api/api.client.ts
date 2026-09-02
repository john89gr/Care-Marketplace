import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/**
 * Shared API client contract. Generated typed clients will replace this
 * once the backend publishes an OpenAPI spec (PLAN.md §6).
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);

  get<T>(path: string): Observable<T> {
    return this.http.get<T>(`/api${path}`);
  }

  post<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<T>(`/api${path}`, body);
  }

  patch<T>(path: string, body: unknown): Observable<T> {
    return this.http.patch<T>(`/api${path}`, body);
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(`/api${path}`);
  }
}
