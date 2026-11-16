import { execFileSync } from 'node:child_process'
import { repositoryEnv } from './core/git-environment.ts'
import type { Violation } from './core/rule.ts'

export const COMMIT_ATTRIBUTION_RULE = 'commit-attribution'

export interface CommitRecord {
  readonly sha: string
  readonly authorName: string
  readonly authorEmail: string
  readonly committerName: string
  readonly committerEmail: string
  readonly trailers: string
  readonly message: string
}

const FIELD = '\u001f'
const RECORD = '\u001e'
const LOG_FORMAT =
  ['%H', '%an', '%ae', '%cn', '%ce', '%(trailers:only,unfold)', '%B'].join('%x1f') + '%x1e'

export interface Trailer {
  readonly key: string
  readonly value: string
}

export function parseTrailers(block: string): Trailer[] {
  return block.split('\n').flatMap(line => {
    const matched = /^([A-Za-z0-9-]+)\s*:\s*(.*?)\s*$/u.exec(line)
    return matched === null ? [] : [{ key: matched[1] ?? '', value: matched[2] ?? '' }]
  })
}

export function parseCommitLog(raw: string): CommitRecord[] {
  const commits: CommitRecord[] = []
  for (const block of raw.split(RECORD)) {
    const trimmed = block.replace(/^\s+/u, '')
    if (trimmed === '') continue
    const [sha, authorName, authorEmail, committerName, committerEmail, trailers, ...rest] =
      trimmed.split(FIELD)
    if (
      sha === undefined ||
      authorName === undefined ||
      authorEmail === undefined ||
      committerName === undefined ||
      committerEmail === undefined ||
      trailers === undefined
    )
      throw new Error(`认不出的 git log 记录：${trimmed.slice(0, 80)}`)
    commits.push({
      sha,
      authorName,
      authorEmail,
      committerName,
      committerEmail,
      trailers,
      message: rest.join(FIELD),
    })
  }
  return commits
}

const AGENT =
  /(?<![a-z])(claude|anthropic|codex|openai|chatgpt|copilot|cursor|kimi|moonshot|deepseek|gemini|devin|aider|windsurf)(?![a-z])/iu

const CO_AUTHOR = /^\s*co-authored-by\s*:/iu
const GENERATED = /generated\s+(with|by)\b/iu

export function attributionViolations(commits: readonly CommitRecord[]): Violation[] {
  const violations: Violation[] = []
  for (const commit of commits) {
    const path = `commit ${commit.sha.slice(0, 9)}`
    const report = (line: number, message: string) =>
      violations.push({ rule: COMMIT_ATTRIBUTION_RULE, path, line, message })
    for (const [role, name, email] of [
      ['author', commit.authorName, commit.authorEmail],
      ['committer', commit.committerName, commit.committerEmail],
    ] as const)
      if (AGENT.test(name) || AGENT.test(email))
        report(0, `${role} 是 ${name} <${email}>：提交只记在实际负责的人名下`)
    for (const [index, line] of commit.message.split('\n').entries()) {
      if (CO_AUTHOR.test(line) && AGENT.test(line))
        report(index + 1, `把 agent 列为共同作者：${line.trim()}`)
      else if (GENERATED.test(line) && AGENT.test(line))
        report(index + 1, `把 agent 列为产出者：${line.trim()}`)
    }
  }
  return violations
}

export function readCommits(root: string, revision = 'HEAD'): CommitRecord[] {
  return parseCommitLog(
    execFileSync('git', ['log', `--format=${LOG_FORMAT}`, revision], {
      env: repositoryEnv(process.env),
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  )
}
