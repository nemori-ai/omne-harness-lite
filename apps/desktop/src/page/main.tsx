import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { ShellLogin } from '@omne-harness/shell-contract'
import { colorSchemeQuery, createSizeController, createThemeController } from '@omne-harness/ui-kit'
import type { ForwardingBridge } from '../shared/channel.ts'
import { missingAtForwarding } from '../shared/wire.ts'
import { assembly, pageFloor } from './assembly.tsx'
import { connectPageBridge, httpChannel } from './bridge.ts'
import { watchConnectivity } from './connectivity.ts'
import { keepBootTokens } from './shell/boot-tokens.ts'
import { adoptChanges, tokenOf, tokensOf } from './shell/changes-sheet.ts'
import { shellPlugin } from './shell/service.ts'
import { storedFloatPlaces } from './shell/float-place.ts'
import { Shell } from './shell/shell.tsx'
import { storedSizePreference } from './shell/size.ts'
import { LOGIN_EXPIRED_TEXT, createShellState } from './shell/state.ts'
import { storedThemePreference } from './shell/theme.ts'
import { markWindowChrome } from './shell/window-chrome.ts'
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
  markWindowChrome(document.documentElement, navigator.userAgent)
  const size = createSizeController(storedSizePreference(() => window.localStorage))
  const bridge = await connectPageBridge(httpChannel(window.location.origin))
  const watched = watchConnectivity(bridge.transport)
  const state = createShellState(shellLogin(bridge), {
    notices: show => bridge.onExpired(() => show(LOGIN_EXPIRED_TEXT)),
    knowsToken: tokenOf(document),
    tokens: tokensOf(document),
  })
  const tree = await startClientTree({
    transport: watched.transport,
    login: bridge.loginState,
    protocols: assembly.protocols,
  })
  await tree.install(shellPlugin(state))
  adoptChanges(document, state.sheet)
  keepBootTokens({
    store: () => window.localStorage,
    root: document.documentElement,
    app: state.appTokens,
    login: bridge.loginState,
    outcomes: pageFloor.outcomes,
  })
  for (const module of assembly.modules) await tree.install(module)
  const preference = storedThemePreference(() => window.localStorage)
  const theme = createThemeController({ ...preference, system: colorSchemeQuery() })
  theme.start()
  const missing = missingAtForwarding(assembly.protocols, bridge.forwardingProtocols()).map(
    key => `${key.name}/v${key.major}`,
  )
  createRoot(element).render(
    <StrictMode>
      <Shell
        appName="omne"
        state={state}
        connectivity={watched}
        theme={{ initial: preference.read(), select: choice => theme.select(choice) }}
        size={size}
        floats={storedFloatPlaces(() => window.localStorage)}
        missingAtForwarding={missing}
      />
    </StrictMode>,
  )
}

void main()
