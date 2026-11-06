// The MCP compatibility matrix (card #1119, closure w3-mcp-e2e): eight targets, two clients each.
// The official SDK client and our `createMcp` on `createLocalTransportFactory` each do three
// steps: discover, list the tools, call one read-only tool. The script prints one table.
//
// It resolves the repository root from its own place (`<root>/tmp/skill-mcp-domain/compat/`),
// imports the product packages from their built `dist`, and takes the SDK client from the
// dependencies of `mcp-host-local`. It runs the local targets itself and reaches the three
// remote targets over the network. Run it: `node mcp-compat-matrix.mjs`.
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { Readable, Writable } from 'node:stream'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../../..')
const HOST = join(ROOT, 'packages/mcp/mcp-host-local')
const MODULES = join(HOST, 'node_modules/@modelcontextprotocol')
const STEP_BOUND_MS = 60_000

const load = path => import(pathToFileURL(path).href)
const { Client, StreamableHTTPClientTransport, SSEClientTransport } = await load(
  join(MODULES, 'client/dist/index.mjs'),
)
const { StdioClientTransport } = await load(join(MODULES, 'client/dist/stdio.mjs'))
const { createMcp } = await load(join(ROOT, 'packages/mcp/mcp/dist/index.js'))
const testing = await load(join(ROOT, 'packages/mcp/mcp-contract/dist/testing.js'))
const identity = await load(join(ROOT, 'packages/common/legal-identity/dist/index.js'))
const { createLocalTransportFactory } = await load(join(HOST, 'dist/index.js'))

const SDK_VERSION = JSON.parse(readFileSync(join(MODULES, 'client/package.json'), 'utf8')).version
const IMPLEMENTATION = execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD'], {
  encoding: 'utf8',
}).trim()
const EVERYTHING_BIN = join(MODULES, 'server-everything/dist/index.js')
const FILESYSTEM_BIN = join(MODULES, 'server-filesystem/dist/index.js')
const FETCH_BIN = join(ROOT, '.venv/bin/mcp-server-fetch')

const bounded = (promise, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} took more than ${STEP_BOUND_MS} ms`)), STEP_BOUND_MS),
    ),
  ])

const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms))

function listening(port) {
  return new Promise(resolveListening => {
    const socket = connect({ host: '127.0.0.1', port })
    socket.once('connect', () => {
      socket.destroy()
      resolveListening(true)
    })
    socket.once('error', () => resolveListening(false))
  })
}

async function freePort() {
  for (;;) {
    const port = 20_000 + Math.floor(Math.random() * 40_000)
    if (!(await listening(port))) return port
  }
}

/** A local web page for the fetch server: `/robots.txt` allows all, `/page` is small HTML. */
async function pageServer() {
  const server = createServer((request, response) => {
    if (request.url === '/robots.txt') {
      response.setHeader('content-type', 'text/plain')
      response.end('User-agent: *\nAllow: /\n')
      return
    }
    response.setHeader('content-type', 'text/html')
    response.end('<html><body><h1>Hi</h1></body></html>')
  })
  const port = await freePort()
  await new Promise(resolveListen => server.listen(port, '127.0.0.1', resolveListen))
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise(done => server.close(done)) }
}

/** The reference server in an HTTP mode on a port of the script's choosing. */
async function everythingHttp(mode) {
  const port = await freePort()
  const child = spawn(process.execPath, [EVERYTHING_BIN, mode], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'ignore', 'ignore'],
    detached: true,
  })
  for (let round = 0; round < 200 && !(await listening(port)); round += 1) await sleep(50)
  if (!(await listening(port))) throw new Error(`server-everything ${mode} did not listen`)
  return {
    url: `http://127.0.0.1:${port}/${mode === 'sse' ? 'sse' : 'mcp'}`,
    close: async () => {
      process.kill(-child.pid, 'SIGKILL')
    },
  }
}

