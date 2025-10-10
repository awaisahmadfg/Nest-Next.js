// email/services/email-template.service.ts

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmailType,
  EmailContext,
  EmailTemplateData,
  OTPEmailContext,
  PasswordResetEmailContext,
  EmailVerificationContext,
  InvitationEmailContext,
  WelcomeEmailContext,
  AdditionalInfoRequestEmailContext,
  RoleApprovedEmailContext,
  RoleRejectedEmailContext,
  BlockchainTransactionCompletedEmailContext,
} from './types/email.types';

@Injectable()
export class EmailTemplateService {
  private companyName: string;
  private supportEmail: string;
  private logoUrl: string;
  private primaryColor: string;
  private websiteUrl: string;
  private cookiesPolicyUrl: string;
  private privacyPolicyUrl: string;
  private termsConditionsUrl: string;
  private twitterUrl: string;
  private facebookUrl: string;
  private instagramUrl: string;

  constructor(private configService: ConfigService) {
    this.companyName = this.configService.get('COMPANY_NAME', 'Your Company');
    this.supportEmail = this.configService.get('SUPPORT_EMAIL', 'support@example.com');
    this.logoUrl = this.configService.get('LOGO_URL', '');
    this.primaryColor = this.configService.get('EMAIL_PRIMARY_COLOR', '#007bff');
    this.websiteUrl = this.configService.get('WEBSITE_URL', 'http://localhost:3000');
    this.cookiesPolicyUrl = 'link';
    this.privacyPolicyUrl = 'link';
    this.termsConditionsUrl = 'link';
    this.twitterUrl = 'x.com';
    this.facebookUrl = 'facebook.com';
    this.instagramUrl = 'instagram.com';
  }

  /**
   * Generate email template based on type and context
   */
  generateTemplate(type: EmailType, context: EmailContext): EmailTemplateData {
    switch (type) {
      case EmailType.OTP:
        return this.generateOTPEmail(context as OTPEmailContext);

      case EmailType.PASSWORD_RESET:
        return this.generatePasswordResetEmail(context as PasswordResetEmailContext);

      case EmailType.EMAIL_VERIFICATION:
        return this.generateEmailVerificationEmail(context as EmailVerificationContext);

      case EmailType.INVITATION:
        return this.generateInvitationEmail(context as InvitationEmailContext);

      case EmailType.WELCOME:
        return this.generateWelcomeEmail(context as WelcomeEmailContext);

      case EmailType.ADDITIONAL_INFO_REQUEST:
        return this.generateAdditionalInfoRequestEmail(
          context as AdditionalInfoRequestEmailContext,
        );

      case EmailType.ROLE_APPROVED:
        return this.generateRoleApprovedEmail(context as RoleApprovedEmailContext);

      case EmailType.ROLE_REJECTED:
        return this.generateRoleRejectedEmail(context as RoleRejectedEmailContext);

      case EmailType.BLOCKCHAIN_TRANSACTION_COMPLETED:
        return this.generateBlockchainTransactionCompletedEmail(
          context as BlockchainTransactionCompletedEmailContext,
        );

      default:
        throw new Error(`Unsupported email type: ${type}`);
    }
  }

  private getDefaultHeader(): string {
    return `
 <div class="header-container">
      <div class="wrapper">
        <div class="header-section">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse">
            <tr>
              <td style="text-align: left; vertical-align: middle">
                <img
                  src="https://raw.githubusercontent.com/asad-codingcops/smarttags-image/refs/heads/main/email-logo.png"
                  alt="SmartTag Analytics"
                  style="height: 48px; max-width: 231px"
                />
              </td>
              <td style="text-align: right; vertical-align: middle">
                <a href="#" style="display: inline-block; margin-left: 16px; text-decoration: none">
                  <img
                    src="https://raw.githubusercontent.com/asad-codingcops/smarttags-image/refs/heads/main/twitter.png"
                  
                    style="width: 20px; height: 20px"
                  />
                </a>
                <a href="#" style="display: inline-block; margin-left: 16px; text-decoration: none">
                  <img
                    src="https://raw.githubusercontent.com/asad-codingcops/smarttags-image/refs/heads/main/facebook-02.png"
                    style="width: 20px; height: 20px"
                  />
                </a>
                <a href="#" style="display: inline-block; margin-left: 16px; text-decoration: none">
                  <img
                    src="https://raw.githubusercontent.com/asad-codingcops/smarttags-image/refs/heads/main/instagram.png"
                    style="width: 20px; height: 20px"
                  />
                </a>
              </td>
            </tr>
          </table>
        </div>
      </div>
    </div>
  `;
  }

