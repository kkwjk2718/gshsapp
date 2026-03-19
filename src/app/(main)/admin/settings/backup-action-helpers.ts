export const RESTORE_CONFIRM_TEXT = "RESTORE";

export function parsePositiveInteger(value: FormDataEntryValue | null | undefined) {
  const normalizedValue = typeof value === "string" ? value.trim() : "";

  if (!normalizedValue) {
    return null;
  }

  const parsedValue = Number(normalizedValue);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return null;
  }

  return parsedValue;
}

export function isSupportedBackupFileName(fileName: string) {
  const lowerCaseFileName = fileName.trim().toLowerCase();
  return lowerCaseFileName.endsWith(".db") || lowerCaseFileName.endsWith(".tar.gz");
}

export function getActionErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallbackMessage;
}
