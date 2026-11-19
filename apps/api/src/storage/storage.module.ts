import { Global, Module } from "@nestjs/common";
import { API_ENV, type ApiEnv } from "../config/env";
import { LocalStorageDriver } from "./local.driver";
import { S3StorageDriver } from "./s3.driver";
import { STORAGE_DRIVER, type StorageDriver } from "./storage.driver";
import { VercelBlobStorageDriver } from "./vercel-blob.driver";

export function createStorageDriver(env: ApiEnv): StorageDriver {
  switch (env.STORAGE_DRIVER) {
    case "s3":
      return new S3StorageDriver({
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION,
        bucket: env.S3_BUCKET!,
        accessKeyId: env.S3_ACCESS_KEY!,
        secretAccessKey: env.S3_SECRET_KEY!,
        publicBaseUrl: env.S3_PUBLIC_BASE_URL!,
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
      });
    case "vercel-blob":
      return new VercelBlobStorageDriver(env.BLOB_READ_WRITE_TOKEN!);
    default:
      return new LocalStorageDriver(env.STORAGE_LOCAL_PATH);
  }
}

@Global()
@Module({
  providers: [{ provide: STORAGE_DRIVER, inject: [API_ENV], useFactory: createStorageDriver }],
  exports: [STORAGE_DRIVER],
})
export class StorageModule {}
