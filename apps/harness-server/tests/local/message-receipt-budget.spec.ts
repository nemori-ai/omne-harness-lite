import { readFileSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import { SqliteStoragePlugin } from '@omne-harness/sqlite-provider/cordis'
import { combinationManifest, manifestDigest } from '@omne-harness/sql-contract'
import {
  preadmissionFacts,
  decodePreadmissionReply,
  decodePreadmissionRecord,
  EXECUTION_RECORD_HANDLERS,
} from '@omne-harness/session-storage-sql/participants'
import { testingTenant, sessionId } from '@omne-harness/session-contract/testing'
import { tenantCodec } from '@omne-harness/legal-identity'
import { storageCatalog } from '../../src/rows/storage/catalog.ts'
import { resolveLocations } from '../../src/local/locations.ts'
import { localOperatorLayer } from '../../src/local/operator-defaults.ts'

describe('local SQL receipt budget for tool message handoff', () => {
  it('commits and recalls a complete page with its original intent and admission outcome', async () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'local-receipt-')))
    const located = resolveLocations({
      platform: 'linux',
      env: { OMNE_SERVER_HOME: base },
      home: base,
    })
    if (located.kind !== 'located') throw new Error('local receipt locations')
    const distribution = JSON.parse(
      readFileSync(
        fileURLToPath(new URL('../../config/serve.distribution.json', import.meta.url)),
        'utf8',
      ),
    ) as { rows: { id: string; config?: Record<string, unknown> }[] }
    const layer = localOperatorLayer({
      distribution,
      locations: located.locations,
      platform: 'linux',
      shutdownDeadlineMs: 10_000,
      settings: {
        version: 1,
        port: 8965,
        workspace: base,
        shell: '/bin/bash',
        shellEnvironment: {},
      },
    })
    const validated = await SqliteStoragePlugin.Config['~standard'].validate(
      layer.ops.find(op => op.id === 'storage')?.config,
    )
    if ('issues' in validated) throw new Error(JSON.stringify(validated.issues))
    const catalog = storageCatalog()
    const made = await createSqliteStorage({
      config: validated.value,
      materials: catalog,
      closeLeases: { admit: name => ({ name }), release: () => {} },
    })
    if (made.kind !== 'created') throw new Error(`receipt provider: ${made.reason}`)
    try {
      const tenant = testingTenant(
        'org_app1st0rage000000000000000',
        'acc_app1st0rage000000000000000',
      )
      const encoded = tenantCodec.encode(tenant)
      if (!encoded.ok) throw new Error('receipt tenant')
      const domain = {
        scope: { kind: 'tenant' as const, tenant: encoded.value },
        transactionDomain: 'receipt',
      }
      const participants = ['execution-record']
      const manifest = combinationManifest({ catalog, participants })
      if (manifest.kind !== 'manifest') throw new Error(`receipt manifest: ${manifest.kind}`)
      const combination = {
        combinationVersion: 'receipt/1',
        manifestDigest: manifestDigest(manifest.manifest),
      }
      expect(
        await made.storage.registerCombination({ ...domain, ...combination, participants }),
      ).toMatchObject({ kind: 'registered' })
      const page = 'x'.repeat(65_536)
      const candidate = {
        id: 'msg_aaaaaaaaaaaaaaaaaaaaaa',
        role: 'tool',
        blocks: [
          {
            id: 'result',
            kind: 'tool_result',
            callId: 'same-call',
            visibility: { toHuman: true, toModel: true },
          },
          { id: 'page', kind: 'text', text: page, visibility: { toHuman: true, toModel: true } },
        ],
      }
      const request = { candidate }
      const origin = { kind: 'tool-result', call: 'same-call', resultVersion: 'v1' }
      const intent = preadmissionFacts({
        phase: 'intent',
        tenant,
        handoff: 'same-handoff',
        entry: 'same-entry',
        session: sessionId('same-session'),
        execution: 'same-execution',
        intent: {
          request,
          origin,
          principal: 'stable-principal',
          qualification: null,
          adoption: null,
          materials: null,
        },
      })
      const outcomeValue = {
        request,
        origin,
        decision: { kind: 'prepared', message: request.candidate },
      }
      const outcome = preadmissionFacts({
        phase: 'outcome',
        tenant,
        handoff: 'same-handoff',
        outcome: { kind: 'prepared', outcome: outcomeValue },
      })
      const commit = (operation: string, command: typeof intent) =>
        made.storage.commit({
          identity: { ...domain, operation, operationKey: operation, protocolVersion: '2' },
          ...combination,
          commands: [command],
        })
      const saved = await commit('intent', intent)
      expect(saved.kind).toBe('committed')
      const fixed = await commit('outcome', outcome)
      expect(fixed.kind, JSON.stringify(fixed)).toBe('committed')
      if (fixed.kind !== 'committed') throw new Error('outcome did not commit')
      const reply = fixed.responses[0]?.reply
      if (reply === undefined) throw new Error('missing receipt')
      const decoded = decodePreadmissionReply(reply)
      expect(decoded.kind).toBe('saved')
      if (decoded.kind !== 'saved') throw new Error('outcome not saved')
      expect(decoded.record.intent).toEqual({
        request,
        origin,
        principal: 'stable-principal',
        qualification: null,
        adoption: null,
        materials: null,
      })
      expect(decoded.record.outcome).toEqual({ kind: 'prepared', outcome: outcomeValue })
      expect(decoded.record).toMatchObject({
        handoff: 'same-handoff',
        entry: 'same-entry',
        session: 'same-session',
        execution: 'same-execution',
      })
      const again = await commit('outcome', outcome)
      expect(again).toEqual(fixed)
      const read = await made.storage.read({
        domain,
        handler: EXECUTION_RECORD_HANDLERS.preadmission,
        protocol: '1',
        requestKey: 'read-original',
        input: { tenant: encoded.value, handoff: 'same-handoff' },
      })
      expect(read.kind).toBe('read')
      if (read.kind !== 'read') throw new Error('original handoff not readable')
      expect(decodePreadmissionRecord(read.output)).toEqual(decoded.record)
    } finally {
      const closed = await made.control.close({ initiator: 'assembly' })
      made.control.assemblyReportSettled()
      rmSync(base, { recursive: true, force: true })
      expect(closed.kind).toBe('closed')
    }
  })
})
