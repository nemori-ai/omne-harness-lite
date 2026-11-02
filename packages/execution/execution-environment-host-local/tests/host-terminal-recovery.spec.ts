/** @module-tag slow */
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  acquisitionRef,
  originRef,
  type EnvironmentLease,
  type EnvironmentProvider,
  type FacilityResult,
  type ManagedResource,
  type ProcessHandle,
  type ProviderAcquireInput,
  type ResourceLedger,
  type TerminalFacility,
} from '@omne-harness/execution-environment-contract'
import {
  createHostFilesDomain,
  createHostFilesProvider,
} from '@omne-harness/execution-environment-host-local'
import { probeCommandPrerequisites, probeTerminalPrerequisites } from '../src/host-probe.ts'

const enabled = process.platform === 'linux' && process.env['OMNE_HOST_TERMINAL_LINUX'] === '1'
const parsed = tenantCodec.parse(
  JSON.stringify({
    organization: 'org_0123456789abcdefghjkmnpqrs',
    account: 'acc_0123456789abcdefghjkmnpqrs',
  }),
)
if (!parsed.ok) throw new Error('tenant fixture')
const access = { principal: 'terminal-test', tenant: parsed.value }
const binding = { kind: 'host_machine' } as const
const base = { access, binding, origin: originRef('terminal-test'), requestId: 'operation' }
const providers: EnvironmentProvider[] = []
const roots: string[] = []
const env = { PATH: '/usr/bin:/bin', LANG: 'C', STATE: 'base' }

