import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { Request } from 'express';
import { defaultIfEmpty, from, lastValueFrom, Observable } from 'rxjs';
import { UsersService } from '../../users/users.service.js';
import type { AuthClaims } from '../guards/firebase-auth.guard.js';
import type { User } from '../../users/entities/user.entity.js';

// Wraps every authenticated request in one Postgres transaction carrying the
// caller's identity as the transaction-local setting 'app.firebase_uid', which
// the RLS policies match against. MikroORM's TransactionContext
// (AsyncLocalStorage) makes all handler queries issued via the injected
// EntityManager join this transaction. Fail-closed: without the setting,
// policies match nothing.
@Injectable()
export class RlsContextInterceptor implements NestInterceptor {
  constructor(
    private readonly em: EntityManager,
    private readonly usersService: UsersService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { authClaims?: AuthClaims; user?: User }>();
    const claims = request.authClaims;

    // Unauthenticated route (e.g. health): no transaction, pass through.
    if (!claims) return next.handle();

    return from(
      this.em.transactional(async (em) => {
        await em.execute('select set_config(?, ?, true)', ['app.firebase_uid', claims.uid]);
        request.user = await this.usersService.getOrCreate(
          claims.uid,
          claims.email,
          claims.displayName,
        );
        // Subscribing inside the transactional callback keeps the handler in
        // the AsyncLocalStorage transaction context; defaultIfEmpty avoids
        // EmptyError when the handler observable completes without emitting.
        return await lastValueFrom(next.handle().pipe(defaultIfEmpty(undefined)));
      }),
    );
  }
}
