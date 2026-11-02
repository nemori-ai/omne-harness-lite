/** @module-tag slow */
import { spawn, spawnSync } from 'node:child_process'
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

async function retainedFixture(retentionLedger = recorder()) {
  const provider = createHostFilesProvider({ domain: createHostFilesDomain() })
  providers.push(provider)
  if (provider.listRecoveryResources === undefined || provider.recover === undefined)
    throw new Error('retention recovery missing')
  const listResources = provider.listRecoveryResources.bind(provider)
  const recover = provider.recover.bind(provider)
  const retentionScope = scope()
  const released = new AbortController()
  const acquire = async (origin: string, own = recorder()) => {
    const result = await provider.acquire({
      tenant: access.tenant,
      acquisition: acquisitionRef(randomUUID()),
      origin: originRef(origin),
      scope: scope(),
      ledger: own.ledger,
      retention: {
        scope: retentionScope,
        ledger: retentionLedger.ledger,
        released: released.signal,
      },
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
    if (result.kind !== 'acquired') throw new Error('retained acquisition')
    const terminal = result.lease.facility('terminal')
    if (terminal === undefined || terminal.attach === undefined || terminal.detach === undefined)
      throw new Error('retention facility missing')
    return { lease: result.lease, terminal, own, request: { ...base, origin: originRef(origin) } }
  }
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'omne-retained-terminal-')))
  roots.push(cwd)
  return {
    provider,
    acquire,
    cwd,
    retentionScope,
    retentionLedger,
    released,
    listResources,
    recover,
  }
}

it('retains one real shell across acquisition release and recovers its zero-attachment scope', async context => {
  if (!(await prerequisites()))
    return context.skip(true, 'Linux PTY and systemd prerequisites unavailable')
  const f = await retainedFixture()
  const a = await f.acquire('a')
  await mkdir(join(f.cwd, 'child'))
  const terminal = value(
    await a.terminal.create({ ...a.request, cwd: f.cwd, env, retain: 'session' }),
  ).terminal
  expect(f.retentionLedger.resources).toHaveLength(1)
  expect(a.own.resources).toHaveLength(0)
  expect((await run(a.terminal, terminal, 'cd child', a.request)).result).toMatchObject({
    kind: 'completed',
  })
  expect(a.own.resources).toHaveLength(1)
  expect(await a.lease.release()).toMatchObject({ kind: 'released' })
  a.own.closed.abort()
  expect(f.retentionLedger.stops).toEqual([])
  expect(await a.terminal.execute({ ...a.request, terminal, script: 'true' })).toMatchObject({
    reason: 'closed',
  })
  const b = await f.acquire('b')
  expect(await b.terminal.attach?.({ ...b.request, terminal })).toMatchObject({ kind: 'done' })
  expect((await run(b.terminal, terminal, 'pwd', b.request)).bytes.toString()).toBe(
    `${f.cwd}/child\r\n`,
  )
  expect(b.own.resources).toHaveLength(1)
  expect(await b.lease.release()).toMatchObject({ kind: 'released' })
  const listed = await f.listResources(f.retentionScope)
  expect(listed.kind).toBe('listed')
  if (listed.kind !== 'listed') throw new Error('retained scope listing')
  expect(listed.resources).toHaveLength(1)
  f.released.abort()
  for (const resource of listed.resources)
    expect(await f.recover(resource)).toMatchObject({ status: 'confirmedStopped' })
  expect(f.retentionLedger.stops).toContain('confirmed')
  expect(await f.provider.retire()).toMatchObject({ kind: 'drained' })
}, 30_000)

