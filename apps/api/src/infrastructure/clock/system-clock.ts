import { Injectable } from '@nestjs/common';
import type { ClockPort } from '@flower/shared-kernel';

@Injectable()
export class SystemClock implements ClockPort {
  now(): Date {
    return new Date();
  }
}
