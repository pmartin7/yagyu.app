import { Entity, Enum, ManyToOne, Opt, Unique } from '@mikro-orm/core';
import { BaseEntity } from '../../common/entities/base.entity.js';
import { EmailMessage } from '../../email-sync/entities/email-message.entity.js';
import { Task } from './task.entity.js';

export type TaskEmailLinkedBy = 'ai' | 'user';

@Entity()
@Unique({ properties: ['task', 'email'] })
export class TaskEmail extends BaseEntity {
  @ManyToOne(() => Task, { deleteRule: 'cascade' })
  task!: Task;

  @ManyToOne(() => EmailMessage, { deleteRule: 'cascade' })
  email!: EmailMessage;

  @Enum({ items: () => ['ai', 'user'], default: 'ai' })
  linkedBy: TaskEmailLinkedBy & Opt = 'ai';
}
