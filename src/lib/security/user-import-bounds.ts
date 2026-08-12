export const USER_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const USER_IMPORT_MAX_ENTRIES = 1_000;
export const USER_IMPORT_MAX_MUTATIONS = 1_000;

export function assertUserImportBounds(fileBytes: number, parsedEntries: number, mutations = 0): void {
  if (!Number.isSafeInteger(fileBytes) || fileBytes < 0 || fileBytes > USER_IMPORT_MAX_BYTES) {
    throw new Error("User import file exceeds the size limit");
  }
  if (!Number.isSafeInteger(parsedEntries) || parsedEntries < 0 || parsedEntries > USER_IMPORT_MAX_ENTRIES) {
    throw new Error("User import entries exceed the limit");
  }
  if (!Number.isSafeInteger(mutations) || mutations < 0 || mutations > USER_IMPORT_MAX_MUTATIONS) {
    throw new Error("User import mutations exceed the limit");
  }
}
