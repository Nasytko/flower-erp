import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../auth/presentation/auth.decorators';
import { CustomerUseCases } from '../application/customer.use-cases';
import {
  CreateCustomerDto,
  CustomerParamsDto,
  OrgParamsDto,
  UpdateCustomerDto,
} from './order.dto';

@ApiTags('customers')
@Controller('organizations/:organizationId/customers')
@RequirePermissions('customers:read')
export class CustomersController {
  constructor(private readonly customers: CustomerUseCases) {}

  @Get()
  list(@Param() params: OrgParamsDto, @Query('q') q?: string) {
    return this.customers.listCustomers(params.organizationId, q ? { search: q } : undefined);
  }

  @Post()
  @RequirePermissions('customers:manage')
  create(@Param() params: OrgParamsDto, @Body() body: CreateCustomerDto) {
    return this.customers.createCustomer({ ...params, ...body });
  }

  @Get(':customerId')
  get(@Param() params: CustomerParamsDto) {
    return this.customers.getCustomer(params.organizationId, params.customerId);
  }

  @Post(':customerId/update')
  @RequirePermissions('customers:manage')
  update(@Param() params: CustomerParamsDto, @Body() body: UpdateCustomerDto) {
    return this.customers.updateCustomer({ ...params, ...body });
  }

  @Post(':customerId/archive')
  @RequirePermissions('customers:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  archive(@Param() params: CustomerParamsDto) {
    return this.customers.archiveCustomer(params.organizationId, params.customerId);
  }
}