  /**
   * Base HTML template wrapper
   */
  private wrapInBaseTemplate(content: string, footerContent?: string): string {
    return `
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
        line-height: 1.6;
        color: #333;
        background-color: #2c2c2c;
        margin: 0;
        padding: 0;
      }
      .wrapper {
        max-width: 640px;
        margin: 0 auto;
        padding: 0;
      }
      .container {
        background-color: #f8fafc;
        border-radius: 0;
        overflow: hidden;
        box-shadow: none;
        padding: 32px 48px 60px 48px;
      }
      .header-section {
        background-color: #f8fafc;
        padding: 32px 40px;
        margin-bottom: 0;
      }
      .content-section {
        background-color: #ffffff;
        padding: 32px 40px 40px 40px;
      }
      .button {
        display: inline-block;
        padding: 12px 30px;
        background: linear-gradient(180deg, #1595C5 0%, #006699 100%);
        color: #ffffff !important;
        text-decoration: none;
        border-radius: 5px;
        font-weight: 500;
        margin: 20px 0;
      }
      .button-center {
        text-align: center;
        margin: 30px 0;
      }
      h1 {
        font-size: 32px;
        font-weight: 600;
        color: #333333;
        margin: 0 0 32px 0;
        line-height: 1.2;
      }
      p {
        font-size: 16px;
        color: #666666;
        margin: 0 0 24px 0;
        line-height: 1.5;
      }
      ul {
        margin: 16px 0 32px 0;
        padding: 0;
        list-style: none;
      }
      ul li {
        font-size: 16px;
        color: #666666;
        margin: 0 0 8px 0;
        padding-left: 24px;
        position: relative;
        line-height: 1.5;
      }
      ul li::before {
        content: '';
        position: absolute;
        left: 0;
        top: 11px;
        width: 4px;
        height: 4px;
        background-color: #666666;
        border-radius: 50%;
      }
      .signature {
        margin: 0;
        font-size: 16px;
        color: #666666;
        line-height: 1.5;
      }
      .company-highlight {
        font-weight: 600;
        color: #333333;
      }
      .footer {
        background-color: #EBEFF3;
        padding: 32px 20px;
        text-align: center;
      }
      .footer-links {
        margin-bottom: 16px;
      }
      .footer-links a {
        color: #999999;
        text-decoration: none;
        margin: 0 16px;
        font-size: 14px;
      }
      .footer-copyright {
        color: #999999;
        font-size: 14px;
        margin: 0;
        line-height: 1.4;
      }
      /* New consistent styles */
      .otp-code {
        background-color: #f8fafc;
        border: 2px solid #e2e8f0;
        border-radius: 8px;
        padding: 24px;
        text-align: center;
        margin: 32px 0;
      }
      .code {
        font-size: 32px;
        font-weight: 700;
        color: #333333;
        letter-spacing: 8px;
        margin: 16px 0;
        font-family: 'Courier New', monospace;
        background-color: #ffffff;
        padding: 16px 24px;
        border-radius: 6px;
        border: 1px solid #d1d5db;
      }
      .security-notice {
        background-color: #fef3c7;
        border: 1px solid #f59e0b;
        border-left: 4px solid #f59e0b;
        border-radius: 6px;
        padding: 16px;
        margin: 24px 0;
      }
      .security-notice p {
        margin: 0;
        color: #92400e;
        font-size: 14px;
      }
      .divider {
        border: none;
        border-top: 1px solid #e5e7eb;
        margin: 32px 0;
      }
      .info-box {
        background-color: #f0f9ff;
        border: 1px solid #0ea5e9;
        border-left: 4px solid #0ea5e9;
        border-radius: 6px;
        padding: 16px;
        margin: 24px 0;
      }
      .info-box p {
        margin: 0;
        color: #0c4a6e;
      }
      .alert-box {
        border-radius: 6px;
        padding: 16px;
        margin: 24px 0;
      }
      .alert-medium {
        background-color: #fff3cd;
        border: 1px solid #fbbf24;
        border-left: 4px solid #fbbf24;
      }
      .alert-medium p {
        margin: 0;
        color: #92400e;
      }
      .warning-box {
        background-color: #fef2f2;
        border: 1px solid #ef4444;
        border-left: 4px solid #ef4444;
        border-radius: 6px;
        padding: 16px;
        margin: 24px 0;
      }
      .warning-box p {
        margin: 0;
        color: #991b1b;
      }
      .success-box {
        background-color: #f0fdf4;
        border: 1px solid #22c55e;
        border-left: 4px solid #22c55e;
        border-radius: 6px;
        padding: 16px;
        margin: 24px 0;
      }
      .success-box p {
        margin: 0;
        color: #166534;
      }
    </style>
  </head>
  <body>
    ${this.getDefaultHeader()}
    <div class="wrapper">
      <div class="container">
        <div class="content-section">
          ${content}
        </div>
      </div>
    </div>
    ${footerContent || this.getDefaultFooter()}
  </body>
</html>
  `;
  }

