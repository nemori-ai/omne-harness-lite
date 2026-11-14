import type { Context, Plugin } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { PrincipalIssuer, PrincipalVerifier } from '@omne-harness/identity'
import { principalIssuerKey, principalVerifierKey } from '@omne-harness/identity/cordis'
import { sessionWorkPrincipalsKey } from '@omne-harness/session-cordis-contract/cordis'
import { stubPlugin } from '../../src/cordis.ts'
import { agentClock } from '../../src/entry/agent-clock.ts'
import {
  principalIssuer,
  principalVerifier,
  sessionPrincipals,
} from '../../src/entry/principals.ts'
import { requestContextTrust } from '../../src/entry/request-context-trust.ts'
import { sessionClock } from '../../src/entry/session-clock.ts'
import { sessionWorkPrincipals } from '../../src/entry/session-work-principals.ts'
import { defineRow } from '../../src/row.ts'
import { serveOnce } from '../fixtures/serve/harness.ts'

const entryObjects = [
  principalVerifier,
  principalIssuer,
  sessionPrincipals,
  sessionWorkPrincipals,
  requestContextTrust,
  sessionClock,
  agentClock,
]

type Box = { issued?: unknown; verifier?: PrincipalVerifier | undefined }

function probeServerEntry(seen: string[], box: Box): Plugin.Object {
  const plugin: Plugin.Object = {
    name: 'probe-server-entry',
    inject: [principalIssuerKey],
    apply(ctx: Context) {
      const issuer: PrincipalIssuer | undefined = ctx.get(principalIssuerKey)
      if (issuer === undefined) {
        seen.push('missing')
        return
      }
      const issued = issuer.issueSystem({ component: 'server-entry' })
      if ('failure' in issued) {
        seen.push('issue-failed')
        return
      }
      box.issued = issued.ok
      seen.push(
        ctx.get(principalVerifierKey) === undefined ? 'verifier-hidden' : 'verifier-visible',
      )
      seen.push(ctx.get(sessionWorkPrincipalsKey) === undefined ? 'work-hidden' : 'work-visible')
    },
  }
  return defineRow({
    row: 'server-entry',
    implementation: 'real',
    manifest: { provides: [], injects: [principalIssuerKey], sameProviderGroup: null },
    lifecycle: { kind: 'none' },
    plugin,
  })
}

function probeVerifier(box: Box): Plugin.Object {
  const plugin: Plugin.Object = {
    name: 'probe-verifier',
    inject: [principalVerifierKey],
    apply(ctx: Context) {
      box.verifier = ctx.get(principalVerifierKey)
    },
  }
  return defineRow({
    row: 'session-ad09',
    implementation: 'real',
    manifest: { provides: [], injects: [principalVerifierKey], sameProviderGroup: null },
    lifecycle: { kind: 'none' },
    plugin,
  })
}

describe('R3 entry objects under serve', () => {
  it('install on the scopes the trust table gives them, print no value, and let server-entry issue and verify', async () => {
    const seen: string[] = []
    const box: Box = {}
    const run = await serveOnce({
      distribution: {
        rows: [
          { id: 'session-ad09', plugin: 'probeVerifier', config: {} },
          { id: 'server-entry', plugin: 'probeServerEntry', config: {} },
        ],
      },
      plugins: {
        stubPlugin,
        probeVerifier: probeVerifier(box),
        probeServerEntry: probeServerEntry(seen, box),
      },
      entryObjects,
    })
    expect(run.stderr.filter(line => !line.startsWith('serve: stop requested: test'))).toEqual([])
    expect(run.result.exitCode).toBe(0)
    expect(run.state('server-entry')).toMatchObject({ state: 'ACTIVE' })
    expect(seen).toEqual(['verifier-hidden', 'work-hidden'])
    const verifier = box.verifier
    if (verifier === undefined) throw new Error('the verifier probe saw no verifier')
    expect((await verifier.verify(box.issued as never)).kind).toBe('verified')

    const records = run.of('entry-object')
    const byName = Object.fromEntries(records.map(record => [record['name'], record['trusted']]))
    expect(byName).toEqual({
      's0.assemblyLifecycle': false,
      principalVerifier: true,
      principalIssuer: true,
      sessionPrincipals: false,
      sessionWorkPrincipals: true,
      requestContextTrust: true,
      sessionClock: false,
      agentClock: false,
    })
    for (const record of records) {
      expect(record['implementation']).toBe('real')
      expect(record).not.toHaveProperty('value')
    }
    const printed = JSON.stringify(run.records)
    expect(printed).not.toMatch(/issueSystem|issueActingForTenant|authority|verify/u)
    expect(run.startup['implementations']).toEqual({
      real: 2,
      'contract-double': 0,
      's0-double': 0,
    })
  })
})
