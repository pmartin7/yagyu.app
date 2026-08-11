import {
  Collection,
  Entity,
  Enum,
  ManyToOne,
  OneToMany,
  Opt,
  Property,
  Unique,
} from '@mikro-orm/core';
import { BaseEntity } from '../../common/entities/base.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { Task } from './task.entity.js';

export type ManagedBy = 'ai' | 'user';
export type RankingMode = 'ai' | 'manual';

@Entity()
@Unique({ properties: ['user', 'name'] })
export class Category extends BaseEntity {
  @ManyToOne(() => User, { deleteRule: 'cascade' })
  user!: User;

  @Property()
  name!: string;

  @Property({ type: 'text' })
  summary!: string;

  @Enum({ items: () => ['ai', 'user'], default: 'ai' })
  managedBy: ManagedBy & Opt = 'ai';

  @Enum({ items: () => ['ai', 'manual'], default: 'ai' })
  rankingMode: RankingMode & Opt = 'ai';

  @Property({ default: 0 })
  sortOrder: number & Opt = 0;

  @OneToMany(() => Task, (task) => task.category)
  tasks = new Collection<Task>(this);
}
