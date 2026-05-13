import * as vscode from "vscode";

const VENDOR = "opencodego";
const SECRET_KEY = "opencodego.apiKey";
const MODELS_URL = "https://opencode.ai/zen/go/v1/models";
const CHAT_COMPLETIONS_URL = "https://opencode.ai/zen/go/v1/chat/completions";
const MESSAGES_URL = "https://opencode.ai/zen/go/v1/messages";

type ApiRole = "user" | "assistant";

interface OpenCodeGoModel extends vscode.LanguageModelChatInformation {
  endpointKind: "chat-completions" | "messages";
  category?: {
    label: string;
    order: number;
  };
  isUserSelectable?: boolean;
}

interface ModelListResponse {
  data?: Array<{
    id?: string;
    owned_by?: string;
  }>;
}

interface ApiMessage {
  role: ApiRole;
  content: string;
}

interface ApiSettings {
  temperature: number;
  maxOutputTokensOverride: number;
  maxInputTokensOverride: number;
}

interface ModelLimits {
  contextWindow: number;
  maxOutputTokens: number;
}

const DEFAULT_MODEL_LIMITS: ModelLimits = {
  contextWindow: 262144,
  maxOutputTokens: 65536
};

const MODEL_LIMITS: Record<string, ModelLimits> = {
  "deepseek-v4-flash": { contextWindow: 1000000, maxOutputTokens: 384000 },
  "deepseek-v4-pro": { contextWindow: 1000000, maxOutputTokens: 384000 },
  "mimo-v2.5": { contextWindow: 1000000, maxOutputTokens: 128000 },
  "mimo-v2.5-pro": { contextWindow: 1048576, maxOutputTokens: 128000 },
  "mimo-v2-omni": { contextWindow: 262144, maxOutputTokens: 65536 },
  "mimo-v2-pro": { contextWindow: 1048576, maxOutputTokens: 128000 },
  "kimi-k2.6": { contextWindow: 262144, maxOutputTokens: 65536 },
  "kimi-k2.5": { contextWindow: 262144, maxOutputTokens: 65536 },
  "glm-5.1": { contextWindow: 202752, maxOutputTokens: 32768 },
  "glm-5": { contextWindow: 202752, maxOutputTokens: 32768 },
  "minimax-m2.7": { contextWindow: 204800, maxOutputTokens: 131072 },
  "minimax-m2.5": { contextWindow: 204800, maxOutputTokens: 65536 },
  "qwen3.6-plus": { contextWindow: 262144, maxOutputTokens: 65536 },
  "qwen3.5-plus": { contextWindow: 262144, maxOutputTokens: 65536 },
  "hy3-preview": { contextWindow: 262144, maxOutputTokens: 128000 }
};

type CopilotCompatibleCapabilities = vscode.LanguageModelChatCapabilities & {
  supportsToolCalling: boolean;
  supportsImageToText: boolean;
};

interface OpenAiToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: object;
  };
}

interface AnthropicToolDefinition {
  name: string;
  description: string;
  input_schema: object;
}

export function activate(context: vscode.ExtensionContext) {
  const provider = new OpenCodeGoProvider(context);

  context.subscriptions.push(
    vscode.lm.registerLanguageModelChatProvider(VENDOR, provider),
    vscode.commands.registerCommand("opencodego.manage", () => provider.manage()),
    vscode.commands.registerCommand("opencodego.diagnostics", () => provider.showDiagnostics()),
    vscode.commands.registerCommand("opencodego.setApiKey", () => provider.setApiKey())
  );
}

export function deactivate() {
  // Nothing to clean up.
}

class OpenCodeGoProvider implements vscode.LanguageModelChatProvider<OpenCodeGoModel> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeLanguageModelChatInformation = this.changeEmitter.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  async manage(): Promise<void> {
    const choice = await vscode.window.showQuickPick(
      [
        { label: "Set API Key", action: "set" as const },
        { label: "Clear API Key", action: "clear" as const },
        { label: "Refresh Models", action: "refresh" as const }
      ],
      {
        title: "Manage OpenCode Go",
        placeHolder: "Choose an action"
      }
    );

    if (!choice) {
      return;
    }

    if (choice.action === "set") {
      await this.setApiKey();
      return;
    }

    if (choice.action === "clear") {
      await this.context.secrets.delete(SECRET_KEY);
      this.changeEmitter.fire();
      vscode.window.showInformationMessage("OpenCode Go API key cleared.");
      return;
    }

