import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AccountService } from "./account.service";
import { PlatformAccountsController } from "./platform-accounts.controller";
import { Mailer } from "../mail/mailer";
import { CsrfGuard, PermissionsGuard, SessionGuard, StoreScopeGuard } from "./guards";
import { PasswordService } from "./password.service";
import { RateLimitService } from "./rate-limit.service";
import { SessionService } from "./session.service";

@Module({
  controllers: [AuthController, PlatformAccountsController],
  providers: [
    AuthService,
    AccountService,
    Mailer,
    PasswordService,
    SessionService,
    RateLimitService,
    // Order matters: session → CSRF → store scope → permissions.
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: StoreScopeGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [PasswordService, RateLimitService],
})
export class AuthModule {}
