import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  OnModuleInit,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Request } from 'express';
import * as admin from 'firebase-admin';
import { UsersService } from '../../users/users.service.js';

@Injectable()
export class FirebaseAuthGuard implements CanActivate, OnModuleInit {
  private usersService!: UsersService;

  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleInit(): void {
    this.usersService = this.moduleRef.get(UsersService, { strict: false });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: unknown }>();
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

    const user = await this.usersService.getOrCreate(
      decoded.uid,
      decoded['email'] ?? '',
      decoded['name'] ?? null,
    );

    request.user = user;
    return true;
  }
}
