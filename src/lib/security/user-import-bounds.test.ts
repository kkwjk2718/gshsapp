import { describe, expect, it } from "vitest";

import { assertUserImportBounds, USER_IMPORT_MAX_BYTES, USER_IMPORT_MAX_ENTRIES, USER_IMPORT_MAX_MUTATIONS } from "./user-import-bounds";

describe("user import bounds", () => {
  it("accepts the exact file and entry limits", () => {
    expect(() => assertUserImportBounds(USER_IMPORT_MAX_BYTES, USER_IMPORT_MAX_ENTRIES, USER_IMPORT_MAX_MUTATIONS)).not.toThrow();
  });

  it("rejects oversized files and parsed entry arrays before database work", () => {
    expect(() => assertUserImportBounds(USER_IMPORT_MAX_BYTES + 1, 0)).toThrow("file");
    expect(() => assertUserImportBounds(1, USER_IMPORT_MAX_ENTRIES + 1)).toThrow("entries");
    expect(() => assertUserImportBounds(1, 1, USER_IMPORT_MAX_MUTATIONS + 1)).toThrow("mutations");
  });
});
