// @module-tag slow
// 归慢层：整套装配＋真库：用例经会话选择宿主起租户、时钟与评估输入的整套装配（SQLite 文件库），并开真实 JSONL 会话日志。
import { describe, expect, it } from 'vitest'
import { selectionHost, AT, ROOT, profile } from './session-selection-fixture.ts'
import { jsonObject } from './log-codec-fixture.ts'
import {
  captureModelLogValue,
  prepareModelLogEntry,
  inspectModelLogEntry,
} from '@omne-harness-lite/model-request-runtime-local'
import { deferred, ControlledSettlementOwner } from './settlement-fixture.ts'
import { narrow } from '@omne-harness-lite/storage'
import { parseTenantId } from '@omne-harness-lite/identity-values'
import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type {
  SettlementRegistration,
  SettlementTaskKind,
} from '@omne-harness-lite/model-request-runtime-local'

describe('RT5 real session model selection and current evaluation', () => {
  it('each legality and repeat command reads current inputs; new model locks never filter the S11 set', async () => {
    const host = await selectionHost()
    try {
      let reads = 0
      const component = host.create({
        currentEvaluationInputs: {
          async read(...args) {
            reads++
            return await host.reader.read(...args)
          },
        },
      }).component
      expect(await component.legalTargets()).toEqual({
        ok: ['example/model-a', 'example/model-b'],
      })
      expect(reads).toBe(1)
      await component.selectModel('example/model-a')
      expect(reads).toBe(2)
      await host.publish([{ item: 'model', value: 'example/model-b', immutable: true, since: AT }])
      expect(await component.legalTargets()).toEqual({
        ok: ['example/model-a', 'example/model-b'],
      })
      expect(reads).toBe(3)
      expect(await component.selectModel('example/model-a')).toEqual({
        selected: 'example/model-a',
      })
      expect(reads).toBe(4)
      expect(await component.effectiveModel()).toMatchObject({
        ok: { selected: 'example/model-a', routeName: 'example/model-b', selectedBy: 'layer_lock' },
      })
      await host.reader.close()
      expect(await component.legalTargets()).toEqual({ unavailable: true })
      expect(await component.selectModel('example/model-a')).toEqual({ unavailable: true })
      expect(reads).toBe(7)
      expect(await host.log.readSince(host.session, 0)).toMatchObject({
        entries: [expect.anything()],
      })
    } finally {
      await host.close()
    }
    const absent = await selectionHost(false)
    try {
      const component = absent.create().component
      expect(await component.legalTargets()).toEqual({ ok: ['example/model-a', 'example/model-b'] })
      expect(await component.selectModel('example/model-b')).toEqual({
        selected: 'example/model-b',
      })
    } finally {
      await absent.close()
    }
  })
  it('controlled foreign, ineffective, inconsistent and unreadable current results never become empty legality or a duplicate success', async () => {
    const host = await selectionHost()
    try {
      await host.create().component.selectModel('example/model-a')
      const foreign = parseTenantId({ ...host.tenant, account: 'other-account' })
      if (!('ok' in foreign)) throw new Error('Foreign tenant syntax')
      for (const fault of ['foreign', 'ineffective', 'inconsistent', 'unreadable'] as const) {
        // Controlled result substitution after a genuine persistent read; not provider proof.
        const component = host.create({
          currentEvaluationInputs: {
            async read(...args) {
              const result = await host.reader.read(...args)
              if (!('input' in result)) throw new Error('Genuine current read failed')
              switch (fault) {
                case 'foreign':
                  return { input: { ...result.input, tenant: foreign.ok } }
                case 'ineffective':
                  return { input: { ...result.input, standing: { standing: 'ineffective' } } }
                case 'inconsistent':
                  return {
                    input: {
                      ...result.input,
                      root: {
                        ...result.input.root,
                        source: { asset: 'nonexistent-root-asset', version: 1 },
                      },
                    },
                  }
                case 'unreadable':
                  return { failure: 'unavailable' }
              }
            },
          },
        }).component
        expect(await component.legalTargets()).toEqual({ unavailable: true })
        expect(await component.selectModel('example/model-a')).toEqual({ unavailable: true })
        expect(await component.displayList()).toEqual({ unavailable: true })
      }
      expect(await host.log.readSince(host.session, 0)).toMatchObject({
        entries: [expect.anything()],
      })
    } finally {
      await host.close()
    }
  })
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
      expect(await component.selectModel('')).toEqual({
        invalidInput: { reason: 'route_name_empty' },
      })
      expect(await component.selectModel(null)).toEqual({ invalidInput: { reason: 'malformed' } })
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
  it('lost acknowledgement stays unknown without replay after the writer stops and releases its registration', async () => {
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
      expect(owner.active).toBe(0)
      expect(owner.releases).toBeGreaterThan(0)
      expect(await component.close()).toEqual({ released: true })
      expect(await component.close()).toEqual({ released: true })
      expect(await component.selectModel('example/model-b')).toEqual({ unavailable: true })
      expect(appendCount).toBe(1)
      expect(owner.active).toBe(0)
    } finally {
      await host.close()
    }
  })
  it('stopped unknown append with no durable entry releases its lease without replay or inferred success', async () => {
    const host = await selectionHost()
    try {
      let appends = 0
      const generation = Object.freeze({})
      const { component, owner } = host.create({
        binding: {
          session: host.session,
          tenant: host.tenant,
          log: {
            ...host.log,
            async append() {
              appends++
              return { failure: 'unavailable' }
            },
          },
          generation,
          currentGeneration: () => generation,
        },
      })
      expect(await component.selectModel('example/model-a')).toEqual({ unavailable: true })
      expect(owner.active).toBe(0)
      expect(await host.log.readSince(host.session, 0)).toMatchObject({ entries: [] })
      expect(await component.close()).toEqual({ released: true })
      expect(await component.selectModel('example/model-a')).toEqual({ unavailable: true })
      expect(appends).toBe(1)
      expect(owner.active).toBe(0)
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

  it('malformed acknowledgement remains unknown without retaining a stopped physical writer', async () => {
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
      expect(await component.close()).toEqual({ released: true })
      expect(owner.active).toBe(0)
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
      let blocking = false
      const { component, owner } = host.create({
        concurrent: 1,
        currentEvaluationInputs: {
          async read(...args) {
            if (blocking) {
              entered.resolve()
              await release.promise
            }
            return await reader.read(...args)
          },
        },
      })
      await component.selectModel('example/model-a')
      blocking = true
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

  it('a readonly stop request defect still stops every other task and releases only after actual late stop', async () => {
    const host = await selectionHost()
    try {
      const owner = new ControlledSettlementOwner()
      const barrier = deferred<void>(),
        readEntered = deferred<void>()
      const acquire = owner.acquire
      let stopCalls = 0,
        failedDiagnostics = 0
      let readingCurrent = false
      // Finished commands also ask their own tasks to stop; count only from the close under test.
      let armed = false
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
                if (!armed) return task.requestStop()
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
      const { component } = host.create({
        owner,
        currentEvaluationInputs: {
          async read(...args) {
            const result = await host.reader.read(...args)
            if (readingCurrent) readEntered.resolve()
            return result
          },
        },
        diagnostic(event) {
          if (event.stage === 'close' && event.outcome === 'unavailable') failedDiagnostics++
        },
      })
      await component.selectModel('example/model-a')
      failedDiagnostics = 0
      readingCurrent = true
      const initialStarts = owner.starts.length
      owner.stopBarrier = barrier.promise
      const reading = component.effectiveModel()
      await readEntered.promise
      armed = true
      let closeReceipt = false
      const closing = component.close().then(value => {
        closeReceipt = true
        return value
      })
      expect(stopCalls).toBe(owner.starts.length - initialStarts)
      expect(stopCalls).toBeGreaterThan(1)
      expect(failedDiagnostics).toBe(1)
      await new Promise<void>(resolve => setImmediate(resolve))
      expect(closeReceipt).toBe(false)
      expect(owner.active).toBe(1)
      barrier.resolve()
      await reading
      expect(await closing).toEqual({ released: true })
      expect(owner.active).toBe(0)
      expect(owner.releases).toBe(2)
    } finally {
      await host.close()
    }
  })

  it('a late unknown writer stays owned until actual stop, then releases without certifying the command', async () => {
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
      const firstClose = component.close()
      expect(component.close()).toBe(firstClose)
      const closing = firstClose.then(value => {
        closeReceipt = true
        return value
      })
      await new Promise<void>(resolve => setImmediate(resolve))
      expect(closeReceipt).toBe(false)
      expect(owner.active).toBe(1)
      expect(await log.readSince(host.session, 0)).toMatchObject({ entries: [] })
      expect(await component.selectModel('example/model-b')).toEqual({ unavailable: true })
      release.resolve()
      expect(await selecting).toEqual({ unavailable: true })
      expect(await closing).toEqual({ released: true })
      expect(owner.active).toBe(0)
      expect(owner.releases).toBe(1)
      expect(await log.readSince(host.session, 0)).toMatchObject({ entries: [expect.anything()] })
      expect(await component.close()).toEqual({ released: true })
      expect(owner.releases).toBe(1)
    } finally {
      await host.close()
    }
  })
  it('a rejected actual-stop receipt remains unfinished and never releases the original registration', async () => {
    const host = await selectionHost()
    try {
      const owner = new ControlledSettlementOwner()
      const acquire = owner.acquire
      Reflect.set(owner, 'acquire', (limit: JsonNumber) => {
        const acquired = acquire(limit)
        if ('unavailable' in acquired) return acquired
        const original = acquired.registration
        const registration: SettlementRegistration = {
          start<T>(kind: SettlementTaskKind, operation: (signal: AbortSignal) => Promise<T>) {
            const task = original.start(kind, operation)
            return {
              ...task,
              stopped: task.stopped.then(() => {
                throw new Error('cleanup receipt failed')
              }),
            }
          },
          release: original.release,
        }
        return { registration }
      })
      const { component } = host.create({ owner })
      expect(await component.legalTargets()).toMatchObject({
        ok: ['example/model-a', 'example/model-b'],
      })
      const firstClose = component.close()
      expect(await firstClose).toEqual({ unavailable: true })
      const retry = component.close()
      expect(retry).not.toBe(firstClose)
      expect(await retry).toEqual({ unavailable: true })
      expect(owner.active).toBe(1)
      expect(owner.releases).toBe(0)
    } finally {
      await host.close()
    }
  })
  it('current catalog landing uses the most specific actual row despite missing credentials and falls back only after withdrawal', async () => {
    const host = await selectionHost()
    try {
      const { registration: _registration, updatedAt: _updatedAt, ...content } = profile()
      const registered = await host.catalog.registerProfile(
        host.tenant,
        { layer: 'tenant', tenant: host.tenant },
        { ...content, origin: 'custom' },
      )
      if ('failure' in registered) throw new Error('Real more-specific profile registration failed')
      expect(await host.catalog.credentialPresent(host.tenant, 'custom')).toEqual({
        present: false,
      })
      const component = host.create().component
      expect(await component.selectModel('example/model-a')).toEqual({
        selected: 'example/model-a',
      })
      expect(await component.effectiveModel()).toMatchObject({
        ok: { profile: registered.ref, selectedBy: 'session' },
      })
      await host.catalog.withdrawProfile(host.tenant, registered.ref)
      expect(await component.effectiveModel()).toMatchObject({
        ok: {
          selected: 'example/model-a',
          profile: { origin: 'official', routeName: 'example/model-a' },
          selectedBy: 'session',
        },
      })
      expect(await host.log.readSince(host.session, 0)).toMatchObject({
        entries: [expect.anything()],
      })
    } finally {
      await host.close()
    }
  })

  it('a genuinely logged image in the supplied complete-prefix projection rejects a text-only target without writing selection', async () => {
    const host = await selectionHost()
    try {
      const captured = captureModelLogValue({
        category: 'message',
        input: {
          kind: 'value',
          value: {
            id: 'image-input',
            type: 'user',
            createdAt: AT,
            blocks: [
              {
                id: 'image-block',
                kind: 'image',
                visibility: { toHuman: true, toModel: true },
                mediaType: 'image/png',
                data: { inline: 'iVBORw0KGgo=' },
              },
            ],
          },
        },
      })
      if ('invalidValue' in captured) throw new Error('Actual user image failed message admission')
      const prepared = prepareModelLogEntry({
        session: host.session,
        shell: { tenant: host.tenant },
        captured: captured.ok,
        purpose: { kind: 'message' },
        messagePrefix: [],
      })
      if ('invalidValue' in prepared) throw new Error('Actual user image failed log codec')
      const appended = await host.log.append(
        host.session,
        [prepared.ok],
        { kind: 'unfenced' },
        { kind: 'unconditional' },
      )
      if ('failure' in appended) throw new Error('Actual image append failed')
      const component = host.create({
        async projection(prefix) {
          const entry = prefix.entries[0]
          const recognized = inspectModelLogEntry({
            session: host.session,
            tenant: host.tenant,
            entry,
            purpose: { kind: 'message' },
            messagePrefix: [],
          })
          if (
            'invalidValue' in recognized ||
            recognized.ok.captured.message?.type !== 'user' ||
            !recognized.ok.captured.message.blocks.some(
              block => block.kind === 'image' && block.visibility.toModel,
            )
          )
            return { unknown: true }
          return { known: ['image'] }
        },
      }).component
      expect(await component.selectModel('example/model-a')).toEqual({
        notLegalTarget: { because: ['modality_mismatch'] },
      })
      expect(await host.log.readSince(host.session, 0)).toMatchObject({
        entries: [expect.anything()],
      })
    } finally {
      await host.close()
    }
  })

  it('actual missing recipe and controlled membership-state loss are unavailable; neither creates a fake no-lock basis', async () => {
    const host = await selectionHost()
    try {
      const component = host.create().component
      await component.selectModel('example/model-a')
      await host.storage.write(
        async tx =>
          await narrow<{ evaluation_input_recipe: { store_key: string; session: string } }>(tx)
            .deleteFrom('evaluation_input_recipe')
            .where('session', '=', host.session)
            .execute(),
      )
      expect(await component.effectiveModel()).toEqual({ unavailable: true })
      expect(await component.legalTargets()).toEqual({ unavailable: true })
      expect(await component.selectModel('example/model-a')).toEqual({ unavailable: true })
      expect(await host.log.readSince(host.session, 0)).toMatchObject({
        entries: [expect.anything()],
      })
    } finally {
      await host.close()
    }
    const other = await selectionHost()
    try {
      const component = other.create().component
      await component.selectModel('example/model-a')
      // Controlled persistent source corruption only; this does not certify the governance removal operation.
      await other.storage.write(
        async tx =>
          await narrow<{
            membership: { organization_id: string; account_id: string; effective: number }
          }>(tx)
            .updateTable('membership')
            .set({ effective: 0 })
            .where('organization_id', '=', other.tenant.organization)
            .where('account_id', '=', other.tenant.account)
            .execute(),
      )
      expect(await component.effectiveModel()).toEqual({ unavailable: true })
      expect(await component.legalTargets()).toEqual({ unavailable: true })
      expect(await component.selectModel('example/model-a')).toEqual({ unavailable: true })
      expect(await other.log.readSince(other.session, 0)).toMatchObject({
        entries: [expect.anything()],
      })
    } finally {
      await other.close()
    }
  })
  it('rejects old model selection without mutating its durable bytes', async () => {
    const host = await selectionHost()
    try {
      const captured = captureModelLogValue({
        category: 'record',
        input: {
          kind: 'value',
          value: {
            kind: 'model_selection_changed',
            routeName: 'example/model-b',
            at: '2100-01-01T00:00:00Z',
          },
        },
      })
      if ('invalidValue' in captured) throw new Error('Selection admission')
      const entry = prepareModelLogEntry({
        session: host.session,
        shell: { tenant: host.tenant },
        captured: captured.ok,
        purpose: { kind: 'record' },
        messagePrefix: null,
      })
      if ('invalidValue' in entry) throw new Error('Selection encoding')
      const old = (key: string) => key.replace(/^mrr\/3\//u, 'mrr/1/')
      const oldEntry = {
        ...entry.ok,
        readKeys: entry.ok.readKeys.map(old),
        payload: { ...jsonObject(entry.ok.payload), format: 'mrr/1' },
      }
      const appended = await host.log.append(
        host.session,
        [oldEntry],
        { kind: 'unfenced' },
        { kind: 'unconditional' },
      )
      if ('failure' in appended) throw new Error('Old actual append')
      const component = host.create().component
      expect(await component.effectiveModel()).toEqual({ unavailable: true })
      expect(await component.selectModel('example/model-a')).toEqual({ unavailable: true })
      expect(await component.legalTargets()).toEqual({ unavailable: true })
      const prefix = await host.log.readSince(host.session, 0)
      if ('failure' in prefix) throw new Error('Old actual read')
      expect(prefix.entries).toHaveLength(1)
      expect(prefix.entries[0]?.readKeys).toEqual(oldEntry.readKeys)
      expect(prefix.entries[0]?.payload).toEqual(oldEntry.payload)
    } finally {
      await host.close()
    }
  })
})
