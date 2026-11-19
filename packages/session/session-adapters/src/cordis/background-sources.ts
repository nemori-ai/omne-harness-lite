import type { Context } from '@deepseek-ai/cordis'
import {
  inputSourceName,
  type DerivedAdmission,
  type DerivedInputKind,
  type InputSourceDeclaration,
  type InputSources,
  type IntakeSubject,
  type SessionDerivedInputs,
} from '@omne-harness/session-contract'
import {
  SessionDerivedInputsService,
  sessionInputSourcesKey,
} from '@omne-harness/session-cordis-contract/cordis'

/** The component Session admits the inputs of its own background-call facts as. */
export const BACKGROUND_CALLS_COMPONENT = 'session-background-calls'

const SESSION: IntakeSubject = Object.freeze({
  kind: 'system',
  component: BACKGROUND_CALLS_COMPONENT,
})
const FROM_SESSION = Object.freeze({
  subject: 'system',
  component: BACKGROUND_CALLS_COMPONENT,
  screened: false,
})

/** The outcome of a tool call in the background. It wakes unless a person stopped that call. */
export const BACKGROUND_OUTCOME_SOURCE: InputSourceDeclaration = Object.freeze({
  name: inputSourceName('session.background-outcome'),
  label: 'Background call outcome',
  accepts: FROM_SESSION,
  wake: 'as-requested',
})

/** The reminder a person's stop of a call in the background leaves. It never wakes. */
export const BACKGROUND_STOP_SOURCE: InputSourceDeclaration = Object.freeze({
  name: inputSourceName('session.background-stop'),
  label: 'Background call stop',
  accepts: FROM_SESSION,
  wake: 'never',
})

const DECLARED: Readonly<Record<DerivedInputKind, InputSourceDeclaration>> = Object.freeze({
  'background-outcome': BACKGROUND_OUTCOME_SOURCE,
  'background-stop': BACKGROUND_STOP_SOURCE,
})

/** The admission of a derived input is the declaration registered now, or null while it is not. */
export function createBackgroundDerivedInputs(
  sources: () => InputSources | undefined,
): SessionDerivedInputs {
  return Object.freeze({
    admission(kind: DerivedInputKind): DerivedAdmission | null {
      const found = sources()?.lookup(DECLARED[kind].name)
      return found?.kind === 'registered'
        ? { declaration: found.declaration, subject: SESSION }
        : null
    },
  })
}

class BackgroundDerivedInputsProvider extends SessionDerivedInputsService {
  private readonly inputs: SessionDerivedInputs
  constructor(ctx: Context, inputs: SessionDerivedInputs) {
    super(ctx)
    this.inputs = inputs
  }
  admission(kind: DerivedInputKind): DerivedAdmission | null {
    return this.inputs.admission(kind)
  }
}

/** Registers the two background sources while the point is there, and provides their admissions. */
export function provideBackgroundSources(ctx: Context): void {
  new BackgroundDerivedInputsProvider(
    ctx,
    createBackgroundDerivedInputs(() => ctx.get(sessionInputSourcesKey)),
  )
  ctx.plugin({
    name: 'session-background-sources',
    inject: [sessionInputSourcesKey],
    apply(scope: Context) {
      scope.sessionInputSources.register(BACKGROUND_OUTCOME_SOURCE)
      scope.sessionInputSources.register(BACKGROUND_STOP_SOURCE)
    },
  })
}
