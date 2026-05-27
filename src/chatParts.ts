import * as vscode from "vscode";
import {
  hasUsageSnapshot,
  toProviderUsagePayload,
  type UsageSnapshot,
} from "./usage";

export const OPENCODE_USAGE_DATA_MIME = "application/vnd.opencode.usage+json";

export function createUsageDataPart(
  usage: UsageSnapshot,
): vscode.LanguageModelDataPart | undefined {
  if (!hasUsageSnapshot(usage)) {
    return undefined;
  }

  const payload = toProviderUsagePayload(usage);
  if (!payload) {
    return undefined;
  }

  return new vscode.LanguageModelDataPart(
    new TextEncoder().encode(JSON.stringify(payload)),
    OPENCODE_USAGE_DATA_MIME,
  );
}

export function isInternalDataPart(
  part: vscode.LanguageModelDataPart,
): boolean {
  return part.mimeType === OPENCODE_USAGE_DATA_MIME;
}