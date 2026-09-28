import { describe, expect, it } from 'vitest'
import { selectionHost, AT, ROOT, profile } from './session-selection-fixture.ts'
import { inspectModelLogEntry } from '@omne-harness-lite/model-request-runtime/log-codec/v2'
import { deferred, ControlledSettlementOwner } from './settlement-fixture.ts'
import { parseTenantId } from '@omne-harness-lite/identity-values'
import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type { SettlementRegistration, SettlementTaskKind } from '../src/settlement-types.ts'

describe('RT5 real session model selection and current evaluation', () => {
  it('requires explicit selection, commits one codec record, repeats without writing and recognizes reopen', async () => {
    const host = await selectionHost()
    try {
      const { component, owner } = host.create()
      expect(await component.effectiveModel()).toEqual({ unavailable: true })
      expect(await component.selectModel('example/model-a')).toEqual({
        selected: 'example/model-a',
      })
      expect(await component.selectModel('example/model-a')).toEqual({
        selected: 'example/model-a',
      })
      const read = await host.log.readSince(host.session, 0)
      if ('failure' in read) throw new Error('Real log read failed')
      expect(read.entries).toHaveLength(1)
      const entry = read.entries[0]
      expect(entry?.dedupeKey).toBeUndefined()
      expect(entry?.readKeys).toHaveLength(2)
      const decoded = inspectModelLogEntry({
        session: host.session,
        tenant: host.tenant,
        entry,
        purpose: { kind: 'record' },
        messagePrefix: null,
      })
      if ('invalidValue' in decoded) throw new Error('Real selection codec failed')
      expect(decoded.ok.captured.record).toEqual({
        kind: 'model_selection_changed',
        routeName: 'example/model-a',
        at: AT,
      })
      const result = await component.effectiveModel()
      if (!('ok' in result)) throw new Error('Real current basis failed')
      expect(result.ok).toMatchObject({
        routeName: 'example/model-a',
        selectedBy: 'session',
        selected: 'example/model-a',
      })
      expect(result.evaluation.root).toEqual(ROOT)
      expect(
        result.evaluation.values.find(value => value.item === 'first_token_wait_limit')?.value,
      ).toBe('PT0.001S')
      expect(owner.active).toBe(0)
      expect(await component.close()).toEqual({ released: true })
      await host.reopen()
      const reopened = host.create().component
      expect(await reopened.effectiveModel()).toMatchObject({
        ok: { selected: 'example/model-a', selectedBy: 'session' },
      })
    } finally {
      await host.close()
    }
  })
  it('successful absent optional model means no lock; real current same-name and changed-name locks are observed without reload', async () => {
    const host = await selectionHost()
    try {
      const component = host.create().component
      await component.selectModel('example/model-a')
      await host.publish([{ item: 'model', value: 'example/model-a', immutable: true, since: AT }])
      expect(await component.effectiveModel()).toMatchObject({
        ok: { selectedBy: 'layer_lock', routeName: 'example/model-a', selected: 'example/model-a' },
      })
      await host.publish([{ item: 'model', value: 'example/model-b', immutable: true, since: AT }])
      expect(await component.effectiveModel()).toMatchObject({
        ok: { selectedBy: 'layer_lock', routeName: 'example/model-b', selected: 'example/model-a' },
      })
      await host.publish([])
      expect(await component.effectiveModel()).toMatchObject({
        ok: { selectedBy: 'session', routeName: 'example/model-a' },
      })
    } finally {
      await host.close()
    }
    const withoutModel = await selectionHost(false)
    try {
      const component = withoutModel.create().component
      await component.selectModel('example/model-b')
      expect(await component.effectiveModel()).toMatchObject({
        ok: { selectedBy: 'session', routeName: 'example/model-b' },
      })
    } finally {
      await withoutModel.close()
    }
  })
  it('unknown projection, missing route and invalid route write nothing; current reader shutdown is not no lock', async () => {
    const host = await selectionHost()
    try {
      const component = host.create().component
      expect(await component.selectModel('never-in-directory')).toEqual({ profileNotFound: true })
      expect(await component.selectModel(' ')).toEqual({ invalidInput: { reason: 'malformed' } })
      const unknown = host.create({
        async projection() {
          return { unknown: true }
        },
      }).component
      expect(await unknown.selectModel('example/model-a')).toEqual({ unavailable: true })
      const before = await host.log.readSince(host.session, 0)
      expect(before).toMatchObject({ entries: [] })
      await component.selectModel('example/model-a')
      await host.reader.close()
      expect(await component.effectiveModel()).toEqual({ unavailable: true })
    } finally {
      await host.close()
    }
  })
  it('generation replacement denies old borrowed components and does not append', async () => {
    const host = await selectionHost()
    try {
      const component = host.create().component
      await host.replaceGeneration()
      expect(await component.selectModel('example/model-a')).toEqual({ unavailable: true })
      expect(await component.effectiveModel()).toEqual({ unavailable: true })
      expect(await host.log.readSince(host.session, 0)).toMatchObject({ entries: [] })
    } finally {
      await host.close()
    }
  })
  it('lost acknowledgement retains the original registration even after selected read; never replays the unknown command', async () => {
    const host = await selectionHost()
    try {
      let appendCount = 0
      const source = host.log
      const wrapped = {
        ...source,
        async append(...args: Parameters<typeof source.append>) {
          appendCount++
          await source.append(...args)
          return { failure: 'unavailable' } as const
        },
      }
      const generation = Object.freeze({})
      const { component, owner } = host.create({
        binding: {
          session: host.session,
          tenant: host.tenant,
          log: wrapped,
          generation,
          currentGeneration: () => generation,
        },
      })
      expect(await component.selectModel('example/model-a')).toEqual({ unavailable: true })
      expect(await component.effectiveModel()).toMatchObject({
        ok: { selected: 'example/model-a' },
      })
      expect(await component.selectModel('example/model-a')).toEqual({ unavailable: true })
      expect(appendCount).toBe(1)
      expect(owner.active).toBe(1)
      expect(await component.close()).toEqual({ unavailable: true })
      expect(owner.active).toBe(1)
    } finally {
      await host.close()
    }
  })
  it('close waits physical stop independently of completed result before releasing registration', async () => {
    const host = await selectionHost()
    try {
      const barrier = deferred<void>()
      const { component, owner } = host.create()
      owner.stopBarrier = barrier.promise
      const selecting = component.selectModel('example/model-a')
      // No reliance on an AbortSignal or an outcome as proof of stopped.
      await new Promise<void>(resolve => setImmediate(resolve))
      let closed = false
      const closing = component.close().then(value => {
        closed = true
        return value
      })
      await new Promise<void>(resolve => setImmediate(resolve))
      expect(closed).toBe(false)
      expect(owner.active).toBe(1)
      barrier.resolve()
      await selecting
      expect(await closing).toEqual({ released: true })
      expect(owner.active).toBe(0)
    } finally {
      await host.close()
    }
  })

  it('validates current legality before repeat; actual withdrawn private row cannot bypass the command check', async () => {
    const host = await selectionHost()
    try {
      const {
        registration: _registration,
        updatedAt: _updatedAt,
        ...content
      } = profile('example/private-model')
      const registered = await host.catalog.registerProfile(
        host.tenant,
        { layer: 'tenant', tenant: host.tenant },
        { ...content, origin: 'custom' },
      )
      if ('failure' in registered)
        throw new Error(`Real profile registration failed: ${registered.failure}`)
      const component = host.create().component
      expect(await component.selectModel('example/private-model')).toEqual({
        selected: 'example/private-model',
      })
      expect(await host.catalog.withdrawProfile(host.tenant, registered.ref)).toMatchObject({
        registration: 'withdrawn',
      })
      expect(await component.selectModel('example/private-model')).toEqual({
        notLegalTarget: { because: ['withdrawn'] },
      })
      expect(await component.effectiveModel()).toMatchObject({
        ok: { routeName: 'example/private-model', selectedBy: 'session' },
      })
      const prefix = await host.log.readSince(host.session, 0)
      expect(prefix).toMatchObject({ entries: [expect.anything()] })
    } finally {
      await host.close()
    }
  })

  it('malformed acknowledgement retains a physically committed command without certifying it from later selected reads', async () => {
    const host = await selectionHost()
    try {
      const log = host.log
      const malformed = { ...log }
      let calls = 0
      Reflect.set(malformed, 'append', async (...args: Parameters<typeof log.append>) => {
        calls++
        await log.append(...args)
        return {}
      })
      const generation = Object.freeze({})
      const { component, owner } = host.create({
        binding: {
          session: host.session,
          tenant: host.tenant,
          log: malformed,
          generation,
          currentGeneration: () => generation,
        },
      })
      expect(await component.selectModel('example/model-a')).toEqual({ unavailable: true })
      expect(await component.effectiveModel()).toMatchObject({
        ok: { selected: 'example/model-a' },
      })
      expect(await component.close()).toEqual({ unavailable: true })
      expect(owner.active).toBe(1)
      expect(calls).toBe(1)
    } finally {
      await host.close()
    }
  })

  it('an incomplete dense prefix or wrong holding tenant is unavailable and adds no selection record', async () => {
    const host = await selectionHost()
    try {
      const component = host.create().component
      await component.selectModel('example/model-a')
      await component.selectModel('example/model-b')
      const log = host.log
      const incomplete = {
        ...log,
        async readSince(...args: Parameters<typeof log.readSince>) {
          const read = await log.readSince(...args)
          return 'failure' in read ? read : { ...read, entries: read.entries.slice(1) }
        },
      }
      const generation = Object.freeze({})
      const badPrefix = host.create({
        binding: {
          session: host.session,
          tenant: host.tenant,
          log: incomplete,
          generation,
          currentGeneration: () => generation,
        },
      }).component
      expect(await badPrefix.effectiveModel()).toEqual({ unavailable: true })
      expect(await badPrefix.selectModel('example/model-a')).toEqual({ unavailable: true })
      const otherTenant = parseTenantId({ ...host.tenant, account: 'other-account' })
      if (!('ok' in otherTenant)) throw new Error('Wrong tenant test syntax')
      const wrong = host.create({
        binding: {
          session: host.session,
          tenant: otherTenant.ok,
          log,
          generation,
          currentGeneration: () => generation,
        },
      }).component
      expect(await wrong.effectiveModel()).toEqual({ unavailable: true })
      expect(await wrong.selectModel('example/model-a')).toEqual({ unavailable: true })
      expect(await log.readSince(host.session, 0)).toMatchObject({
        entries: [expect.anything(), expect.anything()],
      })
    } finally {
      await host.close()
    }
  })

  it('explicit concurrency rejects another operation while the original real source read owns its registration', async () => {
    const host = await selectionHost()
    try {
      const entered = deferred<void>(),
        release = deferred<void>()
      const reader = host.reader
      const { component, owner } = host.create({
        concurrent: 1,
        currentEvaluationInputs: {
          async read(...args) {
            entered.resolve()
            await release.promise
            return await reader.read(...args)
          },
        },
      })
      await component.selectModel('example/model-a')
      const reading = component.effectiveModel()
      await entered.promise
      expect(owner.active).toBe(1)
      expect(await component.selectModel('example/model-b')).toEqual({ unavailable: true })
      release.resolve()
      expect(await reading).toMatchObject({ ok: { selected: 'example/model-a' } })
      expect(owner.active).toBe(0)
    } finally {
      await host.close()
    }
  })

  it('a throwing stop request cannot skip other actual tasks or report released; all stopped barriers still drain', async () => {
    const host = await selectionHost()
    try {
      const owner = new ControlledSettlementOwner()
      const barrier = deferred<void>(),
        appendEntered = deferred<void>()
      owner.stopBarrier = barrier.promise
      const acquire = owner.acquire
      let stopCalls = 0
      Reflect.set(owner, 'acquire', (limit: JsonNumber) => {
        const acquired = acquire(limit)
        if ('unavailable' in acquired) return acquired
        const original = acquired.registration
        const registration: SettlementRegistration = {
          start<T>(kind: SettlementTaskKind, operation: (signal: AbortSignal) => Promise<T>) {
            const task = original.start(kind, operation)
            return {
              ...task,
              requestStop() {
                stopCalls++
                if (stopCalls === 1) throw new Error('stop request defect')
                task.requestStop()
              },
            }
          },
          release: original.release,
        }
        return { registration }
      })
      const log = host.log,
        generation = Object.freeze({})
      const { component } = host.create({
        owner,
        binding: {
          session: host.session,
          tenant: host.tenant,
          log: {
            ...log,
            async append(...args) {
              const result = await log.append(...args)
              appendEntered.resolve()
              return result
            },
          },
          generation,
          currentGeneration: () => generation,
        },
      })
      const selecting = component.selectModel('example/model-a')
      await appendEntered.promise
      const closing = component.close()
      expect(stopCalls).toBe(owner.starts.length)
      expect(stopCalls).toBeGreaterThan(1)
      expect(owner.active).toBe(1)
      barrier.resolve()
      await selecting
      expect(await closing).toEqual({ unavailable: true })
      expect(owner.active).toBe(1)
      expect(owner.releases).toBe(0)
    } finally {
      await host.close()
    }
  })

  it('a late unknown writer remains physically owned across stop and may still durably change selection', async () => {
    const host = await selectionHost()
    try {
      const entered = deferred<void>(),
        release = deferred<void>()
      const log = host.log,
        generation = Object.freeze({})
      const { component, owner } = host.create({
        binding: {
          session: host.session,
          tenant: host.tenant,
          log: {
            ...log,
            async append(...args) {
              entered.resolve()
              await release.promise
              await log.append(...args)
              return { failure: 'unavailable' }
            },
          },
          generation,
          currentGeneration: () => generation,
        },
      })
      const selecting = component.selectModel('example/model-a')
      await entered.promise
      let closeReceipt = false
      const closing = component.close().then(value => {
        closeReceipt = true
        return value
      })
      await new Promise<void>(resolve => setImmediate(resolve))
      expect(closeReceipt).toBe(false)
      expect(owner.active).toBe(1)
      expect(await log.readSince(host.session, 0)).toMatchObject({ entries: [] })
      release.resolve()
      expect(await selecting).toEqual({ unavailable: true })
      expect(await closing).toEqual({ unavailable: true })
      expect(owner.active).toBe(1)
      expect(await log.readSince(host.session, 0)).toMatchObject({ entries: [expect.anything()] })
    } finally {
      await host.close()
    }
  })
})
