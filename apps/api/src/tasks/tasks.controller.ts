import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CreateTaskNoteSchema,
  TaskListQuerySchema,
  UpdateNextStepSchema,
  UpdateTaskSchema,
} from '@morpheus/shared';
import type {
  ApiResponse,
  CategoryResponse,
  CreateTaskNote,
  TaskListQuery,
  TaskResponse,
  UpdateNextStep,
  UpdateTask,
} from '@morpheus/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { FirebaseAuthGuard } from '../common/guards/firebase-auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { User } from '../users/entities/user.entity.js';
import { TasksService } from './tasks.service.js';

@Controller()
@UseGuards(FirebaseAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get('tasks')
  async list(
    @CurrentUser() user: User,
    @Query(new ZodValidationPipe(TaskListQuerySchema)) query: TaskListQuery,
  ): Promise<ApiResponse<TaskResponse[]>> {
    return { success: true, data: await this.tasksService.list(user, query) };
  }

  @Patch('tasks/:id')
  async update(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateTaskSchema)) body: UpdateTask,
  ): Promise<ApiResponse<TaskResponse>> {
    return { success: true, data: await this.tasksService.update(user, id, body) };
  }

  @Patch('tasks/:id/next-steps/:stepId')
  async updateNextStep(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('stepId', new ParseUUIDPipe()) stepId: string,
    @Body(new ZodValidationPipe(UpdateNextStepSchema)) body: UpdateNextStep,
  ): Promise<ApiResponse<TaskResponse>> {
    return {
      success: true,
      data: await this.tasksService.updateNextStep(user, id, stepId, body),
    };
  }

  @Post('tasks/:id/notes')
  async appendNote(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(CreateTaskNoteSchema)) body: CreateTaskNote,
  ): Promise<ApiResponse<TaskResponse>> {
    return { success: true, data: await this.tasksService.appendNote(user, id, body) };
  }

  @Get('categories')
  async listCategories(@CurrentUser() user: User): Promise<ApiResponse<CategoryResponse[]>> {
    return { success: true, data: await this.tasksService.listCategories(user) };
  }
}
