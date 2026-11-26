import { Component, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { inkLookChanged, RedrawProvider, type Redraw, type RedrawKind } from '@omne-harness/ui-kit'
import { dropBootTokens } from '../surface/boot-tokens.ts'
import type { LookHost, Wear } from '../surface/look-host.ts'

/** Wearing a projection on this page: its own sheet after the page's, the boot tokens off the root, the ink told. */
export function wearOn(page: Document): Wear {
  let sheet: CSSStyleSheet | undefined
  return {
    adopt(css) {
      const own = sheet ?? new CSSStyleSheet()
      own.replaceSync(css)
      if (sheet === undefined) page.adoptedStyleSheets = [...page.adoptedStyleSheets, own]
      sheet = own
    },
    drop: () => dropBootTokens(page.documentElement),
    inked: () => inkLookChanged(),
  }
}

const POINTS: Readonly<Record<RedrawKind, string>> = { icon: 'shell.icon', piece: 'shell.piece' }

type FallbackProps = Readonly<{
  fallback: () => ReactNode
  failed: (error: unknown) => void
  children: ReactNode
}>

class Fallback extends Component<FallbackProps, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override componentDidCatch(error: unknown): void {
    this.props.failed(error)
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback() : this.props.children
  }
}

function Put(props: { put: () => ReactNode }): ReactNode {
  return props.put()
}

const marks = new WeakMap<object, number>()
let minted = 0

function markOf(drawing: object): number {
  const held = marks.get(drawing)
  if (held !== undefined) return held
  minted += 1
  marks.set(drawing, minted)
  return minted
}

function redrawFrom(host: LookHost, scope: string | undefined): Redraw {
  return (kind, key, subject, builtIn) => {
    const point = POINTS[kind]
    const drawing = host.drawingAt(point, key)
    if (drawing === undefined) return builtIn()
    return (
      <Fallback
        key={markOf(drawing)}
        fallback={builtIn}
        failed={error => host.threw(point, key, error)}
      >
        <Put put={() => drawing({ scope, subject, generic: builtIn }) as ReactNode} />
      </Fallback>
    )
  }
}

/** The kit draws by the drawings the host wears; each worn projection redraws what is drawn. */
export function LookRedraw({
  host,
  children,
}: Readonly<{ host: LookHost; children: ReactNode }>): React.JSX.Element {
  const worn = useSyncExternalStore(host.subscribe, host.held)
  const redraw = useMemo(() => redrawFrom(host, worn?.scope), [host, worn])
  return <RedrawProvider value={redraw}>{children}</RedrawProvider>
}