  /**
   * Default footer content
   */
  private getDefaultFooter(): string {
    return `
   <div class="footer-container">
      <div class="wrapper">
        <div class="footer">
          <div class="footer-links">
            <a href="#">Cookies policy</a>
            <a href="#">Privacy policy</a>
            <a href="#">Terms & conditions</a>
          </div>
          <p class="footer-copyright">© 2025 SmartTag Analytics. All rights reserved.</p>
        </div>
      </div>
    </div>
  `;
  }

  /**
   * Generate OTP Email
   */
  private generateOTPEmail(context: OTPEmailContext): EmailTemplateData {
    const subject = `Your ${context.action} verification code`;

    const htmlContent = `
      <h1>Verification Code</h1>
      
      <p>Hi ${context.recipientName || 'there'},</p>
      <p>You've requested a verification code for <strong>${context.action}</strong>.</p>
      
      <div class="otp-code">
        <p style="margin: 0; color: #666;">Your verification code is:</p>
        <div class="code">${context.otpCode}</div>
        <p style="margin: 0; font-size: 14px; color: #666;">
          This code will expire in ${context.expiryMinutes} minutes
        </p>
      </div>
      
      <p>Enter this code to complete your ${context.action}.</p>
      
      ${
        context.deviceInfo || context.ipAddress
          ? `
        <div class="security-notice">
          <p><strong>🔒 Security Information:</strong><br>
          ${context.deviceInfo ? `Device: ${context.deviceInfo}<br>` : ''}
          ${context.ipAddress ? `IP Address: ${context.ipAddress}` : ''}</p>
        </div>
      `
          : ''
      }
      
      <hr class="divider">
      <p style="font-size: 14px; color: #666;">
        If you didn't request this code, please ignore this email or contact support if you have concerns.
      </p>
    `;

    const textBody = `
Hi ${context.recipientName || 'there'},

Your ${context.action} verification code is: ${context.otpCode}

This code will expire in ${context.expiryMinutes} minutes.

${context.deviceInfo ? `Device: ${context.deviceInfo}` : ''}
${context.ipAddress ? `IP Address: ${context.ipAddress}` : ''}

If you didn't request this code, please ignore this email.

© ${new Date().getFullYear()} ${this.companyName}
    `.trim();

    return {
      subject,
      htmlBody: this.wrapInBaseTemplate(htmlContent),
      textBody,
    };
  }

  /**
   * Generate Password Reset Email
   */
  private generatePasswordResetEmail(context: PasswordResetEmailContext): EmailTemplateData {
    const subject = 'Reset Your Password';

    const htmlContent = `
    <h1>Password Reset Request</h1>
    
    <p>Hi ${context.recipientName || 'there'},</p>
    
    <p>We received a request to reset your password for your <span class="company-highlight">SmartTag Analytics™</span> account. Click the button below to create a new password:</p>
    
    <div class="button-center">
      <a href="${context.resetLink}" class="button">Reset Password</a>
    </div>
    
    <div class="alert-box alert-medium">
      <p><strong>Important:</strong> This link is only valid for the next ${context.expiryMinutes} minutes.</p>
    </div>
    
    ${
      context.requestedFrom
        ? `
      <div class="security-notice">
        <p><strong>🔒 Security Notice:</strong><br>
        This request was made from: ${context.requestedFrom}</p>
      </div>
    `
        : ''
    }
    
    <hr class="divider">
    
    <p style="font-size: 14px; color: #666666; line-height: 1.5;">
      If you didn't request a password reset, you can safely ignore this email. 
      Your password won't be changed unless you click the link above.
    </p>
    
    <p class="signature">
      <span class="company-highlight">SmartTag Analytics™</span> — Keeping your account secure.
    </p>
  `;

    const textBody = `
Hi ${context.recipientName || 'there'},

We received a request to reset your password for your SmartTag Analytics™ account.

Reset your password here: ${context.resetLink}

This link will expire in ${context.expiryMinutes} Minutes.

${context.requestedFrom ? `This request was made from: ${context.requestedFrom}` : ''}

If you didn't request a password reset, you can safely ignore this email.

SmartTag Analytics™ — Keeping your account secure.

© ${new Date().getFullYear()} ${this.companyName}
  `.trim();

    return {
      subject,
      htmlBody: this.wrapInBaseTemplate(htmlContent),
      textBody,
    };
  }

