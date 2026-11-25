import type { JsonValue } from '@omne-harness/json-text'
import {
  describeFacility,
  type FacilityDescriptor,
  type FacilityRequest,
  type FacilityResult,
} from '../facility.ts'

/** Set before the program starts. `computeMs` counts only the time the domain runs, not waiting. */
export type ProgramLimits = Readonly<{
  computeMs: number
  memoryBytes: number
  /** The return value as JSON text plus the console text, in UTF-8 bytes. */
  outputBytes: number
  calls: number
}>
export type ProgramLimitName = 'compute-time' | 'memory' | 'output' | 'calls'

/** `ordinal` starts at 1, follows the order in which the program made its calls, and is never reused. */
export type ProgramCall = Readonly<{ ordinal: number; entry: string; argument: JsonValue }>

export type ProgramAnswer =
  | Readonly<{ kind: 'value'; value: JsonValue }>
  | Readonly<{
      kind: 'failure'
      /** One of `failures` of the request: the program then sees an instance of that class. */
      name: string
      message: string
      properties: readonly Readonly<{ key: string; value: JsonValue }>[]
    }>

export type ProgramOutcome =
  | Readonly<{ kind: 'returned'; value?: JsonValue; console: string }>
  | Readonly<{
      kind: 'threw'
      name: string
      message: string
      line: number | null
      console: string
    }>
  | Readonly<{ kind: 'syntax'; message: string; line: number | null }>
  | Readonly<{ kind: 'exceeded'; limit: ProgramLimitName; console: string }>
  | Readonly<{ kind: 'aborted'; console: string }>
  | Readonly<{ kind: 'invalid-output'; path: string; console: string }>

export type ProgramRun = Readonly<{
  /** Settles after the domain is confirmed stopped. It says nothing about calls already handed out. */
  outcome: Promise<ProgramOutcome>
  answer(ordinal: number, answer: ProgramAnswer): 'delivered' | 'not-waiting'
  abort(): void
}>

export type ProgramRunRequest<P> = FacilityRequest<P> &
  Readonly<{
    source: string
    input: JsonValue
    /** `Name` is a function of the program, `Name.member` a method of the object `Name`. */
    entries: readonly string[]
    failures: readonly string[]
    limits: ProgramLimits
    onCall(call: ProgramCall): void
    onIdle(issued: number): void
  }>

export interface ProgramFacility<P> {
  run(request: ProgramRunRequest<P>): Promise<FacilityResult<ProgramRun>>
}

declare module '../facility.ts' {
  interface EnvironmentFacilities {
    program: ProgramFacility<unknown>
  }
}

export const programFacility: FacilityDescriptor<'program'> = describeFacility('program', {
  run: 'guarded',
})

const identifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/
const taken = new Set(
  (
    'tools input console globalThis undefined NaN Infinity arguments eval await async yield let static ' +
    'break case catch class const continue debugger default delete do else enum export extends false ' +
    'finally for function if implements import in instanceof interface new null package private ' +
    'protected public return super switch this throw true try typeof var void while with'
  ).split(' '),
)
const free = (name: string) => identifier.test(name) && !name.startsWith('__') && !taken.has(name)

export function isProgramEntry(name: string): boolean {
  const [root = '', member, ...more] = name.split('.')
  return more.length === 0 && free(root) && (member === undefined || identifier.test(member))
}

export function isProgramFailureName(name: string): boolean {
  return free(name)
}
