import { randomUUID } from 'node:crypto'
import { env, platform } from 'node:process'

import { electronApp, optimizer } from '@electron-toolkit/utils'
import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'
import { initScreenCaptureForMain } from '@anase/electron-screen-capture/main'
import { Client } from '@anase/server-sdk'
import { app, ipcMain } from 'electron'
import { noop } from 'es-toolkit'
import { createLoggLogger, injeca } from 'injeca'
import { isLinux } from 'std-env'

import icon from '../../resources/icon.png?asset'

import { openDebugger, setupDebugger } from './app/debugger'
import { emitAppBeforeQuit, emitAppReady, emitAppWindowAllClosed } from './libs/bootkit/lifecycle'
import { setElectronMainDirname } from './libs/electron/location'
import { setupServerChannelHandlers } from './services/anase/channel-server'
import { setupPluginHost } from './services/anase/plugins'
import { setupAiServices } from './services/anima/setup-ai-services'
import { setupBridge } from './services/anima/setup-bridge'
import { setupChannels } from './services/anima/setup-channels'
import { setupDesktopShell } from './services/anima/setup-desktop-shell'
import { setupAnimaOrchestrator } from './services/anima/setup-orchestrator'
import { setupAutoUpdater } from './services/electron/auto-updater'
import { setupTray } from './tray'
import { setupAboutWindowReusable } from './windows/about'
import { setupBeatSync } from './windows/beat-sync'
import { setupCaptionWindowManager } from './windows/caption'
import { setupChatWindowReusableFunc } from './windows/chat'
import { setupDevtoolsWindow } from './windows/devtools'
import { setupMainWindow } from './windows/main'
import { setupNoticeWindowManager } from './windows/notice'
import { setupSettingsWindowReusableFunc } from './windows/settings'
import { setupWidgetsWindowManager } from './windows/widgets'

// Eventa does not yet support window-namespaced contexts, so multiple
// IPC listeners are registered globally. Raise the limit to avoid warnings.
ipcMain.setMaxListeners(100)

setElectronMainDirname(__dirname)
setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Log)
setupDebugger()

const log = useLogg('main').useGlobalConfig()

// Thanks to [@blurymind](https://github.com/blurymind),
//
// When running Electron on Linux, navigator.gpu.requestAdapter() fails.
// In order to enable WebGPU and process the shaders fast enough, we need the following
// command line switches to be set.
//
// https://github.com/electron/electron/issues/41763#issuecomment-2051725363
// https://github.com/electron/electron/issues/41763#issuecomment-3143338995
if (isLinux) {
  app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer')
  app.commandLine.appendSwitch('enable-unsafe-webgpu')
  app.commandLine.appendSwitch('enable-features', 'Vulkan')

  // NOTICE: we need UseOzonePlatform, WaylandWindowDecorations for working on Wayland.
  // Partially related to https://github.com/electron/electron/issues/41551, since X11 is deprecating now,
  // we can safely remove the feature flags for Electron once they made it default supported.
  // Fixes: https://github.com/rocky2431/anima/issues/757
  // Ref: https://github.com/mmaura/poe2linuxcompanion/blob/90664607a147ea5ccea28df6139bd95fb0ebab0e/electron/main/index.ts#L28-L46
  if (env.XDG_SESSION_TYPE === 'wayland') {
    app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal')

    app.commandLine.appendSwitch('enable-features', 'UseOzonePlatform')
    app.commandLine.appendSwitch('enable-features', 'WaylandWindowDecorations')
  }
}

app.dock?.setIcon(icon)
electronApp.setAppUserModelId('app.anase')

initScreenCaptureForMain()

