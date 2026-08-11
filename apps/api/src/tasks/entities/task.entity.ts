import { Collection, Entity, Enum, ManyToOne, OneToMany, Opt, Property } from '@mikro-orm/core';
import type { TaskPriority } from '@morpheus/shared';
import { BaseEntity } from '../../common/entities/base.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { Category, type ManagedBy } from './category.entity.js';
import { TaskEmail } from './task-email.entity.js';
import { TaskNextStep } from './task-next-step.entity.js';
import { TaskNote } from './task-note.entity.js';

export type TaskStatus = 'open' | 'done';

@Entity()
export class Task extends BaseEntity {
  @ManyToOne(() => User, { deleteRule: 'cascade' })
  user!: User;

  @ManyToOne(() => Category, { deleteRule: 'cascade' })
  category!: Category;

  @Property()
  title!: string;

  @Enum({ items: () => ['open', 'done'], default: 'open' })
  status: TaskStatus & Opt = 'open';

  @Property({ type: 'date', nullable: true })
  dueDate: string | null = null;

  @Enum({ items: () => ['low', 'medium', 'high', 'urgent'], default: 'medium' })
  priority: TaskPriority & Opt = 'medium';

  @Property({ type: 'double', default: 0 })
  stackRank: number & Opt = 0;

  @Enum({ items: () => ['ai', 'user'], default: 'ai' })
  managedBy: ManagedBy & Opt = 'ai';

  @Property({ type: 'text', nullable: true })
  aiContext: string | null = null;

  @Property({ type: 'text', nullable: true })
  aiRecommendedAction: string | null = null;

  @OneToMany(() => TaskNextStep, (step) => step.task)
  nextSteps = new Collection<TaskNextStep>(this);

  @OneToMany(() => TaskNote, (note) => note.task)
  notes = new Collection<TaskNote>(this);

  @OneToMany(() => TaskEmail, (taskEmail) => taskEmail.task)
  taskEmails = new Collection<TaskEmail>(this);
}
