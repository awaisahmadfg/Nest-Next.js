import { Body, Controller, Post, UseGuards, Req, HttpCode, HttpStatus, Get } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { Role } from '@prisma/client';
import { CreatePropertyDto } from './dto/create-property.dto';
import { PropertyService } from './property.service';
import { PropertyResponseDto } from './dto/property-response.dto';
import { RolesGuard } from './guard/roles.guard';
import { Roles } from './decorators/roles.decorator';

interface AuthedReq extends Request {
  user: { id: number; roles: Role[] };
}

@Controller('/api')
export class PropertyController {
  constructor(private readonly propertyService: PropertyService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('properties')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.OWNER)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() req: AuthedReq,
    @Body() body: CreatePropertyDto,
  ): Promise<PropertyResponseDto> {
    // use authenticated user ID instead of trusting client
    return this.propertyService.createPropertyAndInvite(body, req.user.id);
  }

  @UseGuards(JwtAuthGuard) // ← THIS IS WHAT'S MISSING
  @Get('my-properties')
  @HttpCode(HttpStatus.OK)
  async getPropertiesForUser(@Req() req: AuthedReq): Promise<PropertyResponseDto[]> {
    // Add proper error handling for undefined user
    if (!req.user) {
      throw new Error('User not authenticated');
    }
    return this.propertyService.getPropertiesForUser(req.user.id);
  }
}
