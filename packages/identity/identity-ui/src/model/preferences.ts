import type { IdentityProtocol } from '@omne-harness/identity-protocol'
import type { ClientOf } from '@omne-harness/sdk/core'

/** The preferences of the account signed in; each failure says in words what was not done. */
export type AccountPreferences = Readonly<{
  read(
    name: string,
  ): Promise<
    | Readonly<{ kind: 'read'; value: string | null; revision: string }>
    | Readonly<{ kind: 'failed'; why: string }>
  >
  write(
    name: string,
    value: string,
    expected: string,
  ): Promise<
    | Readonly<{ kind: 'written'; revision: string }>
    | Readonly<{ kind: 'conflict'; revision: string }>
    | Readonly<{ kind: 'failed'; why: string }>
  >
}>

const why = (outcome: string): string => `账号偏好没有读写成（${outcome}）`

export function accountPreferences(client: ClientOf<IdentityProtocol>): AccountPreferences {
  return {
    async read(name) {
      const answer = await client['read-account-preference']({ name }).catch(() => undefined)
      if (answer?.outcome !== 'succeeded')
        return { kind: 'failed', why: why(answer?.outcome ?? 'unavailable') }
      return { kind: 'read', value: answer.body.value, revision: answer.body.revision }
    },
    async write(name, value, expected) {
      const answer = await client['write-account-preference']({ name, value, expected }).catch(
        () => undefined,
      )
      if (answer?.outcome === 'succeeded')
        return { kind: 'written', revision: answer.body.revision }
      if (answer?.outcome === 'conflict')
        return { kind: 'conflict', revision: answer.body.revision }
      return { kind: 'failed', why: why(answer?.outcome ?? 'unavailable') }
    },
  }
}
