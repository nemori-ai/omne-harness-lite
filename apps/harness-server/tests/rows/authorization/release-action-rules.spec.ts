// The action rules of the release distribution (R2-D34 item 1, S4-6): the shipped default lets `Shell` and
// `Files` run, and an operator adds one deny with the existing row-level `replace` and no code change.
// The admission is the real one over the real reference authorization; only the standing source is a double.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { referenceAdmissionCheck } from '@omne-harness/authorization'
import { inProcessPrincipalAuthority } from '@omne-harness/identity'
import { loadTree } from '../../../src/plugin-tree.ts'
import { serveProfile } from '../../../src/profile.ts'
import { createActionAdmission } from '../../../src/rows/authorization/adapters.ts'
import { authorizationConfig } from '../../../src/rows/authorization/action-rules.ts'
import { fixtureTenant, okOf } from '../../entry/support.ts'

const tenant = fixtureTenant('a')
const distribution: unknown = JSON.parse(
  readFileSync(new URL('../../../config/serve.distribution.json', import.meta.url), 'utf8'),
)
// `runServe` adds the `executionHost` factory binding to the allowlist (HOSTFILE-FACTORY-ROW); the
// release now names it for `execution-host`, so reading the release tree needs the same entry.
const allowlist = [...serveProfile().allowlist, 'executionHost']

function configOf(operator: unknown): unknown {
  const row = loadTree(distribution, operator, allowlist).rows.find(r => r.id === 'authorization')
  if (row === undefined) throw new Error('the release has no authorization row')
  return row.config
}

function admissionFor(config: unknown) {
  const authority = inProcessPrincipalAuthority()
  const actor = okOf(authority.issuer.issueSystem({ component: 'sessionWorkPrincipals' }), 'actor')
  const principal = okOf(
    authority.issuer.issueActingForTenant({
      actor,
      tenant,
      work: { owner: 'session', work: 'ses_own' },
    }),
    'principal',
  )
  const identity = referenceAdmissionCheck({
    verifier: authority.verifier,
    standing: {
      read: () =>
        Promise.resolve({
          kind: 'member' as const,
          role: { role: 'member', model: { model: 'm', revision: '1' } },
          qualifications: [],
          evidence: { record: 'standing/test', revision: '1' },
        }),
    },
    permits: null,
  })
  const { actionRules } = authorizationConfig.parse(config)
  const admission = createActionAdmission({ actionRules, readAdmission: () => identity })
  return (tool: string) =>
    admission.admit({
      principal,
      tenant,
      execution: 'e',
      passage: 'p',
      action: 'a',
      original: { name: tool, arguments: '{}' },
      effectiveArguments: '{}',
      definition: { owner: 'tool', name: tool, revision: '1', digest: 'd' },
      permissions: [],
      decision: null,
    } as never)
}

describe('release action rules', () => {
  it('allows Shell and Files by default and keeps every other tool unavailable', async () => {
    const admit = admissionFor(configOf(undefined))
    expect(await admit('Files')).toMatchObject({ ok: { kind: 'allow' } })
    expect(await admit('Shell')).toMatchObject({ ok: { kind: 'allow' } })
    expect(await admit('Other')).toMatchObject({ ok: { kind: 'unavailable' } })
  })

  it('lets the operator layer deny one tool with a row replace, and the deny wins over the release allow', async () => {
    const operator = {
      ops: [
        {
          kind: 'replace',
          id: 'authorization',
          config: {
            actionRules: {
              revision: 'operator-1',
              rules: [
                { id: 'files', effect: 'allow', tool: 'Files' },
                { id: 'shell', effect: 'allow', tool: 'Shell' },
                { id: 'no-shell', effect: 'deny', tool: 'Shell' },
              ],
            },
          },
        },
      ],
    }
    const admit = admissionFor(configOf(operator))
    expect(await admit('Files')).toMatchObject({ ok: { kind: 'allow' } })
    expect(await admit('Shell')).toMatchObject({
      ok: { kind: 'deny', reason: 'rule/no-shell', evidence: { revision: 'operator-1' } },
    })
  })
})
