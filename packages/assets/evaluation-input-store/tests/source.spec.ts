import { EvaluationInputSupportService } from '@omne-harness-lite/asset-evaluation/cordis'
import { evaluationInputStorePlugin } from '../src/cordis.ts'
import { expect, test, vi } from 'vitest'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { evaluate } from '@omne-harness-lite/asset-evaluation'
import {
  readOpaqueJson,
  writeJsonLossless,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import { narrow, StorageDefect, StorageUnavailable } from '@omne-harness-lite/storage'
import { createEvaluationInputReader } from '../src/index.ts'
import { type CurrentEvaluationInputs } from '@omne-harness-lite/asset-evaluation'
import {
  publishLocalInputs,
  captureSessionRecipe,
  readPublicationRevision,
} from '../src/publication.ts'
import { boot, withHost, asset, assignment, body, holding, ROOT, gate } from './support.ts'

test('real registration/login/membership, publication, capture and file reopen preserve immutable root and exact unknown numbers', async () => {
  const first = await boot()
  let second: Awaited<ReturnType<typeof boot>> | undefined
  try {
    const identity = await first.identity('alice')
    await first.initialize(identity.tenant)
    const read = await first.reader.read('session_a', identity.tenant)
    expect(read).toHaveProperty('input.root.source', { asset: 'ast_root', version: 1 })
    if (!('input' in read)) throw new Error('real source not read')
    const root = read.input.definitions[0]?.versions[0]?.content
    if (root?.category !== 'agent_definition') throw new Error('real root body absent')
    const exact = writeJsonLossless(readOpaqueJson(root.body))
    expect(exact).toContain('9007199254740993')
    expect(exact).toContain('0.10000000000000000001')
    expect(evaluate(read.input)).toHaveProperty('ok.values')
    expect(Object.isFrozen(read.input)).toBe(true)
    expect(Object.isFrozen(read.input.holdings)).toBe(true)
    expect(Object.isFrozen(read.input.root)).toBe(true)
    await first.close(false)
    second = await boot(first.file)
    expect(await second.logins.exchange(identity.presentation)).toEqual({ ok: identity.login })
    const reopened = await second.reader.read('session_a', identity.tenant)
    expect(reopened).toEqual(read)
  } finally {
    await second?.close(false)
    await first.close()
  }
})

test('invalid parameters do no storage work; mismatched real tenant and absent recipe are unavailable', async () =>
  withHost(async h => {
    const alice = await h.identity('alice')
    const bob = await h.identity('bob')
    await h.initialize(alice.tenant)
    const atomic = vi.spyOn(h.storage, 'atomic')
    const read = vi.spyOn(h.storage, 'read')
    expect(await h.reader.read('session ', alice.tenant)).toEqual({ failure: 'invalidInput' })
    expect(await h.reader.read('session_a', { organization: '', account: 'b' })).toEqual({
      failure: 'invalidInput',
    })
    expect(atomic).not.toHaveBeenCalled()
    expect(read).not.toHaveBeenCalled()
    expect(await h.reader.read('session_a', bob.tenant)).toEqual({ failure: 'unavailable' })
    await h.mapSession('session_without_recipe', alice.tenant)
    expect(await h.reader.read('session_without_recipe', alice.tenant)).toEqual({
      failure: 'unavailable',
    })
  }))

test('explicit empty scope is read; missing scope is not silently reconstructed', async () =>
  withHost(async h => {
    const { tenant } = await h.identity('alice')
    await h.initialize(tenant)
    expect(await h.reader.read('session_a', tenant)).toHaveProperty('input')
    await h.storage.write(async tx => {
      await narrow<{ evaluation_input_scope: { store_key: string; layer: string } }>(tx)
        .deleteFrom('evaluation_input_scope')
        .where('store_key', '=', h.deps.storeKey)
        .where('layer', '=', 'tenant')
        .execute()
    })
    expect(await h.reader.read('session_a', tenant)).toEqual({ failure: 'unavailable' })
    expect(h.diagnostics.at(-1)).toHaveProperty('stage', 'scope_missing')
  }))

test('current follows appended v2, pinned keeps v1, and no read mutates prior owned input', async () =>
  withHost(async h => {
    const { tenant } = await h.identity('alice')
    await h.initialize(tenant)
    const before = await h.reader.read('session_a', tenant)
    expect(
      await publishLocalInputs(h.deps, {
        expectedRevision: '1',
        definitions: [asset([body(), body('example/model-b')])],
        scopes: [],
      }),
    ).toEqual({ revision: '2' })
    const after = await h.reader.read('session_a', tenant)
    expect(after).toHaveProperty('input.root.source.version', 2)
    expect(before).toHaveProperty('input.root.source.version', 1)
    if (!('input' in after)) throw new Error('new root unavailable')
    expect(evaluate(after.input)).toHaveProperty('ok.values')
    const holder = { layer: 'tenant' as const, tenant }
    expect(
      await publishLocalInputs(h.deps, {
        expectedRevision: '2',
        definitions: [],
        scopes: [
          {
            holder,
            holdings: [{ ...holding(holder), versionSelection: { kind: 'pinned', number: 1 } }],
          },
        ],
      }),
    ).toEqual({ revision: '3' })
    expect(await h.reader.read('session_a', tenant)).toHaveProperty('input.root.source.version', 1)
  }))

test('two real publishers with the same head admit exactly one complete immutable version line', async () =>
  withHost(async h => {
    const { tenant } = await h.identity('alice')
    await h.initialize(tenant)
    const results = await Promise.all(
      ['example/b', 'example/c'].map(model =>
        publishLocalInputs(h.deps, {
          expectedRevision: '1',
          definitions: [asset([body(), body(model)])],
          scopes: [],
        }),
      ),
    )
    expect(results.filter(result => 'revision' in result)).toHaveLength(1)
    expect(
      results.filter(result => 'failure' in result && result.failure === 'conflict'),
    ).toHaveLength(1)
    expect(await readPublicationRevision(h.deps)).toEqual({ revision: '2' })
    const read = await h.reader.read('session_a', tenant)
    expect(read).toHaveProperty('input.root.source.version', 2)
    expect(read).toHaveProperty('input.definitions.0.versions.length', 2)
  }))

test('actual membership and body reads share one SQLite snapshot while a competing publisher waits', async () =>
  withHost(async h => {
    const { tenant } = await h.identity('alice')
    await h.initialize(tenant)
    const block = gate()
    const actual = h.memberships.participate.bind(h.memberships)
    const spy = vi.spyOn(h.memberships, 'participate').mockImplementation(unit => {
      const participation = actual(unit)
      return {
        ...participation,
        async standing(value) {
          const result = await participation.standing(value)
          await block.pause()
          return result
        },
      }
    })
    const pending = h.reader.read('session_a', tenant)
    await block.reached
    let committed = false
    const publishing = publishLocalInputs(h.deps, {
      expectedRevision: '1',
      definitions: [asset([body(), body('example/model-b')])],
      scopes: [],
    }).then(result => {
      committed = true
      return result
    })
    await new Promise<void>(resolve => {
      setImmediate(resolve)
    })
    expect(committed).toBe(false)
    block.release()
    expect(await pending).toHaveProperty('input.root.source.version', 1)
    expect(await publishing).toEqual({ revision: '2' })
    spy.mockRestore()
    expect(await h.reader.read('session_a', tenant)).toHaveProperty('input.root.source.version', 2)
  }))

test('multi-digit published version positions are read numerically and draft never supplies the selected body', async () =>
  withHost(async h => {
    const { tenant } = await h.identity('alice')
    await h.initialize(tenant)
    const versions = [
      body(),
      ...Array.from({ length: 11 }, (_, index) => body(`example/model-${index + 2}`)),
    ]
    expect(
      await publishLocalInputs(h.deps, {
        expectedRevision: '1',
        definitions: [
          {
            ...asset(versions),
            draft: { category: 'agent_definition', body: body('example/draft') },
          },
        ],
        scopes: [],
      }),
    ).toEqual({ revision: '2' })
    const holder = { layer: 'tenant' as const, tenant }
    expect(
      await publishLocalInputs(h.deps, {
        expectedRevision: '2',
        definitions: [],
        scopes: [{ holder, holdings: [holding(holder)] }],
      }),
    ).toEqual({ revision: '3' })
    const read = await h.reader.read('session_a', tenant)
    expect(read).toHaveProperty('input.root.source.version', 12)
    if (!('input' in read)) throw new Error('version 12 not read')
    const evaluated = evaluate(read.input)
    if (!('ok' in evaluated)) throw new Error('valid current root rejected')
    expect(evaluated.ok.values).toContainEqual({
      capability: ROOT,
      item: 'model',
      value: 'example/model-12',
      from: 'factory',
    })
  }))

test('published content rewrite, sequence gap, missing pinned version and wrong official entitlement are rejected without changing the head', async () =>
  withHost(async h => {
    const { tenant } = await h.identity('alice')
    await h.initialize(tenant)
    const holder = { layer: 'tenant' as const, tenant }
    for (const publication of [
      { definitions: [asset([body('example/rewritten')])], scopes: [] },
      {
        definitions: [
          { ...asset([body(), body()]), versions: [{ ...asset().versions[0], number: 2 }] },
        ],
        scopes: [],
      },
      {
        definitions: [],
        scopes: [
          {
            holder,
            holdings: [{ ...holding(holder), versionSelection: { kind: 'pinned', number: 2 } }],
          },
        ],
      },
      {
        definitions: [],
        scopes: [{ holder, holdings: [{ ...holding(holder), basis: { kind: 'owned' } }] }],
      },
    ]) {
      expect(await publishLocalInputs(h.deps, { expectedRevision: '1', ...publication })).toEqual({
        failure: 'invalidInput',
      })
      expect(await readPublicationRevision(h.deps)).toEqual({ revision: '1' })
    }
  }))

test('version position corruption is classified source unavailable; not a BigInt syntax exception', async () =>
  withHost(async h => {
    const { tenant } = await h.identity('alice')
    await h.initialize(tenant)
    await h.storage.write(async tx => {
      await narrow<{ evaluation_input_version: { version_position: string } }>(tx)
        .updateTable('evaluation_input_version')
        .set({ version_position: 'not-an-integer' })
        .execute()
    })
    expect(await h.reader.read('session_a', tenant)).toEqual({ failure: 'unavailable' })
    expect(h.diagnostics.at(-1)).toHaveProperty('stage', 'version_position')
  }))

test('actual current role is only a qualification gate; capture keeps original role after change and rejects after removal', async () =>
  withHost(async h => {
    const owner = await h.identity('owner')
    const member = await h.identity('member')
    const team = await h.organizations.createTeam(
      owner.tenant.account,
      'test organization',
      'source-team',
    )
    if (!('ok' in team)) throw new Error('real team creation failed')
    const invitation = await h.offers.issueInvitation(
      team.ok.tenant,
      member.tenant.account,
      'member',
    )
    if (!('ok' in invitation)) throw new Error('real invitation failed')
    const joined = await h.offers.acceptInvitation(member.tenant.account, invitation.ok)
    if (!('ok' in joined)) throw new Error('real membership join failed')
    await h.initialize(joined.ok)
    expect(await h.reader.read('session_a', joined.ok)).toHaveProperty(
      'input.standing.role',
      'member',
    )
    expect(await h.memberships.changeRole(team.ok.tenant, joined.ok, 'superAdministrator')).toBe(
      'ok',
    )
    expect(await h.memberships.standing(joined.ok)).toHaveProperty('role', 'superAdministrator')
    expect(
      await captureSessionRecipe(h.deps, {
        session: 'session_a',
        tenant: joined.ok,
        rootDefinition: ROOT,
      }),
    ).toEqual({ captured: true })
    expect(await h.reader.read('session_a', joined.ok)).toHaveProperty(
      'input.standing.role',
      'member',
    )
    expect(await h.memberships.remove(team.ok.tenant, joined.ok)).toBe('ok')
    expect(await h.reader.read('session_a', joined.ok)).toEqual({ failure: 'unavailable' })
  }))

test('mounted workspace is explicitly unavailable, not recast as no-workspace or captured', async () =>
  withHost(async h => {
    const { tenant } = await h.identity('alice')
    await h.initialize(tenant)
    await h.mapSession('session_workspace', tenant)
    expect(
      await captureSessionRecipe(h.deps, {
        session: 'session_workspace',
        tenant,
        rootDefinition: ROOT,
        workspace: { tenant, directory: '/actual-unbound-directory' },
      }),
    ).toEqual({ failure: 'unavailable' })
    expect(await h.reader.read('session_workspace', tenant)).toEqual({ failure: 'unavailable' })
  }))

test('actual source publication changes current lock and settings without manifest reload', async () =>
  withHost(async h => {
    const { tenant } = await h.identity('alice')
    await h.initialize(tenant)
    const holder = { layer: 'organization' as const, organization: tenant.organization }
    expect(
      await publishLocalInputs(h.deps, {
        expectedRevision: '1',
        definitions: [],
        scopes: [
          {
            holder,
            holdings: [
              holding(holder, [
                assignment('model', 'example/model-b', true),
                assignment('first_token_wait_limit', 'PT7S', true),
              ]),
            ],
          },
        ],
      }),
    ).toEqual({ revision: '2' })
    const read = await h.reader.read('session_a', tenant)
    if (!('input' in read)) throw new Error('changed source unavailable')
    const result = evaluate(read.input)
    if (!('ok' in result)) throw new Error('changed input rejected')
    expect(result.ok.values).toContainEqual({
      capability: ROOT,
      item: 'model',
      value: 'example/model-b',
      from: 'organization',
      lockedAt: 'organization',
    })
    expect(result.ok.values).toContainEqual({
      capability: ROOT,
      item: 'first_token_wait_limit',
      value: 'PT7S',
      from: 'organization',
      lockedAt: 'organization',
    })
  }))

test('diagnostic failure is visible and cannot turn an actual committed read or publish into an invented failure', async () =>
  withHost(async h => {
    const { tenant } = await h.identity('alice')
    await h.initialize(tenant)
    const failures: string[] = []
    const deps = {
      ...h.deps,
      diagnostics: () => {
        throw new Error('observer unavailable')
      },
      onDiagnosticFailure: (stage: string) => {
        failures.push(stage)
      },
    }
    const reader = createEvaluationInputReader(deps)
    try {
      expect(await reader.read('session_a', tenant)).toHaveProperty('input')
      expect(
        await publishLocalInputs(deps, { expectedRevision: '1', definitions: [], scopes: [] }),
      ).toEqual({ revision: '2' })
      expect(failures).toEqual(['current_evaluation_inputs', 'current_evaluation_inputs'])
    } finally {
      await reader.close()
    }
  }))

test('transaction releases before pure admission, measured queue/hold end at actual boundaries and diagnostics exclude body/values', async () =>
  withHost(async h => {
    const { tenant } = await h.identity('alice')
    await h.initialize(tenant)
    let acquired = false
    let released = false
    const actual = h.storage.atomic.bind(h.storage)
    const spy = vi.spyOn(h.storage, 'atomic').mockImplementation(async fn => {
      const result = await actual(async unit => {
        acquired = true
        return fn(unit)
      })
      released = true
      return result
    })
    const timing: { acquired: boolean; released: boolean }[] = []
    const reader = createEvaluationInputReader({
      ...h.deps,
      monotonicNow() {
        timing.push({ acquired, released })
        return process.hrtime.bigint()
      },
    })
    try {
      expect(await reader.read('session_a', tenant)).toHaveProperty('input')
      expect(timing.slice(0, 3)).toEqual([
        { acquired: false, released: false },
        { acquired: true, released: false },
        { acquired: true, released: true },
      ])
      expect(timing.slice(3).every(item => item.released)).toBe(true)
      const event = h.diagnostics.at(-1) as JsonObject
      expect(event).toMatchObject({
        kind: 'evaluation_input_read',
        evaluationCount: 1,
        assets: 1,
        versions: 1,
        holdings: 1,
      })
      for (const key of ['queueNanos', 'holdNanos', 'selectorNanos', 'evaluationNanos'])
        expect(BigInt(event[key] as string)).toBeGreaterThanOrEqual(0n)
      const diagnosticText = writeJsonLossless(event)
      expect(diagnosticText).not.toContain('9007199254740993')
      expect(diagnosticText).not.toContain('example/model-a')
      expect(event).not.toHaveProperty('body')
      expect(event).not.toHaveProperty('values')
    } finally {
      spy.mockRestore()
      await reader.close()
    }
  }))

test('participating governance failure escapes real atomic before unavailable; programmer defects remain exceptions', async () =>
  withHost(async h => {
    const { tenant } = await h.identity('alice')
    await h.initialize(tenant)
    let terminal = false
    const original = h.storage.atomic.bind(h.storage)
    const atomic = vi.spyOn(h.storage, 'atomic').mockImplementation(async fn => {
      try {
        return await original(fn)
      } finally {
        terminal = true
      }
    })
    const actualParticipate = h.memberships.participate.bind(h.memberships)
    const participate = vi.spyOn(h.memberships, 'participate').mockImplementation(unit => ({
      ...actualParticipate(unit),
      standing: async () =>
        unit.run(async () => {
          throw new StorageUnavailable('injected actual participation failure')
        }),
    }))
    expect(await h.reader.read('session_a', tenant)).toEqual({ failure: 'unavailable' })
    expect(terminal).toBe(true)
    participate.mockImplementation(unit => ({
      ...actualParticipate(unit),
      standing: async () => {
        throw new StorageDefect('injected defect')
      },
    }))
    await expect(h.reader.read('session_a', tenant)).rejects.toBeInstanceOf(StorageDefect)
    participate.mockRestore()
    atomic.mockRestore()
  }))

test('close after idle read drains a later real blocked transaction and rejects new calls', async () =>
  withHost(async h => {
    const { tenant } = await h.identity('alice')
    await h.initialize(tenant)
    expect(await h.reader.read('session_a', tenant)).toHaveProperty('input')
    const block = gate()
    const actual = h.storage.atomic.bind(h.storage)
    const spy = vi.spyOn(h.storage, 'atomic').mockImplementation(fn =>
      actual(async unit => {
        await block.pause()
        return fn(unit)
      }),
    )
    const pending = h.reader.read('session_a', tenant)
    await block.reached
    let closed = false
    const close = h.reader.close().then(() => {
      closed = true
    })
    await Promise.resolve()
    expect(closed).toBe(false)
    expect(await h.reader.read('session_a', tenant)).toEqual({ failure: 'unavailable' })
    block.release()
    expect(await pending).toHaveProperty('input')
    await close
    expect(closed).toBe(true)
    spy.mockRestore()
    expect(await h.storage.read(async () => 'storage remains assembly-owned')).toBe(
      'storage remains assembly-owned',
    )
  }))

test('real Cordis wrapper reads the same component; withdrawal disables old reference without deleting source', async () =>
  withHost(async h => {
    const { tenant } = await h.identity('alice')
    await h.initialize(tenant)
    const host = h.assembly.ctx.plugin({
      name: 'source-session-host',
      apply(ctx) {
        ctx.provide('sessionTenancy', h.sessionTenancy)
        class Support extends EvaluationInputSupportService {
          monotonicNow() {
            return h.deps.monotonicNow()
          }
          diagnostics(...args: Parameters<typeof h.deps.diagnostics>) {
            return h.deps.diagnostics(...args)
          }
          onDiagnosticFailure(...args: Parameters<typeof h.deps.onDiagnosticFailure>) {
            return h.deps.onDiagnosticFailure(...args)
          }
        }
        new Support(ctx)
      },
    })
    await host
    const fiber = h.assembly.ctx.plugin(evaluationInputStorePlugin, {
      storeKey: h.deps.storeKey,
      deployedOfficial: [...h.deps.deployedOfficial],
    })
    await fiber
    const service = h.assembly.ctx.get('currentEvaluationInputs') as CurrentEvaluationInputs
    expect(await service.read('session_a', tenant)).toHaveProperty('input')
    await fiber.dispose()
    expect(await service.read('session_a', tenant)).toEqual({ failure: 'unavailable' })
    expect(await h.reader.read('session_a', tenant)).toHaveProperty('input')
    await host.dispose()
  }))

// 归慢层：子进程＋真库：fork 发布子进程，在提交点 SIGKILL，再读 SQLite 文件库核对。
test.each(['before_commit', 'after_commit_before_ack'] as const)(
  'real OS SIGKILL at %s leaves either the whole old publication or the whole committed publication, with no automatic retry',
  { tags: ['slow'] },
  async mode =>
    withHost(async h => {
      const { tenant } = await h.identity('alice')
      await h.initialize(tenant)
      const child = fork(new URL('./crash-worker.mjs', import.meta.url), [], {
        execArgv: [],
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      })
      let stderr = ''
      child.stderr?.on('data', chunk => {
        stderr += String(chunk)
      })
      try {
        const checkpoint = new Promise<unknown>((resolve, reject) => {
          child.once('message', resolve)
          child.once('error', reject)
          child.once('exit', () =>
            reject(new Error(`crash worker exited before checkpoint: ${stderr}`)),
          )
        })
        child.send({
          file: h.file,
          deployedOfficial: h.deps.deployedOfficial,
          mode,
          payload: writeJsonLossless({
            expectedRevision: '1',
            definitions: [asset([body(), body('example/model-b')])],
            scopes: [],
          }),
        })
        expect(await checkpoint).toEqual({ stage: mode })
        const exited = once(child, 'exit')
        child.kill('SIGKILL')
        expect((await exited)[1]).toBe('SIGKILL')
        expect(await readPublicationRevision(h.deps)).toEqual({
          revision: mode === 'before_commit' ? '1' : '2',
        })
        const result = await h.reader.read('session_a', tenant)
        expect(result).toHaveProperty('input.root.source.version', mode === 'before_commit' ? 1 : 2)
        expect(result).toHaveProperty(
          'input.definitions.0.versions.length',
          mode === 'before_commit' ? 1 : 2,
        )
        // Result-unknown on the committed branch is resolved by a real read, not a write retry.
        expect(await readPublicationRevision(h.deps)).toEqual({
          revision: mode === 'before_commit' ? '1' : '2',
        })
      } finally {
        if (child.exitCode === null && child.signalCode === null) {
          const exited = once(child, 'exit')
          child.kill('SIGKILL')
          await exited
        }
      }
    }),
)
