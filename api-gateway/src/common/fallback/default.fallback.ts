import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class DefaultFallbackService {
  private readonly logger = new Logger(DefaultFallbackService.name);

  createDefaultFallback<T>(
    defaultResponse: T,
    serviceName: string,
  ): () => Promise<T> {
    return (): Promise<T> => {
      this.logger.warn(`Using default fallback for ${serviceName}`);

      return Promise.resolve(defaultResponse);
    };
  }

  createErrorFallback(
    serviceName: string,
    errorMessage: string,
  ): () => Promise<never> {
    return (): never => {
      this.logger.error(`Fallback error for ${serviceName}: ${errorMessage}`);
      throw new Error(`${serviceName} service unavailable: ${errorMessage}`);
    };
  }

  createEmptyArrayFallback<T>(serviceName: string): () => Promise<T[]> {
    return (): Promise<T[]> => {
      this.logger.warn(`Using empty array fallback for ${serviceName}`);

      return Promise.resolve([]);
    };
  }

  createEmptyObjectFallback<T>(serviceName: string): () => Promise<T> {
    return (): Promise<T> => {
      this.logger.warn(`Using empty object fallback for ${serviceName}`);

      return Promise.resolve({} as T);
    };
  }
}