  /**
   * Generate Email Verification Email
   */
  private generateEmailVerificationEmail(context: EmailVerificationContext): EmailTemplateData {
    const subject = 'Verify Your Email Address';

    const htmlContent = `
      <h1>Email Verification</h1>
      
      <p>Hi ${context.recipientName || 'there'},</p>
      <p>Thanks for signing up! Please verify your email address to activate your account.</p>
      
      <div class="button-center">
        <a href="${context.verificationLink}" class="button">Verify Email Address</a>
      </div>
      
      <p>Or copy and paste this link into your browser:</p>
      <p style="word-break: break-all; color: #0ea5e9; font-size: 14px;">
        ${context.verificationLink}
      </p>
      
      <div class="info-box">
        <p>This verification link will expire in ${context.expiryHours} hours.</p>
      </div>
    `;

    const textBody = `
Hi ${context.recipientName || 'there'},

Thanks for signing up! Please verify your email address to activate your account.

Verify your email here: ${context.verificationLink}

This link will expire in ${context.expiryHours} hours.

© ${new Date().getFullYear()} ${this.companyName}
    `.trim();

    return {
      subject,
      htmlBody: this.wrapInBaseTemplate(htmlContent),
      textBody,
    };
  }

  /**
   * Generate Invitation Email
   */
  private generateInvitationEmail(context: InvitationEmailContext): EmailTemplateData {
    const orgText = context.organizationName || this.companyName;
    const subject = `${context.role} Role Assigned!`;

    const htmlContent = `
      <h1>${context.role} Role Assigned!</h1>
      
      <p>Hello ${context.recipientName || 'there'},</p>

      <p>
        You've been invited to join <strong>${orgText}</strong> as a ${context.role} on 
        <strong>${context.propertyName || 'Property'}</strong> with reference no. 
        <strong>'#7364e23'</strong>.
      </p>

      <p>
        This role gives you access to verified property details, SmartTag registrations, 
        and tailored dashboards to support your deals.
      </p>

      <p>👉 Click the button below to complete your registration and activate your account.</p>

      <div class="button-center">
        <a href="${context.inviteLink}" class="button">Accept Invitation</a>
      </div>

      <p>
        If you have any questions or need assistance, our team is here to help!
      </p>

      <p class="signature">
        Regards,<br/>
        <span class="company-highlight">${this.companyName} Team</span>
      </p>
    `;

    const textBody = `
${context.role} Role Assigned!

Hello ${context.recipientName || 'there'},

You've been invited to join ${orgText} as a ${context.role} on ${context.propertyName || 'Property'} 
with reference no. #7364e23.

This role gives you access to verified property details, SmartTag registrations, 
and tailored dashboards to support your deals.

👉 Complete your registration and activate your account here: ${context.inviteLink}

If you have any questions or need assistance, our team is here to help!

Regards,  
${this.companyName} Team
  `.trim();

    return {
      subject,
      htmlBody: this.wrapInBaseTemplate(htmlContent),
      textBody,
    };
  }

