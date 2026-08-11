import { Entity, Enum, ManyToOne, Property, Unique } from '@mikro-orm/core';
import { BaseEntity } from '../../common/entities/base.entity.js';
import { EmailAccount } from '../../email-accounts/entities/email-account.entity.js';
import { User } from '../../users/entities/user.entity.js';

export type EmailAnalysisStatus = 'pending' | 'skipped' | 'analyzed' | 'error';

@Entity()
@Unique({ properties: ['emailAccount', 'providerMessageId'] })
export class EmailMessage extends BaseEntity {
  @ManyToOne(() => User, { deleteRule: 'cascade' })
  user!: User;

  @ManyToOne(() => EmailAccount, { deleteRule: 'cascade' })
  emailAccount!: EmailAccount;

  @Property()
  providerMessageId!: string;

  @Property()
  threadId!: string;

  @Property()
  sender!: string;

  @Property()
  subject!: string;

  @Property({ type: 'text' })
  snippet!: string;

  @Property({ type: 'text' })
  bodyText!: string;

  @Property()
  receivedAt!: Date;

  @Enum({ items: () => ['pending', 'skipped', 'analyzed', 'error'], default: 'pending' })
  analysisStatus: EmailAnalysisStatus = 'pending';
}
