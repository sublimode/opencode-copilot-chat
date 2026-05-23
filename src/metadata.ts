import { GO_VENDOR, ZEN_VENDOR, type ProviderVendor } from "./providerTypes";

export interface BaseModelLimits {
  contextWindow: number;
  maxOutputTokens: number;
}

export interface ModelMetadataFields {
  contextWindow?: number;
  maxOutputTokens?: number;
  supportsVision?: boolean;
  reasoning?: boolean;
  status?: string;
}

export interface CachedModelMetadataSnapshot {
  fetchedAt: number;
  providers: Record<ProviderVendor, Record<string, ModelMetadataFields>>;
}

export interface ResolvedModelMetadata extends BaseModelLimits {
  supportsVision: boolean;
  reasoning: boolean;
  status?: string;
  source: "models.dev" | "live" | "fallback" | "default";
}

export interface ModelListEntry {
  id?: string;
  status?: string;
  deprecated?: boolean;
  limit?: {
    context?: number;
    output?: number;
  };
  context_window?: number;
  contextWindow?: number;
  max_output_tokens?: number;
  maxOutputTokens?: number;
  attachment?: boolean;
  image_input?: boolean;
  imageInput?: boolean;
  reasoning?: boolean;
  modalities?: {
    input?: string[];
    output?: string[];
  };
}

export interface ModelsDevModelRecord {
  status?: string;
  limit?: {
    context?: number;
    output?: number;
  };
  attachment?: boolean;
  reasoning?: boolean;
  modalities?: {
    input?: string[];
    output?: string[];
  };
}

interface ModelsDevProviderRecord {
  models?: Record<string, ModelsDevModelRecord>;
}

export interface ModelsDevResponse {
  opencode?: ModelsDevProviderRecord;
  "opencode-go"?: ModelsDevProviderRecord;
}

export const MODELS_DEV_API_URL = "https://models.dev/api.json";
export const MODEL_METADATA_REVISION = "session-2026-05-21-b";
export const MODEL_METADATA_CACHE_KEY = "opencodego.modelMetadataCache.v3";
export const MODEL_METADATA_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const DEFAULT_MODEL_LIMITS: BaseModelLimits = {
  contextWindow: 262144,
  maxOutputTokens: 65536,
};

const MODELS_DEV_PROVIDER_BY_VENDOR: Record<ProviderVendor, keyof ModelsDevResponse> = {
  [GO_VENDOR]: "opencode-go",
  [ZEN_VENDOR]: "opencode",
};

const MODEL_LIMITS_BY_PROVIDER: Record<ProviderVendor, Record<string, BaseModelLimits>> = {
  [GO_VENDOR]: {
    "deepseek-v4-flash": { contextWindow: 1000000, maxOutputTokens: 384000 },
    "deepseek-v4-pro": { contextWindow: 1000000, maxOutputTokens: 384000 },
    "mimo-v2.5": { contextWindow: 1000000, maxOutputTokens: 128000 },
    "mimo-v2.5-pro": { contextWindow: 1048576, maxOutputTokens: 128000 },
    "mimo-v2-omni": { contextWindow: 262144, maxOutputTokens: 128000 },
    "mimo-v2-pro": { contextWindow: 1048576, maxOutputTokens: 128000 },
    "kimi-k2.6": { contextWindow: 262144, maxOutputTokens: 65536 },
    "kimi-k2.5": { contextWindow: 262144, maxOutputTokens: 65536 },
    "glm-5.1": { contextWindow: 202752, maxOutputTokens: 32768 },
    "glm-5": { contextWindow: 202752, maxOutputTokens: 32768 },
    "minimax-m2.7": { contextWindow: 204800, maxOutputTokens: 131072 },
    "minimax-m2.5": { contextWindow: 204800, maxOutputTokens: 65536 },
    "qwen3.6-plus": { contextWindow: 262144, maxOutputTokens: 65536 },
    "qwen3.5-plus": { contextWindow: 262144, maxOutputTokens: 65536 },
    "hy3-preview": { contextWindow: 256000, maxOutputTokens: 64000 },
    "ring-2.6-1t": { contextWindow: 262000, maxOutputTokens: 66000 },
  },
  [ZEN_VENDOR]: {
    "deepseek-v4-flash-free": { contextWindow: 200000, maxOutputTokens: 128000 },
    "minimax-m2.5-free": { contextWindow: 204800, maxOutputTokens: 131072 },
    "qwen3.6-plus": { contextWindow: 262144, maxOutputTokens: 65536 },
    "qwen3.6-plus-free": { contextWindow: 262144, maxOutputTokens: 65536 },
    "qwen3.5-plus": { contextWindow: 262144, maxOutputTokens: 65536 },
    "trinity-large-preview-free": { contextWindow: 131072, maxOutputTokens: 131072 },
    "nemotron-3-super-free": { contextWindow: 204800, maxOutputTokens: 128000 },
    "big-pickle": { contextWindow: 200000, maxOutputTokens: 128000 },
  },
};

