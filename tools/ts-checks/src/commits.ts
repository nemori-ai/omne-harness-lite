// 提交信息的两条规则。
// 署名：作者与提交者只能是人，提交信息里不得有把 agent 列为作者或共同作者的行。
// 来源 trailer（`Harness:`、`Agent-Role:`）记的是「怎么产生的」，不表示作者身份，不在禁止之列。规则正文在根 AGENTS.md「署名与分支」。
// 删卡 trailer：`Accepted-Card:`、`Voided-Card:` 的值是一个合乎写法的卡号。规则正文在
// `.meta_harness/design/product/conventions.md`「卡的一生」；它们点到的卡是否真在那次提交里删掉，归 `product/retire.ts`。
import { execFileSync } from 'node:child_process'
import { CARD_ID } from './product/stories.ts'
import type { Violation } from './rule.ts'

export const COMMIT_ATTRIBUTION_RULE = 'commit-attribution'
export const CARD_TRAILER_RULE = 'card-trailer'

export interface CommitRecord {
  readonly sha: string
  readonly authorName: string
  readonly authorEmail: string
  readonly committerName: string
  readonly committerEmail: string
  /** git 认出来的 trailer 块（`%(trailers:only,unfold)`）：一行一条 `Key: value`，没有就是空串。 */
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

/** trailer 块逐行拆成键与值；键按 git 的习惯不分大小写，这里原样保留。 */
export function parseTrailers(block: string): Trailer[] {
  return block.split('\n').flatMap(line => {
    const matched = /^([A-Za-z0-9-]+)\s*:\s*(.*?)\s*$/u.exec(line)
    return matched === null ? [] : [{ key: matched[1] ?? '', value: matched[2] ?? '' }]
  })
}

export const CARD_TRAILER_KEYS = ['Accepted-Card', 'Voided-Card', 'Migrated-Card'] as const
export type CardTrailerKey = (typeof CARD_TRAILER_KEYS)[number]

/** 一个提交上的删卡 trailer：键规范成 `Accepted-Card`／`Voided-Card`，值原样（不一定合乎写法）。 */
export function cardTrailers(record: Pick<CommitRecord, 'trailers'>): {
  readonly key: CardTrailerKey
  readonly value: string
}[] {
  return parseTrailers(record.trailers).flatMap(({ key, value }) => {
    const known = CARD_TRAILER_KEYS.find(name => name.toLowerCase() === key.toLowerCase())
    return known === undefined ? [] : [{ key: known, value }]
  })
}

/** 纯函数：删卡 trailer 的值不是一个合乎写法的卡号即违反（一张卡一条，不许一条里写几张）。 */
export function cardTrailerViolations(commits: readonly CommitRecord[]): Violation[] {
  return commits.flatMap(commit =>
    cardTrailers(commit)
      .filter(trailer => !CARD_ID.test(trailer.value))
      .map(trailer => ({
        rule: CARD_TRAILER_RULE,
        path: `commit ${commit.sha.slice(0, 9)}`,
        line: 0,
        message: `${trailer.key} 的值「${trailer.value}」不是卡号：写成 ST-<三位>-<两位>，一张卡一条`,
      })),
  )
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

/** coding agent 及其厂商的名字；出现在作者、提交者或作者式署名行里即判违反。 */
const AGENT =
  /(?<![a-z])(claude|anthropic|codex|openai|chatgpt|copilot|cursor|kimi|moonshot|deepseek|gemini|devin|aider|windsurf)(?![a-z])/iu

const CO_AUTHOR = /^\s*co-authored-by\s*:/iu
const GENERATED = /generated\s+(with|by)\b/iu

/** 纯函数：给一批提交，列出作者式署名。`path` 写成 `commit <短号>`，`line` 是提交信息里的行号。 */
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

/** `revision` 可达的全部提交；浅克隆时只有克隆下来的那些。 */
export function readCommits(root: string, revision = 'HEAD'): CommitRecord[] {
  return parseCommitLog(
    execFileSync('git', ['log', `--format=${LOG_FORMAT}`, revision], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  )
}
