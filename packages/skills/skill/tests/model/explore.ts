import type { ByteRange, SkillMaterialBasis } from '@omne-harness/skill-contract'
import {
  ACCESS,
  basisOf,
  CAPABILITY,
  CONTROL_PATH,
  GUIDE_PATH,
  locatorOf,
  NEW_PATH,
  scope,
  type MaterialIndex,
  type Name,
  type Principal,
  type Run,
  type Schedule,
  type WorldSpec,
} from './world.ts'

export type Part = 'body' | 'guide' | 'new' | 'control' | 'bad'
export type BasisRef = Readonly<{ name: Name; index: MaterialIndex }>

export type Request =
  | Readonly<{ op: 'describe'; name: Name; basis?: BasisRef }>
  | Readonly<{ op: 'read'; name: Name; part: Part; basis?: BasisRef; range?: ByteRange }>
  | Readonly<{ op: 'list'; name: Name; basis?: BasisRef }>
  | Readonly<{ op: 'export'; name: Name; basis: BasisRef }>
  | Readonly<{ op: 'summaries'; names?: readonly Name[] }>
  | Readonly<{ op: 'search'; text: string }>
  | Readonly<{ op: 'inspect'; name: Name }>

export type AccessRequest = Extract<Request, { op: 'describe' | 'read' | 'list' | 'export' }>

export type Observation = Readonly<{ outcome: unknown }> | Readonly<{ thrown: string }>

export const PART_PATH: Readonly<Record<Exclude<Part, 'body'>, string>> = {
  guide: GUIDE_PATH,
  new: NEW_PATH,
  control: CONTROL_PATH,
  bad: '../escape',
}

function basisOption(ref: BasisRef | undefined): Readonly<{ basis?: SkillMaterialBasis }> {
  return ref === undefined ? {} : { basis: basisOf(ref.name, ref.index) }
}

async function operate(run: Run, who: Principal, request: Request): Promise<unknown> {
  const access = ACCESS[who]
  const { signal } = run
  switch (request.op) {
    case 'describe':
      return run.access.describe(
        access,
        scope,
        CAPABILITY[request.name],
        basisOption(request.basis),
      )
    case 'read':
      return run.access.read(
        access,
        scope,
        {
          capability: CAPABILITY[request.name],
          part:
            request.part === 'body'
              ? { kind: 'body' }
              : { kind: 'resource', path: PART_PATH[request.part] },
        },
        {
          ...basisOption(request.basis),
          ...(request.range === undefined ? {} : { range: request.range }),
          signal,
        },
      )
    case 'list':
      return run.access.list(access, scope, CAPABILITY[request.name], {
        ...basisOption(request.basis),
        signal,
      })
    case 'export':
      return run.access.export(
        access,
        scope,
        CAPABILITY[request.name],
        basisOf(request.basis.name, request.basis.index),
        { signal },
      )
    case 'summaries':
      return run.catalog.summaries(
        access,
        scope,
        request.names?.map(name => CAPABILITY[name]),
      )
    case 'search':
      return run.catalog.search(access, scope, { text: request.text })
    case 'inspect':
      return run.inspection.inspect(locatorOf(request.name))
    default: {
      const exhaustive: never = request
      return exhaustive
    }
  }
}

export async function perform(run: Run, who: Principal, request: Request): Promise<Observation> {
  try {
    return { outcome: await operate(run, who, request) }
  } catch (error) {
    return { thrown: error instanceof Error ? error.name : 'non-error' }
  }
}

export type Violation = Readonly<{
  world: WorldSpec | string
  schedule?: Schedule
  who?: Principal
  request: Request | string
  detail: string
}>

export type Report = Readonly<{
  property: string
  cases: number
  violations: readonly Violation[]
  ms: number
}>

export class Ledger {
  cases = 0
  readonly violations: Violation[] = []
  readonly property: string
  readonly #started = performance.now()
  readonly #limit: number
  constructor(property: string, limit = 20) {
    this.property = property
    this.#limit = limit
  }
  count(): void {
    this.cases += 1
  }
  break(violation: Violation): void {
    if (this.violations.length < this.#limit) this.violations.push(violation)
  }
  report(): Report {
    return {
      property: this.property,
      cases: this.cases,
      violations: this.violations,
      ms: Math.round(performance.now() - this.#started),
    }
  }
}

export function failureOf(observation: Observation): unknown {
  if (!('outcome' in observation)) return undefined
  const { outcome } = observation
  return typeof outcome === 'object' && outcome !== null && Object.hasOwn(outcome, 'failure')
    ? Reflect.get(outcome, 'failure')
    : undefined
}

export function failureKind(observation: Observation): string | undefined {
  const failure = failureOf(observation)
  if (typeof failure === 'string') return failure
  if (typeof failure === 'object' && failure !== null) {
    const kind = Reflect.get(failure, 'kind')
    return typeof kind === 'string' ? kind : undefined
  }
  return undefined
}

export function okOf(observation: Observation): unknown {
  if (!('outcome' in observation)) return undefined
  const { outcome } = observation
  return typeof outcome === 'object' && outcome !== null && Object.hasOwn(outcome, 'ok')
    ? Reflect.get(outcome, 'ok')
    : undefined
}

export function onlyFailure(observation: Observation): boolean {
  if (!('outcome' in observation)) return false
  const { outcome } = observation
  return (
    typeof outcome === 'object' && outcome !== null && Object.keys(outcome).join() === 'failure'
  )
}

export function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]]
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map(rest => [
      item,
      ...rest,
    ]),
  )
}

export function accessRequests(
  names: readonly Name[],
  bases: readonly (BasisRef | undefined)[],
  parts: readonly Part[],
): AccessRequest[] {
  const requests: AccessRequest[] = []
  for (const name of names)
    for (const basis of bases) {
      const withBasis = basis === undefined ? {} : { basis }
      requests.push({ op: 'describe', name, ...withBasis })
      for (const part of parts) requests.push({ op: 'read', name, part, ...withBasis })
      requests.push({ op: 'list', name, ...withBasis })
      if (basis !== undefined) requests.push({ op: 'export', name, basis })
    }
  return requests
}

export function settle(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve))
}
