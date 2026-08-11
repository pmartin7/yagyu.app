import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import mikroOrmConfig from './mikro-orm.config.js';
import { RlsContextInterceptor } from './common/interceptors/rls-context.interceptor.js';
import { UsersModule } from './users/users.module.js';
import { EmailAccountsModule } from './email-accounts/email-accounts.module.js';
import { AiModule } from './ai/ai.module.js';
import { HealthModule } from './health/health.module.js';
import { EmailSyncModule } from './email-sync/email-sync.module.js';
import { TriageModule } from './triage/triage.module.js';
import { TasksModule } from './tasks/tasks.module.js';

@Module({
  imports: [
    MikroOrmModule.forRoot(mikroOrmConfig),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env['NODE_ENV'] !== 'production' ? 'debug' : 'info',
        transport:
          process.env['NODE_ENV'] !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
        redact: ['req.headers.authorization'],
      },
    }),
    // In-memory, per-instance on serverless — a coarse safety net, not a
    // distributed limiter
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    UsersModule,
    EmailAccountsModule,
    AiModule,
    HealthModule,
    EmailSyncModule,
    TriageModule,
    TasksModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: RlsContextInterceptor },
  ],
})
export class AppModule {}
