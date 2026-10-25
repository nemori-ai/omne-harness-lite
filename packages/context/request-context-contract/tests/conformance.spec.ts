import { it, expect } from 'vitest'
import * as operations from '@omne-harness/request-context-contract'
import type { AssemblyOperations } from '@omne-harness/request-context-contract'
import {
  createAssemblyFixture,
  createTestingPrincipalBinding,
  type ConformanceSubject,
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
const real: ConformanceSubject = {
  operations: f =>
    operations.createAssemblyOperations({
      target: f.target,
      sources: f.sources,
      principalBinding: createTestingPrincipalBinding<string>(),
      policies: f.policies,
    }),
}
it('operation suite accepts real operations and rejects each targeted broken implementation', async () => {
  const names = requestContextConformance()
  for (const item of names)
    await expect(runConformanceCase(item, real), item.name).resolves.toEqual({ kind: 'passed' })
  const reference = createAssemblyFixture()
  const good = await (await real.operations(reference)).assemble(reference.call)
  if (good.kind !== 'candidate-before-extension') throw new Error(good.kind)
  for (const item of names) {
    let count = 0
    const broken: ConformanceSubject = {
      async operations(f) {
        const o = await real.operations(f)
        const invalid = async () => ({
          kind: 'invalid' as const,
          field: 'bad',
          reason: 'missing-input' as const,
        })
        const bad: AssemblyOperations<string> = {
          ...o,
          assemble: invalid,
          resume: async () => good,
          planCompaction: invalid,
        }
        if (
          item.name === 'new-inputs-must-be-saved' ||
          item.name === 'incremental-material-required'
        )
          bad.assemble = async () => good
        if (item.name === 'same-input-is-deterministic')
          bad.assemble = async () => ({
            kind: 'invalid',
            field: String(count++),
            reason: 'missing-input',
          })
        return bad
      },
    }
    await expect(runConformanceCase(item, broken), item.name).rejects.toThrow()
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
        async read(input) {
          if (item.name === 'read-requires-access')
            return source.read({ ...input, access: input.access ?? subject.access })
          if (item.name === 'tenant-isolation')
            return source.read({ ...input, access: subject.access })
          if (item.name === 'foreign-cursor-is-invalid')
            return source.read({
              ...input,
              cursor: input.cursor === null ? null : { ...input.cursor, evidence: input.evidence },
            })
          const result = await source.read({
            ...input,
            budgetBytes: item.name === 'page-respects-byte-budget' ? 65536 : input.budgetBytes,
          })
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
            next:
              result.page.rows.length > 1 && first !== undefined
                ? { evidence: args[0].evidence, after: first.seq }
                : result.page.next,
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
