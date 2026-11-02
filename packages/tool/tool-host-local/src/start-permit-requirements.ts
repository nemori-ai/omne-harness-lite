import type {
  DurableEvidence,
  FixedToolRequest,
  ToolStartRecord,
} from '@omne-harness/tool-contract'
import type { CallAccess } from '@omne-harness/tool-contract/provider'

export type StartPermitRequirement =
  | Readonly<{ kind: 'not-required'; source: DurableEvidence }>
  | Readonly<{ kind: 'required'; reason: string }>
  | Readonly<{ kind: 'unknown' | 'unavailable'; diagnostic: string }>

/** A trusted, current decision about the complete fixed action, not call access alone. */
export interface StartPermitRequirements<P> {
  check(
    input: CallAccess<P> &
      Readonly<{
        start: Extract<ToolStartRecord, { kind: 'start' }>
        request: FixedToolRequest
      }>,
  ): Promise<StartPermitRequirement>
}

export const REQUIRED_IN_WAVE2 = 'authorization-permit-required-in-wave2'
export const REQUIREMENTS_UNAVAILABLE = 'start-permit-requirements unavailable'

/** Treat malformed or unavailable provider answers as unknown, without exposing their contents. */
export async function checkStartPermitRequirement<P>(
  provider: StartPermitRequirements<P> | undefined,
  input: Parameters<StartPermitRequirements<P>['check']>[0],
): Promise<StartPermitRequirement> {
  try {
    const result: unknown = await provider?.check(input)
    if (typeof result === 'object' && result !== null) {
      const kind: unknown = Reflect.get(result, 'kind')
      if (kind === 'required' && filledText(Reflect.get(result, 'reason')))
        return { kind, reason: REQUIRED_IN_WAVE2 }
      if (kind === 'not-required') {
        const source = readRequirementSource(Reflect.get(result, 'source'))
        if (source !== null) return { kind, source }
      }
    }
  } catch {
    // The public diagnostic does not expose provider errors or request contents.
  }
  return { kind: 'unknown', diagnostic: REQUIREMENTS_UNAVAILABLE }
}

function filledText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

export function readRequirementSource(value: unknown): DurableEvidence | null {
  if (typeof value !== 'object' || value === null) return null
  const owner: unknown = Reflect.get(value, 'owner')
  const record: unknown = Reflect.get(value, 'record')
  const revision: unknown = Reflect.get(value, 'revision')
  const digest: unknown = Reflect.get(value, 'digest')
  return filledText(owner) && filledText(record) && filledText(revision) && filledText(digest)
    ? Object.freeze({ owner, record, revision, digest })
    : null
}