const VISION_CAPABLE_MODELS = new Set([
  "minimax-m2.7",
  "minimax-m2.5",
  "minimax-m2.5-free",
  "kimi-k2.6",
  "kimi-k2.5",
  "glm-5.1",
  "glm-5",
  "mimo-v2.5",
  "mimo-v2.5-pro",
  "mimo-v2-omni",
  "mimo-v2-pro",
  "qwen3.6-plus",
  "qwen3.6-plus-free",
  "qwen3.5-plus",
]);

export function isFreshModelMetadata(
  snapshot: CachedModelMetadataSnapshot,
): boolean {
  return Date.now() - snapshot.fetchedAt < MODEL_METADATA_CACHE_TTL_MS;
}

export function toEffectiveModelId(
  modelId: string,
  vendor: ProviderVendor,
): string {
  return `${vendor}:${modelId}::${MODEL_METADATA_REVISION}`;
}

export function bundledModelMetadataSnapshot(): CachedModelMetadataSnapshot {
  return {
    fetchedAt: 0,
    providers: {
      [GO_VENDOR]: bundledModelMetadataForProvider(GO_VENDOR),
      [ZEN_VENDOR]: bundledModelMetadataForProvider(ZEN_VENDOR),
    },
  };
}

export function fallbackModelMetadata(
  modelId: string,
  vendor: ProviderVendor,
): ModelMetadataFields | undefined {
  const limits = MODEL_LIMITS_BY_PROVIDER[vendor][modelId];
  const supportsVision = VISION_CAPABLE_MODELS.has(modelId);
  const status =
    vendor === ZEN_VENDOR && modelId === "minimax-m2.5-free"
      ? "deprecated"
      : undefined;

  if (!limits && !supportsVision && !status && !supportsReasoning(modelId)) {
    return undefined;
  }

  return {
    contextWindow: limits?.contextWindow,
    maxOutputTokens: limits?.maxOutputTokens,
    supportsVision: supportsVision || undefined,
    reasoning: supportsReasoning(modelId) || undefined,
    status,
  };
}

export function normalizeModelsDevSnapshot(
  data: ModelsDevResponse,
): CachedModelMetadataSnapshot {
  return {
    fetchedAt: Date.now(),
    providers: {
      [GO_VENDOR]: normalizeModelsDevProvider(
        data[MODELS_DEV_PROVIDER_BY_VENDOR[GO_VENDOR]]?.models ?? {},
      ),
      [ZEN_VENDOR]: normalizeModelsDevProvider(
        data[MODELS_DEV_PROVIDER_BY_VENDOR[ZEN_VENDOR]]?.models ?? {},
      ),
    },
  };
}

export function normalizeLiveModelMetadata(
  model: ModelListEntry,
): ModelMetadataFields | undefined {
  return normalizeModelMetadataFields({
    contextWindow: positiveNumber(
      model.contextWindow ?? model.context_window ?? model.limit?.context,
    ),
    maxOutputTokens: positiveNumber(
      model.maxOutputTokens ?? model.max_output_tokens ?? model.limit?.output,
    ),
    supportsVision: detectVisionSupport(
      model.modalities,
      model.imageInput ?? model.image_input ?? model.attachment,
    ),
    reasoning:
      typeof model.reasoning === "boolean" ? model.reasoning : undefined,
    status: model.deprecated
      ? "deprecated"
      : typeof model.status === "string"
        ? model.status
        : undefined,
  });
}

