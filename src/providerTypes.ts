export const GO_VENDOR = "opencodego" as const;
export const ZEN_VENDOR = "opencodezen" as const;

export type ProviderVendor = typeof GO_VENDOR | typeof ZEN_VENDOR;

export interface ProviderRoutingDefinition {
  vendor: ProviderVendor;
  chatCompletionsUrl: string;
  messagesUrl: string;
  modelsUrl: string;
  responsesUrl?: string;
}
