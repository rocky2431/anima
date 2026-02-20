import type { TransportType } from './types'

/**
 * A recommended MCP server that users can add with one click.
 */
export interface RecommendedMcpServer {
  id: string
  name: string
  description: string
  transport: TransportType
  category: string
  /** For stdio transport */
  command?: string
  args?: string[]
  /** For http/sse transport */
  url?: string
  /** Whether this is an officially maintained server */
  official?: boolean
}

const RECOMMENDED_SERVERS: RecommendedMcpServer[] = [
  {
    id: 'mcp-filesystem',
    name: 'Filesystem',
    description: 'Read and write files on the local filesystem',
    transport: 'stdio',
    category: 'utilities',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    official: true,
  },
  {
    id: 'mcp-memory',
    name: 'Memory',
    description: 'Knowledge graph-based persistent memory server',
    transport: 'stdio',
    category: 'utilities',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    official: true,
  },
  {
    id: 'mcp-brave-search',
    name: 'Brave Search',
    description: 'Web and local search using Brave Search API',
    transport: 'stdio',
    category: 'search',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    official: true,
  },
  {
    id: 'mcp-github',
    name: 'GitHub',
    description: 'Repository management, file operations, and GitHub API integration',
    transport: 'stdio',
    category: 'development',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    official: true,
  },
  {
    id: 'mcp-puppeteer',
    name: 'Puppeteer',
    description: 'Browser automation and web scraping',
    transport: 'stdio',
    category: 'utilities',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    official: true,
  },
  {
    id: 'mcp-fetch',
    name: 'Fetch',
    description: 'Web content fetching and conversion for efficient LLM usage',
    transport: 'stdio',
    category: 'utilities',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
    official: true,
  },
]

/**
 * Returns the list of recommended MCP servers that users can add with one click.
 */
export function getRecommendedServers(): RecommendedMcpServer[] {
  return RECOMMENDED_SERVERS
}
