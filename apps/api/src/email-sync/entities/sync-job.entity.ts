import { Entity, Enum, ManyToOne, Opt, Property, Unique } from '@mikro-orm/core';
import { BaseEntity } from '../../common/entities/base.entity.js';
import { EmailAccount } from '../../email-accounts/entities/email-account.entity.js';

export type SyncJobKind = 'backfill' | 'incremental' | 'analyze' | 'reanalyze';
export type SyncJobStatus = 'pending' | 'running' | 'completed' | 'dead';
export type SyncJobCheckpoint = Record<string, unknown>;

@Entity()
@Unique({ properties: ['emailAccount', 'kind', 'dedupeKey'] })
export class SyncJob extends BaseEntity {
  @ManyToOne(() => EmailAccount, { deleteRule: 'cascade' })
  emailAccount!: EmailAccount;

  @Enum({ items: () => ['backfill', 'incremental', 'analyze', 'reanalyze'] })
  kind!: SyncJobKind;

  @Enum({
    items: () => ['pending', 'running', 'completed', 'dead'],
    default: 'pending',
  })
  status: SyncJobStatus & Opt = 'pending';

  @Property()
  dedupeKey!: string;

  @Property({ default: 0 })
  attempts: number & Opt = 0;

  @Property({ onCreate: () => new Date() })
  runAfter: Date & Opt = new Date();

  @Property({ nullable: true })
  leasedUntil: Date | null = null;

  @Property({ type: 'json', defaultRaw: "'{}'::jsonb" })
  checkpoint: SyncJobCheckpoint & Opt = {};

  @Property({ type: 'text', nullable: true })
  lastError: string | null = null;
}
