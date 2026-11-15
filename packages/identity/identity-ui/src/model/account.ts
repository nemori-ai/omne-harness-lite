import type { IdentityProtocol } from '@omne-harness/identity-protocol'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { ClientOf } from '@omne-harness/sdk/core'
import type { ShellLoginState } from '@omne-harness/shell-contract'

export type AccountState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'reading' }
  | { readonly kind: 'read'; readonly tenant: string; readonly short: string }
  | { readonly kind: 'failed'; readonly text: string }

export type TenantQuery = Pick<ClientOf<IdentityProtocol>, 'query-current-tenant'>

export type AccountPorts = Readonly<{
  query: TenantQuery
  login: {
    state(): ShellLoginState
    subscribe(listener: (state: ShellLoginState) => void): () => void
  }
  scope: { set(scope: string | undefined): void }
}>

export interface AccountModel {
  current(): AccountState
  subscribe(listener: () => void): () => void
  retry(): void
  dispose(): void
}

const IDLE: AccountState = { kind: 'idle' }
const READING: AccountState = { kind: 'reading' }

export const FAILED_TEXT = {
  denied: '登录可能已经失效，正在确认……',
  uncertain: '没有收到可信的答复，读不到当前租户。',
  unavailable: '读不到当前租户：服务暂时不可用。',
} as const

export function tenantText(tenant: TenantId): string {
  const text = tenantCodec.encode(tenant)
  if (!text.ok) throw new TypeError('a tenant decoded from an answer did not encode')
  return text.value
}

const shorten = (text: string): string =>
  text.length <= 14 ? text : `${text.slice(0, 8)}…${text.slice(-4)}`

function failedText(outcome: string): string {
  if (outcome === 'denied') return FAILED_TEXT.denied
  if (outcome === 'uncertain') return FAILED_TEXT.uncertain
  return FAILED_TEXT.unavailable
}

export function createAccountModel(ports: AccountPorts): AccountModel {
  let state: AccountState = IDLE
  let generation = 0
  let disposed = false
  const listeners = new Set<() => void>()
  const enter = (next: AccountState): void => {
    state = next
    for (const listener of Array.from(listeners)) listener()
  }

  async function read(): Promise<void> {
    const mine = ++generation
    enter(READING)
    const answer = await ports.query['query-current-tenant']({})
    if (disposed || mine !== generation) return
    if (answer.outcome !== 'succeeded')
      return enter({ kind: 'failed', text: failedText(answer.outcome) })
    const tenant = tenantText(answer.body.tenantId)
    ports.scope.set(tenant)
    enter({ kind: 'read', tenant, short: shorten(answer.body.tenantId.organization.text) })
  }

  function follow(login: ShellLoginState): void {
    if (login !== 'signed-in') {
      generation += 1
      if (state !== IDLE) enter(IDLE)
      return
    }
    if (state === IDLE) void read()
  }

  const stop = ports.login.subscribe(follow)
  follow(ports.login.state())

  return {
    current: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    retry() {
      if (!disposed && state.kind === 'failed') void read()
    },
    dispose() {
      disposed = true
      stop()
    },
  }
}
