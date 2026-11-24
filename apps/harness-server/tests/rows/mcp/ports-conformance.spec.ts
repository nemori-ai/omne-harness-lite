// @module-tag slow
// The two needs MCP declares, as the release answers them: the conformance suites of the contract.
import { join } from 'node:path'
import { expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { EndpointRef } from '@omne-harness/mcp-contract'
import type { AdoptionView, UseEligibility } from '@omne-harness/mcp-contract/provider'
import {
  mcpAdoptionViewConformance,
  mcpUseEligibilityConformance,
  runConformanceCase,
} from '@omne-harness/mcp-contract/testing'
import { mcpAdoptionViewKey, mcpUseEligibilityKey } from '@omne-harness/mcp-cordis-contract/cordis'
import { anotherPerson, loginAccess } from '../../model/public-stream-support.ts'
import { runOmne, savedTenant } from '../../r9/support.ts'
import { tenantOf } from '../../support/protocol-clients.ts'
import { onReleaseTree, toolCallsThenText, type ReleaseTree } from '../../support/release-tree.ts'
import { endedRuns } from '../authorization/release-flow-support.ts'
import { settled } from '../../support/tools-flow.ts'

const text = (value: string): JsonValue => ({ kind: 'string', value })
const ownerOf = (name: string) => ({ kind: 'asset', category: 'mcp', name }) as const
const refOf = (name: string, holding: string) => ({ name, holding }) as unknown as EndpointRef

async function held(tree: ReleaseTree, name: string): Promise<EndpointRef> {
  const tenant = tenantOf(savedTenant(tree.home))
  const created = await tree.clients.assets['create-asset']({
    tenant,
    operation: `create-${name}`,
    category: 'mcp',
    name,
    body: {
      kind: 'object',
      entries: [
        { key: 'name', value: text(name) },
        { key: 'transport', value: text('streamable-http') },
        { key: 'auth', value: text('none') },
      ],
    } as never,
  })
  if (created.outcome !== 'succeeded') throw new Error(`create ${name}: ${JSON.stringify(created)}`)
  await settled(
    tree,
    `the settings of ${name} to be adopted`,
    () => tree.clients.assets['describe-setting']({ tenant, owner: ownerOf(name), item: 'invoke' }),
    value => value.outcome === 'succeeded' && value.body.item.kind === 'permission',
  )
  return refOf(name, created.body.holding)
}

async function setTimeoutOf(tree: ReleaseTree, name: string, ms: number) {
  const tenant = tenantOf(savedTenant(tree.home))
  const current = await settled(
    tree,
    `the timeout of ${name} to be read`,
    () =>
      tree.clients.assets['describe-setting']({
        tenant,
        owner: ownerOf(name),
        item: 'connect-timeout',
      }),
    value => value.outcome === 'succeeded',
  )
  if (current.outcome !== 'succeeded') throw new Error('unreachable')
  const written = await tree.clients.assets['set-setting']({
    tenant,
    owner: ownerOf(name),
    item: 'connect-timeout',
    operation: `${name}-timeout-${String(ms)}`,
    expectedRevision: current.body.item.revision,
    value: { kind: 'ordinary', value: { kind: 'number', lexeme: String(ms) } as never },
  })
  expect(written).toMatchObject({ outcome: 'succeeded' })
}

async function run<F>(cases: readonly Parameters<typeof runConformanceCase<F>>[0][], fixture: F) {
  const verdicts: Record<string, string> = {}
  for (const conformance of cases) {
    const verdict = await runConformanceCase(conformance, fixture)
    verdicts[`${conformance.clause} ${conformance.name}`] =
      verdict.kind === 'passed' ? 'passed' : `not applicable: ${verdict.handle}`
  }
  return verdicts
}

it(
  'the adoption and the eligibility the release answers MCP with pass the conformance suites of the contract',
  { tags: ['slow'], timeout: 600_000 },
  async () => {
    const exit = await onReleaseTree(
      { script: toolCallsThenText(() => []), permission: 'auto_permission' },
      async tree => {
        const session = await tree.startSession('hello')
        await endedRuns(tree, session, 1)
        const reader = await loginAccess(tree)
        const otherHome = await anotherPerson(tree, 'frank')
        const outsider = await loginAccess(tree, otherHome)
        const opened = await runOmne({
          args: ['create-session', '--definition', 'coding'],
          home: otherHome,
          server: `http://127.0.0.1:${String(tree.port)}`,
          cwd: join(tree.home, '..'),
          credential: 'frank-pw-public-stream-5d1e',
        })
        expect(opened.status, opened.stderr).toBe(0)
        const docs = await held(tree, 'docs')
        const off = await held(tree, 'off')
        const disabled = await tree.clients.assets['set-asset-enabled']({
          tenant: reader.tenant,
          operation: 'off-disabled',
          holding: off.holding,
          enabled: false,
        })
        expect(disabled).toMatchObject({ outcome: 'succeeded' })
        const adoption = tree.scope.get(mcpAdoptionViewKey) as AdoptionView<unknown, unknown>
        const eligibility = tree.scope.get(mcpUseEligibilityKey) as UseEligibility<unknown>
        const missing = refOf('wiki', 'held-none')
        expect(tenantCodec.encode(outsider.tenant).ok).toBe(true)

        let timeout = 1000
        const adoptionVerdicts = await run(mcpAdoptionViewConformance<unknown, unknown>(), {
          port: adoption,
          scope: null,
          reader,
          adopted: docs,
          notAdopted: missing,
          outsider: { access: outsider, missing },
          change: async () => {
            timeout += 1000
            await setTimeoutOf(tree, 'docs', timeout)
          },
        })
        const eligibilityVerdicts = await run(mcpUseEligibilityConformance<unknown>(), {
          port: eligibility,
          eligible: { access: reader, endpoint: docs },
          ineligible: { access: outsider, existing: docs, missing },
          blocked: { access: reader, endpoint: off, reason: 'disabled' },
          revoke: async () => {
            const removed = await tree.clients.assets['remove-asset']({
              tenant: reader.tenant,
              operation: 'docs-removed',
              holding: docs.holding,
            })
            expect(removed).toMatchObject({ outcome: 'succeeded' })
          },
        })
        expect({ adoption: adoptionVerdicts, eligibility: eligibilityVerdicts }).toEqual({
          adoption: {
            'AV1 answers an adopted endpoint by its reference': 'passed',
            'AV2 lists the endpoints adopted in the scope only': 'passed',
            'AV3 answers not-adopted for an endpoint not adopted': 'passed',
            'AV4 answers an outsider the same for an adopted and a missing endpoint': 'passed',
            'AV5 gives a new revision when a setting value changes': 'passed',
            'AV6 answers unknown, not not-adopted, when it cannot read':
              'not applicable: unreadable',
          },
          eligibility: {
            'UE1 answers granted to an eligible principal': 'passed',
            'UE2 answers an ineligible principal the same for an existing and a missing endpoint':
              'passed',
            'UE3 gives a blocked reason to an eligible principal': 'passed',
            'UE4 decides again at the next use after a revocation': 'passed',
            'UE5 answers unknown instead of a refusal when it cannot decide':
              'not applicable: unreadable question',
          },
        })
      },
    )
    expect(exit).toBe(0)
  },
)
