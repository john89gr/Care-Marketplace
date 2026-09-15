import { bootstrapDb } from './src/db';
import { createApp } from './src/app';
import { seed } from './src/seed';
async function main() {
  await bootstrapDb();
  await seed();
  const app = createApp();
  app.listen(3999, () => console.log('up'));
}
main().catch((e) => { console.error(e); process.exit(1); });
