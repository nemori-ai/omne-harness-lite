// Steps 9 and 10: the entry of the pinned snapshot, then its bytes from the source, checked
// against the entry digest. Bytes that do not match are not given: `version-changed`.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  computeDigest,
  type Bytes,
  type PackageEntry,
  type ReadFailure,
} from '@omne-harness/skill-contract'
import { sourceFailureTo } from '../mapping.ts'
import type { SkillPorts } from '../ports.ts'
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

export type Verified = Readonly<{ entry: PackageEntry; bytes: Bytes }>

const ABORTED = Object.freeze({ kind: 'aborted' } as const)

export async function verifiedBytes<P, S>(
  ports: SkillPorts<P, S>,
  pinned: Pinned,
  path: string,
  signal?: AbortSignal,
): Promise<Outcome<Verified, ByteFailure>> {
  // Step 9: the entry must be in the pinned snapshot. No other package fills in for it.
  const entry = pinned.snapshot.entries.find(item => item.path === path)
  if (entry === undefined) return fail({ kind: 'resource-missing' })
  // Step 10: the bytes, from the source, checked against the entry digest.
  if (checkpoint(signal) !== undefined) return fail(ABORTED)
  const opened = await ports.source.open(pinned.locator, pinned.digest, entry.path)
  if (checkpoint(signal) !== undefined) return fail(ABORTED)
  if (!('ok' in opened))
    return fail(sourceFailureTo('access', opened.failure, pinned.gated.basis !== undefined))
  if (computeDigest(opened.ok) !== entry.digest) return fail({ kind: 'version-changed' })
  return succeed({ entry, bytes: opened.ok })
}
