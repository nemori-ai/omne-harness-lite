import { describe, expect, it, vi } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  originRef,
  type EnvironmentFacilities,
  type EnvironmentLease,
  type FileSystemFacility,
} from '@omne-harness/execution-environment-contract'
import { createAuthorEnvironment, type FileObjectNaming } from '../../src/author-environment.ts'
import { callId, principalA, tenantA } from '../coordinator-values.ts'

describe('current file authorization', () => {
  it('names every write again and never calls a facility after revocation', async () => {
    const write = vi.fn<FileSystemFacility<unknown>['write']>(async request => ({
      kind: 'rejected',
      requestId: request.requestId,
      reason: 'unsupported',
    }))
    const files: FileSystemFacility<unknown> = {
      write,
      read: vi.fn(),
      stat: vi.fn(),
      close: vi.fn(),
      list: vi.fn(),
      search: vi.fn(),
      mkdir: vi.fn(),
      remove: vi.fn(),
      move: vi.fn(),
      copy: vi.fn(),
      commitBatch: vi.fn(),
      recoverBatch: vi.fn(),
    }
    const facilities: Partial<EnvironmentFacilities> = { files }
    const lease: EnvironmentLease = {
      placement: {
        kind: 'placement',
        binding: { kind: 'host_machine' },
        provider: { name: 'fixture', generation: '1', version: '1' },
        quotaDomain: 'fixture',
        continuity: { kind: 'not_guaranteed' },
        requirement: {
          allowedBindings: [{ kind: 'host_machine' }],
          isolation: [],
          facilities: ['files'],
        },
      },
      instance: { id: 'instance', generation: '1' },
      continuity: { kind: 'not_guaranteed' },
      facility: key => facilities[key],
      invalidated: new Promise(() => {}),
      release: async () => ({ kind: 'released' }),
    }
    let allowed = true
    const name = vi.fn(async () =>
      allowed
        ? succeed({ token: 'legitimate-parent' })
        : fail({ kind: 'denied' as const, action: 'write' }),
    )
    const value = createAuthorEnvironment({
      access: { principal: principalA, tenant: tenantA, call: callId('call') },
      origin: originRef('original'),
      lease,
      naming: { name },
      facts: { system: 'fixture', release: '1', architecture: 'fixture', facilities: ['files'] },
    })
    expect(value.facts.os).toBe('fixture')
    expect(value.facts.system).toBe('fixture')
    const request = {
      path: '/authorized/new',
      bytes: new Uint8Array([42]),
      mode: 'create' as const,
    }
    await value.files.write(request)
    allowed = false
    expect(await value.files.write(request)).toMatchObject({
      kind: 'rejected',
      reason: 'notAuthorized',
    })
    expect(write).toHaveBeenCalledTimes(1)
    expect(name).toHaveBeenCalledTimes(2)
    expect(name.mock.calls[0]).toMatchObject([{ role: 'parent', path: request.path }])
    expect(write.mock.calls[0]?.[0]).toMatchObject({
      named: { token: 'legitimate-parent' },
      origin: 'original',
      access: { principal: principalA, tenant: tenantA },
    })
    expect(value).not.toHaveProperty('lease')
    expect(value).not.toHaveProperty('access')
  })
})

function fixture(
  terminal?: EnvironmentFacilities['terminal'],
  command?: EnvironmentFacilities['command'],
) {
  const files: FileSystemFacility<unknown> = {
    read: vi.fn(),
    write: vi.fn(),
    stat: vi.fn(),
    close: vi.fn(),
    list: vi.fn(),
    search: vi.fn(),
    mkdir: vi.fn(),
    remove: vi.fn(),
    move: vi.fn(),
    copy: vi.fn(),
    commitBatch: vi.fn(),
    recoverBatch: vi.fn(),
  }
  const facilities: Partial<EnvironmentFacilities> = {
    files,
    ...(terminal ? { terminal } : {}),
    ...(command ? { command } : {}),
  }
  const lease: EnvironmentLease = {
    placement: {
      kind: 'placement',
      binding: { kind: 'host_machine' },
      provider: { name: 'fixture', generation: '1', version: '1' },
      quotaDomain: 'fixture',
      continuity: { kind: 'not_guaranteed' },
      requirement: {
        allowedBindings: [{ kind: 'host_machine' }],
        isolation: [],
        facilities: ['files'],
      },
    },
    instance: { id: 'instance', generation: '1' },
    continuity: { kind: 'not_guaranteed' },
    facility: key => facilities[key],
    invalidated: new Promise(() => {}),
    release: async () => ({ kind: 'released' }),
  }
  const name = vi.fn<FileObjectNaming<typeof principalA>['name']>(async request =>
    request.path.includes('denied')
      ? fail({ kind: 'denied', action: request.operation })
      : succeed({ token: `${request.role}:${request.path}` }),
  )
  const value = createAuthorEnvironment({
    access: { principal: principalA, tenant: tenantA, call: callId('call') },
    origin: originRef('original'),
    lease,
    naming: { name },
    facts: { system: 'fixture', release: '1', architecture: 'fixture', facilities: ['files'] },
  })
  return { files, value, name, facilities }
}

