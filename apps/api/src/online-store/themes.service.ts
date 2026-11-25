import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, type Theme } from "@cartforge/database";
import {
  ALT_TEMPLATE_KEYS,
  PRESETS,
  contrastProblems,
  defaultTheme,
  mapRichText,
  presetByKey,
  themeReferences,
  validateTheme,
  type ThemeData,
} from "@cartforge/theme-engine";
import {
  MAX_THEMES,
  ONLINE_STORE_ERROR_CODES,
  type StorefrontThemePayload,
  type ThemeDetail,
  type ThemeImage,
  type ThemePresetSummary,
  type ThemeSaveResult,
  type TemplateAssignment,
  type TemplateTargetKind,
  type ThemeSummary,
  type ThemeTemplateNames,
  type ThemeVersionSummary,
} from "@cartforge/types";
import { AuditService } from "../audit/audit.service";
import { AppException } from "../common/app-exception";
import { sanitizeRichText } from "../common/sanitize-html";
import { mediaUrls } from "../media/media.mapper";
import { PrismaService } from "../prisma/prisma.service";
import { CATALOG_TAG, StorefrontRevalidator } from "../storefront/revalidation";
import { ThemePreviewTokens } from "../storefront/preview-token";
import { MenusService } from "./menus.service";
import { hasSampleContent } from "./sample/kits";

type Actor = { user_id: string; request_id: string };
const KEEP_VERSIONS = 30;

const notFound = () =>
  new AppException(
    ONLINE_STORE_ERROR_CODES.THEME_NOT_FOUND,
    "Theme not found.",
    HttpStatus.NOT_FOUND,
  );

const json = (t: ThemeData) => JSON.parse(JSON.stringify(t)) as Prisma.InputJsonValue;

/**
 * Themes (Online store → Themes): a library of up to six per store, one live.
 * The editor saves `data` (a draft); publishing copies it to `live_data`, which
 * shoppers see, and keeps a version to roll back to.
 */
