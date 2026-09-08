/**
 * Generates the self-signed localhost certificate used by the fullstack E2E:
 * web-push only sends to HTTPS endpoints, so the stand-in push service
 * (push-receiver.mjs) needs a cert, and the API server must trust it via
 * NODE_EXTRA_CA_CERTS. Playwright starts webServer commands BEFORE
 * globalSetup, so this runs as part of the webServer command chains.
 */

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
export const CERT_DIR = join(here, '.certs');
export const CERT_PATH = join(CERT_DIR, 'cert.pem');
export const KEY_PATH = join(CERT_DIR, 'key.pem');

export function prepareCerts() {
  mkdirSync(CERT_DIR, { recursive: true });
  if (!existsSync(CERT_PATH)) {
    execFileSync(
      'openssl',
      [
        'req', '-x509', '-newkey', 'rsa:2048',
        '-keyout', KEY_PATH, '-out', CERT_PATH,
        '-days', '30', '-nodes',
        '-subj', '/CN=localhost',
        '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1',
      ],
      { stdio: 'pipe' }
    );
  }
  return CERT_PATH;
}

// Direct execution (as a webServer command): prepare and exit.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const cert = prepareCerts();
  console.log(`[prepare-certs] ready: ${cert}`);
}