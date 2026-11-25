import { HttpStatus, Injectable } from "@nestjs/common";
import type { Prisma, SavedSection } from "@cartforge/database";
import { mapRichText, validateSavedSection, type ThemeData } from "@cartforge/theme-engine";
import {
  MAX_SAVED_SECTIONS,
  type SavedSectionDetail,
  type SavedSectionSummary,
} from "@cartforge/types";
import { AuditService } from "../audit/audit.service";
import { AppException } from "../common/app-exception";
import { sanitizeRichText } from "../common/sanitize-html";
import { PrismaService } from "../prisma/prisma.service";

type Actor = { user_id: string; request_id: string };

/** Sections saved to reuse in the theme editor. */
@Injectable()
export class SavedSectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private summary(s: SavedSection): SavedSectionSummary {
    return { id: s.id, name: s.name, type: s.type, created_at: s.created_at.toISOString() };
  }

  async list(storeId: string): Promise<SavedSectionSummary[]> {
    const rows = await this.prisma.savedSection.findMany({
      where: { store_id: storeId },
      orderBy: { created_at: "desc" },
    });
    return rows.map((r) => this.summary(r));
  }

  async get(storeId: string, id: string): Promise<SavedSectionDetail> {
    const s = await this.prisma.savedSection.findFirst({ where: { id, store_id: storeId } });
    if (!s) throw AppException.notFound("Saved section");
    return { ...this.summary(s), section: s.data };
  }

  async create(
    storeId: string,
    name: string,
    raw: unknown,
    actor: Actor,
  ): Promise<SavedSectionSummary> {
    const { section, errors } = validateSavedSection(raw);
    if (!section)
      throw AppException.validation(errors.slice(0, 20).map((e) => ({ ...e, code: "invalid" })));
    if (
      (await this.prisma.savedSection.count({ where: { store_id: storeId } })) >= MAX_SAVED_SECTIONS
    )
      throw new AppException(
        "SAVED_SECTION_LIMIT",
        `You can keep up to ${MAX_SAVED_SECTIONS} saved sections. Delete one first.`,
        HttpStatus.CONFLICT,
      );
    // Same rich-text cleaning as a theme save.
    const wrapped = {
      groups: { header: [], footer: [] },
      templates: { home: [section] },
      alternates: { product: {}, collection: {}, page: {} },
    };
    mapRichText(wrapped as unknown as ThemeData, sanitizeRichText);
    const s = await this.prisma.$transaction(async (tx) => {
      const created = await tx.savedSection.create({
        data: {
          store_id: storeId,
          name,
          type: section.type,
          data: JSON.parse(JSON.stringify(section)) as Prisma.InputJsonValue,
          created_by: actor.user_id,
        },
      });
      await this.audit.recordIn(tx, {
        action: "saved_section.created",
        resource_type: "saved_section",
        resource_id: created.id,
        store_id: storeId,
        actor_user_id: actor.user_id,
        request_id: actor.request_id,
        metadata: { name, type: section.type },
      });
      return created;
    });
    return this.summary(s);
  }

  async remove(storeId: string, id: string, actor: Actor) {
    const s = await this.prisma.savedSection.findFirst({ where: { id, store_id: storeId } });
    if (!s) throw AppException.notFound("Saved section");
    await this.prisma.$transaction(async (tx) => {
      await tx.savedSection.delete({ where: { id } });
      await this.audit.recordIn(tx, {
        action: "saved_section.deleted",
        resource_type: "saved_section",
        resource_id: id,
        store_id: storeId,
        actor_user_id: actor.user_id,
        request_id: actor.request_id,
        metadata: { name: s.name },
      });
    });
  }
}
