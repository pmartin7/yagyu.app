import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import * as admin from 'firebase-admin';

export interface AuthClaims {
  uid: string;
  email: string;
  displayName: string | null;
}

// The guard must not touch the database: user lookup happens later, inside
// the RLS transaction owned by RlsContextInterceptor. It only verifies the
// JWT and stashes the decoded claims on the request.
@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { authClaims?: AuthClaims }>();
    const authHeader = request.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.slice(7);

    let decoded: admin.auth.DecodedIdToken;
    try {
      decoded = await admin.auth().verifyIdToken(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired Firebase token');
    }

    // Never trust an unverified email claim: it allows squatting someone
    // else's address (unique email column) and blocking their real signup.
    // The web app blocks unverified sign-ins too; Google SSO is always verified.
    if (decoded.email_verified !== true) {
      throw new UnauthorizedException('Email address not verified');
    }

    request.authClaims = {
      uid: decoded.uid,
      email: decoded['email'] ?? '',
      displayName: (decoded['name'] as string | undefined) ?? null,
    };
    return true;
  }
}
