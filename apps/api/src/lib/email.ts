import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import type { Options as MailOptions } from 'nodemailer/lib/mailer'
import { config } from '../config'

// ── Transport ─────────────────────────────────────────────────────────────────

function buildTransport(): Transporter {
  const base = {
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
  }

  if (config.SMTP_USER) {
    return nodemailer.createTransport({
      ...base,
      auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD ?? '' },
    })
  }

  return nodemailer.createTransport(base)
}

// Singleton — reused across all requests in the same process
let cachedTransport: Transporter | undefined

export function getTransport(): Transporter {
  if (!cachedTransport) cachedTransport = buildTransport()
  return cachedTransport
}

// ── Role display names ────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrator',
  MANAGER: 'Manager',
  TECHNICIAN: 'Technician',
  VIEWER: 'Viewer',
  CONTRACTOR: 'Contractor',
}

// ── Templates ─────────────────────────────────────────────────────────────────

interface InvitationEmailData {
  to: string
  inviterName: string
  tenantName: string
  roleName: string
  acceptUrl: string
  expiresAt: Date
}

function renderInvitationEmail(d: InvitationEmailData): {
  subject: string
  html: string
  text: string
} {
  const expiry = d.expiresAt.toUTCString()
  const subject = `You're invited to join ${d.tenantName} on MaintainHub`

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

        <!-- Header -->
        <tr><td style="background:#1d4ed8;padding:32px 40px;">
          <p style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-.3px;">MaintainHub</p>
          <p style="margin:6px 0 0;color:#93c5fd;font-size:13px;">Enterprise CMMS Platform</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:40px;">
          <h1 style="margin:0 0 16px;font-size:22px;color:#111827;font-weight:700;">
            You've been invited!
          </h1>
          <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
            <strong>${d.inviterName}</strong> has invited you to join
            <strong>${d.tenantName}</strong> as a <strong>${d.roleName}</strong>.
          </p>
          <p style="margin:0 0 32px;font-size:15px;color:#374151;line-height:1.6;">
            Click the button below to set your password and activate your account.
            This invitation link expires in <strong>48 hours</strong>.
          </p>

          <!-- CTA button -->
          <table cellpadding="0" cellspacing="0" style="margin:0 auto 32px;">
            <tr><td style="background:#1d4ed8;border-radius:6px;text-align:center;">
              <a href="${d.acceptUrl}"
                 style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:.2px;">
                Accept Invitation
              </a>
            </td></tr>
          </table>

          <!-- Fallback URL -->
          <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">
            If the button doesn't work, copy this link into your browser:
          </p>
          <p style="margin:0 0 32px;font-size:11px;word-break:break-all;color:#1d4ed8;">
            ${d.acceptUrl}
          </p>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 24px;">

          <p style="margin:0;font-size:12px;color:#9ca3af;">
            This invitation expires on ${expiry}.<br>
            If you did not expect this email, you can safely ignore it.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  const text = [
    subject,
    '',
    `${d.inviterName} has invited you to join ${d.tenantName} as a ${d.roleName}.`,
    '',
    'Accept your invitation:',
    d.acceptUrl,
    '',
    `This link expires: ${expiry}`,
  ].join('\n')

  return { subject, html, text }
}

// ── Password reset template ───────────────────────────────────────────────────

interface PasswordResetEmailData {
  to: string
  tenantName: string
  resetUrl: string
  expiresMinutes: number
}

function renderPasswordResetEmail(d: PasswordResetEmailData): {
  subject: string
  html: string
  text: string
} {
  const subject = `Reset your MaintainHub password`

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

        <!-- Header -->
        <tr><td style="background:#1d4ed8;padding:32px 40px;">
          <p style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-.3px;">MaintainHub</p>
          <p style="margin:6px 0 0;color:#93c5fd;font-size:13px;">Enterprise CMMS Platform</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:40px;">
          <h1 style="margin:0 0 16px;font-size:22px;color:#111827;font-weight:700;">
            Password Reset Request
          </h1>
          <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
            We received a request to reset your password for your <strong>${d.tenantName}</strong> account.
          </p>
          <p style="margin:0 0 32px;font-size:15px;color:#374151;line-height:1.6;">
            Click the button below to choose a new password.
            This link expires in <strong>${d.expiresMinutes} minutes</strong>.
          </p>

          <!-- CTA button -->
          <table cellpadding="0" cellspacing="0" style="margin:0 auto 32px;">
            <tr><td style="background:#1d4ed8;border-radius:6px;text-align:center;">
              <a href="${d.resetUrl}"
                 style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:.2px;">
                Reset Password
              </a>
            </td></tr>
          </table>

          <!-- Fallback URL -->
          <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">
            If the button doesn't work, copy this link into your browser:
          </p>
          <p style="margin:0 0 32px;font-size:11px;word-break:break-all;color:#1d4ed8;">
            ${d.resetUrl}
          </p>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 24px;">

          <p style="margin:0;font-size:12px;color:#9ca3af;">
            If you didn't request a password reset, you can safely ignore this email.<br>
            Your password will not change unless you click the link above.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  const text = [
    subject,
    '',
    `Reset your password for ${d.tenantName} on MaintainHub:`,
    d.resetUrl,
    '',
    `This link expires in ${d.expiresMinutes} minutes.`,
    '',
    `If you did not request this, ignore this email.`,
  ].join('\n')

  return { subject, html, text }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface EmailService {
  sendInvitation(data: {
    to: string
    inviterName: string
    tenantName: string
    role: string
    acceptUrl: string
    expiresAt: Date
  }): Promise<void>
  sendPasswordReset(data: {
    to: string
    tenantName: string
    resetUrl: string
    expiresMinutes: number
  }): Promise<void>
}

export const emailService: EmailService = {
  async sendInvitation({ to, inviterName, tenantName, role, acceptUrl, expiresAt }) {
    const roleName = ROLE_LABELS[role] ?? role
    const { subject, html, text } = renderInvitationEmail({
      to,
      inviterName,
      tenantName,
      roleName,
      acceptUrl,
      expiresAt,
    })

    const mail: MailOptions = {
      from: config.SMTP_FROM,
      to,
      subject,
      html,
      text,
    }

    await getTransport().sendMail(mail)
  },

  async sendPasswordReset({ to, tenantName, resetUrl, expiresMinutes }) {
    const { subject, html, text } = renderPasswordResetEmail({
      to,
      tenantName,
      resetUrl,
      expiresMinutes,
    })

    const mail: MailOptions = {
      from: config.SMTP_FROM,
      to,
      subject,
      html,
      text,
    }

    await getTransport().sendMail(mail)
  },
}