/** The targets. `prepare` returns the connection and the one read-only call, and what to clean up. */
const ROWS = [
  {
    row: 1,
    label: 'server-everything 2.1.0',
    transport: 'stdio',
    async prepare() {
      return {
        stdio: { command: process.execPath, args: [EVERYTHING_BIN, 'stdio'] },
        call: { tool: 'echo', args: { message: 'hi' } },
        close: async () => undefined,
      }
    },
  },
  {
    row: 2,
    label: 'server-filesystem 2.1.0',
    transport: 'stdio',
    async prepare() {
      const root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-compat-fs-')))
      writeFileSync(join(root, 'a.txt'), 'hello')
      return {
        stdio: { command: process.execPath, args: [FILESYSTEM_BIN, root] },
        call: { tool: 'read_text_file', args: { path: join(root, 'a.txt') } },
        close: async () => rmSync(root, { recursive: true, force: true }),
      }
    },
  },
  {
    row: 3,
    label: 'mcp-server-fetch 2026.10.28 (Python)',
    transport: 'stdio',
    async prepare() {
      if (!existsSync(FETCH_BIN)) throw new Error('mcp-server-fetch not installed: run uv sync --locked --group mcp-fixtures')
      const pages = await pageServer()
      return {
        stdio: { command: FETCH_BIN, args: ['--allow-private-ips', '--no-readability-js'] },
        call: { tool: 'fetch', args: { url: `${pages.url}/page` } },
        close: () => pages.close(),
      }
    },
  },
  {
    row: 4,
    label: 'DeepWiki https://mcp.deepwiki.com/mcp',
    transport: 'Streamable HTTP',
    remote: true,
    async prepare() {
      return {
        http: 'https://mcp.deepwiki.com/mcp',
        call: { tool: 'read_wiki_structure', args: { repoName: 'modelcontextprotocol/typescript-sdk' } },
        close: async () => undefined,
      }
    },
  },
  {
    row: 5,
    label: 'Context7 https://mcp.context7.com/mcp',
    transport: 'Streamable HTTP',
    remote: true,
    async prepare() {
      return {
        http: 'https://mcp.context7.com/mcp',
        call: { tool: 'resolve-library-id', args: { libraryName: 'React', query: 'hooks' } },
        close: async () => undefined,
      }
    },
  },
  {
    row: 6,
    label: 'Microsoft Learn https://learn.microsoft.com/api/mcp',
    transport: 'Streamable HTTP',
    remote: true,
    async prepare() {
      return {
        http: 'https://learn.microsoft.com/api/mcp',
        call: { tool: 'microsoft_docs_search', args: { query: 'azure functions timer trigger' } },
        close: async () => undefined,
      }
    },
  },
  {
    row: 7,
    label: 'server-everything 2.1.0 streamableHttp (local port)',
    transport: 'Streamable HTTP',
    async prepare() {
      const server = await everythingHttp('streamableHttp')
      return { http: server.url, call: { tool: 'echo', args: { message: 'hi' } }, close: server.close }
    },
  },
  {
    row: 8,
    label: 'server-everything 2.1.0 sse (local port)',
    transport: 'legacy HTTP+SSE',
    async prepare() {
      const server = await everythingHttp('sse')
      return { sse: server.url, call: { tool: 'echo', args: { message: 'hi' } }, close: server.close }
    },
  },
]

/** The official SDK client: discover (connect), list the tools, call the tool. */
async function sdkReading(prepared) {
  const client = new Client({ name: 'omne-compat-matrix', version: '0' }, { versionNegotiation: { mode: 'auto' } })
  const transport =
    prepared.stdio !== undefined
      ? new StdioClientTransport({ command: prepared.stdio.command, args: prepared.stdio.args, stderr: 'ignore' })
      : prepared.http !== undefined
        ? new StreamableHTTPClientTransport(new URL(prepared.http))
        : new SSEClientTransport(new URL(prepared.sse))
  try {
    await bounded(client.connect(transport), 'sdk connect')
    const revision = client.getNegotiatedProtocolVersion?.() ?? '?'
    const names = []
    let cursor
    do {
      const page = await bounded(client.listTools(cursor === undefined ? undefined : { cursor }), 'sdk listTools')
      for (const tool of page.tools) names.push(tool.name)
      cursor = page.nextCursor
    } while (cursor !== undefined)
    const result = await bounded(
      client.callTool({ name: prepared.call.tool, arguments: prepared.call.args }),
      'sdk callTool',
    )
    return { revision, names: names.sort(), conclusion: result.isError === true ? 'toolError' : 'complete' }
  } catch (error) {
    return { failure: String(error?.message ?? error).slice(0, 200) }
  } finally {
    await client.close().catch(() => undefined)
  }
}

