import type { Request, Response, Express } from 'express';
import { createApp } from './create-app.js';

// One Nest app per lambda instance, promise-cached so concurrent requests
// during a cold start share a single bootstrap.
let expressApp: Promise<Express> | undefined;

async function bootstrap(): Promise<Express> {
  const app = await createApp();
  await app.init();
  return app.getHttpAdapter().getInstance() as Express;
}

export function api(req: Request, res: Response): Promise<void> {
  expressApp ??= bootstrap();
  return expressApp.then((handler) => handler(req, res));
}
