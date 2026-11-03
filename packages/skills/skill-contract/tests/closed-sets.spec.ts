// The closed sets that SPEC.md lists as code are the same as the public types. Each list below is
// checked against its type by the compiler (`Same`), and against the SPEC text at run time.
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type {
  InspectRejectionCode,
  SettingCategory,
  SkillFailure,
  UnsupportedWhat,
} from '@omne-harness/skill-contract'
import type {
  ReadVerdict,
  SnapshotDefect,
  SourceFailure,
} from '@omne-harness/skill-contract/provider'

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

const rejections = [
  'manifest-missing',
  'name-mismatch',
  'declaration-format-unsupported',
  'outside-package',
  'tool-ref-invalid',
  'setting-category-unknown',
  'malformed',
] as const
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

const typed: readonly true[] = [
  true satisfies Same<(typeof rejections)[number], InspectRejectionCode>,
  true satisfies Same<(typeof failures)[number], SkillFailure['kind']>,
  true satisfies Same<(typeof unsupported)[number], UnsupportedWhat>,
  true satisfies Same<(typeof categories)[number], SettingCategory>,
  true satisfies Same<(typeof sourceFailures)[number], SourceFailure>,
  true satisfies Same<(typeof verdicts)[number], ReadVerdict['kind']>,
  true satisfies Same<(typeof defects)[number], SnapshotDefect['kind']>,
]

const spec = readFileSync(new URL('../SPEC.md', import.meta.url), 'utf8')

/** The lines of the first `text` code block after the anchor `id`. */
function listed(id: string): string[] {
  const anchor = spec.indexOf(`<a id="${id}"></a>`)
  if (anchor === -1) throw new Error(`SPEC.md has no anchor ${id}`)
  const block = /```text\n([\s\S]*?)\n```/.exec(spec.slice(anchor))
  if (block === null) throw new Error(`SPEC.md has no code list after ${id}`)
  return (block[1] ?? '').split('\n')
}

it.each([
  ['set-inspect-rejections', rejections],
  ['set-skill-failures', failures],
  ['set-unsupported', unsupported],
  ['set-setting-categories', categories],
  ['set-source-failures', sourceFailures],
  ['set-read-verdicts', verdicts],
  ['set-snapshot-defects', defects],
])('SPEC.md lists %s exactly as the type has it', (id, list) => {
  expect(typed).toHaveLength(7)
  expect(listed(id)).toEqual([...list])
})
