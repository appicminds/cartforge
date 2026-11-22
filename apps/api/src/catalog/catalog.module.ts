import { Module } from "@nestjs/common";
import { MediaModule } from "../media/media.module";
import { CategoriesController } from "./categories.controller";
import { CategoriesService } from "./categories.service";
import { CollectionsController } from "./collections.controller";
import { CollectionsService } from "./collections.service";

@Module({
  imports: [MediaModule],
  controllers: [CategoriesController, CollectionsController],
  providers: [CategoriesService, CollectionsService],
  exports: [CategoriesService, CollectionsService],
})
export class CatalogModule {}
