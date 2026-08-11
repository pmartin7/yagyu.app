import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { SyncJob } from '../email-sync/entities/sync-job.entity.js';
import { Category } from './entities/category.entity.js';
import { TaskEmail } from './entities/task-email.entity.js';
import { TaskNextStep } from './entities/task-next-step.entity.js';
import { TaskNote } from './entities/task-note.entity.js';
import { Task } from './entities/task.entity.js';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';

@Module({
  imports: [
    MikroOrmModule.forFeature([Category, Task, TaskNextStep, TaskNote, TaskEmail, SyncJob]),
  ],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
