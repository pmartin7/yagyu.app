import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { LinkGmailAccountSchema } from '@morpheus/shared';
import type { ApiResponse, EmailAccountResponse, LinkGmailAccount } from '@morpheus/shared';
import { FirebaseAuthGuard } from '../common/guards/firebase-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { EmailAccountsService } from './email-accounts.service.js';
import { EmailAccount } from './entities/email-account.entity.js';
import { User } from '../users/entities/user.entity.js';

@Controller('email-accounts')
@UseGuards(FirebaseAuthGuard)
export class EmailAccountsController {
  constructor(private readonly emailAccountsService: EmailAccountsService) {}

  @Get()
  async list(@CurrentUser() user: User): Promise<ApiResponse<EmailAccountResponse[]>> {
    const accounts = await this.emailAccountsService.list(user);
    return { success: true, data: accounts.map((account) => this.toResponse(account)) };
  }

  @Post('google')
  async linkGoogle(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(LinkGmailAccountSchema)) body: LinkGmailAccount,
  ): Promise<ApiResponse<EmailAccountResponse>> {
    const account = await this.emailAccountsService.linkGmail(user, body.code);
    return { success: true, data: this.toResponse(account) };
  }

  @Delete(':id')
  async unlink(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<ApiResponse<{ id: string }>> {
    await this.emailAccountsService.unlink(user, id);
    return { success: true, data: { id } };
  }

  private toResponse(account: EmailAccount): EmailAccountResponse {
    return {
      id: account.id,
      provider: account.provider,
      emailAddress: account.emailAddress,
      createdAt: account.createdAt.toISOString(),
    };
  }
}