    this.changeEmitter.fire();
    vscode.window.showInformationMessage("OpenCode Go models refreshed.");
  }

  async setApiKey(): Promise<void> {
    const apiKey = await vscode.window.showInputBox({
      title: "OpenCode Go API Key",
      prompt: "Paste your OpenCode Go API key. It will be stored securely in VS Code SecretStorage.",
      password: true,
      ignoreFocusOut: true
    });

    if (!apiKey) {
      return;
    }

    await this.context.secrets.store(SECRET_KEY, apiKey.trim());
    this.changeEmitter.fire();
    vscode.window.showInformationMessage("OpenCode Go API key saved.");
  }

  async showDiagnostics(): Promise<void> {
    const models = await vscode.lm.selectChatModels({ vendor: VENDOR });
    const lines = models.map((model) => [
      `- ${model.id}`,
      `  name: ${model.name}`,
      `  family: ${model.family}`,
      `  vendor: ${model.vendor}`,
      `  version: ${model.version}`,
      `  maxInputTokens: ${model.maxInputTokens}`,
      `  maxOutputTokens: ${modelLimits(model.id).maxOutputTokens}`,
      ...(MODEL_LIMITS[model.id] ? [] : ["  limits: using default fallback"])
    ].join("\n"));

    const content = [
      "# OpenCode Go Diagnostics",
      "",
      `Models visible through vscode.lm.selectChatModels({ vendor: "${VENDOR}" }): ${models.length}`,
      "",
      ...lines
    ].join("\n");

    const doc = await vscode.workspace.openTextDocument({ content, language: "markdown" });
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
  }

  async provideLanguageModelChatInformation(
    options: vscode.PrepareLanguageModelChatModelOptions,
    token: vscode.CancellationToken
  ): Promise<OpenCodeGoModel[]> {
    const apiKey = await this.context.secrets.get(SECRET_KEY);

    if (!apiKey) {
      if (options.silent) {
        return [];
      }

      await this.setApiKey();
    }

    if (token.isCancellationRequested) {
      return [];
    }

    const models = await this.fetchModels();
    const settings = getSettings();

    return models.map((modelId) => {
      const limits = modelLimits(modelId, settings);

      return {
        id: modelId,
        name: `OpenCode Go / ${formatModelName(modelId)}`,
        family: `opencodego-${modelId}`,
        version: "1.0.0",
        detail: "OpenCode Go",
        tooltip: `OpenCode Go model: ${modelId}`,
        category: {
          label: "OpenCode Go",
          order: 2
        },
        isUserSelectable: true,
        maxInputTokens: limits.contextWindow,
        maxOutputTokens: limits.maxOutputTokens,
        capabilities: modelCapabilities(),
        endpointKind: modelEndpointKind(modelId)
      };
    });
  }

  async provideLanguageModelChatResponse(
    model: OpenCodeGoModel,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken
  ): Promise<void> {
    const apiKey = await this.context.secrets.get(SECRET_KEY);

    if (!apiKey) {
      throw new Error("OpenCode Go API key is required. Use 'OpenCode Go: Manage Provider' to set it.");
    }

    const apiMessages = normalizeMessages(messages.map(convertMessage));
    const settings = getSettings();
    const limits = modelLimits(model.id, settings);

    if (model.endpointKind === "messages") {
      await streamAnthropicMessages(apiKey, model.id, apiMessages, options, settings, limits, progress, token);
      return;
    }

    await streamChatCompletions(apiKey, model.id, apiMessages, options, settings, limits, progress, token);
  }

  async provideTokenCount(
    _model: OpenCodeGoModel,
    text: string | vscode.LanguageModelChatRequestMessage,
    _token: vscode.CancellationToken
  ): Promise<number> {
    const value = typeof text === "string" ? text : messageText(text);
    return Math.ceil(value.length / 4);
  }

  private async fetchModels(): Promise<string[]> {
    try {
      const response = await fetch(MODELS_URL);

      if (!response.ok) {
        throw new Error(`Model list request failed (${response.status}): ${response.statusText}`);
      }

      const data = await response.json() as ModelListResponse;
      const ids = data.data
        ?.map((model) => model.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);

      return ids?.length ? ids : fallbackModels();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showWarningMessage(`Could not fetch OpenCode Go model list. Using bundled model list. ${message}`);
      return fallbackModels();
    }
  }
}

