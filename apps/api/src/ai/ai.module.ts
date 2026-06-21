import { Module } from '@nestjs/common';
import { AppConfig } from '../common/config';
import { AiGatewayService } from './ai-gateway.service';
import { FallbackService } from './fallback.service';
import { AI_PROVIDER, type AiProvider } from './providers/ai-provider.interface';
import { OllamaProvider } from './providers/ollama.provider';
import { OpenAiProvider } from './providers/openai.provider';

@Module({
  providers: [
    AiGatewayService,
    FallbackService,
    OllamaProvider,
    OpenAiProvider,
    // The gateway depends on AI_PROVIDER; pick the implementation at startup from
    // AI_PROVIDER env (default ollama). Both are constructed, only one is wired in.
    {
      provide: AI_PROVIDER,
      useFactory: (config: AppConfig, ollama: OllamaProvider, openai: OpenAiProvider): AiProvider =>
        config.ai.provider === 'openai' ? openai : ollama,
      inject: [AppConfig, OllamaProvider, OpenAiProvider],
    },
  ],
  exports: [AiGatewayService, FallbackService],
})
export class AiModule {}
