import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { OmneHost } from '../shared/host-bridge.ts'
import { domainProtocols } from '../shared/protocols.ts'
import { assemble } from './assembly.tsx'
import { connectPageBridge, httpHostChannel, ipcHostChannel } from './bridge.ts'
import { watchConnectivity } from './connectivity.ts'
import { Shell } from './shell/shell.tsx'
import { startClientTree } from './tree.ts'

declare global {
  interface Window {
    omneHost?: OmneHost
  }
}

const hostChannel = () =>
  window.omneHost === undefined
    ? httpHostChannel(window.location.origin)
    : ipcHostChannel(window.omneHost)

async function main(): Promise<void> {
  const element = document.getElementById('root')
  if (element === null) return
  const bridge = await connectPageBridge(hostChannel())
  const watched = watchConnectivity(bridge.transport)
  const tree = await startClientTree({
    transport: watched.transport,
    login: bridge.loginState,
    protocols: domainProtocols,
  })
  const regions = assemble(bridge)
  createRoot(element).render(
    <StrictMode>
      <Shell
        appName="omne"
        bridge={bridge}
        tree={tree}
        connectivity={watched}
        gate={regions.gate}
        workspace={regions.workspace}
      />
    </StrictMode>,
  )
}

void main()
