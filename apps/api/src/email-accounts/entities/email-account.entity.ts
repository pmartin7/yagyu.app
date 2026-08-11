import { Entity, Enum, ManyToOne, Opt, Property, Unique } from '@mikro-orm/core';
import { BaseEntity } from '../../common/entities/base.entity.js';
import { User } from '../../users/entities/user.entity.js';

export type EmailAccountProvider = 'gmail';
export type EmailAccountSyncStatus = 'idle' | 'syncing' | 'error' | 'reauth_required';

@Entity()
@Unique({ properties: ['user', 'emailAddress'] })
export class EmailAccount extends BaseEntity {
  @Enum({ items: () => ['gmail'], default: 'gmail' })
  provider: EmailAccountProvider & Opt = 'gmail';

  @Property()
  emailAddress!: string;

  // Base64 iv:authTag:ciphertext of the Google refresh token — longer than
  // the 255-char default column, so store as text.
  @Property({ hidden: true, type: 'text' })
  encryptedRefreshToken!: string;

  @Property({ nullable: true })
  syncCursor: string | null = null;

  @Property({ nullable: true })
  lastSyncedAt: Date | null = null;

  @Property({ nullable: true })
  initialSyncCompletedAt: Date | null = null;

  @Property({ nullable: true })
  watchExpiresAt: Date | null = null;

  @Enum({
    items: () => ['idle', 'syncing', 'error', 'reauth_required'],
    default: 'idle',
  })
  syncStatus: EmailAccountSyncStatus & Opt = 'idle';

  @ManyToOne(() => User)
  user!: User;
}
