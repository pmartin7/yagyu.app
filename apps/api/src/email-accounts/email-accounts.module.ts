import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { OAuth2Client } from 'google-auth-library';
import { EmailAccount } from './entities/email-account.entity.js';
import { EmailAccountsService } from './email-accounts.service.js';
import { EmailAccountsController } from './email-accounts.controller.js';

@Module({
  imports: [MikroOrmModule.forFeature([EmailAccount])],
  providers: [
    EmailAccountsService,
    // Provided under its own class as the DI token so it can be swapped for a
    // mock in tests via `overrideProvider(OAuth2Client)`.
    {
      provide: OAuth2Client,
      useFactory: (): OAuth2Client =>
        new OAuth2Client({
          clientId: process.env['GOOGLE_CLIENT_ID'],
          clientSecret: process.env['GOOGLE_CLIENT_SECRET'],
        }),
    },
    { provide: 'GOOGLE_CLIENT_ID', useValue: process.env['GOOGLE_CLIENT_ID'] },
    { provide: 'TOKEN_ENCRYPTION_KEY', useValue: process.env['TOKEN_ENCRYPTION_KEY'] },
  ],
  controllers: [EmailAccountsController],
  exports: [EmailAccountsService],
})
export class EmailAccountsModule {}
