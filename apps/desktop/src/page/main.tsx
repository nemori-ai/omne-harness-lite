import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { ShellLogin } from '@omne-harness/shell-contract'
import { colorSchemeQuery, createThemeController } from '@omne-harness/ui-kit'
import type { HostBridge, OmneHost } from '../shared/host-bridge.ts'
import { assembly } from './assembly.tsx'
import { connectPageBridge, httpHostChannel, ipcHostChannel } from './bridge.ts'
import { watchConnectivity } from './connectivity.ts'
import { shellPlugin } from './shell/service.ts'
import { Shell } from './shell/shell.tsx'
import { createShellState } from './shell/state.ts'
import { storedThemePreference } from './shell/theme.ts'
import { startClientTree } from './tree.ts'
import './styles.css'

declare global {
  interface Window {
    omneHost?: OmneHost
  }
}

const hostChannel = () =>
  window.omneHost === undefined
    ? httpHostChannel(window.location.origin)
    : ipcHostChannel(window.omneHost)

const shellLogin = (bridge: HostBridge): ShellLogin => ({
  state: bridge.loginState.state,
  subscribe: bridge.loginState.subscribe,
  login: bridge.login,
  logout: bridge.logout,
})

async function main(): Promise<void> {
  const element = document.getElementById('root')
  if (element === null) return
  const bridge = await connectPageBridge(hostChannel())
  const watched = watchConnectivity(bridge.transport)
  const state = createShellState(shellLogin(bridge))
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
  createRoot(element).render(
    <StrictMode>
      <Shell
        appName="omne"
        state={state}
        connectivity={watched}
        theme={{ initial, select: choice => theme.select(choice) }}
      />
    </StrictMode>,
  )
}

void main()
