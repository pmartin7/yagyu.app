import './config/load-env.js';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import * as admin from 'firebase-admin';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { validateEnv } from './config/env.schema.js';

// Shared bootstrap for both entrypoints: main.ts (local listener) and
// serverless.ts (Vercel function).
export async function createApp(): Promise<INestApplication> {
  validateEnv();

  // Guarded for serverless warm starts, where the module may be re-imported
  // while the default app instance persists.
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env['FIREBASE_PROJECT_ID'],
        // Env stores may escape newlines in the PEM key
        privateKey: process.env['FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n'),
        clientEmail: process.env['FIREBASE_CLIENT_EMAIL'],
      }),
    });
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api');
  app.enableCors({ origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:5173' });
  app.useGlobalFilters(new AllExceptionsFilter());

  return app;
}
