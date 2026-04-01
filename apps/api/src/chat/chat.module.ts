import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Conversation } from './entities/conversation.entity.js';
import { Message } from './entities/message.entity.js';
import { ChatService } from './chat.service.js';
import { ChatController } from './chat.controller.js';
import { AiModule } from '../ai/ai.module.js';

@Module({
  imports: [MikroOrmModule.forFeature([Conversation, Message]), AiModule],
  providers: [ChatService],
  controllers: [ChatController],
})
export class ChatModule {}
