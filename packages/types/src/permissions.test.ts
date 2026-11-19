import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSIONS,
  SYSTEM_CRITICAL_PERMISSIONS,
  SYSTEM_ROLES,
  isPermission,
} from "./permissions.js";

describe("permission catalog", () => {
  it("has unique permission strings", () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
  });

  it("only references known permissions in system roles", () => {
    for (const role of Object.values(SYSTEM_ROLES)) {
      for (const p of role.permissions) expect(isPermission(p)).toBe(true);
    }
  });

  it("gives system-critical permissions only to owner/admin", () => {
    const limited = ["catalog_manager", "order_manager", "content_designer"] as const;
    for (const key of limited) {
      const perms: readonly string[] = SYSTEM_ROLES[key].permissions;
      for (const critical of SYSTEM_CRITICAL_PERMISSIONS) expect(perms).not.toContain(critical);
    }
  });

  it("withholds ownership transfer and license from admin", () => {
    const perms: readonly string[] = SYSTEM_ROLES.admin.permissions;
    expect(perms).not.toContain("store.ownership.transfer");
    expect(perms).not.toContain("license.manage");
  });
});