/** A child process of any program as a process handle for the landing port. */
function spawnHandle(command, args) {
  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] })
  const exited = new Promise(resolveExit => child.once('exit', () => resolveExit()))
  child.stderr.resume()
  const stderr = new ReadableStream({
    start(controller) {
      void exited.then(() => {
        try {
          controller.close()
        } catch {
          // The reader cancelled the stream first.
        }
      })
    },
  })
  return {
    stdin: Writable.toWeb(child.stdin),
    stdout: Readable.toWeb(child.stdout),
    stderr,
    exited,
    async stop() {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      await exited
      return 'root-only'
    },
  }
}

const organization = identity.organizationCodec.parse('org_0123456789abcdefghjkmnpqrs')
const account = identity.accountCodec.parse('acc_0123456789abcdefghjkmnpqrs')
const ALICE = identity.access({ id: 'alice' }, identity.tenant(organization.value, account.value))

/** Our implementation: `createMcp` on the local transport; refresh, list from the catalog, invoke. */
async function ourReading(prepared) {
  const principalKey = principal => principal.id
  const adoption = testing.createMemoryAdoptionView({ scopeKey: scope => scope })
  const eligibility = testing.createMemoryUseEligibility({ principalKey })
  const absent = { kind: 'absent' }
  const ref = testing.endpointRefOf('matrix')
  const body =
    prepared.stdio !== undefined
      ? {
          name: 'matrix',
          transport: 'stdio',
          auth: 'none',
          launch: { command: prepared.stdio.command, args: prepared.stdio.args, env: [], facilities: [] },
        }
      : { name: 'matrix', transport: 'streamable-http', auth: 'none' }
  const url = prepared.http ?? prepared.sse
  adoption.adopt({
    tenant: ALICE.tenant,
    scope: 'matrix',
    ref,
    body: testing.jsonOf(body),
    settings: {
      target: url === undefined ? absent : { kind: 'value', value: testing.connectionTargetOf(url) },
      credential: absent,
      connectTimeout: { kind: 'value', value: testing.millisOf(30_000) },
    },
  })
  eligibility.grant(ALICE, ref)
  const services = createMcp(
    {
      adoption,
      eligibility,
      credentials: testing.createMemoryCredentialUse(),
      landing: {
        async start(_access, launch) {
          return { ok: spawnHandle(launch.command, launch.args) }
        },
      },
      store: testing.createMemoryCatalogStore(),
      transports: createLocalTransportFactory({
        clientInfo: { name: 'omne-compat-matrix', version: '0' },
        probeTimeoutMs: 10_000,
      }),
      checkOutput: () => ({ kind: 'conforms' }),
    },
    { principalKey, maxListingPages: 20, maxActions: 500, instructionsByteLimit: 4096 },
  )
  try {
    const refreshed = await bounded(services.discovery.refresh(ALICE, { ref }), 'ours refresh')
    if (!('ok' in refreshed) || refreshed.ok.kind !== 'published')
      return { failure: `refresh: ${JSON.stringify(refreshed)}`.slice(0, 200) }
    const view = await services.discovery.current(ALICE, ref)
    if (!('ok' in view) || view.ok.kind !== 'acquired') return { failure: 'the catalog is not acquired' }
    const peer = await services.discovery.peer(ALICE, ref)
    const revision = 'ok' in peer ? peer.ok.peer.protocolVersion : '?'
    const known = view.ok.actions.find(action => action.name === prepared.call.tool)
    if (known === undefined) return { failure: `the catalog has no ${prepared.call.tool}` }
    const names = view.ok.actions.map(action => action.name).sort()
    const invoked = await bounded(
      services.invoker.invoke(ALICE, {
        ref,
        action: testing.actionNameOf(prepared.call.tool),
        args: testing.jsonOf(prepared.call.args),
        expectedDefinition: known.definitionDigest,
        correlationKey: testing.correlationKeyOf('matrix-1'),
        signal: new AbortController().signal,
      }),
      'ours invoke',
    )
    const conclusion = invoked.kind === 'sent' ? invoked.outcome.kind : `not-sent:${invoked.reason.kind}`
    return { revision, names, conclusion }
  } catch (error) {
    return { failure: String(error?.message ?? error).slice(0, 200) }
  } finally {
    await services.connections.closeAll().catch(() => undefined)
  }
}

