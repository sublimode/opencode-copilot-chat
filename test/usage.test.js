const assert = require("node:assert/strict");
const test = require("node:test");

const {
  cacheHitRatio,
  formatUsageLogLine,
  toProviderUsagePayload,
  withUsageTotals,
} = require("../out/usage.js");

test("withUsageTotals derives total tokens when prompt and completion exist", () => {
  assert.deepStrictEqual(
    withUsageTotals({ promptTokens: 11, completionTokens: 7 }),
    { promptTokens: 11, completionTokens: 7, totalTokens: 18 },
  );
});

test("cacheHitRatio uses cached input over prompt tokens", () => {
  assert.equal(cacheHitRatio({ promptTokens: 20, cachedTokens: 5 }), 25);
  assert.equal(cacheHitRatio({ promptTokens: 0, cachedTokens: 5 }), undefined);
});

test("formatUsageLogLine includes cache hit ratio and finish reason", () => {
  assert.equal(
    formatUsageLogLine({
      promptTokens: 20,
      completionTokens: 10,
      cachedTokens: 5,
      finishReason: "stop",
    }),
    "prompt=20 completion=10 total=30 cached=5 cacheHit=25.0% finishReason=stop",
  );
});

test("toProviderUsagePayload emits OpenAI-compatible usage payload", () => {
  assert.deepStrictEqual(
    toProviderUsagePayload({
      promptTokens: 9,
      completionTokens: 4,
      cachedTokens: 2,
    }),
    {
      prompt_tokens: 9,
      completion_tokens: 4,
      total_tokens: 13,
      prompt_tokens_details: { cached_tokens: 2 },
    },
  );
});