// Stub for better-sqlite3 in browser context.
// The real module is Node-native and cannot run in browser.
// This prevents import errors from barrel exports (e.g. @anase/mcp-hub).
export default class Database {
  constructor() {
    throw new Error('better-sqlite3 is not available in browser')
  }
}
