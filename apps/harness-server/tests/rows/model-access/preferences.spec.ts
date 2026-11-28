// @module-tag slow
import { describe, expect, it } from 'vitest'
import { settledSession } from '../../governance/tenant-settings-support.ts'
import { savedTenant } from '../../r9/support.ts'
import { otherTenant } from '../../self-extension/support.ts'
import { setModelSwitches } from '../../support/model-switches.ts'
import { tenantOf } from '../../support/protocol-clients.ts'
import {
  onReleaseTree,
  pollUntil,
  toolCallsThenText,
  type ReleaseTree,
} from '../../support/release-tree.ts'

type Listed = Readonly<{
  route: string
  selectable: boolean
  reasons: readonly string[]
  enabled?: boolean
  defaultReasoningEffort?: string
}>

async function listOf(cli: ReleaseTree['cli']): Promise<readonly Listed[]> {
  const printed = await pollUntil(
    'model/v1 to answer',
    async () => {
      const ran = await cli(['list-models'])
      return JSON.parse(ran.stdout || '{}') as { outcome?: string; body?: { models?: Listed[] } }
    },
    answer => answer.outcome !== undefined,
  )
  expect(printed.outcome).toBe('succeeded')
  return printed.body?.models ?? []
}

describe('a tenant chooses which models of the provider are on (C4, C5, C10)', () => {
  it(
    'starts with the release default, follows the tenant’s switches, and leaves another tenant as it was',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        await settledSession(tree, 'hello')
        const first = await listOf(tree.cli)
        expect(first.filter(model => model.selectable)).toHaveLength(25)
        // 18 chat models through OpenRouter start off, and the one OpenAI serves itself.
        const off = first.filter(model => model.enabled === false)
        expect(off).toHaveLength(19)
        expect(off.filter(model => model.route === 'gpt-6-luna')).toHaveLength(1)
        for (const model of off) expect([model.selectable, model.reasons]).toEqual([false, []])

        await setModelSwitches(tree, { 'moonshotai/kimi-k3': true, 'openai/gpt-6.1-sol': false })
        const after = await listOf(tree.cli)
        const of = (route: string) => after.find(model => model.route === route)
        expect(of('moonshotai/kimi-k3')).toMatchObject({ selectable: true, enabled: true })
        expect(of('openai/gpt-6.1-sol')).toMatchObject({ selectable: false, enabled: false })

        const other = await otherTenant(tree)
        const theirs = await listOf(other.cli)
        expect(theirs.find(model => model.route === 'moonshotai/kimi-k3')).toMatchObject({
          enabled: false,
        })
        expect(theirs.find(model => model.route === 'openai/gpt-6.1-sol')).toMatchObject({
          enabled: true,
        })
      })
      expect(exitCode).toBe(0)
    },
  )

  it(
    'a model turned off is not sent a request, and a session cannot select it',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        const session = await settledSession(tree, 'hello')
        await setModelSwitches(tree, { 'openai/gpt-6.1-sol': false, 'openai/gpt-6-sol': false })
        const tenant = tenantOf(savedTenant(tree.home))
        const refused = await tree.clients.session['select-model']({
          tenant,
          session,
          controlId: 'select-off',
          model: 'openai/gpt-6-sol',
        })
        expect(refused).toMatchObject({ outcome: 'invalid', body: { reason: 'excluded' } })
        const before = tree.modelAuthorizations().length
        await settledSession(tree, 'this one should not reach the model')
        expect(tree.modelAuthorizations().length).toBe(before)
      })
      expect(exitCode).toBe(0)
    },
  )
})
