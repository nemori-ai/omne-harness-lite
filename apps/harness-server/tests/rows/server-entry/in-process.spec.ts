// @module-tag slow
// Starts the release tree: an operation done in process is the operation a client calls, for the login it names.
import type { AccessCallsService } from '@omne-harness/access-cordis-contract/cordis'
import { describe, expect, it } from 'vitest'
import { accessIdentityOfCall } from '../../../src/rows/server-entry/identity.ts'
import { settledSession } from '../../governance/tenant-settings-support.ts'
import { savedLoginProof, savedTenant } from '../../r9/support.ts'
import { otherTenant } from '../../self-extension/support.ts'
import { tenantOf } from '../../support/protocol-clients.ts'
import { onReleaseTree, toolCallsThenText } from '../../support/release-tree.ts'

const SESSION = { name: 'session', major: 1 } as const

describe('an operation of the session protocol done in process, on the release tree', () => {
  it(
    "selects the model for the person who sent it; the same id again is recalled; another tenant's login gets the answer of a session that is not there; a login that cannot be resumed is denied",
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      const exit = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        const session = await settledSession(tree, 'hello')
        const calls = tree.scope.get('accessCalls') as AccessCallsService | undefined
        if (calls === undefined) throw new Error('the entry gives no in-process calls')
        const identity = accessIdentityOfCall(tree.scope)
        const loginTextOf = async (proof: string): Promise<string> => {
          const found = await identity.identifyLogin(proof)
          if (found.outcome !== 'identified') throw new Error(found.outcome)
          return (found.login as unknown as { loginText: string }).loginText
        }
        const tenantText = savedTenant(tree.home)
        const alice = { login: await loginTextOf(savedLoginProof(tree.home)), tenant: tenantText }
        const listed = await tree.cli(['list-models'])
        const routes = [...listed.stdout.matchAll(/"route":"([^"]+)"/gu)].map(found => found[1]!)
        const read = await tree.cli(['read-model-selection', '--session', session])
        const current = /"model":"([^"]+)"/u.exec(read.stdout)?.[1]
        const route = routes.find(each => each !== current)!
        const select = (who: typeof alice, target: string, id: string) =>
          calls.call({
            protocol: SESSION,
            operation: 'select-model',
            body: { tenant: tenantOf(who.tenant), session: target, controlId: id, model: route },
            id,
            ...who,
          })

        expect(await select(alice, session, 'c-1')).toEqual({
          kind: 'answered',
          outcome: 'succeeded',
          body: expect.objectContaining({ controlId: 'c-1', model: route }),
        })
        const standing = async () =>
          /"model":"([^"]+)"/u.exec(
            (await tree.cli(['read-model-selection', '--session', session])).stdout,
          )?.[1]
        expect(await standing()).toBe(route)
        const back = await calls.call({
          protocol: SESSION,
          operation: 'select-model',
          body: { tenant: tenantOf(tenantText), session, controlId: 'c-back', model: current },
          id: 'c-back',
          ...alice,
        })
        expect(back).toMatchObject({ outcome: 'succeeded' })
        expect(await select(alice, session, 'c-1')).toMatchObject({ outcome: 'succeeded' })
        expect(await standing()).toBe(current)

        const frank = await otherTenant(tree)
        const frankTenant = savedTenant(frank.home)
        const bob = {
          login: await loginTextOf(savedLoginProof(frank.home)),
          tenant: frankTenant,
        }
        const foreign = await select(bob, session, 'c-2')
        const absent = await select(bob, 'f'.repeat(64), 'c-3')
        expect(foreign.kind).toBe('answered')
        expect(foreign).toEqual(absent)
        expect(await select({ ...alice, login: 'not-a-login' }, session, 'c-4')).toEqual({
          kind: 'answered',
          outcome: 'denied',
          body: undefined,
        })
        expect(
          await calls.call({
            protocol: SESSION,
            operation: 'select-model',
            body: { tenant: tenantOf(tenantText), session, controlId: 'c-5' },
            id: 'c-5',
            ...alice,
          }),
        ).toMatchObject({ outcome: 'protocol-rejected' })
      })
      expect(exit).toBe(0)
    },
  )
})
