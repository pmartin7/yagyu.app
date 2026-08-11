import { createHash, timingSafeEqual } from 'crypto';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class CronSecretGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.headers.authorization;
    const supplied = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    const expected = process.env['CRON_SECRET'] ?? '';
    const suppliedDigest = createHash('sha256').update(supplied).digest();
    const expectedDigest = createHash('sha256').update(expected).digest();

    if (!expected || !supplied || !timingSafeEqual(suppliedDigest, expectedDigest)) {
      throw new UnauthorizedException('Invalid cron credentials');
    }
    return true;
  }
}
