import { useSyncExternalStore } from 'react'
import { AppTooltipProvider, RedrawProvider } from '@omne-harness/ui-kit'
import type { ViewAsked } from '../../shared/view.ts'
import { useSlot, useWatched } from './hooks.ts'
import { Item } from './item.tsx'
import type { ShellState } from './state.ts'

/** Only the page the request names, filling the window: no sidebar, no floats, no figure, no desk. */
export function ViewPage(props: Readonly<{ state: ShellState; view: ViewAsked }>) {
  const { state, view } = props
  const login = useSyncExternalStore(state.login.subscribe, state.login.state)
  const scope = useWatched(state.scope)
  const page = useSlot(state.slots, 'pages').find(item => item.id === view.page)
  return (
    <RedrawProvider value={state.redraw.draw}>
      <AppTooltipProvider>
        <main className="shell-view">
          {login === 'signed-in' && page !== undefined ? (
            <section className="shell-page" aria-label={page.title} data-page={page.id}>
              <Item scope={scope} render={() =>
                  page.render(view.subject === undefined ? { scope } : { scope, subject: view.subject })
                } />
            </section>
          ) : null}
        </main>
      </AppTooltipProvider>
    </RedrawProvider>
  )
}
