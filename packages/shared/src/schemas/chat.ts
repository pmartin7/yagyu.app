import { z } from 'zod';

export const SendMessageSchema = z.object({
  conversationId: z.string().uuid().optional(),
  content: z.string().min(1).max(10000),
});

export const MessageResponseSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  createdAt: z.string().datetime(),
});

export const ConversationResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  messages: z.array(MessageResponseSchema).optional(),
});

export type SendMessage = z.infer<typeof SendMessageSchema>;
export type MessageResponse = z.infer<typeof MessageResponseSchema>;
export type ConversationResponse = z.infer<typeof ConversationResponseSchema>;
