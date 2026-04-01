import { Collection, Entity, ManyToOne, OneToMany, Property } from '@mikro-orm/core';
import { BaseEntity } from '../../common/entities/base.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { Message } from './message.entity.js';

@Entity()
export class Conversation extends BaseEntity {
  @Property({ nullable: true })
  title: string | null = null;

  @ManyToOne(() => User)
  user!: User;

  @OneToMany(() => Message, (m) => m.conversation)
  messages = new Collection<Message>(this);
}
