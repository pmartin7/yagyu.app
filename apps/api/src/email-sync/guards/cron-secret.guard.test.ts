import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CronSecretGuard } from './cron-secret.guard.js';

function contextWithAuthorization(authorization?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization } }),
    }),
  } as ExecutionContext;
}

describe('CronSecretGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['CRON_SECRET'] = 'exact-secret';
  });

  afterEach(() => {
    delete process.env['CRON_SECRET'];
  });

  it.each([
    ['missing credentials', undefined],
    ['a wrong bearer token', 'Bearer wrong-secret'],
    ['a non-bearer credential', 'Basic exact-secret'],
  ])('rejects %s', (_name, authorization) => {
    // Arrange
    const guard = new CronSecretGuard();
    const context = contextWithAuthorization(authorization);

    // Act
    const activate = () => guard.canActivate(context);

    // Assert
    expect(activate).toThrow(UnauthorizedException);
  });

  it('accepts the exact bearer secret', () => {
    // Arrange
    const guard = new CronSecretGuard();
    const context = contextWithAuthorization('Bearer exact-secret');

    // Act
    const allowed = guard.canActivate(context);

    // Assert
    expect(allowed).toBe(true);
  });
});