it('keeps a real retained terminal busy and detaching another acquisition leaves its leg running', async context => {
  if (!(await prerequisites()))
    return context.skip(true, 'Linux PTY and systemd prerequisites unavailable')
  const f = await retainedFixture()
  const a = await f.acquire('a')
  const b = await f.acquire('b')
  const terminal = value(
    await a.terminal.create({ ...a.request, cwd: f.cwd, env, retain: 'session' }),
  ).terminal
  await b.terminal.attach?.({ ...b.request, terminal })
  const handle = value(
    await a.terminal.execute({ ...a.request, terminal, script: 'sleep 1; printf survived' }),
  )
  expect(await b.terminal.execute({ ...b.request, terminal, script: 'true' })).toMatchObject({
    reason: 'busy',
  })
  expect(await b.terminal.detach?.({ ...b.request, terminal })).toMatchObject({
    value: { status: 'confirmed' },
  })
  expect(await b.terminal.attach?.({ ...b.request, terminal })).toMatchObject({ reason: 'closed' })
  const chunks: Uint8Array[] = []
  for await (const chunk of handle.output) chunks.push(chunk.data)
  expect(await handle.result).toMatchObject({ kind: 'completed', exit: { code: 0 } })
  expect(Buffer.concat(chunks).toString()).toBe('survived')
  expect(value(await a.terminal.close({ ...a.request, terminal }))).toEqual({ status: 'confirmed' })
}, 30_000)

it('prevents real retained creation when its scope closes during durable permission', async context => {
  if (!(await prerequisites()))
    return context.skip(true, 'Linux PTY and systemd prerequisites unavailable')
  const owner = recorder()
  let grant: (value: 'confirmed') => void = () => undefined
  let entered: () => void = () => undefined
  const permission = new Promise<'confirmed'>(resolve => {
    grant = resolve
  })
  const waiting = new Promise<void>(resolve => {
    entered = resolve
  })
  const f = await retainedFixture({
    ...owner,
    ledger: {
      ...owner.ledger,
      permit: () => {
        entered()
        return permission
      },
    },
  })
  const a = await f.acquire('a')
  const creating = a.terminal.create({ ...a.request, cwd: f.cwd, env, retain: 'session' })
  await waiting
  expect(await f.listResources(f.retentionScope)).toMatchObject({
    kind: 'listed',
    resources: owner.resources,
  })
  f.released.abort()
  for (const resource of owner.resources)
    expect(await f.recover(resource)).toMatchObject({ status: 'pending' })
  grant('confirmed')
  expect(await creating).toMatchObject({ reason: 'closed' })
  expect(owner.stops).toContain('confirmed')
  expect(await f.provider.retire()).toMatchObject({ kind: 'drained' })
}, 30_000)

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

it.for([
  { script: 'return 0', code: 0 },
  { script: 'return 7', code: 7 },
  { script: 'return 125', code: 125 },
  { script: 'false', code: 1 },
])(
  'completes $script and restores temporary cwd and env before the next leg',
  { timeout: 30_000 },
  async ({ script, code }, context) => {
    if (!(await prerequisites()))
      return context.skip(true, 'Linux PTY and systemd prerequisites unavailable')
    const f = await fixture()
    const temporary = join(f.cwd, 'temporary')
    await mkdir(temporary)
    const ref = value(await f.terminal.create({ ...base, cwd: f.cwd, env })).terminal
    const leg = await run(f.terminal, ref, `printf '%s ' "$STATE"; pwd; ${script}`, {
      cwd: temporary,
      env: { STATE: 'temporary' },
    })
    expect(leg.result).toMatchObject({ kind: 'completed', exit: { code } })
    expect(leg.bytes.toString()).toBe(`temporary ${temporary}\r\n`)
    expect(value(await f.terminal.list(base))).toEqual([
      { terminal: ref, state: 'idle', observedCwd: f.cwd },
    ])
    expect((await run(f.terminal, ref, 'printf "%s " "$STATE"; pwd')).bytes.toString()).toBe(
      `base ${f.cwd}\r\n`,
    )
  },
)

it('keeps cwd and exported state changed before an early return without overrides', async context => {
  if (!(await prerequisites()))
    return context.skip(true, 'Linux PTY and systemd prerequisites unavailable')
  const f = await fixture()
  const child = join(f.cwd, 'child')
  await mkdir(child)
  const ref = value(await f.terminal.create({ ...base, cwd: f.cwd, env })).terminal
  expect(
    (await run(f.terminal, ref, 'cd child; export STATE=changed; return 0')).result,
  ).toMatchObject({
    kind: 'completed',
    exit: { code: 0 },
  })
  expect(value(await f.terminal.list(base))).toEqual([
    { terminal: ref, state: 'idle', observedCwd: child },
  ])
  expect((await run(f.terminal, ref, 'printf "%s " "$STATE"; pwd')).bytes.toString()).toBe(
    `changed ${child}\r\n`,
  )
}, 30_000)

