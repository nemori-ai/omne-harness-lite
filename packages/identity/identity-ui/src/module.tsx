import { useState } from 'react'
import type { Plugin } from '@deepseek-ai/cordis'
import { identityProtocol, type IdentityProtocol } from '@omne-harness/identity-protocol'
import type { ClientOf } from '@omne-harness/sdk/core'
import { needProtocol, serviceKey } from '@omne-harness/shell-contract'
import { defineUiModule, type ShellService } from '@omne-harness/shell-contract/cordis'
import type { AccountPorts } from './model/account.ts'
import { identityParts } from './parts.ts'
import { accountPreferences, type AccountPreferences } from './model/preferences.ts'
import { createLoginModel, type LoginPorts } from './model/login.ts'
import { AccountBlock, AccountRail } from './view/account-block.tsx'
import { LoginCard } from './view/login-card.tsx'

export const GATE_ID = 'identity.login'
export const accountPreferencesKey = serviceKey<AccountPreferences>('identity.account-preferences')
export const ACCOUNT_ID = 'identity.account'
export const ACCOUNT_ORDER = 1000

type IdentityClient = ClientOf<IdentityProtocol>

function Gate(props: { ports: LoginPorts }) {
  const [model] = useState(() => createLoginModel(props.ports))
  return <LoginCard model={model} />
}

function contribute(shell: ShellService, identity: IdentityClient): void {
  const login: LoginPorts = {
    register: identity,
    login: credentials => shell.login.login(credentials),
  }
  const account: AccountPorts = { query: identity, login: shell.login, scope: shell.scope }
  const logout = (): void => void shell.login.logout()
  shell.contribute('gate', { id: GATE_ID, render: () => <Gate ports={login} /> })
  shell.contribute('sidebar', {
    id: ACCOUNT_ID,
    order: ACCOUNT_ORDER,
    group: 'utility',
    render: () => <AccountBlock ports={account} logout={logout} />,
    rail: () => <AccountRail ports={account} logout={logout} />,
  })
}

export const identityUiModule: Plugin.Object = defineUiModule({
  name: 'identity-ui',
  needs: { identity: needProtocol<IdentityClient>(identityProtocol) },
  apply(shell, { identity }, provide) {
    for (const part of identityParts) part.declare(shell)
    contribute(shell, identity)
    provide(accountPreferencesKey, accountPreferences(identity))
  },
})
