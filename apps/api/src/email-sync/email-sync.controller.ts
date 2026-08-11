import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { waitUntil } from '@vercel/functions';
import type { Request } from 'express';
import { z } from 'zod';
import { CronSecretGuard } from './guards/cron-secret.guard.js';
import { PubsubOidcGuard } from './guards/pubsub-oidc.guard.js';
import { EmailSyncService } from './email-sync.service.js';

const PubsubEnvelopeSchema = z
  .object({
    message: z
      .object({
        data: z.string().min(1),
        messageId: z.string().optional(),
      })
      .passthrough(),
    subscription: z.string().optional(),
  })
  .passthrough();

const GmailNotificationSchema = z
  .object({
    emailAddress: z.string().email(),
    historyId: z.string().regex(/^\d+$/),
  })
  .strict();

@Controller('internal')
export class EmailSyncController {
  private readonly logger = new Logger(EmailSyncController.name);

  constructor(private readonly emailSyncService: EmailSyncService) {}

  @Post('gmail/notifications')
  @HttpCode(200)
  @UseGuards(PubsubOidcGuard)
  async receiveNotification(
    @Body() rawBody: unknown,
    @Req() request: Request,
  ): Promise<{ accepted: true }> {
    const envelope = PubsubEnvelopeSchema.safeParse(rawBody);
    if (!envelope.success) throw new BadRequestException('Invalid Pub/Sub envelope');

    let decoded: unknown;
    try {
      decoded = JSON.parse(Buffer.from(envelope.data.message.data, 'base64').toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid Pub/Sub message data');
    }
    const notification = GmailNotificationSchema.safeParse(decoded);
    if (!notification.success) throw new BadRequestException('Invalid Gmail notification');

    const found = await this.emailSyncService.enqueueIncrementalByEmail(
      notification.data.emailAddress,
      notification.data.historyId,
    );
    if (found) this.schedule(request, this.emailSyncService.drainBounded());
    return { accepted: true };
  }

  // Vercel Cron invokes configured paths with GET. POST remains available for
  // authenticated self-chaining and manual operational drains.
  @Get('sync/run')
  @UseGuards(CronSecretGuard)
  async runScheduledSync(
    @Req() request: Request,
  ): Promise<{ accepted: true; accountsQueued: number }> {
    return this.startSync(request);
  }

  @Post('sync/run')
  @HttpCode(200)
  @UseGuards(CronSecretGuard)
  async runSync(@Req() request: Request): Promise<{ accepted: true; accountsQueued: number }> {
    return this.startSync(request);
  }

  private async startSync(request: Request): Promise<{ accepted: true; accountsQueued: number }> {
    const accountsQueued = await this.emailSyncService.enqueueScheduledSyncs();
    const protocol = String(request.headers['x-forwarded-proto'] ?? request.protocol);
    const selfChainUrl = `${protocol}://${request.get('host')}/api/internal/sync/run`;
    this.schedule(
      request,
      this.emailSyncService
        .renewExpiringWatches()
        .then(() => this.emailSyncService.drainBounded({ selfChainUrl })),
    );
    return { accepted: true, accountsQueued };
  }

  private schedule(_request: Request, promise: Promise<unknown>): void {
    const tracked = promise.catch((error: unknown) => {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Background email drain failed',
      );
    });
    waitUntil(tracked);
  }
}
