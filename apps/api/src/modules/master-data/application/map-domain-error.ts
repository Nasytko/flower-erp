import { BadRequestException, ConflictException } from '@nestjs/common';
import { DomainError } from '../domain/master-data-rules';

export function mapDomainError(error: unknown): never {
  if (error instanceof DomainError) {
    if (
      error.code.includes('EXISTS') ||
      error.code.includes('ALREADY') ||
      error.code.includes('TAKEN') ||
      error.code.includes('IN_USE') ||
      error.code.includes('HAS_')
    ) {
      throw new ConflictException({ code: error.code, message: error.message });
    }
    throw new BadRequestException({ code: error.code, message: error.message });
  }
  throw error;
}
