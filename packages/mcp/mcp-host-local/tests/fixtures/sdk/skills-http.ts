import { createServer, type Server } from 'node:http'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { memorySkillFiles, SkillsExtension } from '@modelcontextprotocol/server/ext/skills'
import { isConnectionTarget, type ConnectionTarget } from '@omne-harness/mcp-contract'
import { listenFree } from '../scripted/http.ts'

/** The SDK's 2026-07-28 server with the skills extension, serving the given files (`<skill>/SKILL.md`, …). */
export type SkillsServer = Readonly<{ target: ConnectionTarget; close(): Promise<void> }>

export async function skillsServer(files: Record<string, string>): Promise<SkillsServer> {
  const catalog = await SkillsExtension.load(memorySkillFiles(files))
  const handler = createMcpHandler(() => {
    const server = new McpServer(
      { name: 'skills-http', version: '1' },
      { capabilities: { tools: {} } },
    )
    catalog.attach(server)
    return server
  })
  const serve = toNodeHandler(handler)
  const http: Server = createServer((request, response) => void serve(request as never, response))
  const port = await listenFree(http)
  const target = `http://127.0.0.1:${String(port)}/mcp`
  if (!isConnectionTarget(target)) throw new Error(target)
  return {
    target,
    close: () =>
      new Promise<void>(resolve => {
        http.closeAllConnections()
        http.close(() => resolve())
      }),
  }
}
