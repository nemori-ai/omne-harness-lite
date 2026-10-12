// Test-only creator process. SIGKILL must leave the original resource index usable.
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import { composeMigrations } from '@omne-harness-lite/storage'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { createHostEnvironment } from '../dist/host.js'
import { hostEnvironmentMigrations } from '../dist/migrations.js'
const [file, marker, mode] = process.argv.slice(2)
const storage = await openStorage({
  dialect: 'sqlite',
  file,
  migrations: composeMigrations(hostEnvironmentMigrations),
  upgrade: false,
})
const scopedStorage =
  mode === 'batch'
    ? {
        ...storage,
        read: storage.read.bind(storage),
        async write(operation) {
          const result = await storage.write(operation)
          if (
            result?.kind === 'batch' &&
            result.receipts?.published.length === 1 &&
            !result.receipts.complete
          ) {
            process.send({ scope, resources })
            await new Promise(() => {})
          }
          return result
        },
      }
    : storage
const scope = {
  tenant: parseTenantId({ organization: 'org', account: 'alice' }).ok,
  session: parseOpaqueIdentifier('host-session', 'SessionRef').ok,
}
const authorization = {},
  resources = []
const provider = createHostEnvironment({
  name: 'real-host',
  storage: scopedStorage,
  access: {
    authorize: async () => ({
      kind: 'authorized',
      identity: {
        binding: 'crash-fixture',
        principal: 'alice',
        principalKind: 'human',
        scope,
        consumer: 'tool',
        contextKeys: [],
      },
    }),
  },
})
const acquisition = await provider.acquire({
  scope,
  authorization,
  call: {
    execution: parseOpaqueIdentifier('crash-owner', 'CallId').ok,
    tool: { name: 'fixture', definition: 'host-v1' },
  },
  requirement: { bindingLayer: 'host_machine', facilities: ['command', 'files'] },
  placement: {
    scope,
    tool: { name: 'fixture', definition: 'host-v1' },
    execution: parseOpaqueIdentifier('crash-owner', 'CallId').ok,
    requirement: { bindingLayer: 'host_machine', facilities: ['command', 'files'] },
    permission: 'always-allow',
    revision: 'fixture',
    evidence: null,
  },
  resources: {
    closed: new AbortController().signal,
    plan: async resource => {
      resources.push(resource)
      return 'recorded'
    },
    permit: async () => 'confirmed',
    adopt: async () => 'confirmed',
    stopped: async () => 'recorded',
  },
})
if (acquisition.kind !== 'acquired') throw new Error('Crash fixture acquire failed')
if (mode === 'batch') {
  await acquisition.lease.facilities.files.commitBatch({
    entries: [
      { path: marker + '-a', data: new TextEncoder().encode('first'), expectedVersion: null },
      { path: marker + '-b', data: new TextEncoder().encode('second'), expectedVersion: null },
    ],
  })
  throw new Error('Expected intercepted original publication receipt')
}
const command = acquisition.lease.facilities.command
let result
if (mode === 'terminal') {
  const created = await command.createTerminal({ cwd: '/tmp', env: { PATH: '/usr/bin:/bin' } })
  if (created.kind !== 'created') throw new Error('Crash fixture terminal failed')
  result = await command.executeTerminal({
    terminal: created.terminal,
    script: `printf x >> '${marker}'; printf entered; sleep 120`,
  })
} else
  result = await command.start({
    executable: '/bin/sh',
    args: ['-c', 'printf x >> "$1"; printf entered; sleep 120', 'literal', marker],
    cwd: '/tmp',
    env: { PATH: '/usr/bin:/bin' },
  })
if (result.kind !== 'started') throw new Error('Crash fixture command failed')
for await (const chunk of result.process.output) if (chunk.stream === 'terminal') break
process.send({ scope, resources })
setInterval(() => {}, 1000)
