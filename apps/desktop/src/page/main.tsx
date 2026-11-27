import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { ShellLogin } from '@omne-harness/shell-contract'
import { colorSchemeQuery, createSizeController, createThemeController } from '@omne-harness/ui-kit'
import type { ForwardingBridge } from '../shared/channel.ts'
import { PAGE_VERSION_EVENT } from '../shared/page-version.ts'
import { missingAtForwarding } from '../shared/wire.ts'
import { assembly, pageFloor } from './assembly.tsx'
import { connectPageBridge, httpChannel } from './bridge.ts'
import { watchConnectivity } from './connectivity.ts'
import { keepBootTokens } from './shell/boot-tokens.ts'
import { storedFacePreference } from './shell/face.ts'
import { adoptChanges, tokenOf, tokensOf } from './shell/changes-sheet.ts'
import { shellPlugin } from './shell/service.ts'
import { storedFloatPlaces } from './shell/float-place.ts'
import { hostFigure } from './shell/desk/device.ts'
import { Shell } from './shell/shell.tsx'
import { createVisualManager, desktopVisualSource } from './shell/visual.ts'
import { tellPageVersion } from './shell/page-version.ts'
import { LOGIN_EXPIRED_TEXT, createShellState } from './shell/state.ts'
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
  const visual = createVisualManager({ host: window, nativeSource: desktopVisualSource })
  const size = createSizeController({
    read: () => visual.getSnapshot().effective.size,
    write: tier => visual.actions.setSize(tier),
  })
  const bridge = await connectPageBridge(httpChannel(window.location.origin))
  const watched = watchConnectivity(bridge.transport)
  let gate: (text: string) => void = () => undefined
  const state = createShellState(shellLogin(bridge), {
    notices: show => {
      gate = show
      return bridge.onExpired(() => show(LOGIN_EXPIRED_TEXT))
    },
    knowsToken: tokenOf(document),
    tokens: tokensOf(document),
    faces: storedFacePreference(() => window.localStorage),
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
  const theme = createThemeController({
    read: () => visual.getSnapshot().effective.theme,
    write: choice => visual.actions.setTheme(choice),
    system: colorSchemeQuery(),
  })
  theme.start()
  visual.subscribe(() => {
    const { effective } = visual.getSnapshot()
    theme.adopt(effective.theme)
    size.adopt(effective.size)
  })
  visual.connect()
  const missing = missingAtForwarding(assembly.protocols, bridge.forwardingProtocols()).map(
    key => `${key.name}/v${key.major}`,
  )
  const figureDevice = hostFigure()
  createRoot(element).render(
    <StrictMode>
      <Shell
        appName="omne"
        state={state}
        connectivity={watched}
        theme={{
          current: () => visual.getSnapshot().effective.theme,
          select: choice => theme.select(choice),
          subscribe: visual.subscribe,
        }}
        size={size}
        floats={storedFloatPlaces(() => window.localStorage)}
        figureDevice={figureDevice}
        missingAtForwarding={missing}
      />
    </StrictMode>,
  )
  const tellVersion = (): void =>
    void tellPageVersion({
      signedIn: () => bridge.loginState.state() === 'signed-in',
      gate: text => gate(text),
      told: state.told,
    })
  window.addEventListener(PAGE_VERSION_EVENT, tellVersion)
  tellVersion()
}

void main()
