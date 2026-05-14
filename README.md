# OpenCode Go — BYOK Provider for Copilot

> **Bring Your Own Key.** Add [OpenCode Go](https://opencode.ai) models to VS Code and GitHub Copilot Chat through the official Language Model Chat Provider API.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.118%2B-blue)](https://code.visualstudio.com/)

---

## ✨ Features

- **BYOK** — supply your own OpenCode Go API key; no subscription upsell
- **Live model list** — fetches available models directly from the OpenCode Go API on startup
- **Bundled fallback** — works offline or if the API is unreachable, using a curated model table
- **Per-model token limits** — accurate context window and max output token values per model, not a single global cap
- **Tool-calling support** — forwards tool schemas using OpenAI-compatible or Anthropic-compatible request shapes automatically based on the model endpoint
- **Dual endpoint routing** — routes standard models to `/chat/completions` and MiniMax M2 models to `/messages` transparently
- **Diagnostics command** — one-click markdown report showing exactly which models VS Code has registered

---

## Requirements

- VS Code **1.118.0** or higher with the Language Model Chat Provider API
- **GitHub Copilot Chat** installed and signed in
- For Copilot Business or Enterprise: the organization policy **Bring Your Own Language Model Key in VS Code** must be enabled
- An **OpenCode Go API key** — get one at [opencode.ai](https://opencode.ai)

---

## ⚡ Quick Start

1. Install the extension (or press `F5` in the repo to launch a dev host).
2. Open **GitHub Copilot Chat**.
3. Click the **model picker** → **Manage Models…**
4. Select **OpenCode Go**.
5. Press `Enter` to accept the default **Group Name**.
6. Enter your **OpenCode Go API Key** when prompted — VS Code stores it as a secret.
7. Choose the models you want available in the picker.
8. Select any OpenCode Go model and start chatting.

> **Tip:** If a model appears in **Language Models** view but not in the chat picker, hover its row and click the eye icon to enable visibility.

---

## Commands

Run any command via the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`):

| Command | Description |
|---|---|
| `OpenCode Go: Manage Provider` | Manage the legacy fallback API key, refresh models, or test a stored key |
| `OpenCode Go: Set API Key` | Store or update a legacy fallback OpenCode Go API key |
| `OpenCode Go: Diagnostics` | Show a markdown report of all registered models |

For the native BYOK flow, prefer the gear icon in **Language Models**. VS Code will ask for a group name first, then the OpenCode Go API key.

---

## Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `opencodego.temperature` | `number` | `0.2` | Sampling temperature for chat completions (`0`–`2`) |
| `opencodego.maxTokens` | `number` | `0` | Max output token override — `0` uses the per-model bundled maximum |
| `opencodego.maxInputTokens` | `number` | `0` | Context window override — `0` uses the per-model bundled context size |
| `opencodego.debugReasoning` | `boolean` | `false` | Write provider `reasoning_content` to **Output → OpenCode Go** for debugging |

---

## Models

The extension fetches the live model list from:

```
https://opencode.ai/zen/go/v1/models
```

Because the endpoint returns IDs only, a bundled metadata table provides accurate context window and max output tokens per model. If the live fetch fails, the bundled list is used as a fallback.

VS Code and Copilot read separate input/output metadata fields for UI display. OpenCode Go models can have very large output limits, so the extension advertises a small response reserve to keep the Language Models table, model picker tooltip, and chat context indicator consistent while still sending each model's full bundled max output limit to the OpenCode Go API.

### Bundled model limits

| Model | Context window | Max output tokens |
|---|---:|---:|
| `deepseek-v4-pro` / `deepseek-v4-flash` | 1,000,000 | 384,000 |
| `mimo-v2.5-pro` / `mimo-v2-pro` | 1,048,576 | 128,000 |
| `mimo-v2.5` | 1,000,000 | 128,000 |
| `kimi-k2.6` / `kimi-k2.5` | 262,144 | 65,536 |
| `qwen3.6-plus` / `qwen3.5-plus` | 262,144 | 65,536 |
| `hy3-preview` | 262,144 | 128,000 |
| `mimo-v2-omni` | 262,144 | 65,536 |
| `minimax-m2.7` | 204,800 | 131,072 |
| `minimax-m2.5` | 204,800 | 65,536 |
| `glm-5.1` / `glm-5` | 202,752 | 32,768 |

Set `opencodego.maxInputTokens` or `opencodego.maxTokens` to a non-zero value to override the bundled defaults globally.

### Endpoint routing

Most models use the OpenAI-compatible chat completions endpoint:
```
https://opencode.ai/zen/go/v1/chat/completions
```

MiniMax M2 models (`minimax-m2.*`) are automatically routed to the Anthropic-compatible messages endpoint:
```
https://opencode.ai/zen/go/v1/messages
```

---

## Development

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode
npm run watch
```

Press `F5` in VS Code to launch an **Extension Development Host** with the extension loaded.

To package a `.vsix` for local install:

```bash
npm run package
```

---

## Contributing

Issues and pull requests are welcome. Please open an issue first for significant changes so we can discuss the approach.

---

## License

MIT — see [LICENSE](./LICENSE) for details.