  /**
   * Generate Welcome Email
   */
  private generateWelcomeEmail(context: WelcomeEmailContext): EmailTemplateData {
    const subject = `Welcome to ${this.companyName}!`;

    const htmlContent = `
      <h1>Welcome Aboard! 🎉</h1>
      
      <p>Hi ${context.recipientName || 'there'},</p>
      <p>We're thrilled to have you join <span class="company-highlight">${this.companyName}</span>! Your account has been successfully created.</p>
      
      ${
        context.features && context.features.length > 0
          ? `
        <div class="success-box">
          <p><strong>Here's what you can do:</strong></p>
          <ul style="margin: 10px 0; padding-left: 20px;">
            ${context.features.map((f) => `<li>${f}</li>`).join('')}
          </ul>
        </div>
      `
          : ''
      }
      
      <div class="button-center">
        <a href="${context.loginLink}" class="button">Get Started</a>
      </div>
      
      ${
        context.gettingStartedLink
          ? `
        <p style="text-align: center;">
          Need help? Check out our 
          <a href="${context.gettingStartedLink}" style="color: #0ea5e9; text-decoration: none;">
            Getting Started Guide
          </a>
        </p>
      `
          : ''
      }
    `;

    const textBody = `
Hi ${context.recipientName || 'there'},

Welcome to ${this.companyName}! Your account has been successfully created.

${context.features ? `What you can do:\n${context.features.map((f) => `- ${f}`).join('\n')}` : ''}

Get started: ${context.loginLink}

${context.gettingStartedLink ? `Getting Started Guide: ${context.gettingStartedLink}` : ''}

© ${new Date().getFullYear()} ${this.companyName}
    `.trim();

    return {
      subject,
      htmlBody: this.wrapInBaseTemplate(htmlContent),
      textBody,
    };
  }

  /**
   * Generate Additional Info Request Email
   */
  private generateAdditionalInfoRequestEmail(
    context: AdditionalInfoRequestEmailContext,
  ): EmailTemplateData {
    const subject = `Additional Information Required for Your ${context.role} Role`;

    const htmlContent = `
      <h1>Additional Information Requested</h1>
      
      <p>Hi ${context.recipientName || 'there'},</p>
      <p>We need some additional information to complete the verification of your <strong>${context.role}</strong> role.</p>
      
      <div class="info-box">
        <p style="margin: 0 0 10px 0;"><strong>📝 Request Details:</strong></p>
        <p style="margin: 0; font-style: italic; padding: 10px; background-color: #ffffff; border-radius: 4px; border: 1px solid #e2e8f0;">
          "${context.note}"
        </p>
        ${context.requesterName ? `<p style="margin: 10px 0 0 0; font-size: 14px;"><strong>Requested by:</strong> ${context.requesterName}</p>` : ''}
      </div>
      
      <p>Please log in to your account to provide the requested information:</p>
      
      <div class="button-center">
        <a href="${context.loginLink || this.websiteUrl}" class="button">Go to the Site</a>
      </div>
      
      <div class="alert-box alert-medium">
        <p><strong>Action Required:</strong> Please respond as soon as possible to avoid delays in your role approval process.</p>
      </div>
      
      <hr class="divider">
      <p style="font-size: 14px; color: #666;">
        If you have any questions about this request, please contact our support team.
      </p>
    `;

    const textBody = `
Hi ${context.recipientName || 'there'},

We need some additional information to complete the verification of your ${context.role} role.

Request Details:
"${context.note}"
${context.requesterName ? `Requested by: ${context.requesterName}` : ''}

Please log in to your account to provide the requested information:
${context.loginLink || this.websiteUrl + '/auth/login'}

Please respond as soon as possible to avoid delays in your role approval process.

If you have any questions about this request, please contact our support team.

© ${new Date().getFullYear()} ${this.companyName}
    `.trim();

    return {
      subject,
      htmlBody: this.wrapInBaseTemplate(htmlContent),
      textBody,
    };
  }

