import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface GeoPoint {
  lat: number;
  lng: number;
  accuracyM: number;
  atMs: number;
}

/** Minimal structural type so tests can inject a fake navigator.geolocation. */
export interface GeolocationProvider {
  getCurrentPosition(
    success: (position: GeolocationPosition) => void,
    error?: (error: GeolocationPositionError) => void
  ): void;
  watchPosition(
    success: (position: GeolocationPosition) => void,
    error?: (error: GeolocationPositionError) => void
  ): number;
  clearWatch(id: number): void;
}

/**
 * Wraps the browser Geolocation API (PLAN.md §5 Phase 2 — Check-in/GPS).
 * The provider is injectable so unit tests can substitute a fake.
 */
@Injectable({ providedIn: 'root' })
export class GeolocationService {
  /** Overridable in tests to inject a fake navigator.geolocation. */
  provider: GeolocationProvider | null = browserGeolocation();

  isSupported(): boolean {
    return this.provider !== null;
  }

  /** One-shot position used for check-in/out GPS stamps. */
  currentPosition(): Observable<GeoPoint> {
    return new Observable((subscriber) => {
      if (!this.provider) {
        subscriber.error(new Error('Geolocation is not supported in this browser.'));
        return;
      }
      this.provider.getCurrentPosition(
        (position) => {
          subscriber.next(toPoint(position));
          subscriber.complete();
        },
        (error) => subscriber.error(new Error(`Geolocation error (${error.code}): ${error.message}`))
      );
    });
  }

  /** Continuous position stream used for live visit tracking. */
  watchPosition(): Observable<GeoPoint> {
    return new Observable((subscriber) => {
      if (!this.provider) {
        subscriber.error(new Error('Geolocation is not supported in this browser.'));
        return;
      }
      const watchId = this.provider.watchPosition(
        (position) => subscriber.next(toPoint(position)),
        (error) => subscriber.error(new Error(`Geolocation error (${error.code}): ${error.message}`))
      );
      return () => this.provider?.clearWatch(watchId);
    });
  }
}

function browserGeolocation(): GeolocationProvider | null {
  if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
    return navigator.geolocation as GeolocationProvider;
  }
  return null;
}

function toPoint(position: GeolocationPosition): GeoPoint {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracyM: position.coords.accuracy,
    atMs: Date.now(),
  };
}
