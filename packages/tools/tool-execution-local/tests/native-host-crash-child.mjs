import { readFile } from 'node:fs/promises'
import { composeMigrations } from '@omne-harness-lite/storage'
import { hostEnvironmentMigrations } from '@omne-harness-lite/execution-environments-host/migrations'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { createHostEnvironment } from '@omne-harness-lite/execution-environments-host'

const input = JSON.parse(await readFile(process.argv[2], 'utf8'))
const storage = await openStorage({
  dialect: 'sqlite',
  file: input.database,
  migrations: composeMigrations(hostEnvironmentMigrations),
  upgrade: false,
})
const waiting = new Map()
let next = 0
process.on('message', reply => {
  const slot = waiting.get(reply.id)
  if (!slot) return
  waiting.delete(reply.id)
  if (reply.error) slot.reject(new Error(reply.error))
  else slot.resolve(reply.result)
})
function record(kind, data) {
  const id = ++next
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject })
    process.send({ kind, id, ...data })
  })
}
const authorization = {}
const provider = createHostEnvironment({
  name: 'native-host',
  storage,
  access: {
    authorize: async () => ({
      kind: 'authorized',
      identity: {
        binding: 'controlled-test',
        principal: 'owner-user',
        principalKind: 'human',
        scope: input.scope,
        consumer: 'tool',
        contextKeys: [],
      },
    }),
  },
})
const placement = {
  scope: input.scope,
  execution: input.callId,
  tool: input.tool,
  requirement: { bindingLayer: 'host_machine', facilities: ['command'] },
  permission: 'always-allow',
  revision: 'controlled-test',
  evidence: null,
}
const acquired = await provider.acquire({
  scope: input.scope,
  authorization,
  call: { tool: input.tool, execution: input.callId },
  requirement: placement.requirement,
  placement,
  resources: {
    closed: new AbortController().signal,
    plan: resource => record('plan', { resource }),
    permit: key => record('permit', { key }),
    adopt: key => record('adopt', { key }),
    stopped: (key, status) => record('stopped', { key, status }),
  },
})
if (acquired.kind !== 'acquired') throw new Error(`Host acquisition failed: ${acquired.reason}`)
await record('acquired', { placement, description: acquired.lease.facilities.description })
const commands = acquired.lease.facilities.command
let started
if (input.mode === 'terminal') {
  const terminal = await commands.createTerminal({
    cwd: input.directory,
    env: { PATH: '/usr/bin:/bin' },
  })
  if (terminal.kind !== 'created') throw new Error('Host terminal creation failed')
  started = await commands.executeTerminal({
    terminal: terminal.terminal,
    script: `printf x >> '${input.marker.replaceAll("'", "'\\''")}'; printf entered; sleep 120`,
  })
} else {
  started = await commands.start({
    executable: '/bin/sh',
    args: ['-c', 'printf x >> "$1"; printf entered; sleep 120', 'literal', input.marker],
    cwd: input.directory,
    env: { PATH: '/usr/bin:/bin' },
  })
}
if (started.kind !== 'started') throw new Error(`Host start failed: ${started.reason}`)
for await (const chunk of started.process.output) {
  if (new TextDecoder().decode(chunk.data).includes('entered')) break
}
process.send({ kind: 'ready' })
setInterval(() => {}, 1000)