  /**
   * Generate Role Approved Email
   */
  private generateRoleApprovedEmail(context: RoleApprovedEmailContext): EmailTemplateData {
    const rolesList =
      context.roles.length === 1
        ? context.roles[0]
        : context.roles.length === 2
          ? context.roles.join(' and ')
          : `${context.roles.slice(0, -1).join(', ')}, and ${context.roles[context.roles.length - 1]}`;

    const subject = ` Your ${rolesList} ${context.roles.length === 1 ? 'role has' : 'roles have'} been approved!`;

    const htmlContent = `
      <h1>Congratulations! Your ${context.roles.length === 1 ? 'Role Has' : 'Roles Have'} Been Approved!</h1>
      
      <p>Hi ${context.recipientName || 'there'},</p>
      
      <p>Great news! Your ${rolesList} ${context.roles.length === 1 ? 'role has' : 'roles have'} been successfully approved on <span class="company-highlight">SmartTag Analytics™</span>.</p>
      
      <div class="success-box">
        <p><strong> Approved ${context.roles.length === 1 ? 'Role' : 'Roles'}:</strong></p>
        <ul style="margin: 10px 0; padding-left: 20px;">
          ${context.roles.map((role) => `<li><strong>${role}</strong></li>`).join('')}
        </ul>
      </div>
      
      <div class="button-center">
        <a href="${context.loginLink || this.websiteUrl + '/auth/login'}" class="button">Access Your Account</a>
      </div>
      
      <p>If you have any questions or need assistance with your new ${context.roles.length === 1 ? 'role' : 'roles'}, our support team is here to help!</p>
      
      <p class="signature">
        Welcome aboard!<br/>
        <span class="company-highlight">SmartTag Analytics™ Team</span>
      </p>
    `;

    const textBody = `
Congratulations! Your ${context.roles.length === 1 ? 'Role Has' : 'Roles Have'} Been Approved!

Hi ${context.recipientName || 'there'},

Great news! Your ${rolesList} ${context.roles.length === 1 ? 'role has' : 'roles have'} been successfully approved on SmartTag Analytics™.

 Approved ${context.roles.length === 1 ? 'Role' : 'Roles'}:
${context.roles.map((role) => `- ${role}`).join('\n')}

Access your account: ${context.loginLink || this.websiteUrl + '/auth/login'}

If you have any questions or need assistance, our support team is here to help!

Welcome aboard!
SmartTag Analytics™ Team

© ${new Date().getFullYear()} ${this.companyName}
    `.trim();

    return {
      subject,
      htmlBody: this.wrapInBaseTemplate(htmlContent),
      textBody,
    };
  }

  /**
   * Generate Role Rejected Email
   */
  private generateRoleRejectedEmail(context: RoleRejectedEmailContext): EmailTemplateData {
    const rolesList =
      context.roles.length === 1
        ? context.roles[0]
        : context.roles.length === 2
          ? context.roles.join(' and ')
          : `${context.roles.slice(0, -1).join(', ')}, and ${context.roles[context.roles.length - 1]}`;

    const subject = `Update on your ${rolesList} ${context.roles.length === 1 ? 'role' : 'roles'} application`;

    const htmlContent = `
      <h1>Update on Your ${context.roles.length === 1 ? 'Role' : 'Roles'} Application</h1>
      
      <p>Hi ${context.recipientName || 'there'},</p>
      
      <p>Thank you for your interest in joining <span class="company-highlight">SmartTag Analytics™</span>. After careful review, we are unable to approve your ${rolesList} ${context.roles.length === 1 ? 'role' : 'roles'} application at this time.</p>
      
      <div class="warning-box">
        <p><strong>${context.roles.length === 1 ? 'Role Not Approved' : 'Roles Not Approved'}:</strong></p>
        <ul style="margin: 10px 0; padding-left: 20px;">
          ${context.roles.map((role) => `<li><strong>${role}</strong></li>`).join('')}
        </ul>
      </div>
      
      ${
        context.reason
          ? `
        <div class="info-box">
          <p><strong>📝 Reason for Decision:</strong></p>
          <p style="font-style: italic; padding: 10px; background-color: #ffffff; border-radius: 4px; border: 1px solid #e2e8f0; margin: 10px 0 0 0;">
            "${context.reason}"
          </p>
        </div>
      `
          : ''
      }
      
      <p>Please note that this decision was made based on our current verification requirements and policies. You may be eligible to reapply in the future if your circumstances change.</p>
      
      <div class="alert-box alert-medium">
        <p><strong>Next Steps:</strong> If you believe this decision was made in error dditional, please contact our support team.</p>
      </div>
      
      <div class="button-center">
        <a href="${context.loginLink || this.websiteUrl + '/auth/signup'}" class="button">Sign Up Again</a>
      </div>
      
      <p>We appreciate your understanding and interest in SmartTag Analytics™.</p>
      
      <p class="signature">
        Best regards,<br/>
        <span class="company-highlight">SmartTag Analytics™ Team</span>
      </p>
    `;

    const textBody = `
Update on Your ${context.roles.length === 1 ? 'Role' : 'Roles'} Application

Hi ${context.recipientName || 'there'},

Thank you for your interest in joining SmartTag Analytics™. After careful review, we are unable to approve your ${rolesList} ${context.roles.length === 1 ? 'role' : 'roles'} application at this time.

 ${context.roles.length === 1 ? 'Role Not Approved' : 'Roles Not Approved'}:
${context.roles.map((role) => `- ${role}`).join('\n')}

${context.reason ? `Reason for Decision: "${context.reason}"` : ''}

Please note that this decision was made based on our current verification requirements and policies. You may be eligible to reapply in the future if your circumstances change.

If you believe this decision was made in error or if you have additional documentation that might support your application, please contact our support team.

Contact Support: ${context.loginLink || this.websiteUrl + '/contact'}

We appreciate your understanding and interest in SmartTag Analytics™.

Best regards,
SmartTag Analytics™ Team

© ${new Date().getFullYear()} ${this.companyName}
    `.trim();

    return {
      subject,
      htmlBody: this.wrapInBaseTemplate(htmlContent),
      textBody,
    };
  }

