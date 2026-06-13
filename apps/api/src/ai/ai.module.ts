import { Module } from '@nestjs/common';
import { AiGatewayService } from './ai-gateway.service';
import { FallbackService } from './fallback.service';
import { OllamaProvider } from './providers/ollama.provider';

@Module({
  providers: [AiGatewayService, FallbackService, OllamaProvider],
  exports: [AiGatewayService, FallbackService],
})
export class AiModule {}