it.each(['move', 'copy'] as const)(
  'names the %s source and target parent before calling the facility',
  async operation => {
    const f = fixture()
    expect(
      await f.value.files[operation]({
        path: '/source',
        target: { path: '/denied/target' },
        replace: false,
      }),
    ).toMatchObject({ kind: 'rejected', reason: 'notAuthorized' })
    expect(f.files[operation]).not.toHaveBeenCalled()
    expect(f.name.mock.calls.map(([request]) => [request.path, request.role])).toEqual([
      ['/source', 'object'],
      ['/denied/target', 'parent'],
    ])
  },
)

it('names every batch entry before any publication and distinguishes create from replace', async () => {
  const f = fixture()
  const result = await f.value.files.commitBatch({
    entries: [
      { path: '/allowed', bytes: new Uint8Array([1]), expectedVersion: null },
      { path: '/denied', bytes: new Uint8Array([2]), expectedVersion: 'v1' },
    ],
  })
  expect(result).toMatchObject({ kind: 'rejected', reason: 'notAuthorized' })
  expect(f.files.commitBatch).not.toHaveBeenCalled()
  expect(f.name.mock.calls.map(([request]) => request.role)).toEqual(['parent', 'object'])
})

it('never permits tools to override the host identity and gives each operation a new request id', async () => {
  const f = fixture()
  const request = {
    path: '/file',
    named: { token: 'forged' },
    requestId: 'forged',
    origin: 'forged',
    access: { principal: 'forged', tenant: 'forged' },
    binding: { kind: 'forged' },
  }
  await f.value.files.read(request)
  await f.value.files.read(request)
  const calls = vi.mocked(f.files.read).mock.calls
  expect(calls[0]?.[0]).toMatchObject({
    named: { token: 'object:/file' },
    origin: 'original',
    binding: { kind: 'host_machine' },
    access: { principal: principalA, tenant: tenantA },
  })
  expect(calls[0]?.[0].requestId).not.toBe('forged')
  expect(calls[0]?.[0].requestId).not.toBe(calls[1]?.[0].requestId)
})

it('fixes the path and bytes before asynchronous naming', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<void>()
  f.name.mockImplementationOnce(async () => {
    await gate.promise
    return succeed({ token: 'original-object' })
  })
  const request = { path: '/original', mode: 'replace' as const, bytes: new Uint8Array([1]) }
  const pending = f.value.files.write(request)
  request.path = '/forged'
  request.bytes[0] = 99
  gate.resolve()
  await pending
  expect(f.files.write).toHaveBeenCalledWith(
    expect.objectContaining({
      path: '/original',
      bytes: new Uint8Array([1]),
      named: { token: 'original-object' },
    }),
  )
})

it('fails closed on unknown naming and never replaces terminal operations with command', async () => {
  const f = fixture()
  f.name.mockResolvedValueOnce(
    fail({
      kind: 'commit-unknown',
      operation: (await import('../coordinator-values.ts')).operationId('naming'),
    }),
  )
  expect(await f.value.files.read({ path: '/file' })).toMatchObject({ kind: 'unknown' })
  expect(f.files.read).not.toHaveBeenCalled()
  expect(
    await f.value.terminal.execute({ terminal: { id: 'old', generation: '1' }, script: 'echo' }),
  ).toMatchObject({ kind: 'rejected', reason: 'unavailable' })
})

it('checks optional terminal attachment capabilities and keeps the current acquisition origin', async () => {
  const terminal: EnvironmentFacilities['terminal'] = {
    create: vi.fn(),
    execute: vi.fn(),
    close: vi.fn(),
    list: vi.fn(),
  }
  expect(fixture(terminal).value.terminal.retention).toBeUndefined()
  const target = { terminal: { id: 'retained', generation: '1' } }
  const attach = vi.fn(
    async (input: Parameters<EnvironmentFacilities['terminal']['close']>[0]) => ({
      kind: 'done' as const,
      requestId: input.requestId,
      value: { terminal: input.terminal },
    }),
  )
  const detach = vi.fn(
    async (input: Parameters<EnvironmentFacilities['terminal']['close']>[0]) => ({
      kind: 'done' as const,
      requestId: input.requestId,
      value: { status: 'unconfirmed' as const },
    }),
  )
  const f = fixture({ ...terminal, retention: { attach, detach } })
  const retention = f.value.terminal.retention
  if (retention === undefined) throw new Error('bound retention missing')
  const forged = {
    ...target,
    requestId: 'forged',
    origin: 'forged',
    access: { principal: 'forged', tenant: 'forged' },
    binding: { kind: 'forged' },
  }
  await retention.attach(forged)
  expect(await retention.detach(target)).toMatchObject({
    kind: 'done',
    value: { status: 'unconfirmed' },
  })
  expect(attach).toHaveBeenCalledWith(
    expect.objectContaining({
      origin: 'original',
      access: { principal: principalA, tenant: tenantA },
      terminal: target.terminal,
    }),
  )
  expect(detach).toHaveBeenCalledTimes(1)
  expect(attach.mock.calls[0]?.[0].requestId).not.toBe('forged')
  expect(attach.mock.calls[0]?.[0].requestId).not.toBe(detach.mock.calls[0]?.[0].requestId)
  f.facilities.terminal = terminal
  expect(await retention.attach(target)).toMatchObject({ kind: 'rejected', reason: 'unavailable' })
  expect(await retention.detach(target)).toMatchObject({ kind: 'rejected', reason: 'unavailable' })
  expect(attach).toHaveBeenCalledTimes(1)
  expect(detach).toHaveBeenCalledTimes(1)
})

