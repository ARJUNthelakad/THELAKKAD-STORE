import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { closeNeonPool, getNeonClient, isNeonConfigured } from '../src/server/neon';
import {
  createPostgresRepository,
  ensurePostgresSchema,
  migrateJsonStateToPostgres,
  type LegacyJsonStoreState,
} from '../src/server/postgresDb';

async function main(): Promise<void> {
  if (!isNeonConfigured()) {
    console.error(
      '[migrate] DATABASE_URL is not set. Export your Neon PostgreSQL connection string (e.g. from Vercel Environment Variables) and re-run `npm run db:migrate`.'
    );
    process.exit(1);
  }

  const sourcePathArg = process.argv[2];
  const sourcePath = sourcePathArg
    ? path.resolve(process.cwd(), sourcePathArg)
    : path.resolve(process.cwd(), 'data', 'store.json');

  const db = getNeonClient();

  try {
    console.info('[migrate] Ensuring Neon PostgreSQL schema (16 tables + indexes)...');
    await ensurePostgresSchema(db);

    if (!fs.existsSync(sourcePath)) {
      console.info(
        `[migrate] No legacy store.json found at ${sourcePath}. Schema is initialized with default catalog, settings, and website content.`
      );
      return;
    }

    console.info(`[migrate] Reading legacy data from ${sourcePath}...`);
    const raw = fs.readFileSync(sourcePath, 'utf8');
    const parsed = JSON.parse(raw) as LegacyJsonStoreState;

    const summary = await migrateJsonStateToPostgres(db, parsed);
    console.info('[migrate] Migration transaction committed. Verified Neon row counts:');
    console.table(summary);

    // Cross-check key fields against original store.json
    const repo = createPostgresRepository(db);
    const [settings, website, orders, staff] = await Promise.all([
      repo.getSettings(),
      repo.getWebsiteContent(),
      repo.getOrders(),
      repo.getAllStaff(),
    ]);

    const checks: Array<{ name: string; ok: boolean; detail: string }> = [
      {
        name: 'Store settings migrated',
        ok:
          !parsed.settings?.supportEmail ||
          settings.supportEmail === parsed.settings.supportEmail,
        detail: `${settings.storeName} (${settings.supportEmail})`,
      },
      {
        name: 'Website editor config migrated',
        ok:
          !parsed.website?.hero?.headline ||
          website.hero.headline === parsed.website.hero.headline,
        detail: `Hero: "${website.hero.headline}"`,
      },
      {
        name: 'Orders preserved',
        ok: (parsed.orders ?? []).every((orig) =>
          orders.some((migrated) => migrated.reference === orig.reference)
        ),
        detail: `${orders.length} order(s) in Neon`,
      },
      {
        name: 'Admin accounts preserved',
        ok: (parsed.staff ?? []).every((orig) =>
          staff.some((migrated) => migrated.email === orig.email.trim().toLowerCase())
        ),
        detail: `${staff.length} staff account(s) in Neon`,
      },
    ];

    console.info('[migrate] Verification checks:');
    for (const check of checks) {
      console.info(`  ${check.ok ? 'PASS' : 'FAIL'} - ${check.name}: ${check.detail}`);
    }

    if (checks.some((c) => !c.ok)) {
      console.error('[migrate] One or more verification checks failed.');
      process.exitCode = 1;
    } else {
      console.info(
        '[migrate] All checks passed. Original data/store.json was preserved untouched. Script is safe to re-run.'
      );
    }
  } finally {
    await closeNeonPool();
  }
}

main().catch((err) => {
  console.error('[migrate] Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
