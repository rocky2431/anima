import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const server = new McpServer({
  name: 'echo-test-server',
  version: '1.0.0',
})

server.registerTool('echo', {
  description: 'Echo back the input message',
}, async () => ({
  content: [{ type: 'text', text: 'Echo: hello' }],
}))

server.registerTool('add', {
  description: 'Add two numbers',
}, async () => ({
  content: [{ type: 'text', text: String(2 + 3) }],
}))

async function main(): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main()
