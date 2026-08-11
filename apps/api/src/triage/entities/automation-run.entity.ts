import { Entity, Enum, ManyToOne, Property } from '@mikro-orm/core';
import { BaseEntity } from '../../common/entities/base.entity.js';
import { EmailMessage } from '../../email-sync/entities/email-message.entity.js';
import { Task } from '../../tasks/entities/task.entity.js';
import { User } from '../../users/entities/user.entity.js';

export type AutomationStage = 'screen' | 'route' | 'write';

@Entity()
export class AutomationRun extends BaseEntity {
  @ManyToOne(() => User, { deleteRule: 'cascade' })
  user!: User;

  @Enum({ items: () => ['screen', 'route', 'write'] })
  stage!: AutomationStage;

  @ManyToOne(() => EmailMessage, { nullable: true, deleteRule: 'set null' })
  email: EmailMessage | null = null;

  @ManyToOne(() => Task, { nullable: true, deleteRule: 'set null' })
  task: Task | null = null;

  @Property()
  promptVersion!: string;

  @Property()
  model!: string;

  @Property({ type: 'json' })
  appliedChanges!: Record<string, unknown>;

  @Property({ type: 'json', defaultRaw: "'{}'::jsonb" })
  generationConfig: Record<string, unknown> = {};

  @Property({ default: 0 })
  tokensIn = 0;

  @Property({ default: 0 })
  tokensOut = 0;

  @Property({ default: 0 })
  latencyMs = 0;
}