  /**
   * Generate blockchain transaction completed email
   */
  private generateBlockchainTransactionCompletedEmail(
    context: BlockchainTransactionCompletedEmailContext,
  ): EmailTemplateData {
    const explorerUrl =
      context.explorerUrl || `https://sepolia.etherscan.io/tx/${context.transactionHash}`;
    const buttonUrl = context.actionUrl || explorerUrl;

    const content = `
      <h1>Blockchain Registration Completed!</h1>
      
      <p>Hi ${context.recipientName || 'there'},</p>
      
      <p>
        Great news! Your property <strong>"${context.propertyName}"</strong> has been successfully
        registered on the blockchain. The transaction is confirmed and permanently recorded.
      </p>
      
      <div class="info-box">
        <p><strong>Property Details</strong></p>
        <ul style="margin: 10px 0; padding-left: 20px; list-style: disc;">
          <li><strong>Property Name:</strong> ${context.propertyName}</li>
          <li><strong>Property ID:</strong> ${context.propertyId}</li>
          <li><strong>Digital ID (Token ID):</strong> ${context.tokenId}</li>
          <li><strong>Transaction Hash:</strong> <a href="${explorerUrl}" style="color: #0ea5e9; text-decoration: none; word-break: break-all">${context.transactionHash}</a></li>
          ${context.chainName ? `<li><strong>Confirmed On:</strong> ${context.chainName}</li>` : ''}
        </ul>
      </div>

      ${
        context.errorMessage
          ? `
      <div class="warning-box">
        <p><strong>Note:</strong> ${context.errorMessage}</p>
      </div>
      `
          : ''
      }
      
      <div class="button-center">
        <a href="${buttonUrl}" class="button">View Property</a>
      </div>
      
      <p class="signature">
        Regards,<br/>
        <span class="company-highlight">${this.companyName} Team</span>
      </p>
    `;

    return {
      subject: `✅ Property "${context.propertyName}" Successfully Registered on Blockchain`,
      htmlBody: this.wrapInBaseTemplate(content),
      textBody: `
Property Successfully Registered on Blockchain!

Hello ${context.recipientName || 'there'},

Great news! Your property "${context.propertyName}" has been successfully registered on the blockchain.

Property Details:
- Property Name: ${context.propertyName}
- Property ID: ${context.propertyId}
- Digital ID (Token ID): ${context.tokenId}
- Transaction Hash: ${context.transactionHash}
${context.chainName ? `- Confirmed On: ${context.chainName}` : ''}

View on Blockchain Explorer: ${explorerUrl}
${context.actionUrl ? `Manage property: ${context.actionUrl}` : ''}
${context.errorMessage ? `Note: ${context.errorMessage}` : ''}

This transaction hash serves as permanent proof of your property's registration on the blockchain.

If you have any questions, please contact our support team.

Best regards,
${this.companyName} Team
      `,
      metadata: {
        category: 'blockchain',
        importance: 'high',
      },
    };
  }

  /**
   * Utility function to adjust color brightness
   */
  private adjustColor(color: string, percent: number): string {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = ((num >> 8) & 0x00ff) + amt;
    const B = (num & 0x0000ff) + amt;
    return (
      '#' +
      (
        0x1000000 +
        (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
        (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
        (B < 255 ? (B < 1 ? 0 : B) : 255)
      )
        .toString(16)
        .slice(1)
    );
  }
}
