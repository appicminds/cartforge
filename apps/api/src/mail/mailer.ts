import { Inject, Injectable, Logger } from "@nestjs/common";
import { API_ENV, type ApiEnv } from "../config/env";

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Outgoing email. EMAIL_PROVIDER=resend sends through Resend; "log" sends nothing
 * and — outside production only — writes the message to the log so links can be
 * followed during development. Failures are logged, never thrown to the caller,
 * so an email outage can't reveal whether an account exists.
 */
@Injectable()
export class Mailer {
  private readonly logger = new Logger(Mailer.name);

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  get enabled(): boolean {
    return this.env.EMAIL_PROVIDER === "resend";
  }

  /** "sent": really delivered · "logged": development log · "off": nothing happens. */
  get mode(): "sent" | "logged" | "off" {
    if (this.enabled) return "sent";
    return this.env.NODE_ENV === "production" ? "off" : "logged";
  }

  async send(email: Email): Promise<boolean> {
    if (this.env.EMAIL_PROVIDER === "log") {
      if (this.env.NODE_ENV === "production")
        this.logger.warn(`Email to a user not sent: EMAIL_PROVIDER is "log" (${email.subject})`);
      else this.logger.log(`[email] to=${email.to} subject="${email.subject}"\n${email.text}`);
      return false;
    }
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.env.EMAIL_FROM,
          to: [email.to],
          subject: email.subject,
          text: email.text,
          html: email.html,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        this.logger.error(`Email provider refused a message (${res.status})`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(`Email provider unreachable: ${(err as Error).message}`);
      return false;
    }
  }
}
