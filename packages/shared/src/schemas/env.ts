import { z } from 'zod';

// Byte length from base64 shape alone (no Buffer/atob — this package must
// stay runtime-agnostic between the browser web app and the Node API).
function base64DecodedByteLength(value: string): number {
  const cleaned = value.trim();
  if (cleaned.length === 0 || cleaned.length % 4 !== 0) return -1;
  const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0;
  return (cleaned.length / 4) * 3 - padding;
}

export const EnvSchema = z.object({
  // Database
  NEON_DATABASE_URL: z.string().url(),

  // Firebase Admin SDK
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_PRIVATE_KEY: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().email(),

  // AI Providers
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  DEFAULT_AI_MODEL: z.string().min(1),

  // Google OAuth (Gmail account linking)
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .min(1)
    .refine(
      (value) => base64DecodedByteLength(value) === 32,
      'TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key (e.g. openssl rand -base64 32)',
    ),

  // Observability (optional)
  AXIOM_TOKEN: z.string().optional(),
  AXIOM_DATASET: z.string().optional(),

  // App
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Vercel Blob (optional)
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;