it.for([0, 7])(
  'invalidates the terminal when its shell exits with code %i',
  { timeout: 30_000 },
  async (code, context) => {
    if (!(await prerequisites()))
      return context.skip(true, 'Linux PTY and systemd prerequisites unavailable')
    const f = await fixture()
    const ref = value(await f.terminal.create({ ...base, cwd: f.cwd, env })).terminal
    const proceed = join(f.cwd, 'proceed')
    const handle = value(
      await f.terminal.execute({
        ...base,
        terminal: ref,
        script: `while [ ! -e '${proceed}' ]; do sleep 0.01; done; exit ${code}`,
      }),
    )
    await writeFile(proceed, '')
    expect(await handle.result).toMatchObject({ kind: 'failed', reason: 'effectUnknown' })
    expect(value(await f.terminal.list(base))).toEqual([
      { terminal: ref, state: 'invalid', observedCwd: f.cwd },
    ])
    expect(await f.terminal.execute({ ...base, terminal: ref, script: 'true' })).toMatchObject({
      kind: 'rejected',
      reason: 'closed',
    })
  },
)

it('invalidates the terminal when the original cwd cannot be restored after return', async context => {
  if (!(await prerequisites()))
    return context.skip(true, 'Linux PTY and systemd prerequisites unavailable')
  const f = await fixture()
  const original = join(f.cwd, 'original')
  const proceed = join(f.cwd, 'proceed')
  await mkdir(original)
  const ref = value(await f.terminal.create({ ...base, cwd: original, env })).terminal
  const handle = value(
    await f.terminal.execute({
      ...base,
      terminal: ref,
      cwd: f.cwd,
      script: `while [ ! -e '${proceed}' ]; do sleep 0.01; done; rmdir '${original}'; return 0`,
    }),
  )
  await writeFile(proceed, '')
  expect(await handle.result).toMatchObject({ kind: 'failed', reason: 'effectUnknown' })
  expect(value(await f.terminal.list(base))).toEqual([
    { terminal: ref, state: 'invalid', observedCwd: original },
  ])
  expect(await f.terminal.execute({ ...base, terminal: ref, script: 'true' })).toMatchObject({
    kind: 'rejected',
    reason: 'closed',
  })
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

it('keeps an unconfirmed stop pending until the original supervisor can be reached again', async context => {
  if (!(await prerequisites()))
    return context.skip(true, 'Linux PTY and systemd prerequisites unavailable')
  const record = recorder()
  const f = await fixture(record.ledger)
  const ref = value(await f.terminal.create({ ...base, cwd: f.cwd, env })).terminal
  const handle = value(await f.terminal.execute({ ...base, terminal: ref, script: 'sleep 30' }))
  const address = process.env['DBUS_SESSION_BUS_ADDRESS']
  const runtimeDirectory = process.env['XDG_RUNTIME_DIR']
  const unreachableDirectory = join(f.cwd, 'unreachable-runtime')
  process.env['XDG_RUNTIME_DIR'] = unreachableDirectory
  process.env['DBUS_SESSION_BUS_ADDRESS'] = `unix:path=${unreachableDirectory}/bus`
  try {
    const supervisor = spawnSync('systemctl', ['--user', 'is-system-running'], {
      encoding: 'utf8',
      timeout: 10_000,
    })
    expect(supervisor.error).toBeUndefined()
    expect(supervisor.status).toBeGreaterThan(0)
    expect(await handle.stop('forced')).toBe('unconfirmed')
    expect(record.stops).toContain('unconfirmed')
  } finally {
    if (address === undefined) delete process.env['DBUS_SESSION_BUS_ADDRESS']
    else process.env['DBUS_SESSION_BUS_ADDRESS'] = address
    if (runtimeDirectory === undefined) delete process.env['XDG_RUNTIME_DIR']
    else process.env['XDG_RUNTIME_DIR'] = runtimeDirectory
  }
  expect(await handle.stop('forced')).toBe('confirmed')
  expect(record.stops.at(-1)).toBe('confirmed')
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