async function streamChatCompletions(
  apiKey: string,
  modelId: string,
  messages: ApiMessage[],
  options: vscode.ProvideLanguageModelChatResponseOptions,
  settings: ApiSettings,
  limits: ModelLimits,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  token: vscode.CancellationToken
): Promise<void> {
  const tools = mapOpenAiTools(options.tools);

  await streamOpenCodeResponse(
    CHAT_COMPLETIONS_URL,
    apiKey,
    {
      model: modelId,
      messages,
      temperature: settings.temperature,
      max_tokens: limits.maxOutputTokens,
      stream: true,
      ...(tools.length ? { tools, tool_choice: toolChoice(options.toolMode) } : {})
    },
    progress,
    token,
    extractChatCompletionChunk,
    extractChatCompletionText
  );
}

async function streamAnthropicMessages(
  apiKey: string,
  modelId: string,
  messages: ApiMessage[],
  options: vscode.ProvideLanguageModelChatResponseOptions,
  settings: ApiSettings,
  limits: ModelLimits,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  token: vscode.CancellationToken
): Promise<void> {
  const tools = mapAnthropicTools(options.tools);

  await streamOpenCodeResponse(
    MESSAGES_URL,
    apiKey,
    {
      model: modelId,
      messages,
      temperature: settings.temperature,
      max_tokens: limits.maxOutputTokens,
      stream: true,
      ...(tools.length ? { tools, tool_choice: anthropicToolChoice(options.toolMode) } : {})
    },
    progress,
    token,
    extractAnthropicChunk,
    extractAnthropicText
  );
}

function mapOpenAiTools(tools: readonly vscode.LanguageModelChatTool[] | undefined): OpenAiToolDefinition[] {
  return (tools ?? []).map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema ?? { type: "object", properties: {} }
    }
  }));
}

function mapAnthropicTools(tools: readonly vscode.LanguageModelChatTool[] | undefined): AnthropicToolDefinition[] {
  return (tools ?? []).map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema ?? { type: "object", properties: {} }
  }));
}

function toolChoice(mode: vscode.LanguageModelChatToolMode): "auto" | "required" {
  return mode === vscode.LanguageModelChatToolMode.Required ? "required" : "auto";
}

function anthropicToolChoice(mode: vscode.LanguageModelChatToolMode): { type: "auto" | "any" } {
  return { type: mode === vscode.LanguageModelChatToolMode.Required ? "any" : "auto" };
}

