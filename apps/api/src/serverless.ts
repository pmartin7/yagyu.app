import { Logger } from '@nestjs/common';
import type { Request, Response, Express } from 'express';
import { createApp } from './create-app.js';

// One Nest app per lambda instance, promise-cached so concurrent requests
// during a cold start share a single bootstrap.
let expressApp: Promise<Express> | undefined;
const logger = new Logger('Serverless');

async function bootstrap(): Promise<Express> {
  const app = await createApp();
  await app.init();
  return app.getHttpAdapter().getInstance() as Express;
}

function respondBootstrapFailure(res: Response, err: unknown): void {
  if (res.headersSent) return;
  const message = err instanceof Error ? err.message : 'Unknown bootstrap error';
  logger.error(
    { errorName: err instanceof Error ? err.name : 'Error', message },
    'API bootstrap failed',
  );
  res.status(500).json({
    success: false,
    statusCode: 500,
    error: 'INTERNAL_SERVER_ERROR',
    message: 'API failed to start',
  });
}

export function api(req: Request, res: Response): Promise<void> {
  expressApp ??= bootstrap().catch((err: unknown) => {
    // Allow the next request to retry bootstrap after a cold-start failure.
    expressApp = undefined;
    throw err;
  });
  // Reject handler only — do not wrap Express request errors as bootstrap failures.
  return expressApp.then(
    (handler) => {
      handler(req, res);
    },
    (err: unknown) => {
      respondBootstrapFailure(res, err);
    },
  );
}
