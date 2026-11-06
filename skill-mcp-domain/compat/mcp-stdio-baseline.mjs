// Baseline: the official SDK client against the reference servers installed from the lockfile.
const { Client } = await import('/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/packages/mcp/mcp-host-local/node_modules/@modelcontextprotocol/client/dist/index.mjs')
const { StdioClientTransport } = await import('/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/packages/mcp/mcp-host-local/node_modules/@modelcontextprotocol/client/dist/stdio.mjs')
const targets = [['server-everything 2.1.0', '/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/packages/mcp/mcp-host-local/node_modules/.bin/mcp-server-everything', []], ['server-filesystem 2.1.0', '/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/packages/mcp/mcp-host-local/node_modules/.bin/mcp-server-filesystem', ['/tmp']], ['mcp-server-fetch 2026.10.28 (Python)', '/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/.venv/bin/mcp-server-fetch', []]]
for (const [label, command, args] of targets) {
  const client = new Client({ name: 'probe', version: '0' }, { versionNegotiation: { mode: 'auto' } })
  try {
    await client.connect(new StdioClientTransport({ command, args, stderr: 'ignore' }))
    const tools = await client.listTools()
    console.log(label, '| era', client.getProtocolEra?.(), '| version', client.getNegotiatedProtocolVersion?.(), '| tools', tools.tools.length, '|', tools.tools.map(t => t.name).slice(0, 4).join(','))
  } catch (e) { console.log(label, '| FAIL', String(e?.message ?? e).slice(0, 200)) }
  await client.close().catch(() => {})
}
process.exit(0)
