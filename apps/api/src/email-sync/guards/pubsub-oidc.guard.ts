import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { OAuth2Client } from 'google-auth-library';

@Injectable()
export class PubsubOidcGuard implements CanActivate {
  private readonly oauthClient = new OAuth2Client();

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const serviceAccount = process.env['PUBSUB_PUSH_SERVICE_ACCOUNT'];
    if (!serviceAccount) {
      throw new UnauthorizedException('Pub/Sub push is not configured');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Pub/Sub OIDC token');
    }

    const protocol = String(request.headers['x-forwarded-proto'] ?? request.protocol);
    const host = request.get('host');
    const audience = `${protocol}://${host}${request.originalUrl}`;

    try {
      const ticket = await this.oauthClient.verifyIdToken({
        idToken: authorization.slice(7),
        audience,
      });
      const payload = ticket.getPayload();
      if (payload?.email !== serviceAccount || payload.email_verified !== true) {
        throw new UnauthorizedException('Unexpected Pub/Sub service account');
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid Pub/Sub OIDC token');
    }
    return true;
  }
}
