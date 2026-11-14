import { expect, it } from 'vitest'
import type {
  CompatibilityHint,
  InspectRejectionCode,
  SettingCategory,
  SkillFailure,
  UnsupportedWhat,
} from '@omne-harness/skill-contract'
import { INSPECT_REJECTIONS } from '../src/failures.ts'
import { COMPATIBILITY_HINTS } from '../src/hints.ts'
import type {
  ReadVerdict,
  SnapshotDefect,
  SourceFailure,
} from '@omne-harness/skill-contract/provider'

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

const rejections = INSPECT_REJECTIONS
const failures = [
  'not-available-to-you',
  'unavailable-stand-in',
  'bad-path',
  'outside-package',
  'resource-missing',
  'basis-unavailable',
  'adopted-material-changed',
  'version-changed',
  'source-unavailable',
  'unsupported',
  'aborted',
  'unknown',
] as const
const unsupported = ['no-readable-package'] as const
const categories = ['preference', 'binding', 'placement-identity', 'governance'] as const
const sourceFailures = [
  'package-not-found',
  'entry-not-found',
  'bytes-mismatch',
  'outside-package',
  'unavailable',
  'entry-unreadable',
] as const
const verdicts = ['granted', 'refused', 'unknown'] as const
const defects = ['invalid-root-name', 'duplicate-path', 'prefix-conflict'] as const
const hints = COMPATIBILITY_HINTS

const typed: readonly true[] = [
  true satisfies Same<(typeof rejections)[number], InspectRejectionCode>,
  true satisfies Same<(typeof failures)[number], SkillFailure['kind']>,
  true satisfies Same<(typeof unsupported)[number], UnsupportedWhat>,
  true satisfies Same<(typeof categories)[number], SettingCategory>,
  true satisfies Same<(typeof sourceFailures)[number], SourceFailure>,
  true satisfies Same<(typeof verdicts)[number], ReadVerdict['kind']>,
  true satisfies Same<(typeof defects)[number], SnapshotDefect['kind']>,
  true satisfies Same<(typeof hints)[number], CompatibilityHint>,
]

it.each([
  ['set-inspect-rejections', rejections],
  ['set-skill-failures', failures],
  ['set-unsupported', unsupported],
  ['set-setting-categories', categories],
  ['set-source-failures', sourceFailures],
  ['set-read-verdicts', verdicts],
  ['set-snapshot-defects', defects],
  ['set-compatibility-hints', hints],
])('SPEC.md lists %s exactly as the type has it', (_id, list) => {
  expect(typed).toHaveLength(8)
  expect(new Set(list).size).toBe(list.length)
})
