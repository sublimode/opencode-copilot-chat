const assert = require("node:assert/strict");
const test = require("node:test");

const {
  normalizeGoogleFullResponse,
  normalizeGoogleStreamEvent,
  normalizeResponsesStreamEvent,
  resolveModelRouting,
} = require("../out/routing.js");
const { GO_VENDOR, ZEN_VENDOR } = require("../out/providerTypes.js");

const GO_PROVIDER = {
  vendor: GO_VENDOR,
  chatCompletionsUrl: "https://go.example/v1/chat/completions",
  messagesUrl: "https://go.example/v1/messages",
  modelsUrl: "https://go.example/v1/models",
};

const ZEN_PROVIDER = {
  vendor: ZEN_VENDOR,
  chatCompletionsUrl: "https://zen.example/v1/chat/completions",
  messagesUrl: "https://zen.example/v1/messages",
  responsesUrl: "https://zen.example/v1/responses",
  modelsUrl: "https://zen.example/v1/models",
};

test("normalizeResponsesStreamEvent normalizes text deltas", () => {
  assert.deepStrictEqual(
    normalizeResponsesStreamEvent({
      type: "response.output_text.delta",
      delta: "hello",
    }),
    {
      choices: [
        {
          index: 0,
          delta: { content: "hello" },
          finish_reason: null,
        },
      ],
    },
  );
});

test("normalizeResponsesStreamEvent normalizes function-call and completion events", () => {
  assert.deepStrictEqual(
    normalizeResponsesStreamEvent({
      type: "response.output_item.added",
      output_index: 2,
      item: {
        type: "function_call",
        name: "search",
        call_id: "call_123",
      },
    }),
    {
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 2,
                id: "call_123",
                type: "function",
                function: { name: "search", arguments: "" },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    },
  );

  assert.deepStrictEqual(
    normalizeResponsesStreamEvent({
      type: "response.function_call_arguments.delta",
      output_index: 2,
      delta: '{"q":"abc"}',
    }),
    {
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 2,
                function: { arguments: '{"q":"abc"}' },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    },
  );

  assert.deepStrictEqual(
    normalizeResponsesStreamEvent({
      type: "response.completed",
      response: {
        stop_reason: "completed",
        usage: {
          input_tokens: 11,
          output_tokens: 7,
          input_tokens_details: { cached_tokens: 3 },
        },
      },
    }),
    {
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 11,
        completion_tokens: 7,
        total_tokens: 18,
        prompt_tokens_details: { cached_tokens: 3 },
      },
    },
  );

  assert.deepStrictEqual(
    normalizeResponsesStreamEvent({ type: "response.unknown" }),
    { choices: [] },
  );
});

test("normalizeGoogleStreamEvent keeps text, thought and finish reasons", () => {
  assert.deepStrictEqual(
    normalizeGoogleStreamEvent({
      candidates: [
        {
          content: {
            parts: [
              { text: "thinking", thought: true },
              { text: "answer" },
            ],
          },
          finishReason: "STOP",
        },
      ],
      usageMetadata: {
        promptTokenCount: 9,
        candidatesTokenCount: 4,
        thoughtsTokenCount: 2,
        totalTokenCount: 15,
      },
    }),
    {
      choices: [
        {
          index: 0,
          delta: {
            content: "answer",
            reasoning_content: "thinking",
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 9,
        completion_tokens: 6,
        total_tokens: 15,
      },
    },
  );

  assert.deepStrictEqual(
    normalizeGoogleStreamEvent({
      candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }],
    }),
    {
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: "length",
        },
      ],
    },
  );
});

test("normalizeGoogleFullResponse preserves function calls", () => {
  assert.deepStrictEqual(
    normalizeGoogleFullResponse({
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: {
                  name: "lookupWeather",
                  args: { city: "Recife" },
                },
              },
            ],
          },
          finishReason: "STOP",
        },
      ],
    }),
    {
      choices: [
        {
          index: 0,
          message: {
            tool_calls: [
              {
                id: "",
                type: "function",
                function: {
                  name: "lookupWeather",
                  arguments: '{"city":"Recife"}',
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    },
  );
});

test("resolveModelRouting chooses the expected transport family", () => {
  assert.deepStrictEqual(resolveModelRouting("gpt-4.1", ZEN_PROVIDER), {
    endpointKind: "responses",
    endpointUrl: "https://zen.example/v1/responses",
    sdkPackage: "@ai-sdk/openai",
  });

  assert.deepStrictEqual(resolveModelRouting("gemini-2.5-pro", ZEN_PROVIDER), {
    endpointKind: "google",
    endpointUrl: "https://zen.example/v1/models/gemini-2.5-pro",
    sdkPackage: "@ai-sdk/google",
  });

  assert.deepStrictEqual(resolveModelRouting("claude-sonnet-4", ZEN_PROVIDER), {
    endpointKind: "messages",
    endpointUrl: "https://zen.example/v1/messages",
    sdkPackage: "@ai-sdk/anthropic",
  });

  assert.deepStrictEqual(resolveModelRouting("minimax-m2.5", GO_PROVIDER), {
    endpointKind: "messages",
    endpointUrl: "https://go.example/v1/messages",
    sdkPackage: "@ai-sdk/anthropic",
  });

  assert.deepStrictEqual(resolveModelRouting("deepseek-v4-flash", GO_PROVIDER), {
    endpointKind: "chat-completions",
    endpointUrl: "https://go.example/v1/chat/completions",
    sdkPackage: "@ai-sdk/openai-compatible",
  });
});