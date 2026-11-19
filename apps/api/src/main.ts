import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureApp } from "./bootstrap";
import { API_ENV, type ApiEnv } from "./config/env";

async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApp(app);
  const env = app.get<ApiEnv>(API_ENV);
  await app.listen(env.API_PORT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
