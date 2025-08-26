import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ERROR_MESSAGES } from 'src/common/constants';
import { EmailService } from '../email/email.service';
import { ResetPasswordDto } from '../email/dto/reset-password.dto';
import { OAuth2Client } from 'google-auth-library';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private prisma: PrismaService,
    private emailService: EmailService,
    private googleClient: OAuth2Client,
  ) {}

  async signup(createUserDto: CreateUserDto) {
    const user = await this.usersService.createUser({
      ...createUserDto,
    });

    const payload = { email: user.email, sub: user.id, role: user.role };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.generateRefreshToken(user);

    await this.setRefreshToken(user.id, refreshToken);

    return {
      accessToken: accessToken,
      refreshToken: refreshToken,
      user: new UserResponseDto(user),
    };
  }

  async validateUser(email: string, password: string): Promise<UserResponseDto | null> {
    const user = await this.usersService.findUserByEmail(email.toLowerCase());

    if (!user) {
      throw new UnauthorizedException(ERROR_MESSAGES.NO_ACCOUNT_FOUND);
    }

    if (user && (await bcrypt.compare(password, user.password))) {
      return new UserResponseDto(user);
    }
    return null;
  }

  async login(user: UserResponseDto) {
    const payload = { email: user.email, sub: user.id, role: user.role };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.generateRefreshToken(user);

    await this.setRefreshToken(user.id, refreshToken);

    return {
      accessToken: accessToken,
      refreshToken: refreshToken,
      user: new UserResponseDto(user),
    };
  }

  async setRefreshToken(userId: number, refreshToken: string) {
    const refreshExpiresIn = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN');

    if (!refreshExpiresIn) {
      throw new Error(ERROR_MESSAGES.JWT_EXPIRES_NOT_SET);
    }

    const refreshTokenExpires = new Date();
    refreshTokenExpires.setDate(
      refreshTokenExpires.getDate() + parseInt(refreshExpiresIn.slice(0, -1), 10),
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        refreshToken,
        refreshTokenExpires,
      },
    });
  }

  generateRefreshToken(user: UserResponseDto) {
    const payload = { email: user.email, sub: user.id, role: user.role };
    return this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN'),
    });
  }

  async refreshTokens(userId: number) {
    const user = await this.usersService.findUserById(userId);
    if (!user) throw new UnauthorizedException(ERROR_MESSAGES.USER_NOT_FOUND);

    const userDto = new UserResponseDto(user);
    const accessPayload = { email: user.email, sub: user.id, role: user.role };

    const accessToken = this.jwtService.sign(accessPayload);
    const refreshToken = this.generateRefreshToken(userDto);

    await this.setRefreshToken(user.id, refreshToken);

    return {
      accessToken: accessToken,
      refreshToken: refreshToken,
      user: userDto,
    };
  }

  async logout(userId: number) {
    const user = await this.usersService.findUserById(userId);
    if (!user) throw new UnauthorizedException(ERROR_MESSAGES.USER_NOT_FOUND);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        refreshToken: null,
        refreshTokenExpires: null,
      },
    });
  }

  async requestOtpReset(email: string): Promise<{ message: string }> {
    const user = await this.usersService.findUserByEmail(email.toLowerCase());
    if (!user) {
      throw new UnauthorizedException(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresIn = this.configService.get<string>('OTP_EXPIRES_IN');

    if (!otpExpiresIn) {
      throw new Error(ERROR_MESSAGES.OTP_EXPIRES_NOT_SET);
    }

    const otpExpires = new Date(Date.now() + parseInt(otpExpiresIn) * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetOtp: otp,
        resetOtpExpires: otpExpires,
      },
    });

    try {
      await this.emailService.sendPasswordResetOtpEmail(user.email, otp);
    } catch {
      throw new Error(ERROR_MESSAGES.PASSOWRD_RESET_ERROR);
    }
    return { message: 'An OTP email has been sent to your email' };
  }

  async verifyOtp(email: string, otp: string): Promise<{ message: string }> {
    const normalizedEmail = email.toLowerCase().trim();

    const user = await this.usersService.findUserByEmail(normalizedEmail);

    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.NO_ACCOUNT_FOUND);
    }

    if (!user.resetOtp) {
      throw new BadRequestException(ERROR_MESSAGES.NO_OTP_REQUEST_FOUND);
    }

    if (!user.resetOtpExpires) {
      throw new BadRequestException(ERROR_MESSAGES.OTP_EXPIRATION_TIME_NOT_SET);
    }

    const isExpired = user.resetOtpExpires < new Date();

    if (isExpired) {
      throw new BadRequestException(ERROR_MESSAGES.OTP_EXPIRED);
    }

    if (user.resetOtp !== otp.trim()) {
      console.warn(`Failed OTP attempt for user ${normalizedEmail}`);
      throw new BadRequestException(ERROR_MESSAGES.INVALID_OTP);
    }

    return {
      message: 'OTP verified successfully. You can now reset your password',
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<{ message: string }> {
    const { email, otp, newPassword, confirmPassword } = resetPasswordDto;

    if (newPassword !== confirmPassword) {
      throw new BadRequestException(ERROR_MESSAGES.PASSWORD_MISMATCH);
    }

    const user = await this.usersService.findUserByEmail(email.toLowerCase());

    if (!user) {
      throw new BadRequestException(ERROR_MESSAGES.INVALID_REQUEST);
    }

    await this.verifyOtp(email, otp);

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetOtp: null,
        resetOtpExpires: null,
      },
    });

    return { message: 'Password reset successfully' };
  }

  async loginWithSSO(provider, providerToken: string) {
    const userInfo = await this.verifySSOToken(provider, providerToken);

    // Full User type
    let user = await this.usersService.findUserResponseByEmail(userInfo.email);

    if (!user) {
      const createUserDto: CreateUserDto = {
        email: userInfo.email,
        password: '',
        role: 'VIEWER',
      };
      const newUser = await this.usersService.createUser(createUserDto);
      user = {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
      };
    }

    if (!user) {
      throw new Error('User creation failed'); // safety
    }

    // Now wrap only for response
    const userDto = new UserResponseDto(user);

    const accessToken = this.jwtService.sign({ email: user.email, sub: user.id, role: user.role });
    const refreshToken = this.generateRefreshToken(userDto);
    await this.setRefreshToken(user.id, refreshToken);

    return {
      user: userDto,
      accessToken,
      refreshToken,
      message: 'Login successful',
    };
  }

  private async verifySSOToken(provider, token: string): Promise<{ email: string; name: string }> {
    if (provider !== 'google') {
      throw new UnauthorizedException('Unsupported SSO provider');
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const ticket = await this.googleClient.verifyIdToken({
        idToken: token,
        audience: this.configService.get<string>('GOOGLE_CLIENT_ID')!, // safe non-null
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const payload = ticket.getPayload();

      if (!payload || typeof payload.email !== 'string' || typeof payload.name !== 'string') {
        throw new UnauthorizedException('Invalid Google token payload');
      }

      return { email: payload.email, name: payload.name };
    } catch (err) {
      throw new UnauthorizedException('Invalid Google token' + err);
    }
  }
}
