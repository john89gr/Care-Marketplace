/**
 * Dev-only visual check: boots the built app with the demo backend, signs in
 * with role-consistent demo sessions and screenshots every route.
 *
 * Usage: node scripts/screenshot-pages.mjs [outDir] [--mobile]
 * Requires a prior `ng build` (dist/care-marketplace/browser).
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const OUT = process.argv[2] ?? '/tmp/shots';
const MOBILE = process.argv.includes('--mobile');
const DARK = process.env.SHOT_DARK === '1';

const USERS = {
  client: { userId: 'u-client', displayName: 'Maria Papadopoulou', roles: ['client'] },
  nurse: { userId: 'u-nurse', displayName: 'Elena Papadaki', roles: ['nurse'] },
  admin: { userId: 'u-admin', displayName: 'Admin', roles: ['admin'] },
  pharmacy: { userId: 'u-pharmacy', displayName: 'Central Pharmacy', roles: ['pharmacy'] },
};

const PUBLIC = [
  ['login', '/login'],
  ['register', '/register'],
  ['forbidden', '/forbidden'],
  ['gov-gr-auth', '/gov-gr-auth'],
];

const CLIENT = [
  ['marketplace', '/marketplace'],
  ['bookings', '/bookings'],
  ['review', '/review'],
  ['live-visit', '/live-visit'],
  ['care-plan', '/care-plan'],
  ['payments', '/payments'],
  ['disputes', '/disputes'],
  ['wallet', '/wallet'],
  ['vitals', '/vitals'],
  ['health-record', '/health-record'],
  ['screenings', '/screenings'],
  ['medications', '/medications'],
  ['history', '/history'],
  ['contacts', '/contacts'],
  ['reminders', '/reminders'],
  ['health-summary', '/health-summary'],
  ['prescriptions', '/prescriptions'],
  ['pharmacy-orders', '/pharmacy-orders'],
  ['consents', '/consents'],
  ['chat', '/chat'],
  ['profile', '/profile'],
];

const NURSE = [
  ['visits', '/visits'],
  ['shifts', '/shifts'],
  ['onboarding', '/onboarding'],
  ['clinical-log', '/clinical-log'],
];

const ADMIN = [
  ['admin', '/admin'],
  ['admin-audit', '/admin/audit'],
  ['admin-consents', '/admin/consents'],
];

const PHARMACY = [['pharmacy', '/pharmacy']];

await mkdir(OUT, { recursive: true });

const server = spawn('node', ['e2e/static-server.mjs'], { stdio: 'ignore' });
await delay(800);

const browser = await chromium.launch();
const errors = [];

async function runPass(userKey, routes) {
  const user = USERS[userKey];
  const context = await browser.newContext({
    viewport: MOBILE ? { width: 414, height: 900 } : { width: 1440, height: 1000 },
    locale: 'en-GB',
    colorScheme: DARK ? 'dark' : 'light',
  });
  await context.addInitScript(
    ({ session, theme }) => {
      localStorage.setItem('cm.session.v1', JSON.stringify(session));
      localStorage.setItem('cm.demo.v1', '1');
      localStorage.setItem('cm.theme.v1', theme);
    },
    {
      session: {
        ...user,
        expiresAtMs: Date.now() + 86_400_000,
        idVerifiedVia: 'email',
      },
      theme: DARK ? 'dark' : 'light',
    }
  );

  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${userKey}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${userKey}] ${String(e)}`));

  for (const [name, path] of routes) {
    try {
      await page.goto(`http://localhost:4200${path}`, { waitUntil: 'load', timeout: 20_000 });
    } catch {
      errors.push(`[${userKey}] navigation failed: ${path}`);
    }
    await delay(700);
    const label = userKey === 'client' ? name : `${userKey}-${name}`;
    await page.screenshot({ path: `${OUT}/${label}.png`, fullPage: true });
    process.stdout.write(`· ${label}\n`);
  }
  await context.close();
}

async function runPublicPass() {
  const context = await browser.newContext({
    viewport: MOBILE ? { width: 414, height: 900 } : { width: 1440, height: 1000 },
    locale: 'en-GB',
    colorScheme: DARK ? 'dark' : 'light',
  });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[public] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[public] ${String(e)}`));
  for (const [name, path] of PUBLIC) {
    await page.goto(`http://localhost:4200${path}?demo=1`, { waitUntil: 'load' });
    await delay(500);
    await page.screenshot({ path: `${OUT}/public-${name}.png`, fullPage: true });
    process.stdout.write(`· public-${name}\n`);
  }
  await context.close();
}

await runPublicPass();
await runPass('client', CLIENT);
await runPass('nurse', NURSE);
await runPass('admin', ADMIN);
await runPass('pharmacy', PHARMACY);

await browser.close();
server.kill();

if (errors.length) {
  console.log(`\n${errors.length} console error(s):`);
  for (const e of new Set(errors)) {
    console.log(`  ${e.slice(0, 220)}`);
  }
  process.exitCode = 1;
} else {
  console.log('\nno console errors');
}
