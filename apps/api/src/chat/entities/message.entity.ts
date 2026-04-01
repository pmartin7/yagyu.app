import { Entity, Enum, ManyToOne, Property } from '@mikro-orm/core';
import { BaseEntity } from '../../common/entities/base.entity.js';
import { Conversation } from './conversation.entity.js';

export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
}

@Entity()
export class Message extends BaseEntity {
  @Enum(() => MessageRole)
  role!: MessageRole;

  @Property({ type: 'text' })
  content!: string;

  @ManyToOne(() => Conversation)
  conversation!: Conversation;
}