it('lists retained processes with the current request identity only while the command facility offers it', async () => {
  const start = vi.fn<EnvironmentFacilities['command']['start']>()
  expect(fixture(undefined, { start }).value.command.retention).toBeUndefined()
  const listed = [
    {
      process: { id: 'retained', generation: '1' },
      origin: originRef('earlier'),
      handedOverAtMs: 1,
      state: 'running' as const,
      processes: 'unknown' as const,
    },
  ]
  const list = vi.fn<NonNullable<EnvironmentFacilities['command']['retention']>['list']>(
    async request => ({ kind: 'done', requestId: request.requestId, value: listed }),
  )
  const f = fixture(undefined, { start, retention: { list } })
  const retention = f.value.command.retention
  if (retention === undefined) throw new Error('bound command retention missing')
  const forged = {
    requestId: 'forged',
    origin: 'forged',
    access: { principal: 'forged', tenant: 'forged' },
    binding: { kind: 'forged' },
  }
  const answer = await retention.list(forged as unknown as Record<string, never>)
  expect(list).toHaveBeenCalledTimes(1)
  const sent = list.mock.calls[0]?.[0]
  expect(sent).toMatchObject({
    origin: 'original',
    binding: { kind: 'host_machine' },
    access: { principal: principalA, tenant: tenantA },
  })
  expect(sent?.requestId).not.toBe('forged')
  expect(answer).toEqual({ kind: 'done', requestId: sent?.requestId, value: listed })
  f.facilities.command = { start }
  expect(await retention.list({})).toMatchObject({ kind: 'rejected', reason: 'unavailable' })
  expect(list).toHaveBeenCalledTimes(1)
  expect(retention.stop).toBeUndefined()
  expect(retention.output).toBeUndefined()
  expect(f.value.command.containment).toBeUndefined()
})

it('stops and reads retained processes with the current request identity, and shows the containment', async () => {
  const start = vi.fn<EnvironmentFacilities['command']['start']>()
  type Retention = NonNullable<EnvironmentFacilities['command']['retention']>
  const list = vi.fn<Retention['list']>(async request => ({
    kind: 'done',
    requestId: request.requestId,
    value: [],
  }))
  const stop = vi.fn<NonNullable<Retention['stop']>>(async request => ({
    kind: 'done',
    requestId: request.requestId,
    value: { status: 'confirmed' },
  }))
  const output = vi.fn<NonNullable<Retention['output']>>(async request => ({
    kind: 'done',
    requestId: request.requestId,
    value: { kind: 'none' },
  }))
  const f = fixture(undefined, { start, containment: 'sealed', retention: { list, stop, output } })
  expect(f.value.command.containment).toBe('sealed')
  const retention = f.value.command.retention
  if (retention?.stop === undefined || retention.output === undefined)
    throw new Error('stop and output missing')
  const process = { id: 'retained', generation: '1' }
  const forged = {
    requestId: 'forged',
    origin: 'forged',
    access: { principal: 'forged', tenant: 'forged' },
    binding: { kind: 'forged' },
  }
  const stopped = await retention.stop({
    ...(forged as unknown as Record<string, never>),
    process,
    mode: 'graceful',
  })
  const read = await retention.output({
    ...(forged as unknown as Record<string, never>),
    process,
    from: { stdout: 3 },
  })
  const identity = {
    origin: 'original',
    binding: { kind: 'host_machine' },
    access: { principal: principalA, tenant: tenantA },
  }
  expect(stop.mock.calls[0]?.[0]).toMatchObject({ ...identity, process, mode: 'graceful' })
  expect(output.mock.calls[0]?.[0]).toMatchObject({ ...identity, process, from: { stdout: 3 } })
  expect(stop.mock.calls[0]?.[0].requestId).not.toBe('forged')
  expect(stopped).toEqual({
    kind: 'done',
    requestId: stop.mock.calls[0]?.[0].requestId,
    value: { status: 'confirmed' },
  })
  expect(read).toEqual({
    kind: 'done',
    requestId: output.mock.calls[0]?.[0].requestId,
    value: { kind: 'none' },
  })
  f.facilities.command = { start, retention: { list } }
  expect(await retention.stop({ process, mode: 'forced' })).toMatchObject({
    kind: 'rejected',
    reason: 'unavailable',
  })
  expect(await retention.output({ process })).toMatchObject({
    kind: 'rejected',
    reason: 'unavailable',
  })
  expect(stop).toHaveBeenCalledTimes(1)
  expect(output).toHaveBeenCalledTimes(1)
})
