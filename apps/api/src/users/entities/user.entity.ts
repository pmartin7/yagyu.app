import { Entity, Property } from '@mikro-orm/core';
import { BaseEntity } from '../../common/entities/base.entity.js';

@Entity()
export class User extends BaseEntity {
  @Property({ unique: true })
  firebaseUid!: string;

  @Property({ unique: true })
  email!: string;

  @Property({ nullable: true })
  displayName: string | null = null;
}
