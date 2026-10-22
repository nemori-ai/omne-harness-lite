import { it, expect } from 'vitest'
import * as operations from '@omne-harness/request-context-contract'
import {
  requestContextConformance,
  representationPolicyConformance,
  compactionPolicyConformance,
  runConformanceCase,
  createScriptedRepresentationPolicy,
  createScriptedCompactionPolicy,
  createMemoryHistorySource,
  historySourceConformance,
} from '@omne-harness/request-context-contract/testing'
import { tenantCodec } from '@omne-harness/legal-identity'
import { fixture, row, entry, epoch, scope } from './fixtures.js'
it('operation suite accepts real operations and rejects each targeted broken implementation', async () => {
  const names = requestContextConformance<string>()
  for (const item of names) {
    const f = fixture()
    await expect(
      runConformanceCase(item, {
        operations,
        input: f.input,
        ports: f.ports,
        policies: f.policies,
      }),
    ).resolves.toEqual({ kind: 'passed' })
  }
  for (const item of names) {
    const f = fixture()
    const good = await operations.assemble(f.input, f.ports, f.policies)
    if (good.kind !== 'candidate-before-extension') throw new Error(good.kind)
    const bad: typeof operations = {
      ...operations,
      assemble: async () => ({ kind: 'invalid', field: 'bad', reason: 'missing-input' }),
      resume: async () => good,
      planCompaction: async () => ({ kind: 'invalid', field: 'bad', reason: 'missing-input' }),
    }
    if (item.name === 'new-inputs-must-be-saved' || item.name === 'incremental-material-required')
      bad.assemble = async () => good
    if (item.name === 'same-input-is-deterministic') {
      let count = 0
      bad.assemble = async () => ({
        kind: 'invalid',
        field: String(count++),
        reason: 'missing-input',
      })
    }
    await expect(
      runConformanceCase(item, {
        operations: bad,
        input: f.input,
        ports: f.ports,
        policies: f.policies,
      }),
      item.name,
    ).rejects.toThrow()
  }
})
it('history double passes every public obligation and each isolated bad source fails its own case', async () => {
  for (const item of historySourceConformance<string>()) {
    const f = fixture()
    const other = tenantCodec.parse(
      '{"organization":"org_11111111111111111111111111","account":"acc_11111111111111111111111111"}',
    )
    if (!other.ok) throw new Error('Tenant fixture')
    const data = {
      scope,
      tenant: f.input.identity.access.tenant,
      epochs: [
        {
          epoch,
          rows: [row(0), row(1)],
          entries: [
            { ref: entry('entry:0'), message: row(0).message },
            { ref: entry('entry:1'), message: row(1).message },
          ],
          open: [],
        },
      ],
    }
    const createSource = (
      data: import('@omne-harness/request-context-contract/testing').HistoryFixture,
    ) => createMemoryHistorySource<string>(data)
    const subject = {
      source: createSource(data),
      fixture: data,
      access: f.input.identity.access,
      otherTenant: other.value,
      createSource,
    }
    await expect(runConformanceCase(item, subject), item.name).resolves.toEqual({ kind: 'passed' })
    const createBad: typeof createSource = data => {
      const source = createSource(data)
      return {
        ...source,
        async read(e, access, after, budget) {
          if (item.name === 'read-requires-access')
            return source.read(e, access ?? subject.access, after, budget)
          if (item.name === 'tenant-isolation') return source.read(e, subject.access, after, budget)
          if (item.name === 'missing-scope-is-invalid')
            return source.read({ ...e, scope: e.scope ?? data.scope }, access, after, budget)
          const result = await source.read(
            e,
            access,
            after,
            item.name === 'page-respects-byte-budget' ? 65536 : budget,
          )
          if (result.kind !== 'page') return result
          if (item.name === 'page-size-retains-order')
            return { ...result, page: { ...result.page, rows: [...result.page.rows].reverse() } }
          if (item.name === 'prefix-digest-is-chained')
            return {
              ...result,
              page: {
                ...result.page,
                rows: result.page.rows.map(row => ({ ...row, prefixDigest: 'constant-non-chain' })),
              },
            }
          return result
        },
      }
    }
    await expect(
      runConformanceCase(item, { ...subject, source: createBad(data), createSource: createBad }),
      item.name,
    ).rejects.toThrow()
  }
})
it('the public prefix case also rejects per-row digests that do not depend on the preceding row', async () => {
  const f = fixture(),
    item = historySourceConformance<string>().find(item => item.name === 'prefix-digest-is-chained')
  if (item === undefined) throw new Error('Missing chain obligation')
  const other = tenantCodec.parse(
    '{"organization":"org_11111111111111111111111111","account":"acc_11111111111111111111111111"}',
  )
  if (!other.ok) throw new Error('Tenant fixture')
  const data = {
    scope,
    tenant: f.input.identity.access.tenant,
    epochs: [{ epoch, rows: [row(0), row(1)], entries: [], open: [] }],
  }
  const createSource = (
    fixture: import('@omne-harness/request-context-contract/testing').HistoryFixture,
  ) => {
    const source = createMemoryHistorySource<string>(fixture)
    return {
      ...source,
      async read(...args: Parameters<typeof source.read>) {
        const result = await source.read(...args)
        return result.kind === 'page'
          ? {
              ...result,
              page: {
                ...result.page,
                rows: result.page.rows.map(row => ({
                  ...row,
                  prefixDigest: JSON.stringify(row.message),
                })),
              },
            }
          : result
      },
    }
  }
  await expect(
    runConformanceCase(item, {
      source: createSource(data),
      fixture: data,
      access: f.input.identity.access,
      otherTenant: other.value,
      createSource,
    }),
  ).rejects.toThrow()
})
it('prefix conformance accepts provider-specific digests and a source that chooses smaller pages', async () => {
  const f = fixture(),
    item = historySourceConformance<string>().find(item => item.name === 'prefix-digest-is-chained')
  if (item === undefined) throw new Error('Missing chain obligation')
  const other = tenantCodec.parse(
    '{"organization":"org_11111111111111111111111111","account":"acc_11111111111111111111111111"}',
  )
  if (!other.ok) throw new Error('Tenant fixture')
  const data = {
    scope,
    tenant: f.input.identity.access.tenant,
    epochs: [{ epoch, rows: [row(0), row(1)], entries: [], open: [] }],
  }
  const createSource = (
    fixture: import('@omne-harness/request-context-contract/testing').HistoryFixture,
  ) => {
    const source = createMemoryHistorySource<string>(fixture)
    return {
      ...source,
      async read(...args: Parameters<typeof source.read>) {
        const result = await source.read(...args)
        if (result.kind !== 'page') return result
        const first = result.page.rows[0]
        return {
          ...result,
          page: {
            rows:
              first === undefined
                ? []
                : [{ ...first, prefixDigest: 'provider-owned:' + first.prefixDigest }],
            next: result.page.rows.length > 1 ? (first?.seq ?? null) : result.page.next,
          },
        }
      },
    }
  }
  await expect(
    runConformanceCase(item, {
      source: createSource(data),
      fixture: data,
      access: f.input.identity.access,
      otherTenant: other.value,
      createSource,
    }),
  ).resolves.toEqual({ kind: 'passed' })
})
it('policy suites pass scripted doubles and reject individual policy defects', async () => {
  for (const item of representationPolicyConformance()) {
    await expect(
      runConformanceCase(item, { policy: createScriptedRepresentationPolicy() }),
    ).resolves.toEqual({ kind: 'passed' })
    const base = createScriptedRepresentationPolicy()
    const bad = {
      ...base,
      choose: () =>
        item.name === 'text-original-decision' ? ('none' as const) : ('original' as const),
    }
    await expect(runConformanceCase(item, { policy: bad })).rejects.toThrow()
  }
  for (const item of compactionPolicyConformance()) {
    const f = fixture()
    const data = { scope, tenant: f.input.identity.access.tenant, epochs: [] }
    const policy = createScriptedCompactionPolicy()
    await expect(runConformanceCase(item, { policy, fixture: data })).resolves.toEqual({
      kind: 'passed',
    })
    let count = 0
    const bad = {
      ...policy,
      configDigest: () => String(count++),
      trim(material: operations.SummaryMaterial) {
        Object.assign(material, { trimmed: [{ bad: true }] })
        return material
      },
    }
    await expect(runConformanceCase(item, { policy: bad, fixture: data })).rejects.toThrow()
  }
})
it('public suite rejects an implementation that measures only open work inside chosen coverage', async () => {
  const item = requestContextConformance<string>().find(
    value => value.name === 'floor-after-cover-cannot-evade-budget',
  )
  if (item === undefined) throw new Error('Missing lower-bound regression')
  const f = fixture()
  const bad = {
    ...operations,
    planCompaction: (
      input: Parameters<typeof operations.planCompaction<string>>[0],
      ports: typeof f.ports,
      policies: typeof f.policies,
    ) =>
      operations.planCompaction(
        input,
        {
          ...ports,
          history: {
            ...ports.history,
            async compactionContext(...args: Parameters<typeof ports.history.compactionContext>) {
              const result = await ports.history.compactionContext(...args)
              if (result.kind !== 'context') return result
              const draft = policies.compaction.plan({
                view: operations.project([], input.history.epoch),
                context: result.value,
                measure: () => '0',
                windowTokens: input.selection.profile.definition.context.window.provided,
              })
              if (draft.kind !== 'draft') return result
              const end = result.value.covered.findIndex(entry => entry.ref === draft.coverTo)
              return {
                ...result,
                value: {
                  ...result.value,
                  open: result.value.open.filter(ref =>
                    result.value.covered.slice(0, end + 1).some(entry => entry.ref === ref),
                  ),
                },
              }
            },
          },
        },
        policies,
      ),
  }
  await expect(
    runConformanceCase(item, {
      operations: bad,
      input: f.input,
      ports: f.ports,
      policies: f.policies,
    }),
  ).rejects.toThrow()
})
