import { expect, test } from 'vitest'
import { parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import type { ManifestRecord } from '@omne-harness-lite/assembly-manifest-store'
import { readRunnerChain } from '../src/index.ts'
import { chainHost, session, a } from './runner-chain-support.ts'

async function withHost(run: (host: Awaited<ReturnType<typeof chainHost>>) => Promise<void>) {
  const host = await chainHost()
  try {
    await run(host)
  } finally {
    await host.close()
  }
}

test('real AR fill E1 and another-category reload E2 retain the original loop chain and immutable EIS bodies', async () =>
  withHost(async host => {
    expect(
      await host.registry.fill(session, host.evaluation, 'evaluation_one', host.order),
    ).toHaveProperty('snapshots')
    const first = await readRunnerChain({ session, binding: host.binding, sources: host.sources })
    expect(first).toMatchObject([
      { definition: { name: 'example:b', position: 'before_model_call' } },
      { definition: { name: 'example:a', position: 'before_model_call' } },
    ])
    host.setInput({
      ...host.input,
      session: [
        {
          capability: a,
          assignment: {
            item: 'position',
            value: 'after_persist_message',
            immutable: false,
            since: '2026-09-29T01:00:00Z',
          },
        },
      ],
    })
    expect(await host.registry.reload(session, 'tool', host.order)).toHaveProperty('snapshots')
    const head = await host.manifest.readHead(session)
    if (!('head' in head)) throw new Error('actual manifest unavailable')
    expect(head.head).toBe(2)
    expect(head.latest.tool?.evaluationRef).not.toBe(head.latest.loop_extension?.evaluationRef)
    expect(
      await readRunnerChain({ session, binding: host.binding, sources: host.sources }),
    ).toEqual(first)
  }))

test('real MF accepts legal loop reuse deletion, while complete given and mint retain all entries', async () =>
  withHost(async host => {
    expect(await host.manifest.append(session, 0, host.record(1))).toHaveProperty('seq', 1)
    expect(
      await host.manifest.append(session, 1, host.record(2, 'reuse', host.composition.slice(1))),
    ).toHaveProperty('seq', 2)
    expect(
      await readRunnerChain({ session, binding: host.binding, sources: host.sources }),
    ).toMatchObject([{ definition: { name: 'example:a' } }])
    expect(await host.manifest.append(session, 2, host.record(3, 'mint'))).toHaveProperty('seq', 3)
    const result = await readRunnerChain({ session, binding: host.binding, sources: host.sources })
    expect(result).toHaveLength(2)
    expect(Object.isFrozen(result)).toBe(true)
  }))

test('real missing manifest, empty chain, mismatched tenant/session, withdrawn reader and generation remain distinct', async () =>
  withHost(async host => {
    const read = () => readRunnerChain({ session, binding: host.binding, sources: host.sources })
    expect(await read()).toEqual({ failure: 'manifestMissing' })
    expect(await host.manifest.append(session, 0, host.record(1))).toHaveProperty('seq')
    expect(
      await readRunnerChain({
        session: 'different_session',
        binding: host.binding,
        sources: host.sources,
      }),
    ).toEqual({ failure: 'manifestMissing' })
    expect(
      await readRunnerChain({
        session,
        binding: {
          ...host.binding,
          tenant: unwrap(
            parseTenantId({ organization: 'other_organization', account: 'other_account' }),
          ),
        },
        sources: host.sources,
      }),
    ).toEqual({ failure: 'unavailable' })
    expect(
      await readRunnerChain({
        session,
        binding: host.binding,
        sources: { ...host.sources, isActive: () => false },
      }),
    ).toEqual({ failure: 'unavailable' })
    await host.history.close()
    expect(await read()).toEqual({ failure: 'unavailable' })
    expect(await host.manifest.append(session, 1, host.record(2, 'reuse', []))).toHaveProperty(
      'seq',
    )
    expect(await read()).toEqual([])
  }))

test.each([
  'wrong producer',
  'extra content',
  'wrong version',
  'wrong order',
  'wrong reference',
  'bad permission',
] as const)('selected source rejects %s before interpreting a contribution', async mutation =>
  withHost(async host => {
    expect(await host.manifest.append(session, 0, host.record(1))).toHaveProperty('seq')
    const head = await host.manifest.readHead(session)
    if (!('head' in head) || !head.latest.loop_extension) throw new Error('missing real record')
    const original = head.latest.loop_extension
    const base = host.record(1)
    let record: ManifestRecord = original
    // Each counterfeit source is deliberately typed at this test boundary; the production reader must reject it.
    if (mutation === 'wrong producer')
      record = {
        ...original,
        content: { ...base.content, filledBy: { kind: 'asset_change' } },
      } as unknown as ManifestRecord
    if (mutation === 'extra content')
      record = {
        ...original,
        content: { ...base.content, extra: true },
      } as unknown as ManifestRecord
    if (mutation === 'wrong version')
      record = {
        ...original,
        tables: {
          loop_extension: {
            ...original.tables.loop_extension,
            composition: host.composition.map(item => ({ ...item, version: 2 })),
          },
        },
      } as unknown as ManifestRecord
    if (mutation === 'wrong order')
      record = {
        ...original,
        tables: {
          loop_extension: {
            ...original.tables.loop_extension,
            composition: [...host.composition].reverse(),
          },
        },
      } as unknown as ManifestRecord
    if (mutation === 'wrong reference')
      record = { ...original, evaluationRef: 'other_ref' } as ManifestRecord
    if (mutation === 'bad permission')
      record = {
        ...original,
        content: {
          ...base.content,
          evaluation: {
            ...host.evaluation,
            values: host.evaluation.values.map(item =>
              item.item === 'power'
                ? { ...item, value: { allowed: ['observe', 'not_a_power'] } }
                : item,
            ),
          },
        },
      } as unknown as ManifestRecord
    expect(
      await readRunnerChain({
        session,
        binding: host.binding,
        sources: {
          ...host.sources,
          manifest: {
            ...host.manifest,
            async readHead() {
              return { head: head.head, latest: { loop_extension: record } }
            },
          },
        },
      }),
    ).toEqual({ failure: 'unavailable' })
  }),
)

test('newly published current bodies do not replace the immutable version selected by the actual manifest', async () =>
  withHost(async host => {
    expect(
      await host.registry.fill(session, host.evaluation, 'evaluation_one', host.order),
    ).toHaveProperty('snapshots')
    expect(await host.publishNewerBodies()).toHaveProperty('revision', '2')
    const chain = await readRunnerChain({ session, binding: host.binding, sources: host.sources })
    expect(chain).toMatchObject([
      {
        definition: {
          name: 'example:b',
          position: 'before_model_call',
          implementation: { builtinName: 'example:b' },
        },
      },
      {
        definition: {
          name: 'example:a',
          position: 'before_model_call',
          implementation: { builtinName: 'example:a' },
        },
      },
    ])
  }))