afterEach(async () => {
  await Promise.all(providers.splice(0).map(provider => provider.retire()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function prerequisites() {
  return (
    enabled &&
    (await probeCommandPrerequisites(10_000)).kind === 'satisfied' &&
    (await probeTerminalPrerequisites()).length === 0
  )
}
function value<T>(result: FacilityResult<T>): T {
  if (result.kind !== 'done') throw new Error(`expected done, got ${JSON.stringify(result)}`)
  return result.value
}
function scope() {
  const text = `terminal-${randomUUID()}`
  function valid(ref: string): ref is ProviderAcquireInput['scope']['ref'] {
    return ref.length > 0
  }
  if (!valid(text)) throw new Error('scope fixture')
  return { ref: text }
}
function recorder() {
  const resources: ManagedResource[] = []
  const stops: ('confirmed' | 'unconfirmed')[] = []
  const closed = new AbortController()
  const ledger: ResourceLedger = {
    closed: closed.signal,
    async plan(resource) {
      resources.push(resource)
      return 'recorded'
    },
    async permit() {
      return 'confirmed'
    },
    async adopt() {
      return 'confirmed'
    },
    async stopped(_key, status) {
      stops.push(status)
      return 'recorded'
    },
  }
  return { ledger, resources, stops, closed }
}
async function fixture(ledger = recorder().ledger) {
  const provider = createHostFilesProvider({ domain: createHostFilesDomain() })
  providers.push(provider)
  const ownerScope = scope()
  const acquire = async (): Promise<EnvironmentLease> => {
    const result = await provider.acquire({
      tenant: access.tenant,
      acquisition: acquisitionRef(randomUUID()),
      origin: base.origin,
      scope: ownerScope,
      ledger,
      placement: {
        kind: 'placement',
        binding,
        quotaDomain: provider.quotaDomain,
        continuity: provider.continuity,
        provider: {
          name: provider.name,
          generation: provider.generation,
          version: provider.version,
        },
        requirement: { allowedBindings: [binding], facilities: ['terminal'], isolation: [] },
      },
    })
    if (result.kind !== 'acquired') throw new Error('acquisition fixture')
    return result.lease
  }
  const lease = await acquire()
  const terminal = lease.facility('terminal')
  if (terminal === undefined) throw new Error('terminal facility missing')
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'omne-terminal-test-')))
  roots.push(cwd)
  return { provider, lease, terminal, cwd, acquire, scope: ownerScope }
}
async function run(
  terminal: TerminalFacility<unknown>,
  ref: Parameters<TerminalFacility<unknown>['execute']>[0]['terminal'],
  script: string,
  extra: Partial<Parameters<TerminalFacility<unknown>['execute']>[0]> = {},
) {
  const handle = value(await terminal.execute({ ...base, terminal: ref, script, ...extra }))
  const chunks: Uint8Array[] = []
  for await (const chunk of handle.output) chunks.push(chunk.data)
  const result = await handle.result
  return { handle, result, bytes: Buffer.concat(chunks) }
}

it('runs a real PTY, keeps cwd, restores temporary overrides, and preserves non-UTF8 bytes', async context => {
  if (!(await prerequisites()))
    return context.skip(true, 'Linux PTY and systemd prerequisites unavailable')
  const f = await fixture()
  await mkdir(join(f.cwd, 'child'))
  const ref = value(await f.terminal.create({ ...base, cwd: f.cwd, env })).terminal
  expect((await run(f.terminal, ref, 'test -t 0 && test -t 1 && cd child')).result).toMatchObject({
    kind: 'completed',
    exit: { code: 0 },
  })
  expect((await run(f.terminal, ref, 'pwd')).bytes.toString()).toBe(`${f.cwd}/child\r\n`)
  expect(
    (
      await run(f.terminal, ref, 'printf "%s " "$STATE"; pwd', {
        cwd: f.cwd,
        env: { STATE: 'temporary' },
      })
    ).bytes.toString(),
  ).toBe(`temporary ${f.cwd}\r\n`)
  expect((await run(f.terminal, ref, 'printf "%s " "$STATE"; pwd')).bytes.toString()).toBe(
    `base ${f.cwd}/child\r\n`,
  )
  expect((await run(f.terminal, ref, "stty -onlcr; printf '\\377\\033[31mZ\\r\\n'")).bytes).toEqual(
    Buffer.from([255, 27, 91, 51, 49, 109, 90, 13, 10]),
  )
  expect(value(await f.terminal.close({ ...base, terminal: ref }))).toEqual({ status: 'confirmed' })
  expect(await f.terminal.execute({ ...base, terminal: ref, script: 'true' })).toMatchObject({
    kind: 'rejected',
    reason: 'closed',
  })
}, 30_000)

it('isolates acquisition references and rejects a second running leg while another terminal continues', async context => {
  if (!(await prerequisites()))
    return context.skip(true, 'Linux PTY and systemd prerequisites unavailable')
  const f = await fixture()
  const ref = value(await f.terminal.create({ ...base, cwd: f.cwd, env })).terminal
  const second = (await f.acquire()).facility('terminal')
  if (second === undefined) throw new Error('second terminal missing')
  expect(value(await second.list(base))).toEqual([])
  expect(await second.execute({ ...base, terminal: ref, script: 'true' })).toMatchObject({
    kind: 'rejected',
    reason: 'notFound',
  })
  expect(
    await f.terminal.close({ ...base, terminal: { ...ref, generation: 'wrong' } }),
  ).toMatchObject({ kind: 'rejected', reason: 'notFound' })
  const busy = value(await f.terminal.execute({ ...base, terminal: ref, script: 'sleep 30' }))
  expect(await f.terminal.execute({ ...base, terminal: ref, script: 'true' })).toMatchObject({
    kind: 'rejected',
    reason: 'busy',
  })
  const other = value(await second.create({ ...base, cwd: f.cwd, env })).terminal
  expect((await run(second, other, 'printf alive')).bytes.toString()).toBe('alive')
  expect(await busy.stop('forced')).toBe('confirmed')
  expect(await busy.result).toMatchObject({ kind: 'failed', reason: 'effectUnknown' })
  expect(value(await f.terminal.list(base))).toContainEqual({
    terminal: ref,
    state: 'invalid',
    observedCwd: f.cwd,
  })
  expect((await run(second, other, 'printf still-alive')).bytes.toString()).toBe('still-alive')
}, 30_000)

it('does not treat user output or late background writers as successful completion', async context => {
  if (!(await prerequisites()))
    return context.skip(true, 'Linux PTY and systemd prerequisites unavailable')
  const f = await fixture()
  const ref = value(await f.terminal.create({ ...base, cwd: f.cwd, env })).terminal
  const forged = await run(f.terminal, ref, `printf '{"t":"finished","code":0}'; false`)
  expect(forged.result).toMatchObject({ kind: 'completed', exit: { code: 1 } })
  expect(forged.bytes.toString()).toBe('{"t":"finished","code":0}')
  const background = await run(f.terminal, ref, '(sleep 2; printf late) &')
  expect(background.result).toMatchObject({ kind: 'failed', reason: 'effectUnknown' })
  expect(await f.terminal.execute({ ...base, terminal: ref, script: 'printf next' })).toMatchObject(
    { kind: 'rejected', reason: 'closed' },
  )
}, 30_000)

it('keeps the permit gate closed and drains a live terminal on release', async context => {
  if (!(await prerequisites()))
    return context.skip(true, 'Linux PTY and systemd prerequisites unavailable')
  const record = recorder()
  let permit: (() => void) | undefined
  let entered: (() => void) | undefined
  const wait = new Promise<void>(resolve => {
    permit = resolve
  })
  const permitting = new Promise<void>(resolve => {
    entered = resolve
  })
  const f = await fixture({
    ...record.ledger,
    async permit() {
      entered?.()
      await wait
      return 'closed'
    },
  })
  const marker = join(f.cwd, 'started')
  const startup = join(f.cwd, 'startup.sh')
  await writeFile(startup, `printf started > '${marker}'\n`)
  const creating = f.terminal.create({ ...base, cwd: f.cwd, env: { ...env, BASH_ENV: startup } })
  await permitting
  await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' })
  // A planned scope can exist before the shell. Releasing during permit still seals this acquisition.
  const releasing = f.lease.release()
  permit?.()
  expect(await creating).toMatchObject({ kind: 'rejected', reason: 'closed' })
  expect(await releasing).toEqual({ kind: 'released' })
  await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await f.terminal.list(base)).toMatchObject({ kind: 'rejected', reason: 'closed' })
  const live = await fixture()
  const ref = value(await live.terminal.create({ ...base, cwd: live.cwd, env })).terminal
  const handle = value(await live.terminal.execute({ ...base, terminal: ref, script: 'sleep 30' }))
  expect(await live.lease.release()).toEqual({ kind: 'released' })
  expect(await handle.result).toMatchObject({ kind: 'failed', reason: 'effectUnknown' })
}, 30_000)

