import { Controller, Get, Res } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Public()
  @Get()
  @ApiExcludeEndpoint()
  async getMetrics(@Res({ passthrough: true }) res: Response): Promise<string> {
    const { contentType, metrics } = await this.metricsService.getMetrics();
    res.setHeader('Content-Type', contentType);
    return metrics;
  }
}
