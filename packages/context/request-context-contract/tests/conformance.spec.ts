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
it('history double passes all identity/order cases; each targeted bad source fails', async () => {
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
    const source = createMemoryHistorySource<string>(data)
    const subject = {
      source,
      fixture: data,
      access: f.input.identity.access,
      otherTenant: other.value,
      commit: async () => epoch,
    }
    await expect(runConformanceCase(item, subject)).resolves.toEqual({ kind: 'passed' })
    const bad = {
      ...source,
      read: async () => ({
        kind: 'page' as const,
        page: {
          rows: [
            { ...row(1), prefixDigest: '1' },
            { ...row(0), prefixDigest: '0' },
          ],
          next: null,
        },
      }),
    }
    await expect(runConformanceCase(item, { ...subject, source: bad })).rejects.toThrow()
  }
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
