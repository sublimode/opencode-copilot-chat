const assert = require("node:assert/strict");
const test = require("node:test");

const { buildOpenCodeGatewayAuthHeaders } = require("../out/openCodeAuth.js");

test("buildOpenCodeGatewayAuthHeaders matches OpenCode messages auth", () => {
  assert.deepStrictEqual(buildOpenCodeGatewayAuthHeaders("messages", "sk-test"), {
    "x-api-key": "sk-test",
    "anthropic-version": "2023-06-01",
  });
});

test("buildOpenCodeGatewayAuthHeaders matches OpenCode google auth", () => {
  assert.deepStrictEqual(buildOpenCodeGatewayAuthHeaders("google", "sk-test"), {
    "x-goog-api-key": "sk-test",
  });
});

test("buildOpenCodeGatewayAuthHeaders matches OpenCode bearer auth", () => {
  assert.deepStrictEqual(buildOpenCodeGatewayAuthHeaders("chat-completions", "sk-test"), {
    Authorization: "Bearer sk-test",
  });

  assert.deepStrictEqual(buildOpenCodeGatewayAuthHeaders("responses", "sk-test"), {
    Authorization: "Bearer sk-test",
  });
});