function recoverInNewProcess(scopeRef: string): Promise<unknown> {
  const entry = pathToFileURL(join(import.meta.dirname, '../dist/index.js')).href
  const source = `import {createHostFilesProvider,createHostFilesDomain} from ${JSON.stringify(entry)};
const provider=createHostFilesProvider({domain:createHostFilesDomain()});
const listed=await provider.listRecoveryResources({ref:${JSON.stringify(scopeRef)}});
const results=listed.kind==='listed'?await Promise.all(listed.resources.map(resource=>provider.recover(resource))):[];
await provider.retire(); process.stdout.write(JSON.stringify({listed,results}));`
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', source], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    it('keeps an unconfirmed stop pending until the original supervisor can be reached again', async context => {
      if (!(await prerequisites()))
        return context.skip(true, 'Linux PTY and systemd prerequisites unavailable')
      const record = recorder()
      const f = await fixture(record.ledger)
      const ref = value(await f.terminal.create({ ...base, cwd: f.cwd, env })).terminal
      const handle = value(await f.terminal.execute({ ...base, terminal: ref, script: 'sleep 30' }))
      const address = process.env['DBUS_SESSION_BUS_ADDRESS']
      process.env['DBUS_SESSION_BUS_ADDRESS'] = 'unix:path=/nonexistent-omne-terminal-bus'
      try {
        expect(await handle.stop('forced')).toBe('unconfirmed')
        expect(record.stops).toContain('unconfirmed')
      } finally {
        if (address === undefined) delete process.env['DBUS_SESSION_BUS_ADDRESS']
        else process.env['DBUS_SESSION_BUS_ADDRESS'] = address
      }
      expect(await handle.stop('forced')).toBe('confirmed')
      expect(record.stops.at(-1)).toBe('confirmed')
    }, 30_000)
    let output = ''
    let errors = ''
    child.stdout.setEncoding('utf8').on('data', (text: string) => {
      output += text
    })
    child.stderr.setEncoding('utf8').on('data', (text: string) => {
      errors += text
    })
    child.once('error', reject)
    child.once('close', code => {
      if (code !== 0) return reject(new Error(errors))
      try {
        resolve(JSON.parse(output))
      } catch (error) {
        reject(error)
      }
    })
  })
}

it('lets a new process list and stop original terminal and command scopes without replaying scripts', async context => {
  if (!(await prerequisites()))
    return context.skip(true, 'Linux PTY and systemd prerequisites unavailable')
  const record = recorder()
  const f = await fixture(record.ledger)
  const ref = value(await f.terminal.create({ ...base, cwd: f.cwd, env })).terminal
  const marker = join(f.cwd, 'once')
  const terminal = value(
    await f.terminal.execute({
      ...base,
      terminal: ref,
      script: `printf x >> '${marker}'; sleep 30`,
    }),
  )
  const command = f.lease.facility('command')
  if (command === undefined) throw new Error('command facility missing')
  const process: ProcessHandle = value(
    await command.start({
      ...base,
      cwd: f.cwd,
      env,
      executable: '/bin/sleep',
      args: ['30'],
      outputMode: 'separate',
    }),
  )
  const result = await recoverInNewProcess(f.scope.ref)
  expect(result).toMatchObject({
    listed: { kind: 'listed', resources: expect.arrayContaining(record.resources) },
    results: [{ status: 'confirmedStopped' }, { status: 'confirmedStopped' }],
  })
  expect(await terminal.result).toMatchObject({ kind: 'failed', reason: 'effectUnknown' })
  expect(await process.result).toMatchObject({ kind: 'failed', reason: 'effectUnknown' })
  expect(await readFile(marker, 'utf8')).toBe('x')
}, 30_000)
