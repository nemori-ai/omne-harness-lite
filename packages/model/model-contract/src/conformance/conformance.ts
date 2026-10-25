// The conformance entry: runs every check against a subject and reports, for each obligation,
// whether the subject kept it. It reports; it does not throw for a violation.
import { admissionChecks } from './conformance-admission.ts'
import { boundedSubject } from './conformance-bounded.ts'
import { controlChecks } from './conformance-control.ts'
import { DEFAULT_CAPACITY, DEFAULT_CONSUMER, DEFAULT_REQUEST } from './conformance-defaults.ts'
import { within } from './conformance-kit.ts'
import { observationChecks } from './conformance-observation.ts'
import { routeChecks } from './conformance-routes.ts'
import { settlementChecks } from './conformance-settlement.ts'
import { transportChecks } from './conformance-transport.ts'
import {
  ConformanceFailure,
  ConformanceSkip,
  type Check,
  type ConformanceOptions,
  type ConformanceReport,
  type ConformanceSubject,
  type ObligationResult,
  type Requirement,
  type Scene,
} from './conformance-types.ts'

const DEFAULT_WAIT_MS = 1000

function checksOf<P>(): readonly Check<P>[] {
  return [
    ...admissionChecks<P>(),
    ...settlementChecks<P>(),
    ...controlChecks<P>(),
    ...observationChecks<P>(),
    ...routeChecks<P>(),
    ...transportChecks<P>(),
  ]
}

/** The requirements that the subject does not meet, by name. */
function unmet<P>(subject: ConformanceSubject<P>, requires: readonly Requirement[]): string[] {
  return requires.filter(
    name => (name === 'transport' ? subject.transport : subject.hooks?.[name]) === undefined,
  )
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

function verdictOf(error: unknown): Pick<ObligationResult, 'status' | 'detail'> {
  if (error instanceof ConformanceSkip) return { status: 'not-applicable', detail: error.message }
  if (error instanceof ConformanceFailure) return { status: 'fail', detail: error.message }
  return { status: 'fail', detail: `the subject threw ${describe(error)}` }
}

type Built<P> = Readonly<{ subject: ConformanceSubject<P> }> | Readonly<{ detail: string }>

/** Builds the subject for one check. A factory that throws or hangs fails that check only. */
async function build<P>(options: ConformanceOptions<P>, waitMs: number): Promise<Built<P>> {
  try {
    const subject = await within(waitMs, (async () => options.subject())(), 'the subject factory')
    return { subject }
  } catch (error) {
    const detail =
      error instanceof ConformanceFailure
        ? error.message
        : `the subject factory threw ${describe(error)}`
    return { detail }
  }
}

/** Releases the subject. The reason it could not be released, or null when it was. */
async function release<P>(subject: ConformanceSubject<P>, waitMs: number): Promise<string | null> {
  try {
    await within(waitMs, (async () => subject.dispose?.())(), 'the dispose of the subject')
    return null
  } catch (error) {
    return error instanceof ConformanceFailure
      ? error.message
      : `the dispose of the subject threw ${describe(error)}`
  }
}

/** A release that failed fails the check; a failure the check found stays beside it. */
function withReleaseFailure(result: ObligationResult, reason: string): ObligationResult {
  return {
    ...result,
    status: 'fail',
    detail: result.status === 'fail' ? `${result.detail}; also ${reason}` : reason,
  }
}

async function runBody<P>(
  subject: ConformanceSubject<P>,
  check: Check<P>,
  waitMs: number,
): Promise<ObligationResult> {
  const absent = unmet(subject, check.requires)
  if (absent.length > 0) {
    return {
      obligation: check.name,
      status: 'not-applicable',
      detail: `the subject gives no ${absent.join(', ')}`,
    }
  }
  const scene: Scene<P> = {
    subject: boundedSubject(subject, waitMs),
    request: subject.request ?? DEFAULT_REQUEST,
    consumer: subject.consumer ?? DEFAULT_CONSUMER,
    capacity: subject.capacity ?? DEFAULT_CAPACITY,
    waitMs,
  }
  try {
    await check.run(scene)
    return { obligation: check.name, status: 'pass', detail: '' }
  } catch (error) {
    return { obligation: check.name, ...verdictOf(error) }
  }
}

async function runCheck<P>(
  options: ConformanceOptions<P>,
  check: Check<P>,
  waitMs: number,
): Promise<ObligationResult> {
  const built = await build(options, waitMs)
  if ('detail' in built) return { obligation: check.name, status: 'fail', detail: built.detail }
  const result = await runBody(built.subject, check, waitMs)
  const failed = await release(built.subject, waitMs)
  return failed === null ? result : withReleaseFailure(result, failed)
}

/**
 * Checks a provider, and optionally a transport, against the obligations of the Model contract
 * that can be seen through the public face. A check that needs a hook or a transport that the
 * subject does not give is reported as not applicable, as are the three read checks when the
 * provider gives the whole result as one page. A failure of the subject, including a thrown error
 * or a wait past `waitMs`, is reported as a failure of that check with its reason.
 */
export async function checkModelProviderConformance<P>(
  options: ConformanceOptions<P>,
): Promise<ConformanceReport> {
  const waitMs = options.waitMs ?? DEFAULT_WAIT_MS
  if (!Number.isSafeInteger(waitMs) || waitMs < 1)
    throw new RangeError('waitMs must be a positive integer number of milliseconds')
  const results: ObligationResult[] = []
  for (const check of checksOf<P>()) results.push(await runCheck(options, check, waitMs))
  return { ok: results.every(result => result.status !== 'fail'), results }
}
