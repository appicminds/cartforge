import { Module } from "@nestjs/common";
import { API_ENV, type ApiEnv } from "../config/env";
import { ThemePreviewTokens } from "../storefront/preview-token";
import { BlogService } from "./blog.service";
import { MenusService } from "./menus.service";
import {
  ArticlesController,
  BlogsController,
  MenusController,
  PagesController,
  SavedSectionsController,
  StorefrontOnlineStoreController,
  ThemeTemplatesController,
  ThemesController,
} from "./online-store.controller";
import { PagesService } from "./pages.service";
import { SavedSectionsService } from "./saved-sections.service";
import { ThemesService } from "./themes.service";

/** Store builder (Next 3): themes and the editor, menus, content pages. */
@Module({
  controllers: [
    ThemesController,
    ThemeTemplatesController,
    MenusController,
    PagesController,
    BlogsController,
    SavedSectionsController,
    ArticlesController,
    StorefrontOnlineStoreController,
  ],
  providers: [
    ThemesService,
    MenusService,
    PagesService,
    BlogService,
    SavedSectionsService,
    {
      provide: ThemePreviewTokens,
      inject: [API_ENV],
      useFactory: (env: ApiEnv) => new ThemePreviewTokens(env.SESSION_SECRET),
    },
  ],
})
export class OnlineStoreModule {}
