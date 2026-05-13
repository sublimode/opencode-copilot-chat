# OpenCode Go BYOK Provider

VS Code extension that adds OpenCode Go models to VS Code Chat and GitHub Copilot Chat through the official Language Model Chat Provider API.

This is a BYOK provider. You bring your OpenCode Go API key, then select OpenCode Go models from Copilot Chat's model picker.

## Requirements

- Latest VS Code with the Language Model Chat Provider API.
- GitHub Copilot Chat installed and signed in.
- For Copilot Business or Enterprise, the organization policy **Bring Your Own Language Model Key in VS Code** must be enabled.
- An OpenCode Go API key.

## Development

Install dependencies:

```bash
npm install
```

Compile:

```bash
npm run compile
```

Press `F5` in VS Code to launch an Extension Development Host.

## Usage

1. In the Extension Development Host, open GitHub Copilot Chat.
2. Open the model dropdown.
3. Choose **Manage Models**.
4. Select **OpenCode Go**.
5. Enter your OpenCode Go API key when prompted.
6. Select the OpenCode Go models you want to add.
7. Pick one of those models in Copilot Chat.

If the models are visible in the Language Models editor but not in the Copilot Chat picker, hover over the model row and enable the eye icon. The Language Models editor is the inventory; the chat picker only shows models whose visibility is enabled.

You can also run:

```text
OpenCode Go: Manage Provider
```

or:

```text
OpenCode Go: Set API Key
```

For troubleshooting, run:

```text
OpenCode Go: Diagnostics
```

It opens a markdown report with the models returned by `vscode.lm.selectChatModels({ vendor: "opencodego" })`.

## Models

The extension fetches the current model list from:

```text
https://opencode.ai/zen/go/v1/models
```

OpenCode Go's model-list endpoint currently returns model IDs only, so the extension keeps a bundled model metadata table for context window and max output tokens. The Language Models view and Copilot Chat picker use those per-model values instead of one fixed limit for every model.

If the live list cannot be fetched, it falls back to a bundled list that includes models such as:

- `kimi-k2.6`
- `glm-5.1`
- `deepseek-v4-pro`
- `deepseek-v4-flash`
- `qwen3.6-plus`
- `minimax-m2.7`
- `mimo-v2.5-pro`

Current bundled limits include:

| Model | Context window | Max output tokens |
| --- | ---: | ---: |
| `deepseek-v4-pro` / `deepseek-v4-flash` | 1,000,000 | 384,000 |
| `mimo-v2.5-pro` / `mimo-v2-pro` | 1,048,576 | 128,000 |
| `mimo-v2.5` | 1,000,000 | 128,000 |
| `kimi-k2.6` / `kimi-k2.5` | 262,144 | 65,536 |
| `qwen3.6-plus` / `qwen3.5-plus` | 262,144 | 65,536 |
| `minimax-m2.7` | 204,800 | 131,072 |
| `minimax-m2.5` | 204,800 | 65,536 |
| `glm-5.1` / `glm-5` | 202,752 | 32,768 |
| `mimo-v2-omni` | 262,144 | 65,536 |
| `hy3-preview` | 262,144 | 128,000 |

You can override those values with `opencodego.maxInputTokens` and `opencodego.maxTokens`. Leave either setting at `0` to use the bundled model-specific maximum.

## Notes

OpenCode Go exposes most models through:

```text
https://opencode.ai/zen/go/v1/chat/completions
```

MiniMax M2 models use:

```text
https://opencode.ai/zen/go/v1/messages
```

This provider advertises tool-calling support using both the public VS Code capability name and the internal capability name currently read by bundled Copilot Chat. Tool schemas are forwarded to OpenCode Go using OpenAI-compatible or Anthropic-compatible request shapes, depending on the model endpoint.
