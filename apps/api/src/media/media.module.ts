import { Module } from "@nestjs/common";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";
import { MediaUploadInterceptor, VideoCompleteInterceptor } from "./upload.interceptor";

@Module({
  controllers: [MediaController],
  providers: [MediaService, MediaUploadInterceptor, VideoCompleteInterceptor],
  exports: [MediaService],
})
export class MediaModule {}
