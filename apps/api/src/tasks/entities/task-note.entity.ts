import { Entity, ManyToOne, Property } from '@mikro-orm/core';
import { BaseEntity } from '../../common/entities/base.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { Task } from './task.entity.js';

@Entity()
export class TaskNote extends BaseEntity {
  @ManyToOne(() => Task, { deleteRule: 'cascade' })
  task!: Task;

  @ManyToOne(() => User, { deleteRule: 'cascade' })
  user!: User;

  @Property({ type: 'text' })
  body!: string;
}
