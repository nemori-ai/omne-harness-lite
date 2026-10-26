import { describe, expect, it } from 'vitest'
import { BINDING_MARKERS, type TaskBinding } from '../src/delivery/binding.ts'
import type { GhCommand } from '../src/delivery/github-read.ts'
import { fileScope, issueScope, scopeOverlap } from '../src/delivery/scope-overlap.ts'
import { table } from './fixtures/lines.ts'

const card = (source: string, ...writeScope: string[]) => ({ source, writeScope })
function binding(number: number, writeScope: string[]): TaskBinding {
  return {
    schemaVersion: 1,
    issue: {
      repository: 'owner/repo',
      id: `I_${number}`,
      number,
      url: `https://github.com/owner/repo/issues/${number}`,
    },
    revision: 1,
    attempt: `${number}-r1-a1`,
    responsible: 'human',
    branch: `human/issue-${number}`,
    route: { kind: 'track', track: 'legacy-refactor' },
    completionTarget: 'track',
    taskBase: 'a'.repeat(40),
    writeScope,
    dispatch: `https://github.com/owner/repo/issues/${number}#issuecomment-1`,
    conditions: [],
    authorization: [],
  }
}
const body = (task: TaskBinding) =>
  `## 身份与责任\n\n- 交付修订：1\n\n## 当前执行与交接\n\n\`\`\`json ${BINDING_MARKERS[1]}\n${JSON.stringify(task)}\n\`\`\`\n`
/** A GitHub stand-in that answers one Issue read per number from `bodies`. */
function github(bodies: Record<number, string>, extra: object = {}): GhCommand {
  return argv => {
    const number = Number(argv.at(-1)?.split('/').at(-1))
    const text = bodies[number]
    if (argv[2] !== 'GET' || text === undefined)
      throw new Error(`unexpected call ${argv.join(' ')}`)
    return {
      number,
      node_id: `I_${number}`,
      html_url: `https://github.com/owner/repo/issues/${number}`,
      body: text,
      labels: [],
      milestone: null,
      ...extra,
    }
  }
}

describe('write scope overlap', () => {
  it('finds no conflict between disjoint scopes', () => {
    expect(
      scopeOverlap(
        [card('#1', 'tools/dev-flow'), card('#2', 'tools/dev', 'docs/README.md')],
        table(),
      ).conflicts,
    ).toEqual([])
  })

  it('reports equal paths and directory prefixes in both directions', () => {
    const result = scopeOverlap(
      [
        card('#1', 'tools/dev-flow', 'docs/a.md'),
        card('#2', 'tools/dev-flow/src/x.ts'),
        card('#3', 'docs/a.md', 'tools'),
      ],
      table(),
    )
    expect(result.conflicts).toEqual([
      {
        first: '#1',
        second: '#2',
        firstPath: 'tools/dev-flow',
        secondPath: 'tools/dev-flow/src/x.ts',
      },
      { first: '#1', second: '#3', firstPath: 'tools/dev-flow', secondPath: 'tools' },
      { first: '#1', second: '#3', firstPath: 'docs/a.md', secondPath: 'docs/a.md' },
      { first: '#2', second: '#3', firstPath: 'tools/dev-flow/src/x.ts', secondPath: 'tools' },
    ])
  })

  it('leaves task tmp and shared paths open to every card', () => {
    const result = scopeOverlap(
      [card('#1', 'tmp', 'pnpm-lock.yaml', 'a'), card('#2', 'tmp/issue-2', 'pnpm-lock.yaml', 'b')],
      table(),
    )
    expect(result.conflicts).toEqual([])
    expect(result.cards[0]).toEqual({
      source: '#1',
      counted: ['a'],
      open: ['tmp', 'pnpm-lock.yaml'],
    })
  })

  it('refuses a source given twice', () => {
    expect(() => scopeOverlap([card('#1', 'a'), card('#1', 'b')], table())).toThrow(
      'more than once',
    )
  })
})

describe('reading write scopes', () => {
  it('reads the binding of an Issue', () => {
    expect(issueScope('owner/repo', 7, github({ 7: body(binding(7, ['tools'])) }))).toEqual({
      source: '#7',
      writeScope: ['tools'],
    })
  })

  it('refuses an Issue without a binding and a pull request', () => {
    expect(() => issueScope('owner/repo', 7, github({ 7: 'no binding' }))).toThrow('has no binding')
    expect(() =>
      issueScope('owner/repo', 7, github({ 7: body(binding(7, ['a'])) }, { pull_request: {} })),
    ).toThrow('pull request')
  })

  it('reads a JSON binding file and a saved Issue body', () => {
    const task = binding(3, ['docs'])
    expect(fileScope('b.json', JSON.stringify(task)).writeScope).toEqual(['docs'])
    expect(fileScope('body.md', body(task)).writeScope).toEqual(['docs'])
  })

  it('refuses a file without exactly one binding and an invalid binding', () => {
    expect(() => fileScope('x.md', 'text')).toThrow('exactly one binding block')
    expect(() =>
      fileScope('x.json', JSON.stringify({ ...binding(3, ['a']), writeScope: ['../out'] })),
    ).toThrow('repository-relative')
  })
})
