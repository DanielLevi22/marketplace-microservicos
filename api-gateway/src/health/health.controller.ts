import { Controller, Get, Param } from '@nestjs/common';
import { HealthService } from './health.service';
import { HealthCheckService as CustomHealthCheckService } from 'src/common/health/health-check.service';
import { HealthStatus } from 'src/common/health/health-check.interface';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HttpHealthIndicator,
} from '@nestjs/terminus';
import { serviceConfig } from 'src/config/gateway.config';

@Controller('health')
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly customHealthCheckService: CustomHealthCheckService,
    private readonly health: HealthCheckService,
    private readonly http: HttpHealthIndicator,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Health check do gateway' })
  @ApiResponse({ status: 200, description: 'Gateway está saudável' })
  @HealthCheck()
  getHealth() {
    return this.health.check([
      () =>
        this.http.pingCheck('users', `${serviceConfig.users.url}/health`, {
          timeout: serviceConfig.users.timeout,
        }),
      () =>
        this.http.pingCheck(
          'products',
          `${serviceConfig.products.url}/health`,
          { timeout: serviceConfig.products.timeout },
        ),
      () =>
        this.http.pingCheck(
          'checkout',
          `${serviceConfig.checkout.url}/health`,
          { timeout: serviceConfig.checkout.timeout },
        ),
      () =>
        this.http.pingCheck(
          'payments',
          `${serviceConfig.payments.url}/health`,
          { timeout: serviceConfig.payments.timeout },
        ),
    ]);
  }

  @Get('services')
  @ApiOperation({ summary: 'Health check de todos os serviços' })
  @ApiResponse({ status: 200, description: 'Status de todos os serviços' })
  async getServicesHealth() {
    const services = await this.customHealthCheckService.checkAllServices();

    const overallStatus = services.every(
      (s) => s.status === HealthStatus.HEALTHY,
    )
      ? HealthStatus.HEALTHY
      : services.some((s) => s.status === HealthStatus.HEALTHY)
        ? HealthStatus.DEGRADED
        : HealthStatus.UNHEALTHY;

    return {
      overallStatus,
      timestamp: new Date().toISOString(),
      services,
      summary: {
        total: services.length,
        healthy: services.filter((s) => s.status === HealthStatus.HEALTHY)
          .length,
        unhealthy: services.filter((s) => s.status === HealthStatus.UNHEALTHY)
          .length,
        degraded: services.filter((s) => s.status === HealthStatus.DEGRADED)
          .length,
      },
    };
  }

  @Get('services/:serviceName')
  @ApiOperation({ summary: 'Health check de um serviço específico' })
  @ApiResponse({ status: 200, description: 'Status do serviço' })
  getServiceHealth(@Param('serviceName') serviceName: string) {
    const cached = this.customHealthCheckService.getCachedHealth(serviceName);

    if (!cached) {
      return {
        status: 'unknown',
        message: 'Service not found or never checked',
        timestamp: new Date().toISOString(),
      };
    }

    return cached;
  }

  @Get('ready')
  @ApiOperation({ summary: 'Get readiness status' })
  @ApiResponse({
    status: 200,
    description: 'Readiness status retrieved successfully',
  })
  async getReady() {
    return this.healthService.getReadyStatus();
  }

  @Get('live')
  @ApiOperation({ summary: 'Get liveness status' })
  @ApiResponse({
    status: 200,
    description: 'Liveness status retrieved successfully',
  })
  getLive() {
    return this.healthService.getLiveStatus();
  }
}
