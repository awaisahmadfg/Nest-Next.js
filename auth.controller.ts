import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { RefreshTokenGuard } from './guard/refresh-token.guard';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { ERROR_MESSAGES } from 'src/common/constants';
import { OtpRequestDto } from '../email/dto/otp-request.dto';
import { VerifyOtpDto } from '../email/dto/verify-otp.dto';
import { ResetPasswordDto } from '../email/dto/reset-password.dto';

interface AuthenticatedRequest extends Request {
  user: UserResponseDto;
}

@Controller('api/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() createUserDto: CreateUserDto): Promise<{
    user: UserResponseDto;
    message: string;
  }> {
    const user = await this.authService.register(createUserDto);
    return {
      user,
      message: 'User registered successfully',
    };
  }

  @UseGuards(AuthGuard('local'))
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Req() req: AuthenticatedRequest): Promise<{
    accessToken: string;
    refreshToken: string;
    user: UserResponseDto;
    message: string;
  }> {
    const result = await this.authService.login(req.user);
    return {
      ...result,
      message: 'User logged in successfully',
    };
  }

  @UseGuards(RefreshTokenGuard)
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refreshTokens(@Req() req: AuthenticatedRequest): Promise<{
    accessToken: string;
    refreshToken: string;
    user: UserResponseDto;
    message: string;
  }> {
    const result = await this.authService.refreshTokens(Number(req.user['sub']));
    return {
      ...result,
      message: 'Tokens refreshed successfully',
    };
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(@Req() req: AuthenticatedRequest): Promise<{
    message: string;
  }> {
    if (!req.user?.id) {
      throw new UnauthorizedException(ERROR_MESSAGES.UNAUTHORIZED_ACCESS);
    }
    const userId = Number(req.user?.id);
    await this.authService.logout(userId);
    return {
      message: 'User logged out successfully',
    };
  }

  @Post('request-otp')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() forgotPasswordDto: OtpRequestDto): Promise<{ message: string }> {
    return this.authService.requestOtpReset(forgotPasswordDto.email);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto): Promise<{ message: string }> {
    return this.authService.verifyOtp(verifyOtpDto.email, verifyOtpDto.otp);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto): Promise<{ message: string }> {
    return this.authService.resetPassword(resetPasswordDto);
  }
}
