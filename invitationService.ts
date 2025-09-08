import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, InviteStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../email/email.service';
import { InviteResponseDto } from './dto/invite-response.dto';
import { plainToInstance } from 'class-transformer';

interface CreateInviteParams {
  invitedById: number;
  email: string;
  roles: Role[];
  propertyId?: string; // business code, e.g. "PROP-000100"
}
@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async sendEmailToInvite(
    params: CreateInviteParams,
  ): Promise<{ data: InviteResponseDto; message: string }> {
    const { invitedById, email, roles, propertyId } = params;

    // Validate roles array
    if (!roles || roles.length === 0) {
      throw new BadRequestException('At least one role must be provided');
    }

    // Remove duplicate roles
    const uniqueRoles = [...new Set(roles)];

    // Use the first role for email template display (backward compatibility)
    const primaryRole = uniqueRoles[0];

    const inviter = await this.prisma.user.findUnique({
      where: { id: invitedById },
      select: { id: true, fullName: true, email: true },
    });
    if (!inviter) throw new BadRequestException('Inviter not found');

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    // lookup property by business code (string) -> get numeric PK
    let propertyDbId: number | null = null;
    let propertyName: string | undefined;

    if (propertyId) {
      const prop = await this.prisma.property.findUnique({
        where: { propertyId }, // business code lookup
        select: { id: true, name: true },
      });
      if (!prop) throw new BadRequestException('Property not found');
      propertyDbId = prop.id;
      propertyName = prop.name;
    }

    // Created propertyInvite table
    const invite = await this.prisma.propertyInvite.create({
      data: {
        email: email.toLowerCase().trim(),
        roles: uniqueRoles,
        status: InviteStatus.PENDING,
        invitedById,
        propertyId: propertyDbId,
      },
    });

    const frontend = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    // const inviteLink = `${frontend}/auth/signup?inviteId=${invite.id}`;

    // Generate different links based on whether user exists
    let inviteLink: string;
    if (existingUser) {
      // For existing users: direct accept endpoint
      inviteLink = `${frontend}/api/invitations/${invite.id}/accept`;
    } else {
      // For new users: signup page with inviteId
      inviteLink = `${frontend}/auth/signup?inviteId=${invite.id}`;
    }

    const inviterName = inviter.fullName || inviter.email;

    await this.emailService.sendInviteEmail({
      to: email,
      inviteLink,
      role: primaryRole,
      inviterName,
      propertyName,
      inviteeName: undefined,
    });

    return {
      data: plainToInstance(InviteResponseDto, invite, { excludeExtraneousValues: true }),
      message: 'Invitation via email sent successfully',
    };
  }

  // To populate the invitee email on signup
  async getInvitationById(id: number): Promise<{ email: string; roles: Role[] }> {
    const invite = await this.prisma.propertyInvite.findUnique({
      where: { id },
      select: {
        email: true,
        roles: true,
        status: true,
        createdAt: true,
      },
    });

    if (!invite) throw new NotFoundException('Invitation not found');

    return {
      email: invite.email,
      roles: invite.roles,
    };
  }

  // NEW METHOD: Accept invitation for existing users
  async acceptInvitation(inviteId: number, userId: number): Promise<{ message: string }> {
    const invite = await this.prisma.propertyInvite.findUnique({
      where: { id: inviteId },
      // invited user's details (like their email and name)
      include: { invitedUser: true },
    });

    if (!invite) {
      throw new NotFoundException('Invitation not found');
    }

    if (invite.status === InviteStatus.ACCEPTED) {
      throw new BadRequestException('Invitation already accepted');
    }

    // Verify the authenticated user matches the invitation email
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.email.toLowerCase() !== invite.email.toLowerCase()) {
      throw new BadRequestException('You are not authorized to accept this invitation');
    }

    // Update the invitation status
    await this.prisma.propertyInvite.update({
      where: { id: inviteId },
      data: {
        status: InviteStatus.ACCEPTED,
        invitedUserId: userId,
        acceptedAt: new Date(),
      },
    });

    return { message: 'Invitation accepted successfully' };
  }
}
