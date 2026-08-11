import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { AiModule } from '../ai/ai.module.js';
import { EmailSyncModule } from '../email-sync/email-sync.module.js';
import { EmailMessage } from '../email-sync/entities/email-message.entity.js';
import { SyncJob } from '../email-sync/entities/sync-job.entity.js';
import { Category } from '../tasks/entities/category.entity.js';
import { TaskEmail } from '../tasks/entities/task-email.entity.js';
import { TaskNextStep } from '../tasks/entities/task-next-step.entity.js';
import { TaskNote } from '../tasks/entities/task-note.entity.js';
import { Task } from '../tasks/entities/task.entity.js';
import { AutomationRun } from './entities/automation-run.entity.js';
import { TriageService } from './triage.service.js';

@Module({
  imports: [
    AiModule,
    EmailSyncModule,
    MikroOrmModule.forFeature([
      EmailMessage,
      SyncJob,
      AutomationRun,
      Category,
      Task,
      TaskNextStep,
      TaskNote,
      TaskEmail,
    ]),
  ],
  providers: [TriageService, { provide: 'TRIAGE_JOB_PROCESSOR', useExisting: TriageService }],
  exports: [TriageService],
})
export class TriageModule {}
