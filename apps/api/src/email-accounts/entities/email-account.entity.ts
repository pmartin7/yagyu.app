import { Entity, Enum, ManyToOne, Opt, Property, Unique } from '@mikro-orm/core';
import { BaseEntity } from '../../common/entities/base.entity.js';
import { User } from '../../users/entities/user.entity.js';

export type EmailAccountProvider = 'gmail';

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

  @ManyToOne(() => User)
  user!: User;
}
