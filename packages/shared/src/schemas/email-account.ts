import { z } from 'zod';

export const EmailAccountProviderSchema = z.enum(['gmail']);

export const LinkGmailAccountSchema = z.object({
  code: z.string().min(1),
});

export const EmailAccountResponseSchema = z.object({
  id: z.string().uuid(),
  provider: EmailAccountProviderSchema,
  emailAddress: z.string().email(),
  createdAt: z.string().datetime(),
});

export type EmailAccountProvider = z.infer<typeof EmailAccountProviderSchema>;
export type LinkGmailAccount = z.infer<typeof LinkGmailAccountSchema>;
export type EmailAccountResponse = z.infer<typeof EmailAccountResponseSchema>;