export function resolveModelMetadata(
  modelId: string,
  vendor: ProviderVendor,
  snapshot: CachedModelMetadataSnapshot,
  liveModelMetadataById: Map<string, ModelMetadataFields>,
): ResolvedModelMetadata {
  const cachedMetadata = snapshot.providers[vendor][modelId];
  const liveMetadata = liveModelMetadataById.get(modelId);
  const fallbackMetadata = fallbackModelMetadata(modelId, vendor);

  return {
    contextWindow:
      liveMetadata?.contextWindow ??
      cachedMetadata?.contextWindow ??
      fallbackMetadata?.contextWindow ??
      DEFAULT_MODEL_LIMITS.contextWindow,
    maxOutputTokens:
      liveMetadata?.maxOutputTokens ??
      cachedMetadata?.maxOutputTokens ??
      fallbackMetadata?.maxOutputTokens ??
      DEFAULT_MODEL_LIMITS.maxOutputTokens,
    supportsVision:
      liveMetadata?.supportsVision ??
      cachedMetadata?.supportsVision ??
      fallbackMetadata?.supportsVision ??
      false,
    reasoning:
      liveMetadata?.reasoning ??
      cachedMetadata?.reasoning ??
      fallbackMetadata?.reasoning ??
      supportsReasoning(modelId),
    status:
      liveMetadata?.status ??
      cachedMetadata?.status ??
      fallbackMetadata?.status,
    source: liveMetadata
      ? "live"
      : cachedMetadata
        ? "models.dev"
        : fallbackMetadata
          ? "fallback"
          : "default",
  };
}

export function hasExplicitModelLimits(
  modelId: string,
  vendor: ProviderVendor,
): boolean {
  return Boolean(fallbackModelMetadata(modelId, vendor));
}

function bundledModelMetadataForProvider(
  vendor: ProviderVendor,
): Record<string, ModelMetadataFields> {
  return Object.fromEntries(
    Object.keys(MODEL_LIMITS_BY_PROVIDER[vendor]).flatMap((modelId) => {
      const metadata = fallbackModelMetadata(modelId, vendor);
      return metadata ? [[modelId, metadata] as const] : [];
    }),
  );
}

function normalizeModelsDevProvider(
  models: Record<string, ModelsDevModelRecord>,
): Record<string, ModelMetadataFields> {
  const normalized: Record<string, ModelMetadataFields> = {};

  for (const [modelId, model] of Object.entries(models)) {
    const metadata = normalizeModelMetadataFields({
      contextWindow: positiveNumber(model.limit?.context),
      maxOutputTokens: positiveNumber(model.limit?.output),
      supportsVision: detectVisionSupport(model.modalities, model.attachment),
      reasoning:
        typeof model.reasoning === "boolean" ? model.reasoning : undefined,
      status: typeof model.status === "string" ? model.status : undefined,
    });

    if (metadata) {
      normalized[modelId] = metadata;
    }
  }

  return normalized;
}

function normalizeModelMetadataFields(
  metadata: ModelMetadataFields,
): ModelMetadataFields | undefined {
  if (
    metadata.contextWindow === undefined &&
    metadata.maxOutputTokens === undefined &&
    metadata.supportsVision === undefined &&
    metadata.reasoning === undefined &&
    metadata.status === undefined
  ) {
    return undefined;
  }
  return metadata;
}

function detectVisionSupport(
  modalities: { input?: string[]; output?: string[] } | undefined,
  attachmentHint: boolean | undefined,
): boolean | undefined {
  const inputModalities = Array.isArray(modalities?.input)
    ? modalities.input
    : undefined;
  if (inputModalities?.length) {
    return inputModalities.some((modality) => modality !== "text");
  }
  return typeof attachmentHint === "boolean" ? attachmentHint : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined;
}

function supportsReasoning(modelId: string): boolean {
  return /^(deepseek-|glm-|kimi-|qwen3(?:\.|-))/i.test(modelId);
}