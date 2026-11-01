// R3 的入口对象在 `serve` 模式下（验收 5）：七个模块装进一棵最小树，受信与否由受信表决定，`entry-object`
// 记录与 stderr 里没有值、没有签发者；`server-entry` 行经受信的 `principalIssuer` 签出的主体经根上的核验器通过。
// 别的行看不见 `principalIssuer` 由受信表与 APP-0 的装载前检查保证，不在这里重复断言。
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

/** 探针行：装在 `server-entry` 上，签一个 `server-entry` 系统主体并经核验器核验，把结果写进 `seen`。 */
function probeServerEntry(seen: string[]): Plugin.Object {
  const plugin: Plugin.Object = {
    name: 'probe-server-entry',
    inject: [principalIssuerKey, principalVerifierKey],
    async apply(ctx: Context) {
      const issuer: PrincipalIssuer | undefined = ctx.get(principalIssuerKey)
      const verifier: PrincipalVerifier | undefined = ctx.get(principalVerifierKey)
      if (issuer === undefined || verifier === undefined) {
        seen.push('missing')
        return
      }
      const issued = issuer.issueSystem({ component: 'server-entry' })
      if ('failure' in issued) {
        seen.push('issue-failed')
        return
      }
      seen.push((await verifier.verify(issued.ok)).kind)
      seen.push(ctx.get(sessionWorkPrincipalsKey) === undefined ? 'work-hidden' : 'work-visible')
    },
  }
  return defineRow({
    row: 'server-entry',
    implementation: 'real',
    manifest: {
      provides: [],
      injects: [principalIssuerKey, principalVerifierKey],
      sameProviderGroup: null,
    },
    lifecycle: { kind: 'none' },
    plugin,
  })
}

describe('R3 entry objects under serve', () => {
  it('install on the scopes the trust table gives them, print no value, and let server-entry issue and verify', async () => {
    const seen: string[] = []
    const run = await serveOnce({
      distribution: { rows: [{ id: 'server-entry', plugin: 'probeServerEntry', config: {} }] },
      plugins: { stubPlugin, probeServerEntry: probeServerEntry(seen) },
      entryObjects,
    })
    // 夹具看到 startup-result 就请求停止，那一行是夹具自己的；此外 stderr 什么都没有。
    expect(run.stderr.filter(line => !line.startsWith('serve: stop requested: test'))).toEqual([])
    expect(run.result.exitCode).toBe(0)
    expect(run.state('server-entry')).toMatchObject({ state: 'ACTIVE' })
    expect(seen).toEqual(['verified', 'work-hidden'])

    const records = run.of('entry-object')
    const byName = Object.fromEntries(records.map(record => [record['name'], record['trusted']]))
    expect(byName).toEqual({
      's0.assemblyLifecycle': false,
      principalVerifier: false,
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
      real: 1,
      'contract-double': 0,
      's0-double': 0,
    })
  })
})
