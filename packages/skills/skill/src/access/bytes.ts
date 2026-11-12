// Step 10: the bytes of one entry of the pinned snapshot from the source, checked against the
// entry digest. Bytes that do not match are not given: `version-changed`. The entry comes from
// the caller, which did step 9 (the lookup) itself.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  computeDigest,
  type Bytes,
  type PackageEntry,
  type ReadFailure,
} from '@omne-harness/skill-contract'
import { sourceFailureTo } from '../mapping.ts'
import type { SkillPorts } from '../ports.ts'
import { isBytes, sourceAnswer } from '../source-answer.ts'
import { checkpoint } from './checkpoint.ts'
import type { Pinned } from './pin.ts'

export type ByteFailure = Extract<
  ReadFailure,
  {
    kind:
      | 'resource-missing'
      | 'version-changed'
      | 'basis-unavailable'
      | 'source-unavailable'
      | 'outside-package'
      | 'aborted'
  }
>

const ABORTED = Object.freeze({ kind: 'aborted' } as const)
const VERSION_CHANGED = Object.freeze({ kind: 'version-changed' } as const)

export async function verifiedBytes<P, S>(
  ports: SkillPorts<P, S>,
  pinned: Pinned,
  entry: PackageEntry,
  signal?: AbortSignal,
): Promise<Outcome<Bytes, ByteFailure>> {
  if (checkpoint(signal) === 'aborted') return fail(ABORTED)
  const opened = await sourceAnswer(
    () => ports.source.open(pinned.locator, pinned.basis.digest, entry.path),
    isBytes,
  )
  if (checkpoint(signal) === 'aborted') return fail(ABORTED)
  if (!('ok' in opened)) return fail(sourceFailureTo('open', opened.failure, pinned.byBasis))
  if (computeDigest(opened.ok) !== entry.digest) return fail(VERSION_CHANGED)
  return succeed(opened.ok)
}
