// Baseline: the official SDK client (lockfile version) against public remote MCP servers over HTTP.
const { Client, StreamableHTTPClientTransport } = await import('/home/user/omne-harness-lite/.worktrees/skill-mcp/packages/mcp/mcp-host-local/node_modules/@modelcontextprotocol/client/dist/index.mjs')
const targets = [['DeepWiki', 'https://mcp.deepwiki.com/mcp'], ['Context7', 'https://mcp.context7.com/mcp'], ['Microsoft Learn', 'https://learn.microsoft.com/api/mcp']]
for (const [label, url] of targets) {
  const client = new Client({ name: 'probe', version: '0' }, { versionNegotiation: { mode: 'auto' } })
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(url)))
    const tools = await client.listTools()
    console.log(label, '| era', client.getProtocolEra?.() ?? '?', '| version', client.getNegotiatedProtocolVersion?.() ?? '?', '| tools', tools.tools.length, '|', tools.tools.map(t => t.name).slice(0, 4).join(','))
  } catch (e) { console.log(label, '| FAIL', String(e?.message ?? e).slice(0, 200)) }
  await client.close().catch(() => {})
}
process.exit(0)
