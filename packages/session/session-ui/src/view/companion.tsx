import type { FloatProps, PartDrawer } from '@omne-harness/shell-contract'
import { Button, InkMotes } from '@omne-harness/ui-kit'
import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react'
import type { BackgroundCallsStore } from '../model/background-calls.ts'
import { companionFacts, type CompanionFacts } from '../model/companion.ts'
import type { SayTarget } from '../model/say.ts'
import type { SessionDriver } from '../model/session-driver.ts'
import type { SessionWorkspaces } from '../model/session-workspaces.ts'
import {
  sessionCompanion,
  sessionCompanionFigure,
  type CompanionDrawing,
  type CompanionFigureDrawing,
  type CompanionPort,
} from '../parts.ts'
import { useInBackground } from './figure-report.tsx'
import { useSession } from './use-session.ts'

export const COMPANION = 'companion'
export const COMPANION_LABEL = '对 Agent 说一句话'

export type CompanionProps = Readonly<{
  workspaces: SessionWorkspaces
  background: BackgroundCallsStore
  shell: PartDrawer
  float: FloatProps
  onShow: () => void
}>

/** The way to say a word to the agent from any page: drawn only while there is a tenant to speak as. */
export function Companion({ workspaces, float, ...rest }: CompanionProps) {
  const handle = useSession(workspaces, float.scope)
  if (handle.kind !== 'ready' || float.scope === undefined) return null
  return <Held driver={handle.driver} tenant={float.scope} float={float} {...rest} />
}

type HeldProps = Omit<CompanionProps, 'workspaces'> &
  Readonly<{ driver: SessionDriver; tenant: string }>

function Held({ driver, tenant, background, shell, float, onShow }: HeldProps) {
  const held = useRef<CompanionFacts | null>(null)
  const facts = useSyncExternalStore(
    driver.subscribe,
    () => (held.current = companionFacts(driver.getState(), held.current)),
  )
  const running = useInBackground(background, tenant, facts.live)
  const doing = facts.doing === 'idle' && running ? 'background' : facts.doing
  const say = useCallback((to: SayTarget, words: string) => driver.say(to, words), [driver])
  const { sessions, current } = facts
  const port = useMemo<CompanionPort>(
    () => ({ sessions, current, say, show: onShow }),
    [sessions, current, say, onShow],
  )
  const { grip, corner, dragging, note } = float
  const given: CompanionDrawing = { ...port, doing, grip, corner, dragging, note }
  return sessionCompanion.draw(shell, () => <BuiltIn shell={shell} given={given} />, given)
}

/** What the companion looks like: the drawing put on its figure, or the ink motes it ships with. */
function Figure({
  shell,
  look,
}: {
  readonly shell: PartDrawer
  readonly look: CompanionFigureDrawing
}) {
  const { doing, unfolded, dragging } = look
  return sessionCompanionFigure.draw(
    shell,
    () => <InkMotes doing={doing} listening={unfolded} carried={dragging} />,
    look,
  )
}

/** The companion as it ships: its figure is a button that opens and closes the shell's say note beside it. */
function BuiltIn({
  shell,
  given,
}: {
  readonly shell: PartDrawer
  readonly given: CompanionDrawing
}) {
  const { doing, grip, dragging, note } = given
  return (
    <div className="omne-companion" {...sessionCompanion.props}>
      <Button
        variant="ghost"
        className="omne-companion-figure"
        {...sessionCompanionFigure.props}
        {...grip}
        aria-label={COMPANION_LABEL}
        aria-expanded={note.open}
        disabled={!note.there}
        onClick={event => note.toggle(event.currentTarget)}
      >
        <Figure shell={shell} look={{ doing, unfolded: note.open, dragging }} />
      </Button>
    </div>
  )
}
