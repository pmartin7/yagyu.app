import './config/load-env.js';
import { buildOrmConfig } from './mikro-orm.config.js';

// Migrations run as neondb_owner (table owner, BYPASSRLS): DDL needs
// ownership, and backfill DML is unaffected by RLS. The app runtime uses
// src/mikro-orm.config.ts with the RLS-bound app_user credential instead.
// Wired to the CLI via the "mikro-orm" key in package.json.
export default buildOrmConfig(process.env['NEON_DATABASE_URL']);
