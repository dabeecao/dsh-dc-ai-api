# DC AI API Plugin for DeepSeek Harness (DSH)

<p align="center">
  <img src="./icon.svg" width="80" height="80" alt="DC AI API Logo" />
</p>

Integrates the **DC AI Gateway** (`https://dc-ai.dabeecao.org`) into DeepSeek Harness as a native model provider. Automatically discovers all available models, tailors reasoning (thinking) effort ladders per model family, recognizes vision support, and provides a real-time quota, usage, and cost monitoring dashboard in Settings.

---

## Features

- **Direct Gateway Integration**: Adds `dc-ai` as a single, clean model provider in DSH.
- **Dual API Protocols (Switchable with 1 Click)**:
  - **Responses API (`openai-responses`)**: Recommended modern protocol for reasoning & thinking models.
  - **Chat Completions (`openai-completions`)**: Traditional `/v1/chat/completions` protocol with streaming support.
- **Tailored Reasoning (Thinking) Ladder**:
  - **DeepSeek family**: 3 levels (`Off / High / Max`).
  - **GPT / Gemini / Claude**: 5 levels (`Off / Low / Medium / High / Max`).
  - **Grok / Other reasoning models**: 4 levels (`Off / Low / Medium / High`).
  - **Non-reasoning models**: Automatically disabled (`reasoningEfforts: false`).
- **Vision Support Detection**: Automatically identifies vision-capable models (e.g. Gemini, GPT, Claude, DeepSeek Flash) and filters out standalone image generation endpoints.
- **Dedicated Settings & Analytics Dashboard**:
  - Real-time 4-hour window quota tracking with countdown to reset.
  - Daily spendable quota and daily token consumption metrics.
  - Sliding window cost history table.
  - Built-in connection tester with latency ping (ms).
  - Modern bilingual UI (English / Tiếng Việt).
- **Offline Snapshot Fallback**: Bundled fallback catalog ensures all models remain available even before the API key is configured or during network outages.

---

## Online Installation

Install online using the DSH CLI:

```bash
# Using GitHub repository
dsh plugin --profile web add github:dabeecao/dsh-dc-ai-api

# Or using full git URL
dsh plugin --profile web add https://github.com/dabeecao/dsh-dc-ai-api.git
```

*(Replace `web` with your host profile name if you are using a custom profile).*

Then restart DSH or run:

```bash
docker compose restart
```

---

## Configuration

1. In DSH, open **Settings → DC AI API**.
2. Enter your API Key (e.g. `dc_...`) and click **Save Configuration**.
3. Alternatively, export `DC_AI_API_KEY` in your environment or save it to `.credentials.yaml`.

### Available Options in `cordis.patch.yml`

| Field | Default | Description |
| --- | --- | --- |
| `route` | `dc-ai` | Provider id registered in DSH |
| `displayName` | `DC AI` | Provider display name |
| `baseURL` | `https://dc-ai.dabeecao.org` | Gateway URL |
| `apiKey` | `""` | Direct API key (optional; saved securely) |
| `apiKeyEnv` | `DC_AI_API_KEY` | Credential reference environment variable |
| `api` | `openai-responses` | Protocol: `openai-responses` or `openai-completions` |
| `syncOnStart` | `true` | Auto-refresh catalog on startup |
| `refreshHours` | `6` | Periodic refresh interval (hours; `0` disables) |
| `includeModels` | `[]` | Whitelist specific model IDs (empty = all) |
| `excludeModels` | `[]` | Blacklist specific model IDs |
| `requestTimeoutMs` | `30000` | Gateway request timeout in milliseconds |

---

## License

[MIT](./LICENSE) © 2026 [dabeecao](https://github.com/dabeecao)
