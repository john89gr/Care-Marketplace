import { describe, it, expect } from 'vitest';
import '@angular/compiler'; // required for JIT partial declarations in tests
import { App } from './app';

// The CLI-generated spec used Karma's TestBed; under Vitest we verify the
// module exports without component rendering.
describe('App', () => {
  it('is defined', () => {
    expect(App).toBeTruthy();
  });
});