app.whenReady().then(async () => {
  injeca.setLogger(createLoggLogger(useLogg('injeca').useGlobalConfig()))

  const serverChannel = injeca.provide('modules:channel-server', () => setupServerChannelHandlers())
  const pluginHost = injeca.provide('modules:plugin-host', () => setupPluginHost())
  const animaOrchestrator = injeca.provide('modules:anima-orchestrator', () => setupAnimaOrchestrator())
  const desktopShell = injeca.provide('modules:desktop-shell', {
    dependsOn: { animaOrchestrator },
    build: ({ dependsOn }) => setupDesktopShell(dependsOn.animaOrchestrator),
  })
  const channels = injeca.provide('modules:channels', () => setupChannels())
  const aiServices = injeca.provide('modules:ai-services', () => setupAiServices())
  // Bridge is set up after both animaOrchestrator and aiServices resolve.
  // Uses injeca.invoke (not provide) since it doesn't produce a named dependency.
  const bridge = injeca.provide('modules:anima-bridge', {
    dependsOn: { animaOrchestrator, aiServices, serverChannel },
    build: (resolved: any) => {
      // Lazy WS client to forward enriched responses to the frontend.
      // Connects to the same in-process WS server that channel-server starts.
      const wsPort = env.PORT ? Number(env.PORT) : 6121
      const wsUrl = `ws://127.0.0.1:${wsPort}/ws`
      let bridgeClient: Client | null = null

      function getBridgeClient(): Client {
        if (!bridgeClient) {
          bridgeClient = new Client({
            name: 'anima-bridge',
            url: wsUrl,
            token: env.ANASE_TOKEN ?? 'abcd',
            possibleEvents: ['persona:proactive:trigger'],
          })
        }
        return bridgeClient
      }

      return setupBridge(
        {
          animaOrchestrator: resolved.dependsOn.animaOrchestrator,
          aiOrchestrator: resolved.dependsOn.aiServices.aiOrchestrator,
        },
        {
          onEnrichedResponse: (event) => {
            log.log('Enriched proactive response', { triggerId: event.triggerId, isAiGenerated: event.isAiGenerated })
            getBridgeClient().send({
              type: 'persona:proactive:trigger',
              data: {
                id: randomUUID(),
                kind: 'observation' as const,
                headline: event.text,
                emotion: event.emotion as 'idle' | 'curious' | 'caring' | 'worried' | 'sleepy' | 'excited' | undefined,
              },
            })
          },
        },
      )
    },
  })
  const autoUpdater = injeca.provide('services:auto-updater', () => setupAutoUpdater())
  const widgetsManager = injeca.provide('windows:widgets', () => setupWidgetsWindowManager())
  const noticeWindow = injeca.provide('windows:notice', () => setupNoticeWindowManager())
  const aboutWindow = injeca.provide('windows:about', {
    dependsOn: { autoUpdater },
    build: ({ dependsOn }) => setupAboutWindowReusable(dependsOn),
  })

  // BeatSync will create a background window to capture and process audio.
  const beatSync = injeca.provide('windows:beat-sync', () => setupBeatSync())
  const devtoolsMarkdownStressWindow = injeca.provide('windows:devtools:markdown-stress', () => setupDevtoolsWindow())

  const chatWindow = injeca.provide('windows:chat', {
    dependsOn: { widgetsManager },
    build: ({ dependsOn }) => setupChatWindowReusableFunc(dependsOn),
  })

  const settingsWindow = injeca.provide('windows:settings', {
    dependsOn: { widgetsManager, beatSync, autoUpdater, devtoolsMarkdownStressWindow },
    build: async ({ dependsOn }) => setupSettingsWindowReusableFunc(dependsOn),
  })

  const mainWindow = injeca.provide('windows:main', {
    dependsOn: { settingsWindow, chatWindow, widgetsManager, noticeWindow, beatSync, autoUpdater },
    build: async ({ dependsOn }) => setupMainWindow(dependsOn),
  })

  const captionWindow = injeca.provide('windows:caption', {
    dependsOn: { mainWindow },
    build: async ({ dependsOn }) => setupCaptionWindowManager(dependsOn),
  })

  const tray = injeca.provide('app:tray', {
    dependsOn: { mainWindow, settingsWindow, captionWindow, widgetsWindow: widgetsManager, beatSyncBgWindow: beatSync, aboutWindow },
    build: async ({ dependsOn }) => setupTray(dependsOn),
  })

  injeca.invoke({
    dependsOn: { mainWindow, tray, serverChannel, pluginHost, animaOrchestrator, desktopShell, channels, aiServices, bridge },
    callback: noop,
  })

  injeca.start().catch(err => log.withError(err).error('Failed to start injeca'))

  // Lifecycle
  emitAppReady()

  // Extra
  openDebugger()

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
}).catch((err) => {
  log.withError(err).error('Error during app initialization')
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  emitAppWindowAllClosed()

  if (platform !== 'darwin') {
    app.quit()
  }
})

// Clean up server and intervals when app quits
app.on('before-quit', async () => {
  emitAppBeforeQuit()
  injeca.stop()
})
