import assert from 'node:assert/strict'
import { fail, succeed } from '@omne-harness/operation-result'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ContinuationKey, ContinuationRecords } from './ports.ts'
import { conformanceCase, handle, tenantText, type ConformanceCase } from './testing-case.ts'

export type ContinuationRecordsFixture = Readonly<{
  records: ContinuationRecords
  tenant: TenantId
  otherTenant: TenantId
  unavailable?: () => Promise<void>
}>

const key = (tenant: TenantId, checkpoint: string): ContinuationKey => ({ tenant, checkpoint })

export function mcpContinuationRecordsConformance(): readonly ConformanceCase<ContinuationRecordsFixture>[] {
  type F = ContinuationRecordsFixture
  return [
    conformanceCase<F>(
      'continuation-records',
      'the first mark of a checkpoint is marked, every later one is already',
      async ({ records, tenant }) => {
        assert.deepEqual(await records.mark(key(tenant, 'sha256:a')), succeed('marked'))
        assert.deepEqual(await records.mark(key(tenant, 'sha256:a')), succeed('already'))
        assert.deepEqual(await records.mark(key(tenant, 'sha256:a')), succeed('already'))
      },
    ),
    conformanceCase<F>(
      'continuation-records',
      'a mark belongs to its tenant and its checkpoint: another of either is marked on its own',
      async ({ records, tenant, otherTenant }) => {
        assert.deepEqual(await records.mark(key(tenant, 'sha256:b')), succeed('marked'))
        assert.deepEqual(await records.mark(key(otherTenant, 'sha256:b')), succeed('marked'))
        assert.deepEqual(await records.mark(key(tenant, 'sha256:c')), succeed('marked'))
      },
    ),
    conformanceCase<F>(
      'continuation-records',
      'a store that cannot be reached says unavailable, and marks nothing',
      async ({ records, tenant, unavailable }) => {
        const cut = handle(unavailable, 'unavailable')
        await cut()
        assert.deepEqual(await records.mark(key(tenant, 'sha256:d')), fail('unavailable'))
      },
    ),
  ]
}

export type MemoryContinuationRecords = ContinuationRecords &
  Readonly<{ marks(): readonly string[]; cut(): void; mend(): void }>

export function createMemoryContinuationRecords(): MemoryContinuationRecords {
  const marked = new Set<string>()
  let reachable = true
  return {
    async mark({ tenant, checkpoint }) {
      if (!reachable) return fail('unavailable')
      const text = JSON.stringify([tenantText(tenant), checkpoint])
      if (marked.has(text)) return succeed('already')
      marked.add(text)
      return succeed('marked')
    },
    marks: () => [...marked],
    cut: () => {
      reachable = false
    },
    mend: () => {
      reachable = true
    },
  }
}
