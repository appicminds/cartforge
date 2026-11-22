import { Module } from "@nestjs/common";
import { API_ENV, type ApiEnv } from "../config/env";
import { ThemePreviewTokens } from "../storefront/preview-token";
import { MenusService } from "./menus.service";
import {
  MenusController,
  PagesController,
  StorefrontOnlineStoreController,
  ThemesController,
} from "./online-store.controller";
import { PagesService } from "./pages.service";
import { ThemesService } from "./themes.service";

/** Store builder (Next 3): themes and the editor, menus, content pages. */
@Module({
  controllers: [
    ThemesController,
    MenusController,
    PagesController,
    StorefrontOnlineStoreController,
  ],
  providers: [
    ThemesService,
    MenusService,
    PagesService,
    {
      provide: ThemePreviewTokens,
      inject: [API_ENV],
      useFactory: (env: ApiEnv) => new ThemePreviewTokens(env.SESSION_SECRET),
    },
  ],
})
export class OnlineStoreModule {}
