<h1 align="center">Project Anase</h1>

<p align="center">Your AI girlfriend & companion — an open-source platform for building intimate, intelligent virtual characters that live alongside you.</p>

<p align="center">
  <a href="https://github.com/rocky2431/anima/blob/main/LICENSE"><img src="https://img.shields.io/github/license/rocky2431/anima.svg?style=flat&colorA=080f12&colorB=1fa669"></a>
</p>

> [!NOTE]
> This project is built upon [Project AIRI](https://github.com/moeru-ai/airi) by the moeru-ai team. We deeply appreciate the original team's outstanding work in building such a comprehensive AI companion foundation. Project Anase extends and customizes it with a focus on the AI girlfriend & companion experience.

> [!WARNING]
> This project is under active development. APIs and features may change without notice.

## What is Anase?

Anase is a full-stack AI companion platform that brings virtual characters to life across **web**, **desktop**, and **mobile**. Unlike simple chatbots, Anase gives your AI companion the ability to:

- **See your screen** — understand what you're working on and offer contextual help
- **Remember everything** — build long-term memories from your conversations and activities
- **Be proactive** — initiate conversations based on time, mood, and context
- **Learn your preferences** — adapt personality and responses through a skills system
- **Live everywhere** — web browser, Electron desktop app, or mobile (Capacitor)

## Architecture

```
+-----------------------------------------------------+
|                   Frontend Apps                      |
|  stage-web (Browser) . stage-tamagotchi (Desktop)   |
|  stage-pocket (Mobile)                              |
+-----------------------------------------------------+
|                   Core Packages                      |
|  stage-ui . persona-engine . skills-engine          |
|  context-engine . plugin-sdk . server-runtime       |
+-----------------------------------------------------+
|                   Services                           |
|  anase-brain . discord-bot . telegram-bot           |
|  minecraft . twitter-services                       |
+-----------------------------------------------------+
|                   Plugins                            |
|  mcp-hub . skills . context-engine . homeassistant  |
|  bilibili-laplace . claude-code . web-extension     |
+-----------------------------------------------------+
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vue 3, Pinia, VueUse, UnoCSS |
| Desktop | Electron |
| Mobile | Capacitor (iOS/Android) |
| LLM | [Vercel AI SDK](https://sdk.vercel.ai/) (`@ai-sdk/openai`, `@ai-sdk/anthropic`) |
| 3D/Live2D | Three.js, PixiJS, Live2D Cubism |
| Backend | Hono, Better SQLite3, LanceDB |
| Build | pnpm workspaces, Turborepo, tsdown |

## Quick Start

### Prerequisites

- Node.js 23+
- pnpm (via corepack)

### Development

```shell
# Install dependencies
pnpm install

# Start web version (browser)
pnpm dev

# Start desktop version (Electron)
pnpm dev:tamagotchi

# Start mobile version
pnpm dev:pocket

# Run tests
pnpm test
```

### Build

```shell
pnpm build              # All packages + apps
pnpm build:web          # Web app only
pnpm build:tamagotchi   # Desktop app only
```

## Project Structure

| Directory | Purpose |
|-----------|---------|
| `apps/` | Deployable applications (stage-web, stage-tamagotchi, stage-pocket, server) |
| `packages/` | Shared libraries (~35 packages) |
| `services/` | Bot integrations (Discord, Telegram, Minecraft, Twitter) |
| `plugins/` | Anase plugins (MCP hub, skills, context engine, Home Assistant, etc.) |
| `crates/` | Rust native modules (input capture, audio transcription) |
| `docs/` | Documentation site |

## Key Features

### Context Engine
Three-layer memory system (working memory, real-time vector search, structured document store) that captures activities, processes screenshots, and builds long-term understanding of the user.

### Persona Engine
Emotion state machine with proactive trigger system. 11 trigger conditions (morning greeting, rest reminder, late night care, etc.) with Do-Not-Disturb policies.

### Skills System
Extensible prompt enhancement through SKILL.md files. Skills provide domain-specific knowledge and behavior modifications without code changes.

### Plugin Architecture
Full plugin lifecycle management with WebSocket transport, capability negotiation, and configuration protocols. Supports both built-in and third-party plugins.

### MCP Integration
Model Context Protocol support for connecting external tools and data sources to the AI companion.

## Supported LLM Providers

Powered by [Vercel AI SDK](https://sdk.vercel.ai/) with OpenAI-compatible provider interface:

OpenAI, Anthropic Claude, Google Gemini, DeepSeek, Qwen, xAI, Groq, Mistral, OpenRouter, Ollama, vLLM, SGLang, Together.ai, Fireworks.ai, Cloudflare Workers AI, SiliconFlow, and any OpenAI-compatible endpoint.

## Current Capabilities

- **Brain**: Chat across Discord, Telegram; play Minecraft & Factorio; long-term memory
- **Ears**: Browser audio input, Discord voice, client-side speech recognition & talking detection
- **Mouth**: ElevenLabs voice synthesis
- **Body**: VRM & Live2D model support with auto-blink, auto-look-at, idle eye movement

## Contributing

See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for guidelines.

## Acknowledgements

- [Project AIRI](https://github.com/moeru-ai/airi) — the upstream project this work is based on. Thanks to the moeru-ai team for building the foundational architecture, plugin system, and multi-platform infrastructure.
- [Reka UI](https://github.com/unovue/reka-ui) for UI components
- [pixiv/ChatVRM](https://github.com/pixiv/ChatVRM) for VRM inspiration
- [Vercel AI SDK](https://sdk.vercel.ai/) for LLM integration
- UI design inspired by [Cookard](https://store.steampowered.com/app/2919650/Cookard/), [UNBEATABLE](https://store.steampowered.com/app/2240620/UNBEATABLE/)

## License

[MIT](./LICENSE)
