import type { JsonValue } from '@omne-harness/json-text'
import { accessProtocol, guestContractOfTree } from '@omne-harness/public-contract'
import { createClient, type Transport } from '@omne-harness/sdk/core'
import type { CookieLogin } from './login-cookie.ts'

type Targets = ReadonlySet<string>
type TargetOf = (key: Readonly<{ name: string; major: number }>, name: string) => string

export type TenantProtocols = Readonly<{
  has(login: CookieLogin, target: string): Promise<boolean>
  forget(login: CookieLogin): void
  frame(frame: JsonValue, first: boolean): void
}>

const scopedOf = (frame: JsonValue): string | undefined => {
  if (frame.kind !== 'object') return undefined
  const told = frame.entries.find(entry => entry.key === 'scoped')?.value
  return told?.kind === 'number' ? told.lexeme : undefined
}

/** What the server answers a login of the targets of its tenant's protocols: kept by proof until the availability tells they changed. */
export function tenantProtocols(
  transportFor: (login: CookieLogin) => Transport,
  targetOf: TargetOf,
): TenantProtocols {
  const kept = new Map<string, Promise<Targets | undefined>>()
  let told: string | undefined

  async function read(login: CookieLogin): Promise<Targets | undefined> {
    const answer = await createClient(accessProtocol, transportFor(login))
      .scoped({})
      .catch(() => undefined)
    if (answer?.outcome !== 'succeeded') return undefined
    return new Set(
      answer.body.protocols.flatMap(({ contract }) => {
        const made = guestContractOfTree(contract)
        if (!('ok' in made)) return []
        const { operations, ...key } = made.ok.contract
        return Object.keys(operations).map(name => targetOf(key, name))
      }),
    )
  }

  return {
    async has(login, target) {
      const before = kept.get(login.proof)
      if ((await before)?.has(target) === true) return true
      const now = kept.get(login.proof)
      if (now !== before) return (await now)?.has(target) === true
      const fresh = read(login)
      kept.set(login.proof, fresh)
      return (await fresh)?.has(target) === true
    },
    forget(login) {
      kept.delete(login.proof)
    },
    frame(frame, first) {
      const count = scopedOf(frame)
      if (count === undefined || (!first && count === told)) return
      told = count
      kept.clear()
    },
  }
}
