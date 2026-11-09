import { describe, expect, it } from 'vitest'

import type { ToolLedgerStore, AccessVerdict } from '@omne-harness/tool'
import { createMemoryToolLedgerStore } from '@omne-harness/tool/testing'
import {
  createLocalStartCoordinator,
  callHostDomain,
  type StartPermitRequirement,
  type StartPermitRequirements,
  type StartCoordinatorAccess,
} from '@omne-harness/tool-host-local'
import type { FixedToolRequest } from '@omne-harness/tool-contract'
import type { StartPermit } from '@omne-harness/tool-contract/provider'
import {
  access,
  callAccess,
  request,
  startOf,
  evidence,
  callId,
  operationId,
  instanceId,
  tenantA,
  tenantB,
  principalA,
  principalB,
} from './coordinator-values.ts'
import { bindingFixture, unbox } from './author-values.ts'

const noPermit: StartPermitRequirement = { kind: 'not-required', source: evidence('no-permit-v1') }
const required: StartPermitRequirement = {
  kind: 'required',
  reason: 'requires explicit permission',
}
const requiredReason = 'authorization-permit-required-in-wave2'

function barrier() {
  let open = () => {}
  const wait = new Promise<void>(resolve => {
    open = resolve
  })
  return { wait, open }
}

async function fixture(
  options: Readonly<{
    missing?: boolean
    wrap?: (memory: ToolLedgerStore) => ToolLedgerStore
    access?: StartCoordinatorAccess<string>
  }> = {},
) {
  const memory = createMemoryToolLedgerStore()
  const store = options.wrap?.(memory) ?? memory
  let answer = noPermit
  let thrown = false
  const questions: Parameters<StartPermitRequirements<string>['check']>[0][] = []
  const source: StartPermitRequirements<string> = {
    check: async input => {
      questions.push(input)
      if (thrown) throw new Error('private request and provider error')
      return answer
    },
  }
  const create = (missing = false) =>
    createLocalStartCoordinator({
      store,
      access: options.access ?? { qualify: async () => ({ kind: 'allowed' }) },
      guardsOf: () => [],
      commitAttempts: 4,
      ...(missing ? {} : { permitRequirements: source }),
    })
  let authority = create(options.missing)
  const consumptions: Awaited<ReturnType<typeof authority.consume>>[] = []
  const author = await bindingFixture(async input => {
    const result = await authority.consume(input)
    consumptions.push(result)
    return result
  })
  const fixed = author.request
  if (fixed === undefined || fixed.availability.kind !== 'available')
    throw new Error('missing fixed request')
  const call = { ...author.access, call: callId('call-1') }
  const start = {
    kind: 'start' as const,
    operation: operationId('start-1'),
    executor: fixed.availability.executor,
    execution: { tenant: call.tenant, call: call.call, instance: instanceId, generation: '1' },
  }
  const prepare = (value = fixed) => authority.prepare({ ...call, start, request: value })
  const consume = (permit: StartPermit) =>
    authority.consume({ ...call, permit, executorReceipt: evidence('real-capsule') })
  const execute = (permit: StartPermit) =>
    author.binding.start({ ...call, start, request: fixed, permit }, author.environment)
  const records = async () => {
    const result = await memory.read(callHostDomain(call.tenant, 'start', call.call))
    if (result.kind !== 'complete') throw new Error('memory read failed')
    return result.records.flatMap(record => (record.kind === 'host' ? [record.host.value] : []))
  }
  const acceptances = async () =>
    (await records()).filter(
      value =>
        typeof value === 'object' && value !== null && Reflect.get(value, 'kind') === 'acceptance',
    )
  return {
    prepare,
    consume,
    execute,
    records,
    acceptances,
    questions,
    consumptions,
    call,
    start,
    fixed,
    memory,
    inspect: () => authority.inspect({ ...call, start }),
    launches: () => author.launches?.(),
    answer: (value: StartPermitRequirement) => {
      answer = value
    },
    throwSource: (value: boolean) => {
      thrown = value
    },
    rebuild: (missing = false) => {
      authority = create(missing)
    },
    finish: () => author.completeStop?.(start),
  }
}

