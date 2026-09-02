import { Injectable, inject, signal, computed } from '@angular/core';
import { ApiClient } from '../../core/api/api.client';
import { matchCandidates } from './matching';
import * as i0 from "@angular/core";
const DEFAULT_FILTERS = {
    query: '',
    roles: [],
    maxDistanceKm: null,
    minRating: null,
    availableNowOnly: false,
};
export class MarketplaceStore {
    api = inject(ApiClient);
    _filters = signal(DEFAULT_FILTERS, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_filters" }] : /* istanbul ignore next */ []));
    _results = signal([], /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_results" }] : /* istanbul ignore next */ []));
    _loading = signal(false, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_loading" }] : /* istanbul ignore next */ []));
    _error = signal('', /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_error" }] : /* istanbul ignore next */ []));
    filters = this._filters.asReadonly();
    results = this._results.asReadonly();
    loading = this._loading.asReadonly();
    error = this._error.asReadonly();
    hasResults = computed(() => this._results().length > 0, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "hasResults" }] : /* istanbul ignore next */ []));
    setFilters(patch) {
        this._filters.update((current) => ({ ...current, ...patch }));
    }
    resetFilters() {
        this._filters.set(DEFAULT_FILTERS);
    }
    /** Fetch candidates and run the v1 matching engine. */
    search() {
        const filters = this._filters();
        this._loading.set(true);
        this._error.set('');
        this.api
            .get(`/caregivers/search?${this.toQuery(filters)}`)
            .subscribe({
            next: (candidates) => {
                this._results.set(matchCandidates(candidates, filters));
                this._loading.set(false);
            },
            error: () => {
                this._error.set('Search is unavailable right now. Please try again later.');
                this._loading.set(false);
            },
        });
    }
    setResults(results) {
        this._results.set(results);
        this._loading.set(false);
    }
    setLoading(loading) {
        this._loading.set(loading);
    }
    toQuery(filters) {
        const params = new URLSearchParams();
        if (filters.query) {
            params.set('q', filters.query);
        }
        if (filters.roles.length > 0) {
            params.set('roles', filters.roles.join(','));
        }
        if (filters.maxDistanceKm !== null) {
            params.set('maxDistance', String(filters.maxDistanceKm));
        }
        if (filters.minRating !== null) {
            params.set('minRating', String(filters.minRating));
        }
        if (filters.availableNowOnly) {
            params.set('availableNow', 'true');
        }
        return params.toString();
    }
    static ɵfac = function MarketplaceStore_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || MarketplaceStore)(); };
    static ɵprov = /*@__PURE__*/ i0.ɵɵdefineInjectable({ token: MarketplaceStore, factory: MarketplaceStore.ɵfac, providedIn: 'root' });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(MarketplaceStore, [{
        type: Injectable,
        args: [{ providedIn: 'root' }]
    }], null, null); })();
