import { Global, Module } from "@nestjs/common";
import { API_ENV, type ApiEnv } from "../config/env";
import { DNS_RESOLVER, DOMAIN_PROVIDER, domainProviderFor, systemDns } from "./domain-provider";
import { DomainsService } from "./domains.service";
import {
  DomainsController,
  PlatformAdminController,
  PlatformPublicController,
  StoresAccountController,
} from "./platform.controller";
import { PlatformAdminService } from "./platform-admin.service";
import { StoreProvisioningService } from "./provisioning.service";

/** P1: editions, sign-up provisioning, store domains and platform administration. */
@Global()
@Module({
  controllers: [
    PlatformPublicController,
    StoresAccountController,
    DomainsController,
    PlatformAdminController,
  ],
  providers: [
    StoreProvisioningService,
    DomainsService,
    PlatformAdminService,
    {
      provide: DOMAIN_PROVIDER,
      inject: [API_ENV],
      useFactory: (env: ApiEnv) => domainProviderFor(env),
    },
    { provide: DNS_RESOLVER, useValue: systemDns },
  ],
  exports: [StoreProvisioningService, DomainsService],
})
export class PlatformModule {}