async function streamOpenCodeResponse(
  url: string,
  apiKey: string,
  body: unknown,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  token: vscode.CancellationToken,
  extractStreamText: (data: unknown) => string | undefined,
  extractFullText: (data: unknown) => string | undefined
): Promise<void> {
  const controller = new AbortController();
  const cancellation = token.onCancellationRequested(() => controller.abort());

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`OpenCode Go API request failed (${response.status}): ${detail || response.statusText}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!response.body || !contentType.includes("text/event-stream")) {
      const data = await response.json();
      const text = extractFullText(data);
      if (text) {
        progress.report(new vscode.LanguageModelTextPart(text));
      }
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (!token.isCancellationRequested) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const event of events) {
        const text = parseServerSentEvent(event, extractStreamText);
        if (text) {
          progress.report(new vscode.LanguageModelTextPart(text));
        }
      }
    }

    const remaining = parseServerSentEvent(buffer, extractStreamText);
    if (remaining) {
      progress.report(new vscode.LanguageModelTextPart(remaining));
    }
  } finally {
    cancellation.dispose();
  }
}

function parseServerSentEvent(event: string, extractText: (data: unknown) => string | undefined): string {
  const lines = event
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim());

  const chunks: string[] = [];

  for (const line of lines) {
    if (!line || line === "[DONE]") {
      continue;
    }

    try {
      const data = JSON.parse(line) as unknown;
      const text = extractText(data);
      if (text) {
        chunks.push(text);
      }
    } catch {
      // Ignore malformed SSE lines; the API may send comments or keep-alive frames.
    }
  }

  return chunks.join("");
}

function convertMessage(message: vscode.LanguageModelChatRequestMessage): ApiMessage {
  return {
    role: message.role === vscode.LanguageModelChatMessageRole.Assistant ? "assistant" : "user",
    content: messageText(message)
  };
}

function messageText(message: vscode.LanguageModelChatRequestMessage): string {
  return message.content.map(partToText).filter(Boolean).join("\n");
}

function partToText(part: vscode.LanguageModelInputPart | unknown): string {
  if (part instanceof vscode.LanguageModelTextPart) {
    return part.value;
  }

  if (part instanceof vscode.LanguageModelToolResultPart) {
    return part.content.map(partToText).filter(Boolean).join("\n");
  }

  if (part instanceof vscode.LanguageModelToolCallPart) {
    return `[Tool call: ${part.name} ${JSON.stringify(part.input)}]`;
  }

  if (typeof part === "string") {
    return part;
  }

  return "";
}

function normalizeMessages(messages: ApiMessage[]): ApiMessage[] {
  const normalized: ApiMessage[] = [];

  for (const message of messages) {
    if (!message.content.trim()) {
      continue;
    }

    const previous = normalized.at(-1);
    if (previous?.role === message.role) {
      previous.content = `${previous.content}\n\n${message.content}`;
    } else {
      normalized.push({ ...message });
    }
  }

  if (normalized[0]?.role === "assistant") {
    normalized.unshift({
      role: "user",
      content: "Continue the conversation based on the prior assistant message."
    });
  }

  return normalized.length ? normalized : [{ role: "user", content: "" }];
}

function extractChatCompletionChunk(data: unknown): string | undefined {
  if (!isRecord(data) || !Array.isArray(data.choices)) {
    return undefined;
  }

  const first = data.choices[0];
  if (!isRecord(first)) {
    return undefined;
  }

  const delta = first.delta;
  if (isRecord(delta) && typeof delta.content === "string") {
    return delta.content;
  }

  return undefined;
}

function extractChatCompletionText(data: unknown): string | undefined {
  if (!isRecord(data) || !Array.isArray(data.choices)) {
    return undefined;
  }

  const first = data.choices[0];
  if (!isRecord(first)) {
    return undefined;
  }

  const message = first.message;
  if (isRecord(message) && typeof message.content === "string") {
    return message.content;
  }

  if (typeof first.text === "string") {
    return first.text;
  }

  return undefined;
}

function extractAnthropicChunk(data: unknown): string | undefined {
  if (!isRecord(data)) {
    return undefined;
  }

  const delta = data.delta;
  if (isRecord(delta) && typeof delta.text === "string") {
    return delta.text;
  }

  return undefined;
}

function extractAnthropicText(data: unknown): string | undefined {
  if (!isRecord(data) || !Array.isArray(data.content)) {
    return undefined;
  }

  return data.content
    .map((part) => isRecord(part) && typeof part.text === "string" ? part.text : "")
    .join("");
}

function getSettings(): ApiSettings {
  const config = vscode.workspace.getConfiguration("opencodego");

  return {
    temperature: config.get("temperature", 0.2),
    maxOutputTokensOverride: config.get("maxTokens", 0),
    maxInputTokensOverride: config.get("maxInputTokens", 0)
  };
}

function modelLimits(modelId: string, settings = getSettings()): ModelLimits {
  const limits = MODEL_LIMITS[modelId] ?? DEFAULT_MODEL_LIMITS;
  const contextWindow = positiveOverride(settings.maxInputTokensOverride) ?? limits.contextWindow;
  const maxOutputTokens = positiveOverride(settings.maxOutputTokensOverride) ?? limits.maxOutputTokens;

  return {
    contextWindow,
    maxOutputTokens: Math.min(maxOutputTokens, contextWindow)
  };
}

function positiveOverride(value: number): number | undefined {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

function modelCapabilities(): CopilotCompatibleCapabilities {
  return {
    imageInput: false,
    toolCalling: 128,
    supportsImageToText: false,
    supportsToolCalling: true
  };
}

function modelEndpointKind(modelId: string): OpenCodeGoModel["endpointKind"] {
  return modelId.startsWith("minimax-m2.") ? "messages" : "chat-completions";
}

function formatModelName(modelId: string): string {
  return modelId
    .split("-")
    .map((part) => part.toUpperCase() === part ? part : part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function fallbackModels(): string[] {
  return [
    "minimax-m2.7",
    "minimax-m2.5",
    "kimi-k2.6",
    "kimi-k2.5",
    "glm-5.1",
    "glm-5",
    "deepseek-v4-pro",
    "deepseek-v4-flash",
    "qwen3.6-plus",
    "qwen3.5-plus",
    "mimo-v2-pro",
    "mimo-v2-omni",
    "mimo-v2.5-pro",
    "mimo-v2.5",
    "hy3-preview"
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
