import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  attributionViolations,
  readCommits,
  type CommitRecord,
} from '@omne-harness/repo-toolchain/commits'
import { afterEach, describe, expect, it } from 'vitest'
import { applyAttributionBaseline, readAttributionBaseline } from '../src/attribution-baseline.ts'

const LISTED = 'a'.repeat(40)
const OTHER = 'b'.repeat(40)
const baseline = {
  decision: 'https://example.invalid/decision',
  commits: [{ sha: LISTED, reason: 'shared history' }],
}
function commit(sha: string, message: string, authorName = 'Person'): CommitRecord {
  return {
    sha,
    authorName,
    authorEmail: 'person@example.invalid',
    committerName: 'Person',
    committerEmail: 'person@example.invalid',
    trailers: '',
    message,
  }
}
const coAuthor = 'docs: x\n\nCo-authored-by: Cursor <cursoragent@cursor.com>\n'

describe('提交署名的历史审计基线', () => {
  it('只跳过列出的确切提交里的共同作者行', () => {
    const commits = [commit(LISTED, coAuthor), commit(OTHER, coAuthor)]
    const left = applyAttributionBaseline(attributionViolations(commits), commits, baseline)
    expect(left.map(v => v.path)).toEqual([`commit ${OTHER.slice(0, 9)}`])
  })
  it('列出的提交若作者是 agent，仍然报告', () => {
    const commits = [commit(LISTED, 'docs: x\n', 'Claude')]
    const left = applyAttributionBaseline(attributionViolations(commits), commits, baseline)
    expect(left).toHaveLength(1)
    expect(left[0]?.message).toContain('author')
  })
  it('列出的提交若有“产出者”行，仍然报告', () => {
    const commits = [commit(LISTED, 'docs: x\n\nGenerated with Claude Code\n')]
    expect(
      applyAttributionBaseline(attributionViolations(commits), commits, baseline),
    ).toHaveLength(1)
  })
})

describe('基线文件', () => {
  let dir: string | undefined
  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true })
    dir = undefined
  })
  const write = (body: unknown) => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'omne-attribution-baseline-')))
    const path = join(dir, 'baseline.json')
    writeFileSync(path, JSON.stringify(body))
    return path
  }
  it.each([
    [
      '短提交号',
      { rule: 'commit-attribution', decision: 'https://x', commits: [{ sha: 'abc', reason: 'r' }] },
    ],
    [
      '空理由',
      {
        rule: 'commit-attribution',
        decision: 'https://x',
        commits: [{ sha: LISTED, reason: ' ' }],
      },
    ],
    ['别的规则', { rule: 'other', decision: 'https://x', commits: [] }],
    ['没有决定链接', { rule: 'commit-attribution', commits: [] }],
    [
      '重复提交',
      {
        rule: 'commit-attribution',
        decision: 'https://x',
        commits: [
          { sha: LISTED, reason: 'r' },
          { sha: LISTED, reason: 'r' },
        ],
      },
    ],
  ])('%s：拒绝，不当作空基线', (_, body) => {
    expect(() => readAttributionBaseline(write(body))).toThrow()
  })
})

describe('本仓库', () => {
  it('当前可达的全部历史在审计基线之外没有作者式署名', () => {
    const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
    const commits = readCommits(root)
    expect(commits.length).toBeGreaterThan(0)
    const recorded = readAttributionBaseline(
      fileURLToPath(new URL('../commit-attribution-baseline.json', import.meta.url)),
    )
    expect(applyAttributionBaseline(attributionViolations(commits), commits, recorded)).toEqual([])
  })
})
