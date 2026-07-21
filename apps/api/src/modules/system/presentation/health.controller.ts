import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../auth/presentation/auth.decorators';
import { HealthService } from '../application/health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get('live')
  live() {
    return this.healthService.live();
  }

  @Public()
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const payload = await this.healthService.ready();
    if (payload.checks.database === 'down') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return payload;
  }
}