describe('R2-D60 start permit requirements', () => {
  it('does not issue a permit without a requirement source', async () => {
    const store = createMemoryToolLedgerStore()
    const authority = createLocalStartCoordinator({
      store,
      access: access(),
      guardsOf: () => [],
      commitAttempts: 4,
    })
    expect(
      await authority.prepare({ ...callAccess('c1'), start: startOf('c1'), request: request() }),
    ).toMatchObject({ failure: { kind: 'unavailable', dependency: 'start-permit-requirements' } })
    expect(store.commits).toBe(0)
  })

  it('refuses a required action before it issues a permit or calls the author', async () => {
    const f = await fixture()
    f.answer(required)
    expect(await f.prepare()).toMatchObject({
      failure: { kind: 'unsupported', reason: requiredReason },
    })
    expect(await f.records()).toEqual([])
    expect(f.launches()).toBe(0)
  })

  it('persists a required rejection at consume and never revives that start', async () => {
    const f = await fixture()
    const permit = unbox(await f.prepare())
    f.answer(required)
    expect(await f.execute(permit)).toHaveProperty('failure')
    const rejection = unbox(await f.consume(permit))
    expect(rejection).toMatchObject({ kind: 'rejected', reason: requiredReason })
    expect(unbox(await f.inspect())).toEqual(rejection)
    f.answer(noPermit)
    const again = unbox(await f.prepare())
    expect(unbox(await f.consume(again))).toEqual(rejection)
    f.rebuild(true)
    expect(unbox(await f.consume(permit))).toEqual(rejection)
    expect(await f.acceptances()).toEqual([])
    expect(f.launches()).toBe(0)
  })

  it.each([
    { kind: 'unknown', diagnostic: 'private' },
    { kind: 'unavailable', diagnostic: 'private' },
    { kind: 'not-required' },
    { kind: 'not-required', source: { owner: 'incomplete' } },
    { kind: 'required' },
    null,
    { kind: 'allowed' },
  ])('keeps malformed or unknown requirement %j pending without an author call', async value => {
    const f = await fixture()
    const permit = unbox(await f.prepare())
    // Deliberately violate the provider boundary to exercise runtime validation.
    f.answer(value as StartPermitRequirement)
    expect(await f.prepare()).toMatchObject({
      failure: { kind: 'unavailable', dependency: 'start-permit-requirements' },
    })
    expect(await f.execute(permit)).toHaveProperty('failure.kind', 'commit-unknown')
    expect(unbox(await f.consume(permit))).toEqual({
      kind: 'unknown',
      diagnostic: 'start-permit-requirements unavailable',
    })
    expect(await f.acceptances()).toEqual([])
    expect(f.launches()).toBe(0)
    f.answer(noPermit)
    expect(unbox(await f.consume(permit)).kind).toBe('started')
  })

  it.each(['missing', 'throws'] as const)(
    'keeps %s source pending and retries the same permit after recovery',
    async fault => {
      const f = await fixture()
      const permit = unbox(await f.prepare())
      if (fault === 'missing') f.rebuild(true)
      else f.throwSource(true)
      expect(await f.prepare()).toHaveProperty('failure.dependency', 'start-permit-requirements')
      expect(await f.execute(permit)).toHaveProperty('failure.kind', 'commit-unknown')
      expect(unbox(await f.consume(permit))).toEqual({
        kind: 'unknown',
        diagnostic: 'start-permit-requirements unavailable',
      })
      expect(await f.acceptances()).toEqual([])
      expect(f.launches()).toBe(0)
      f.rebuild()
      f.throwSource(false)
      expect(unbox(await f.consume(permit)).kind).toBe('started')
    },
  )

  it('uses consume evidence and recognizes acceptance after source removal without another execute', async () => {
    const f = await fixture()
    const permit = unbox(await f.prepare())
    const current = evidence('no-permit-v2')
    f.answer({ kind: 'not-required', source: current })
    const live = unbox(await f.execute(permit))
    expect(f.launches()).toBe(1)
    const accepted = unbox(await f.consume(permit))
    expect(await f.acceptances()).toMatchObject([{ requirementSource: current }])
    f.rebuild(true)
    expect(unbox(await f.consume(permit))).toEqual(accepted)
    expect(unbox(await f.inspect())).toEqual(accepted)
    expect(unbox(await f.execute(permit))).toBe(live)
    expect(f.launches()).toBe(1)
    await f.finish()
  })

  it('rechecks the requirement after a CAS conflict before author execution', async () => {
    let conflict = false
    let changed = () => {}
    const f = await fixture({
      wrap: memory => ({
        durability: 'none',
        readRecord: (domain, key) => memory.readRecord(domain, key),
        due: (tenant, now, limit) => memory.due(tenant, now, limit),
        read: domain => memory.read(domain),
        commit: async input => {
          if (conflict) {
            conflict = false
            changed()
            return { kind: 'conflict', current: input.expected }
          }
          return memory.commit(input)
        },
      }),
    })
    const permit = unbox(await f.prepare())
    changed = () => f.answer(required)
    conflict = true
    expect(await f.execute(permit)).toHaveProperty('failure')
    expect(unbox(await f.inspect())).toMatchObject({ kind: 'rejected', reason: requiredReason })
    expect(f.questions).toHaveLength(3)
    expect(await f.acceptances()).toEqual([])
    expect(f.launches()).toBe(0)
  })

  it.each(['denied', 'unavailable'] as const)(
    'rechecks access after a CAS conflict changes allowed to %s',
    async kind => {
      let conflict = false
      let verdict: AccessVerdict = { kind: 'allowed' }
      const qualifications: AccessVerdict['kind'][] = []
      const f = await fixture({
        access: {
          qualify: async () => {
            qualifications.push(verdict.kind)
            return verdict
          },
        },
        wrap: memory => ({
          durability: 'none',
          readRecord: (domain, key) => memory.readRecord(domain, key),
          due: (tenant, now, limit) => memory.due(tenant, now, limit),
          read: domain => memory.read(domain),
          commit: async input => {
            if (conflict) {
              conflict = false
              verdict =
                kind === 'denied'
                  ? { kind, reason: 'membership revoked during CAS conflict' }
                  : { kind, diagnostic: 'directory unavailable during CAS conflict' }
              return { kind: 'conflict', current: input.expected }
            }
            return memory.commit(input)
          },
        }),
      })
      const permit = unbox(await f.prepare())
      const previousChecks = qualifications.length
      conflict = true
      expect(await f.execute(permit)).toHaveProperty(
        'failure.kind',
        kind === 'denied' ? 'denied' : 'commit-unknown',
      )
      expect(qualifications.slice(previousChecks)).toEqual(['allowed', 'allowed', kind])
      expect(f.consumptions).toMatchObject([
        { ok: { kind: kind === 'denied' ? 'rejected' : 'unknown' } },
      ])
      expect(f.questions).toHaveLength(2)
      expect(await f.acceptances()).toEqual([])
      expect(f.launches()).toBe(0)
      const records = await f.records()
      const kinds = records.flatMap(value =>
        typeof value === 'object' && value !== null ? [Reflect.get(value, 'kind')] : [],
      )
      verdict = { kind: 'allowed' }
      if (kind === 'denied') {
        expect(kinds).toEqual(['rejection'])
        expect(unbox(await f.inspect())).toMatchObject({
          kind: 'rejected',
          reason: 'access-denied-before-start',
        })
        expect(unbox(await f.consume(permit))).toHaveProperty('kind', 'rejected')
      } else {
        expect(kinds).toEqual(['permit'])
        expect(unbox(await f.consume(permit))).toHaveProperty('kind', 'started')
      }
      expect(f.launches()).toBe(0)
    },
  )

  it('rechecks after waiting for the tenant serial section', async () => {
    const entered = barrier()
    const resume = barrier()
    let block = false
    const f = await fixture({
      wrap: memory => ({
        durability: 'none',
        readRecord: (domain, key) => memory.readRecord(domain, key),
        due: (tenant, now, limit) => memory.due(tenant, now, limit),
        read: async domain => {
          if (block) {
            block = false
            entered.open()
            await resume.wait
          }
          return memory.read(domain)
        },
        commit: input => memory.commit(input),
      }),
    })
    const permit = unbox(await f.prepare())
    block = true
    const first = f.prepare()
    await entered.wait
    const second = f.execute(permit)
    f.answer(required)
    resume.open()
    expect(await first).toHaveProperty('failure.reason', requiredReason)
    expect(await second).toHaveProperty('failure')
    expect(unbox(await f.inspect())).toMatchObject({ kind: 'rejected', reason: requiredReason })
    expect(await f.acceptances()).toEqual([])
    expect(f.launches()).toBe(0)
  })

  it('snapshots the complete request before the first access await', async () => {
    const entered = barrier()
    const resume = barrier()
    const principal = { subject: 'original' }
    let seen: FixedToolRequest | undefined
    const authority = createLocalStartCoordinator({
      store: createMemoryToolLedgerStore(),
      access: {
        qualify: async () => {
          entered.open()
          await resume.wait
          return { kind: 'allowed' }
        },
      },
      guardsOf: () => [],
      commitAttempts: 4,
      permitRequirements: {
        check: async input => {
          expect(input.principal).toBe(principal)
          seen = input.request
          expect(Reflect.set(input.request.arguments, 'effective', 'changed by provider')).toBe(
            false,
          )
          return noPermit
        },
      },
    })
    const fixed = structuredClone(request())
    const original = structuredClone(fixed)
    const start = startOf('c1')
    const pending = authority.prepare({ ...callAccess('c1'), principal, start, request: fixed })
    await entered.wait
    Reflect.set(fixed.arguments, 'effective', 'changed by caller')
    Reflect.set(fixed.availability.definition, 'description', 'changed definition')
    Reflect.set(start, 'operation', operationId('changed-start'))
    resume.open()
    expect(await pending).toHaveProperty('ok.start.operation', operationId('c1/start'))
    expect(seen).toEqual(original)
    expect(Object.isFrozen(fixed)).toBe(false)
  })

  it('refuses a different fixed request for the same pending start', async () => {
    const f = await fixture()
    const permit = unbox(await f.prepare())
    const changed = {
      ...f.fixed,
      arguments: { ...f.fixed.arguments, effective: '{"path":"b.txt"}' },
    }
    expect(await f.prepare(changed)).toMatchObject({
      failure: { kind: 'conflict', operation: f.start.operation },
    })
    expect(unbox(await f.consume(permit)).kind).toBe('started')
    expect(f.questions.at(-1)?.request).toEqual(f.fixed)
  })

  it('binds the command and complete definition, not only the tool name', async () => {
    const f = await fixture()
    const definition = f.fixed.availability.definition
    if (definition.kind !== 'function' || f.fixed.availability.kind !== 'available')
      throw new Error('function fixture')
    const { parameters, returns, kind: _kind, ...common } = definition
    const commands: FixedToolRequest = {
      ...f.fixed,
      command: 'read',
      availability: {
        ...f.fixed.availability,
        definition: {
          ...common,
          kind: 'commands',
          encoding: 'wrapped',
          commands: ['read', 'write'].map(name => ({
            name,
            summary: name,
            parameters: { kind: 'declared', value: parameters },
            returns,
          })),
        },
      },
    }
    const permit = unbox(await f.prepare(commands))
    expect(await f.prepare({ ...commands, command: 'write' })).toHaveProperty(
      'failure.kind',
      'conflict',
    )
    expect(
      await f.prepare({
        ...commands,
        availability: {
          ...commands.availability,
          definition: { ...commands.availability.definition, description: 'different definition' },
        },
      }),
    ).toHaveProperty('failure.kind', 'conflict')
    expect(unbox(await f.consume(permit)).kind).toBe('started')
    expect(f.questions.at(-1)?.request).toEqual(commands)
  })

  it('passes distinct complete actions and identities to the source for two tenants', async () => {
    const seen: unknown[] = []
    const authority = createLocalStartCoordinator({
      store: createMemoryToolLedgerStore(),
      access: access(),
      guardsOf: () => [],
      commitAttempts: 4,
      permitRequirements: {
        check: async input => {
          seen.push(input)
          return noPermit
        },
      },
    })
    const inputs = [
      {
        principal: principalA,
        tenant: tenantA,
        call: callId('same'),
        start: startOf('same', tenantA),
        request: request(),
      },
      {
        principal: principalB,
        tenant: tenantB,
        call: callId('same'),
        start: startOf('same', tenantB),
        request: request({ arguments: { original: '{}', effective: '{}', complete: true } }),
      },
    ]
    for (const input of inputs) {
      const permit = unbox(await authority.prepare(input))
      expect(
        unbox(await authority.consume({ ...input, permit, executorReceipt: evidence('capsule') }))
          .kind,
      ).toBe('started')
    }
    expect(seen).toEqual([inputs[0], inputs[0], inputs[1], inputs[1]])
  })

  it.each(['request', 'inputDigest', 'requestBinding', 'requirementSource'] as const)(
    'does not adopt a pending record with missing %s or overwrite it on prepare',
    async field => {
      let legacy = false
      const f = await fixture({
        wrap: memory => ({
          durability: 'none',
          readRecord: (domain, key) => memory.readRecord(domain, key),
          due: (tenant, now, limit) => memory.due(tenant, now, limit),
          commit: input => memory.commit(input),
          read: async domain => {
            const read = await memory.read(domain)
            if (!legacy || read.kind !== 'complete') return read
            return {
              ...read,
              records: read.records.map(record => {
                if (
                  record.kind !== 'host' ||
                  typeof record.host.value !== 'object' ||
                  record.host.value === null ||
                  Reflect.get(record.host.value, 'kind') !== 'permit'
                )
                  return record
                const value = structuredClone(record.host.value)
                Reflect.deleteProperty(value, field)
                return { ...record, host: { ...record.host, value } }
              }),
            }
          },
        }),
      })
      const permit = unbox(await f.prepare())
      const commits = f.memory.commits
      legacy = true
      f.rebuild()
      expect(await f.execute(permit)).toHaveProperty('failure.kind', 'commit-unknown')
      expect(unbox(await f.consume(permit))).toHaveProperty('kind', 'unknown')
      expect(await f.prepare()).toHaveProperty('failure.kind', 'unavailable')
      expect(f.memory.commits).toBe(commits)
      expect(await f.acceptances()).toEqual([])
      expect(f.launches()).toBe(0)
    },
  )

  it('recognizes an old acceptance without its new source field', async () => {
    let legacy = false
    const f = await fixture({
      wrap: memory => ({
        durability: 'none',
        readRecord: (domain, key) => memory.readRecord(domain, key),
        due: (tenant, now, limit) => memory.due(tenant, now, limit),
        commit: input => memory.commit(input),
        read: async domain => {
          const read = await memory.read(domain)
          if (!legacy || read.kind !== 'complete') return read
          return {
            ...read,
            records: read.records.map(record => {
              if (
                record.kind !== 'host' ||
                typeof record.host.value !== 'object' ||
                record.host.value === null
              )
                return record
              const value = structuredClone(record.host.value)
              Reflect.deleteProperty(value, 'requirementSource')
              return { ...record, host: { ...record.host, value } }
            }),
          }
        },
      }),
    })
    const permit = unbox(await f.prepare())
    unbox(await f.execute(permit))
    const accepted = unbox(await f.consume(permit))
    legacy = true
    f.rebuild(true)
    expect(unbox(await f.consume(permit))).toEqual(accepted)
    expect(unbox(await f.inspect())).toEqual(accepted)
    unbox(await f.execute(permit))
    expect(f.launches()).toBe(1)
    await f.finish()
  })

  it('recognizes a committed acceptance after its reply is lost without replaying the author', async () => {
    let lose = false
    const f = await fixture({
      wrap: memory => ({
        durability: 'none',
        readRecord: (domain, key) => memory.readRecord(domain, key),
        due: (tenant, now, limit) => memory.due(tenant, now, limit),
        read: domain => memory.read(domain),
        commit: async input => {
          const result = await memory.commit(input)
          if (lose && result.kind === 'committed') {
            lose = false
            return { kind: 'unknown', diagnostic: 'lost commit answer' }
          }
          return result
        },
      }),
    })
    const permit = unbox(await f.prepare())
    lose = true
    expect(await f.execute(permit)).toHaveProperty('failure.kind', 'commit-unknown')
    expect(await f.acceptances()).toHaveLength(1)
    f.rebuild(true)
    expect(unbox(await f.consume(permit)).kind).toBe('started')
    expect(await f.execute(permit)).toHaveProperty('failure.kind', 'commit-unknown')
    expect(f.launches()).toBe(0)
  })

  it('does not report a permanent rejection when its commit outcome is unknown', async () => {
    let lose = false
    const f = await fixture({
      wrap: memory => ({
        durability: 'none',
        readRecord: (domain, key) => memory.readRecord(domain, key),
        due: (tenant, now, limit) => memory.due(tenant, now, limit),
        read: domain => memory.read(domain),
        commit: async input => {
          if (lose) {
            lose = false
            return { kind: 'unknown', diagnostic: 'unconfirmed' }
          }
          return memory.commit(input)
        },
      }),
    })
    const permit = unbox(await f.prepare())
    f.answer(required)
    lose = true
    expect(unbox(await f.consume(permit))).toHaveProperty('kind', 'unknown')
    expect(await f.acceptances()).toEqual([])
    expect(unbox(await f.consume(permit))).toMatchObject({
      kind: 'rejected',
      reason: requiredReason,
    })
    expect(f.launches()).toBe(0)
  })

  it('denies unavailable access at the entry before reading the host ledger', async () => {
    let unavailable = false
    const f = await fixture({
      access: {
        qualify: async () =>
          unavailable
            ? { kind: 'unavailable', diagnostic: 'directory unavailable' }
            : { kind: 'allowed' },
      },
    })
    const permit = unbox(await f.prepare())
    const reads = f.memory.reads
    unavailable = true
    expect(await f.execute(permit)).toHaveProperty('failure.dependency', 'access-guard')
    expect(f.memory.reads).toBe(reads)
    expect(await f.acceptances()).toEqual([])
    expect(f.launches()).toBe(0)
  })

  it.each(['unavailable', 'denied'] as const)(
    'rechecks access inside the serial section: %s',
    async kind => {
      let verdict: AccessVerdict = { kind: 'allowed' }
      let checks = 0
      let flipAt = Infinity
      const f = await fixture({
        access: {
          qualify: async () => {
            checks += 1
            if (checks === flipAt)
              return kind === 'denied'
                ? { kind, reason: 'revoked' }
                : { kind, diagnostic: 'private access error' }
            return verdict
          },
        },
      })
      const permit = unbox(await f.prepare())
      flipAt = checks + 2
      expect(await f.execute(permit)).toHaveProperty('failure')
      expect(await f.acceptances()).toEqual([])
      expect(f.launches()).toBe(0)
      if (kind === 'denied') expect(unbox(await f.inspect())).toHaveProperty('kind', 'rejected')
      else {
        expect(
          (await f.records()).some(
            value =>
              typeof value === 'object' &&
              value !== null &&
              Reflect.get(value, 'kind') === 'rejection',
          ),
        ).toBe(false)
        verdict = { kind: 'allowed' }
        expect(unbox(await f.consume(permit)).kind).toBe('started')
      }
    },
  )
})