const sameNames = (left, right) => left.length === right.length && left.every((name, index) => name === right[index])

const lines = []
let crashed = false
for (const spec of ROWS) {
  const stamp = spec.remote === true ? execFileSync('date', ['-u'], { encoding: 'utf8' }).trim() : ''
  let prepared
  try {
    prepared = await spec.prepare()
  } catch (error) {
    lines.push({ spec, stamp, error: `not prepared: ${String(error?.message ?? error)}` })
    crashed = true
    continue
  }
  try {
    const sdk = await sdkReading(prepared)
    const ours = await ourReading(prepared)
    lines.push({ spec, stamp, call: prepared.call, sdk, ours })
  } finally {
    await prepared.close().catch(() => undefined)
  }
}

const verdict = line => {
  if (line.error !== undefined) return line.error
  const { sdk, ours } = line
  if (sdk.failure !== undefined || ours.failure !== undefined)
    return `unreachable or failed: sdk=${sdk.failure ?? 'ok'}; ours=${ours.failure ?? 'ok'}`
  const same = sdk.conclusion === ours.conclusion && sameNames(sdk.names, ours.names) && sdk.revision === ours.revision
  return same ? 'agree' : 'differ'
}

console.log(`SDK client: @modelcontextprotocol/client ${SDK_VERSION}; implementation: ${IMPLEMENTATION}; node ${process.version}`)
console.log('Excluded: GitHub MCP https://api.githubcopilot.com/mcp/ (OAuth; not in scope).')
console.log('')
console.log('| row | target | transport | revision (sdk / ours) | tools (sdk / ours), names equal | call | conclusion (sdk / ours) | verdict | date -u (remote) |')
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
for (const line of lines) {
  const { spec } = line
  if (line.error !== undefined) {
    console.log(`| ${spec.row} | ${spec.label} | ${spec.transport} | - | - | - | - | ${line.error} | ${line.stamp} |`)
    continue
  }
  const { sdk, ours, call } = line
  const callText = `\`${call.tool}\` ${JSON.stringify(call.args)}`
  if (sdk.failure !== undefined || ours.failure !== undefined) {
    console.log(`| ${spec.row} | ${spec.label} | ${spec.transport} | ${sdk.revision ?? '-'} / ${ours.revision ?? '-'} | - | ${callText} | sdk: ${sdk.conclusion ?? sdk.failure} / ours: ${ours.conclusion ?? ours.failure} | ${verdict(line)} | ${line.stamp} |`)
    continue
  }
  const names = `${sdk.names.length} / ${ours.names.length}, ${sameNames(sdk.names, ours.names) ? 'equal' : `differ (sdk only: ${sdk.names.filter(n => !ours.names.includes(n)).join(',') || '-'}; ours only: ${ours.names.filter(n => !sdk.names.includes(n)).join(',') || '-'})`}`
  console.log(`| ${spec.row} | ${spec.label} | ${spec.transport} | ${sdk.revision} / ${ours.revision} | ${names} | ${callText} | ${sdk.conclusion} / ${ours.conclusion} | ${verdict(line)} | ${line.stamp} |`)
}
// Every spawned child belongs to a closed connection or a killed process group.
process.exit(crashed && lines.every(line => line.error !== undefined) ? 1 : 0)
