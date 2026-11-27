import { inputSourceName, type InputSourceDeclaration } from '@omne-harness/session-contract'

/** The sources by which a goal puts an input into a session: three into its own, one into the session that examines for it. The names are in the log. */
export const GOAL_SOURCES = Object.freeze({
  start: inputSourceName('goal.start'),
  resume: inputSourceName('goal.resume'),
  continue: inputSourceName('goal.continue'),
  examine: inputSourceName('goal.examine'),
})
export type GoalSource = keyof typeof GOAL_SOURCES

const LABELS: Readonly<Record<GoalSource, string>> = {
  start: 'Goal set',
  resume: 'Goal resumed',
  continue: 'Goal not met yet',
  examine: 'Goal examination',
}

/** The declarations to register with Session: each accepts the system component of goals and wakes the session. */
export function goalInputSources(component: string): readonly InputSourceDeclaration[] {
  return (Object.keys(GOAL_SOURCES) as GoalSource[]).map(key => ({
    name: GOAL_SOURCES[key],
    label: LABELS[key],
    accepts: { subject: 'system', component, screened: false },
    wake: 'always',
  }))
}
