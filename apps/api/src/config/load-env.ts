import { resolve } from 'path';
import { config as loadDotenv } from 'dotenv';

// Load the repo-root .env in local dev; no-op in production where env vars
// come from the platform. This module must be imported before any module
// that reads process.env at load time (e.g. mikro-orm.config).
// Compiled location: apps/api/dist/config/load-env.js → repo root is 4 up.
loadDotenv({ path: resolve(__dirname, '../../../../.env') });
