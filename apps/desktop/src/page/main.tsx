import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { ShellLogin } from '@omne-harness/shell-contract'
import { colorSchemeQuery, createSizeController, createThemeController } from '@omne-harness/ui-kit'
import type { ForwardingBridge } from '../shared/channel.ts'
import { missingAtForwarding } from '../shared/wire.ts'
import { assembly } from './assembly.tsx'
import { connectPageBridge, httpChannel } from './bridge.ts'
import { watchConnectivity } from './connectivity.ts'
import { shellPlugin } from './shell/service.ts'
import { Shell } from './shell/shell.tsx'
import { bindSizeKeys, storedSizePreference } from './shell/size.ts'
import { LOGIN_EXPIRED_TEXT, createShellState } from './shell/state.ts'
import { storedThemePreference } from './shell/theme.ts'
import { startClientTree } from './tree.ts'
import './styles.css'

const shellLogin = (bridge: ForwardingBridge): ShellLogin => ({
  state: bridge.loginState.state,
  subscribe: bridge.loginState.subscribe,
  login: bridge.login,
  logout: bridge.logout,
})

async function main(): Promise<void> {
  const element = document.getElementById('root')
  if (element === null) return
  const size = createSizeController(storedSizePreference(() => window.localStorage))
  bindSizeKeys(window, size, /Mac/.test(navigator.platform) ? 'mac' : 'other')
  const bridge = await connectPageBridge(httpChannel(window.location.origin))
  const watched = watchConnectivity(bridge.transport)
  const state = createShellState(shellLogin(bridge), {
    notices: show => bridge.onExpired(() => show(LOGIN_EXPIRED_TEXT)),
  })
  const tree = await startClientTree({
    transport: watched.transport,
    login: bridge.loginState,
    protocols: assembly.protocols,
  })
  await tree.install(shellPlugin(state))
  for (const module of assembly.modules) await tree.install(module)
  const theme = createThemeController({
    ...storedThemePreference(() => window.localStorage),
    system: colorSchemeQuery(),
  })
  const initial = theme.start()
  const missing = missingAtForwarding(assembly.protocols, bridge.forwardingProtocols()).map(
    key => `${key.name}/v${key.major}`,
  )
  createRoot(element).render(
    <StrictMode>
      <Shell
        appName="omne"
        state={state}
        connectivity={watched}
        theme={{ initial, select: choice => theme.select(choice) }}
        missingAtForwarding={missing}
      />
    </StrictMode>,
  )
}

void main()
