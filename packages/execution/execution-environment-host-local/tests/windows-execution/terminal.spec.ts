/** @module-tag slow */
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { createWindowsRetainedTerminalFactory } from '../../src/windows-execution/terminal.ts'
import { outputOf, psString, terminalFixture } from './terminal-fixture.ts'

it('preserves a real shell across two foreground invocations and closes the original Job', async context => {
  if (process.platform !== 'win32') return context.skip()
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-terminal-')))
  const first = join(root, 'first')
  const temporary = join(root, 'temporary')
  await mkdir(first)
  await mkdir(temporary)
  const f = terminalFixture(root)
  try {
    const created = await f.manager.facility.create(f.request)
    expect(created.kind).toBe('done')
    if (created.kind !== 'done') return
    const request = { ...f.call, terminal: created.value.terminal }
    const a = await f.manager.facility.execute({
      ...request,
      script: `Set-Location -LiteralPath ${psString(first)}; $global:kept = 'persisted'; $global:LASTEXITCODE = 0`,
    })
    expect(a.kind).toBe('done')
    if (a.kind !== 'done') return
    expect(await a.value.result).toMatchObject({
      kind: 'completed',
      exit: { kind: 'code', code: 0 },
    })
    await outputOf(a.value)
    const b = await f.manager.facility.execute({
      ...request,
      requestId: randomUUID(),
      script:
        '$global:seen = (Get-Location).ProviderPath; if ($kept -ne "persisted") { throw "state lost" }; [Console]::Write("raw`r`n中文`r")',
    })
    expect(b.kind).toBe('done')
    if (b.kind !== 'done') return
    expect(b.value.process).toEqual(a.value.process)
    expect(await b.value.result).toMatchObject({
      kind: 'completed',
      exit: { kind: 'code', code: 0 },
    })
    await outputOf(b.value)
    expect(await f.manager.facility.list(f.request)).toMatchObject({
      kind: 'done',
      value: [{ state: 'idle', observedCwd: first }],
    })
    const override = await f.manager.facility.execute({
      ...request,
      requestId: randomUUID(),
      cwd: temporary,
      env: { OMNE_OVERRIDE: 'once', omne_override: 'once' },
      script: `if ((Get-Location).ProviderPath -ne ${psString(temporary)}) { throw 'cwd override missing' }; if ($env:OMNE_OVERRIDE -ne 'once') { throw 'env override missing' }; $global:overrideSeen = $env:OMNE_OVERRIDE`,
    })
    expect(override.kind).toBe('done')
    if (override.kind !== 'done') return
    await override.value.result
    await outputOf(override.value)
    expect(await f.manager.facility.list(f.request)).toMatchObject({
      kind: 'done',
      value: [{ state: 'idle', observedCwd: first }],
    })
    const verified = await f.manager.facility.execute({
      ...request,
      requestId: randomUUID(),
      script: `if ($env:OMNE_OVERRIDE) { Set-Location ${psString(root)} }; if ($seen -ne ${psString(first)} -or $overrideSeen -ne 'once') { Set-Location ${psString(root)} }`,
    })
    expect(verified.kind).toBe('done')
    if (verified.kind !== 'done') return
    await verified.value.result
    await outputOf(verified.value)
    expect(await f.manager.facility.list(f.request)).toMatchObject({
      kind: 'done',
      value: [{ state: 'idle', observedCwd: first }],
    })
    expect(await f.manager.facility.close(request)).toMatchObject({
      kind: 'done',
      value: { status: 'confirmed' },
    })
    expect(f.manager.unconfirmed()).toEqual([])
    expect(f.capacity.reading().terminals).toBe(0)
  } finally {
    await f.manager.stopAll()
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)

it('removes confirmed closed history before creating another terminal while preserving unconfirmed resources', async context => {
  if (process.platform !== 'win32') return context.skip()
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-terminal-history-')))
  const f = terminalFixture(root)
  const record = f.input.ledger.stopped
  try {
    const first = await f.manager.facility.create(f.request)
    expect(first.kind).toBe('done')
    if (first.kind !== 'done') return
    const original = { ...f.call, terminal: first.value.terminal }
    f.input.ledger.stopped = async () => 'unavailable'
    expect(await f.manager.facility.close(original)).toMatchObject({
      kind: 'done',
      value: { status: 'unconfirmed' },
    })
    const second = await f.manager.facility.create({ ...f.request, requestId: randomUUID() })
    expect(second.kind).toBe('done')
    if (second.kind !== 'done') return
    expect(f.manager.unconfirmed()).toHaveLength(2)
    expect(await f.manager.facility.list(f.call)).toMatchObject({
      kind: 'done',
      value: [
        expect.objectContaining({ state: 'invalid' }),
        expect.objectContaining({ state: 'idle' }),
      ],
    })
    f.input.ledger.stopped = record
    expect(await f.manager.facility.close(original)).toMatchObject({
      kind: 'done',
      value: { status: 'confirmed' },
    })
    const third = await f.manager.facility.create({ ...f.request, requestId: randomUUID() })
    expect(third.kind).toBe('done')
    if (third.kind !== 'done') return
    expect(third.value.terminal).not.toEqual(first.value.terminal)
    expect(await f.manager.facility.execute({ ...original, script: '' })).toMatchObject({
      kind: 'rejected',
      reason: 'notFound',
    })
    expect(await f.manager.facility.list(f.call)).toMatchObject({
      kind: 'done',
      value: [
        expect.objectContaining({ terminal: second.value.terminal }),
        expect.objectContaining({ terminal: third.value.terminal }),
      ],
    })
    expect(await f.manager.stopAll()).toEqual([])
    expect(await f.manager.facility.list(f.call)).toMatchObject({ kind: 'done', value: [] })
  } finally {
    f.input.ledger.stopped = record
    await f.manager.stopAll()
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)

it('reserves retained identity before start and gates native startup with its retention ledger', async context => {
  if (process.platform !== 'win32') return context.skip()
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-terminal-retained-')))
  const f = terminalFixture(root)
  const factory = createWindowsRetainedTerminalFactory(f.input)
  const backend = factory({
    request: { ...f.request, retain: 'session' },
    ledger: f.input.ledger,
    scope: f.input.scope,
    closed: () => false,
  })
  expect(backend).toBeDefined()
  expect(f.plans).toEqual([])
  if (backend === undefined) return
  context.onTestFinished(async () => {
    await backend.stop()
  })
  try {
    expect(backend.resource.key).toBe(backend.terminal.id)
    expect((await backend.start()).kind).toBe('done')
    const a = await backend.execute({
      ...f.call,
      terminal: backend.terminal,
      script: '$global:retained = 42',
    })
    expect(a.kind).toBe('done')
    if (a.kind !== 'done') return
    await a.value.result
    await outputOf(a.value)
    const b = await backend.execute({
      ...f.call,
      terminal: backend.terminal,
      script: 'Start-Sleep -Seconds 30',
    })
    expect(b.kind).toBe('done')
    if (b.kind !== 'done') return
    expect(await a.value.stop('forced')).toBe('unconfirmed')
    expect(backend.information().state).toBe('running')
    expect(await b.value.stop('forced')).toBe('confirmed')
    expect(backend.information().state).toBe('closed')
  } finally {
    await backend.stop()
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)
