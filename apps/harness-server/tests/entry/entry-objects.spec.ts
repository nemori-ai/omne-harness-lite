// R3 的入口对象在 `serve` 模式下（验收 5）：七个模块装进一棵最小树，受信与否由受信表决定，`entry-object`
// 记录与 stderr 里没有值、没有签发者；`server-entry` 行经受信的 `principalIssuer` 签出的主体，经受信核验器
// `principalVerifier`（R2-D203 P-9，对 `session-ad09` 可见，对 `server-entry` 不可见）核验通过。
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

type Box = { issued?: unknown; verifier?: PrincipalVerifier | undefined }

/** 探针行：装在 `server-entry` 上，签一个 `server-entry` 系统主体放进 `box`，并记下本行看得见哪些受信名。 */
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

/** 探针行：装在 `session-ad09` 上（受信表让它看见核验器），把核验器放进 `box`。 */
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
    // 夹具看到 startup-result 就请求停止，那一行是夹具自己的；此外 stderr 什么都没有。
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
