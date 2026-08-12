import { Entity, ManyToOne, Opt, Property } from '@mikro-orm/core';
import { BaseEntity } from '../../common/entities/base.entity.js';
import { Task } from './task.entity.js';

@Entity()
export class TaskNextStep extends BaseEntity {
  @ManyToOne(() => Task, { deleteRule: 'cascade' })
  task!: Task;

  @Property()
  title!: string;

  @Property({ type: 'datetime', nullable: true })
  completedAt: Date | null = null;

  @Property({ default: 0 })
  sortOrder: number & Opt = 0;
}
