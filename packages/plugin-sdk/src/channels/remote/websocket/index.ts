import { createContext } from '@moeru/eventa/adapters/websocket/native'

export function createWebSocketHostChannel(webSocket: WebSocket) {
  return createContext(webSocket)
}

export function createWebSocketDataChannel(webSocket: WebSocket) {
  return createContext(webSocket)
}
