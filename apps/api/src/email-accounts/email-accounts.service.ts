import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { OAuth2Client } from 'google-auth-library';
import { decryptToken, encryptToken } from './token-cipher.js';
import { EmailAccount } from './entities/email-account.entity.js';
import { User } from '../users/entities/user.entity.js';

const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

@Injectable()
export class EmailAccountsService {
  private readonly logger = new Logger(EmailAccountsService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly oauthClient: OAuth2Client,
    @Inject('GOOGLE_CLIENT_ID') private readonly googleClientId: string,
    @Inject('TOKEN_ENCRYPTION_KEY') private readonly tokenEncryptionKey: string,
  ) {}

  async linkGmail(user: User, code: string): Promise<EmailAccount> {
    const { tokens } = await this.oauthClient.getToken({ code, redirect_uri: 'postmessage' });

    if (!tokens.refresh_token) {
      throw new BadRequestException(
        "Google did not return a refresh token. Remove Yagyu's access at myaccount.google.com/permissions and try linking again.",
      );
    }

    const grantedScopes = tokens.scope?.split(' ') ?? [];
    if (!grantedScopes.includes(GMAIL_READONLY_SCOPE)) {
      throw new BadRequestException(
        'Gmail access was not granted. Please allow the Gmail permission when linking.',
      );
    }

    if (!tokens.id_token) {
      throw new BadRequestException('Google did not return an id token.');
    }

    const ticket = await this.oauthClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: this.googleClientId,
    });
    const email = ticket.getPayload()?.email;
    if (!email) {
      throw new BadRequestException('Google account has no email address.');
    }

    const emailAddress = email.toLowerCase();
    const encryptedRefreshToken = encryptToken(tokens.refresh_token, this.tokenEncryptionKey);

    const existing = await this.em.findOne(EmailAccount, { user, emailAddress });
    if (existing) {
      existing.encryptedRefreshToken = encryptedRefreshToken;
      await this.em.flush();
      return existing;
    }

    const account = this.em.create(EmailAccount, {
      user,
      emailAddress,
      encryptedRefreshToken,
      provider: 'gmail',
    });
    await this.em.flush();
    return account;
  }

  async list(user: User): Promise<EmailAccount[]> {
    return this.em.find(EmailAccount, { user });
  }

  async unlink(user: User, id: string): Promise<void> {
    const account = await this.em.findOne(EmailAccount, { id, user });
    if (!account) {
      throw new NotFoundException('Email account not found');
    }

    try {
      const refreshToken = decryptToken(account.encryptedRefreshToken, this.tokenEncryptionKey);
      await this.oauthClient.revokeToken(refreshToken);
    } catch (err) {
      // Log message only — gaxios errors carry the request config, which
      // includes the plaintext refresh token being revoked
      this.logger.warn(
        { accountId: account.id, error: err instanceof Error ? err.message : String(err) },
        'Failed to revoke Google token during unlink',
      );
    }

    await this.em.removeAndFlush(account);
  }
}
