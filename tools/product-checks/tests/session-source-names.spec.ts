import { describe, expect, it } from 'vitest'
import type { SourceFile } from '@omne-harness/repo-toolchain'
import { RULES, sessionCoreNoSourceNames } from '../src/rules/index.ts'

const file = (path: string, text: string): SourceFile => ({ path, text })

const declared = file(
  'packages/session/session-access/src/member-source.ts',
  "export const MEMBER = { name: inputSourceName('session.member'), label: 'Member' }",
)
const probe = file(
  'apps/harness-server/tests/support/probe.ts',
  "const TASK = inputSourceName('probe.task')",
)
const check = (...files: SourceFile[]) =>
  sessionCoreNoSourceNames.check([declared, probe, ...files]).map(v => `${v.path}:${v.line}`)

describe('session-core-no-source-names (SE-30)', () => {
  it('is in the standing rule set', () => {
    expect(RULES).toContain(sessionCoreNoSourceNames)
  })

  it.each(['session-contract', 'session', 'session-cordis'])(
    'refuses a declared source name written in %s',
    member => {
      const path = `packages/session/${member}/src/decide.ts`
      const text = ['const a = 1', "if (source === 'session.member') return true"].join('\n')
      expect(check(file(path, text))).toEqual([`${path}:2`])
    },
  )

  it('refuses it under a path relative to the scanned root, as the scan gives paths', () => {
    const path = 'session/session-contract/src/decide.ts'
    expect(check(file(path, "export const WRITTEN_BACK = 'session.member'"))).toEqual([`${path}:1`])
    expect(check(file('notsession/session/src/x.ts', "const a = 'session.member'"))).toEqual([])
  })

  it('refuses a name declared by a test-side contributor too, and a template without holes', () => {
    const path = 'packages/session/session-contract/src/judgments.ts'
    expect(check(file(path, "const a = 'probe.task'\nconst b = `session.member`"))).toEqual([
      `${path}:1`,
      `${path}:2`,
    ])
  })

  it('refuses a core member that builds a source name itself', () => {
    const path = 'packages/session/session/src/command.ts'
    expect(check(file(path, "\n\nconst own = inputSourceName('session.fresh')"))).toEqual([
      `${path}:3`,
    ])
  })

  it('leaves a contributor, a test, a testing double and an undeclared text alone', () => {
    expect(
      check(
        file('packages/session/session-adapters/src/cordis/x.ts', "const a = 'session.member'"),
        file('packages/session/session-contract/tests/x.spec.ts', "const a = 'session.member'"),
        file(
          'packages/session/session-contract/src/testing-sources.ts',
          "inputSourceName('test.person')",
        ),
        file('packages/session/session-contract/src/decide.ts', "const kind = 'intake.routed'"),
        file('packages/session/session-cordis/src/provider.ts', "const key = 'session.modes'"),
      ),
    ).toEqual([])
  })

  it('says what to do', () => {
    const path = 'packages/session/session-contract/src/decide.ts'
    const [violation] = sessionCoreNoSourceNames.check([declared, file(path, "'session.member'")])
    expect(violation?.message).toMatch(/来源/u)
    expect(violation?.rule).toBe('session-core-no-source-names')
  })
})
