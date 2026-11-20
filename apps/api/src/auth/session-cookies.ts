import { Inject, Injectable } from "@nestjs/common";
import type { CookieOptions, Response } from "express";
import { COOKIES } from "@cartforge/types";
import { API_ENV, type ApiEnv } from "../config/env";
import { deriveCsrfToken } from "./tokens";

/** Session + CSRF cookies, shared by every route that signs someone in. */
@Injectable()
export class SessionCookies {
  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  private base(): CookieOptions {
    return { secure: this.env.COOKIE_SECURE, sameSite: "lax", path: "/" };
  }

  set(res: Response, token: string, expires: Date): void {
    res.cookie(COOKIES.SESSION, token, { ...this.base(), httpOnly: true, expires });
    // Readable by the admin JS so it can echo it in X-CSRF-Token (double submit).
    res.cookie(COOKIES.CSRF, deriveCsrfToken(this.env.SESSION_SECRET, token), {
      ...this.base(),
      httpOnly: false,
      expires,
    });
  }

  clear(res: Response): void {
    res.clearCookie(COOKIES.SESSION, this.base());
    res.clearCookie(COOKIES.CSRF, this.base());
  }
}