@Injectable()
export class ThemesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidator: StorefrontRevalidator,
    private readonly previews: ThemePreviewTokens,
    private readonly menus: MenusService,
  ) {}

  presets(): ThemePresetSummary[] {
    return PRESETS.map(({ key, name, description }) => ({
      key,
      name,
      description,
      has_sample_content: hasSampleContent(key),
    }));
  }

  private summary(t: Theme): ThemeSummary {
    return {
      id: t.id,
      name: t.name,
      preset: t.preset,
      role: t.role as ThemeSummary["role"],
      updated_at: t.updated_at.toISOString(),
      published_at: t.published_at?.toISOString() ?? null,
      has_unpublished_changes:
        t.role === "live" && JSON.stringify(t.data) !== JSON.stringify(t.live_data),
    };
  }

  /** Every store has a live theme: Foundry until the merchant picks another. */
  private async ensureLive(storeId: string) {
    if (await this.prisma.theme.count({ where: { store_id: storeId } })) return;
    const data = json(defaultTheme());
    await this.prisma.theme
      .create({
        data: {
          store_id: storeId,
          name: "Foundry",
          preset: "foundry",
          role: "live",
          data,
          live_data: data,
          published_at: new Date(),
        },
      })
      .catch((err: unknown) => {
        // Another request created it first.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"))
          throw err;
      });
  }

  private async find(storeId: string, id: string) {
    const t = await this.prisma.theme.findFirst({ where: { id, store_id: storeId } });
    if (!t) throw notFound();
    return t;
  }

  async list(storeId: string): Promise<ThemeSummary[]> {
    await this.ensureLive(storeId);
    const rows = await this.prisma.theme.findMany({
      where: { store_id: storeId },
      orderBy: [{ role: "asc" }, { updated_at: "desc" }],
    });
    return rows.map((t) => this.summary(t));
  }

  async get(storeId: string, id: string): Promise<ThemeDetail> {
    const t = await this.find(storeId, id);
    const data = validateTheme(t.data, false).theme;
    return {
      ...this.summary(t),
      data,
      images: await this.images(storeId, themeReferences(data).media),
    };
  }

  private async audited<T>(
    storeId: string,
    action: string,
    actor: Actor,
    resourceId: string,
    metadata: object,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const r = await fn(tx);
      await this.audit.recordIn(tx, {
        action,
        resource_type: "theme",
        resource_id: resourceId,
        store_id: storeId,
        actor_user_id: actor.user_id,
        request_id: actor.request_id,
        metadata,
      });
      return r;
    });
  }

  private async assertRoom(storeId: string) {
    if ((await this.prisma.theme.count({ where: { store_id: storeId } })) >= MAX_THEMES)
      throw new AppException(
        ONLINE_STORE_ERROR_CODES.THEME_LIMIT,
        `You can keep up to ${MAX_THEMES} themes. Delete one first.`,
        HttpStatus.CONFLICT,
      );
  }

  async create(storeId: string, presetKey: string, name: string | undefined, actor: Actor) {
    await this.ensureLive(storeId);
    const preset = presetByKey(presetKey);
    if (!preset)
      throw AppException.validation([
        { path: "preset", message: "Choose a theme", code: "invalid" },
      ]);
    await this.assertRoom(storeId);
    const t = await this.audited(
      storeId,
      "theme.created",
      actor,
      "",
      { preset: preset.key },
      (tx) =>
        tx.theme.create({
          data: {
            store_id: storeId,
            name: name ?? preset.name,
            preset: preset.key,
            data: json(preset.build()),
          },
        }),
    );
    return this.summary(t);
  }

  async duplicate(storeId: string, id: string, actor: Actor) {
    const src = await this.find(storeId, id);
    await this.assertRoom(storeId);
    const t = await this.audited(storeId, "theme.duplicated", actor, id, {}, (tx) =>
      tx.theme.create({
        data: {
          store_id: storeId,
          name: `Copy of ${src.name}`.slice(0, 80),
          preset: src.preset,
          data: src.data as Prisma.InputJsonValue,
        },
      }),
    );
    return this.summary(t);
  }

  async rename(storeId: string, id: string, name: string, actor: Actor) {
    await this.find(storeId, id);
    const t = await this.audited(storeId, "theme.renamed", actor, id, { name }, (tx) =>
      tx.theme.update({ where: { id }, data: { name } }),
    );
    return this.summary(t);
  }

  async remove(storeId: string, id: string, actor: Actor) {
    const t = await this.find(storeId, id);
    if (t.role === "live")
      throw new AppException(
        ONLINE_STORE_ERROR_CODES.THEME_LIVE,
        "The live theme can't be deleted. Publish another theme first.",
        HttpStatus.CONFLICT,
      );
    await this.audited(storeId, "theme.deleted", actor, id, { name: t.name }, (tx) =>
      tx.theme.delete({ where: { id } }),
    );
  }

  /** The editor's save: strict validation, rich text sanitized. */
  async save(storeId: string, id: string, raw: unknown): Promise<ThemeSaveResult> {
    await this.find(storeId, id);
    const { theme, errors } = validateTheme(raw, true);
    if (errors.length)
      throw AppException.validation(
        errors
          .slice(0, 50)
          .map((e) => ({ path: `data.${e.path}`, message: e.message, code: "invalid" })),
      );
    mapRichText(theme, sanitizeRichText);
    const t = await this.prisma.theme.update({ where: { id }, data: { data: json(theme) } });
    return { updated_at: t.updated_at.toISOString(), contrast: contrastProblems(theme) };
  }

  /** Makes the theme live with its saved content, and keeps a version. */
  async publish(storeId: string, id: string, actor: Actor): Promise<ThemeSummary> {
    const t = await this.find(storeId, id);
    const data = validateTheme(t.data, false).theme;
    const out = await this.audited(
      storeId,
      "theme.published",
      actor,
      id,
      { name: t.name },
      async (tx) => {
        // Serialize publishes per store.
        await tx.$queryRaw`SELECT id FROM stores WHERE id = ${storeId}::uuid FOR UPDATE`;
        if (t.role !== "live")
          await tx.theme.updateMany({
            where: { store_id: storeId, role: "live" },
            data: { role: "unpublished" },
          });
        const updated = await tx.theme.update({
          where: { id },
          data: { role: "live", data: json(data), live_data: json(data), published_at: new Date() },
        });
        await tx.themeVersion.create({
          data: { theme_id: id, store_id: storeId, data: json(data), created_by: actor.user_id },
        });
        const old = await tx.themeVersion.findMany({
          where: { theme_id: id },
          orderBy: { created_at: "desc" },
          skip: KEEP_VERSIONS,
          select: { id: true },
        });
        if (old.length)
          await tx.themeVersion.deleteMany({ where: { id: { in: old.map((v) => v.id) } } });
        return updated;
      },
    );
    await this.refresh(storeId);
    return this.summary(out);
  }

  async versions(storeId: string, id: string): Promise<ThemeVersionSummary[]> {
    await this.find(storeId, id);
    const rows = await this.prisma.themeVersion.findMany({
      where: { theme_id: id },
      orderBy: { created_at: "desc" },
      take: KEEP_VERSIONS,
      select: { id: true, created_at: true, created_by: true },
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.created_by).filter((x): x is string => !!x) } },
      select: { id: true, name: true, email: true },
    });
    const who = new Map(users.map((u) => [u.id, u.name || u.email]));
    return rows.map((r) => ({
      id: r.id,
      created_at: r.created_at.toISOString(),
      created_by: r.created_by ? (who.get(r.created_by) ?? null) : null,
    }));
  }

  /** Puts an earlier version back; on the live theme it's published right away. */
  async restore(storeId: string, id: string, versionId: string, actor: Actor) {
    const t = await this.find(storeId, id);
    const v = await this.prisma.themeVersion.findFirst({ where: { id: versionId, theme_id: id } });
    if (!v) throw notFound();
    await this.audited(storeId, "theme.restored", actor, id, { version: versionId }, (tx) =>
      tx.theme.update({ where: { id }, data: { data: v.data as Prisma.InputJsonValue } }),
    );
    return t.role === "live"
      ? this.publish(storeId, id, actor)
      : this.summary(await this.find(storeId, id));
  }

  /** Discards unpublished edits on the live theme. */
  async discard(storeId: string, id: string, actor: Actor) {
    const t = await this.find(storeId, id);
    if (t.role !== "live" || !t.live_data) return this.summary(t);
    const out = await this.audited(storeId, "theme.discarded", actor, id, {}, (tx) =>
      tx.theme.update({ where: { id }, data: { data: t.live_data as Prisma.InputJsonValue } }),
    );
    return this.summary(out);
  }

  async previewLink(storeId: string, id: string) {
    await this.find(storeId, id);
    const { token, expires } = this.previews.sign(storeId, id);
    return { token, expires_at: expires.toISOString() };
  }

  private refresh(storeId: string) {
    return this.revalidator.enabled
      ? this.revalidator.notify([`${CATALOG_TAG}:${storeId.toLowerCase()}`])
      : Promise.resolve();
  }

  private async images(storeId: string, ids: string[]): Promise<Record<string, ThemeImage>> {
    if (!ids.length) return {};
    const rows = await this.prisma.mediaAsset.findMany({
      where: { store_id: storeId, id: { in: ids } },
      include: { derivatives: true },
    });
    return Object.fromEntries(
      rows.map((a) => {
        const u = mediaUrls(a);
        return [
          a.id,
          {
            url: u.url,
            medium_url: u.medium_url,
            large_url: u.large_url,
            width: a.width,
            height: a.height,
            alt: a.alt_text,
          },
        ];
      }),
    );
  }

  // ───────────── Alternate templates ─────────────

  /** Alternate template names of the live theme (saved draft and published). */
  async templateNames(storeId: string): Promise<ThemeTemplateNames> {
    await this.ensureLive(storeId);
    const t = await this.prisma.theme.findFirst({ where: { store_id: storeId, role: "live" } });
    const out: ThemeTemplateNames = { product: [], collection: [], page: [] };
    if (!t) return out;
    for (const raw of [t.data, t.live_data]) {
      const d = validateTheme(raw, false).theme;
      for (const k of ALT_TEMPLATE_KEYS)
        out[k] = [...new Set([...out[k], ...Object.keys(d.alternates[k])])].sort();
    }
    return out;
  }

  private async target(storeId: string, kind: TemplateTargetKind, id: string) {
    const where = { id, store_id: storeId };
    const row =
      kind === "product"
        ? await this.prisma.product.findFirst({
            where: { ...where, deleted_at: null },
            select: { template_suffix: true },
          })
        : kind === "collection"
          ? await this.prisma.collection.findFirst({ where, select: { template_suffix: true } })
          : await this.prisma.page.findFirst({ where, select: { template_suffix: true } });
    if (!row) throw AppException.notFound(kind[0]!.toUpperCase() + kind.slice(1));
    return row;
  }

  async assignment(
    storeId: string,
    kind: TemplateTargetKind,
    id: string,
  ): Promise<TemplateAssignment> {
    const [row, names] = await Promise.all([
      this.target(storeId, kind, id),
      this.templateNames(storeId),
    ]);
    return { template: row.template_suffix, available: names[kind] };
  }

  async assign(
    storeId: string,
    kind: TemplateTargetKind,
    id: string,
    template: string | null,
    actor: Actor,
  ): Promise<TemplateAssignment> {
    await this.target(storeId, kind, id);
    const names = await this.templateNames(storeId);
    if (template && !names[kind].includes(template))
      throw AppException.validation([
        {
          path: "template",
          message: "Create this template in the theme editor first",
          code: "unknown",
        },
      ]);
    await this.audited(
      storeId,
      "theme.template_assigned",
      actor,
      id,
      { kind, template },
      async (tx) => {
        const data = { template_suffix: template };
        if (kind === "product") await tx.product.update({ where: { id }, data });
        else if (kind === "collection") await tx.collection.update({ where: { id }, data });
        else await tx.page.update({ where: { id }, data });
      },
    );
    await this.refresh(storeId);
    return { template, available: names[kind] };
  }

  // ───────────── Storefront ─────────────

  /**
   * What the storefront renders: the live theme, or a theme's saved draft when
   * a valid preview token comes with the request (editor, preview links).
   */
  async forStorefront(
    storeId: string,
    previewToken: string | undefined,
  ): Promise<StorefrontThemePayload> {
    let row: Theme | null = null;
    let preview = false;
    if (previewToken) {
      const themeId = this.previews.verify(previewToken, storeId);
      if (themeId) {
        row = await this.prisma.theme.findFirst({ where: { id: themeId, store_id: storeId } });
        preview = !!row;
      }
    }
    row ??= await this.prisma.theme.findFirst({ where: { store_id: storeId, role: "live" } });
    const data = row
      ? validateTheme(preview ? row.data : (row.live_data ?? row.data), false).theme
      : defaultTheme();
    const refs = themeReferences(data);
    const [images, menus] = await Promise.all([
      this.images(storeId, refs.media),
      this.menus.resolveForStorefront(storeId, refs.menus),
    ]);
    return { theme_id: row?.id ?? null, preview, data, images, menus };
  }
}
