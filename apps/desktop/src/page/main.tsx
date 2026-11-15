import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { domainProtocols } from '../shared/protocols.ts'
import { assemble } from './assembly.tsx'
import { connectPageBridge } from './bridge.ts'
import { watchConnectivity } from './connectivity.ts'
import { Shell } from './shell/shell.tsx'
import { startClientTree } from './tree.ts'

async function main(): Promise<void> {
  const element = document.getElementById('root')
  if (element === null) return
  const bridge = await connectPageBridge({ origin: window.location.origin })
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
