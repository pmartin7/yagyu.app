import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../common/guards/firebase-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { UpdateUserSchema } from '@morpheus/shared';
import type { UpdateUser } from '@morpheus/shared';
import { UsersService } from './users.service.js';
import { User } from './entities/user.entity.js';

@Controller('users')
@UseGuards(FirebaseAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: User): User {
    return user;
  }

  @Patch('me')
  updateMe(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(UpdateUserSchema)) body: UpdateUser,
  ): Promise<User> {
    return this.usersService.updateProfile(user, body);
  }
}
