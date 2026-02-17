# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Project AIRI (`@proj-airi/root`) — an open-source AI virtual character / VTuber platform inspired by Neuro-sama. It provides a "soul container" that brings AI characters into our world across web, desktop, and mobile. Built with Vue 3, TypeScript, Electron, and Rust (Tauri plugins). LLM interactions powered by [xsAI](https://github.com/moeru-ai/xsai).

## Monorepo Structure

**Package manager**: pnpm (v10.28+) with workspace catalogs. **Build orchestrator**: Turborepo. **Rust workspace**: Cargo (toolchain 1.89.0).

| Directory | Purpose |
|-----------|---------|
| `apps/` | Deployable applications (stage-web, stage-tamagotchi, stage-pocket, server, component-calling) |
| `packages/` | Shared libraries (~35 packages: stage-ui, ui, i18n, server-runtime, plugin-sdk, etc.) |
| `services/` | Bot integrations (discord-bot, telegram-bot, minecraft, satori-bot, twitter-services) |
| `plugins/` | AIRI plugins (bilibili-laplace, claude-code, homeassistant, web-extension) |
| `crates/` | Rust Tauri plugins (mcp, rdev, window-pass-through, audio transcription/VAD) |
| `integrations/` | IDE integrations (VSCode extensions) |
| `docs/` | Documentation site (Astro-based) |

## Key Architectural Layers

- **`packages/stage-ui`**: Heart of the UI — core business components, composables, stores shared by stage-web and stage-tamagotchi. Provider definitions in `src/stores/providers/`, orchestration modules in `src/stores/modules/`.
- **`packages/ui`**: Low-level primitives (inputs, buttons, layout) built on reka-ui. Minimal business logic.
- **`packages/stage-shared`**: Shared logic across stage-ui, stage-ui-three, stage-web, stage-tamagotchi.
- **`packages/server-runtime` / `server-sdk` / `server-shared`**: Server channel powering services and plugins.
- **`packages/plugin-sdk`**: Plugin lifecycle management using xstate.
- **IPC**: `@moeru/eventa` for type-safe, framework-agnostic IPC/RPC. Contracts centralized in `apps/stage-tamagotchi/src/shared`.
- **DI**: `injeca` for dependency injection across services, plugins, and frontend.

## Common Commands

```shell
# Install & bootstrap
pnpm install                    # Also runs postinstall: simple-git-hooks + build:packages

# Development (pick one)
pnpm dev                        # Stage Web (browser) — default
pnpm dev:tamagotchi             # Stage Tamagotchi (Electron desktop)
pnpm dev:pocket                 # Stage Pocket (mobile/Capacitor)
pnpm dev:docs                   # Documentation site
pnpm dev:ui                     # Stage UI component stories (Histoire)
pnpm dev:server                 # Server runtime

# Build
pnpm build                      # All packages + apps via Turborepo
pnpm build:packages             # Only packages
pnpm build:web                  # Only stage-web
pnpm build:tamagotchi           # Desktop app build
pnpm build:crates               # Rust workspace

# Testing
pnpm test                       # Vitest with coverage (watch mode)
pnpm test:run                   # Vitest single run
pnpm exec vitest run <path>     # Run specific test file

# Linting & Type checking
pnpm lint                       # ESLint via moeru-lint
pnpm lint:fix                   # ESLint with auto-fix (also handles formatting)
pnpm lint:rust                  # cargo fmt --check && cargo clippy
pnpm typecheck                  # tsc/vue-tsc across all packages/apps

# Scoped commands (use pnpm workspace filters)
pnpm -F @proj-airi/stage-ui typecheck
pnpm -F @proj-airi/stage-tamagotchi exec vitest run
pnpm -F @proj-airi/telegram-bot start
```

## Testing Configuration

Root `vitest.config.ts` defines test projects: `apps/server`, `apps/stage-tamagotchi`, `packages/stage-ui`, `packages/plugin-sdk`, `packages/vite-plugin-warpdrive`, `packages/audio-pipelines-transcribe`, `packages/server-runtime`. Individual packages may have their own vitest config.

## Tech Stack Specifics

- **Frontend**: Vue 3 + Vue Router, Pinia (state), VueUse (composables), UnoCSS (styling, NOT Tailwind), Histoire (stories)
- **Desktop**: Electron (current) — `crates/` contains legacy Tauri plugins still used for native capabilities
- **Mobile**: Capacitor (iOS/Android)
- **Validation**: Valibot (not Zod for most packages)
- **Bundling**: tsdown for library packages, Vite/electron-vite for apps
- **LLM SDK**: xsAI (`@xsai/*` packages)
- **Fonts**: DM Sans, Comfortaa, Kiwi Maru, Sniglet (via UnoCSS web fonts)

## Code Conventions

- **Styling**: UnoCSS only. Use v-bind class arrays for readability: `:class="['px-2 py-1', 'flex items-center']"` not long inline class strings. Config in root `uno.config.ts`.
- **Icons**: Iconify icon sets only. No bespoke SVGs.
- **File naming**: kebab-case.
- **i18n**: All translations in `packages/i18n`. Never scatter translations across apps.
- **Imports**: perfectionist sort-imports enforced by ESLint. Grouped by type → builtin → external → internal → relative.
- **no-console rule**: `console.log` is an ESLint error. Use `console.warn`, `console.error`, or `console.info` only.
- **Settings/devtools routes**: Use `<route lang="yaml"> meta: layout: settings </route>` pattern. Register routes/icons in the app's `layouts/settings.vue`.
- **Commit style**: Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`, etc.).
- **Pre-commit hook**: nano-staged runs `moeru-lint --fix` on all staged files.

## Version Bumping

```shell
npx bumpp --no-commit --no-tag  # Bumps package.json versions recursively
```
The `bump.config.ts` also syncs the version to `Cargo.toml` workspace and regenerates `Cargo.lock`.

## Prerequisites

- Node.js 23+
- pnpm (via corepack)
- Rust toolchain 1.89.0 (only needed for crates/ or desktop development)

## Important References

- Detailed contributor guide: `.github/CONTRIBUTING.md`
- Agent/AI contributor guide with full path index: `AGENTS.md`
- Architecture diagram: `README.md` (mermaid flowchart)
