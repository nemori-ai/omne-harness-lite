// 提交署名的历史审计基线：已在共享历史里、不能改写的提交，逐条列出完整 SHA 与决定。
// 只跳过这些确切提交里“把 agent 列为共同作者”的行；作者、提交者与其余提交照常检查。
import { readFileSync } from 'node:fs'
import { COMMIT_ATTRIBUTION_RULE, type CommitRecord } from '@omne-harness/repo-toolchain/commits'
import type { Violation } from '@omne-harness/repo-toolchain/core/rule'

export interface AttributionBaseline {
  readonly decision: string
  readonly commits: readonly { readonly sha: string; readonly reason: string }[]
}

const SHA = /^[0-9a-f]{40}$/u
const CO_AUTHOR_MESSAGE = '把 agent 列为共同作者'

/** 读并校验基线文件；格式不对就报错，不当作空基线。 */
export function readAttributionBaseline(path: string): AttributionBaseline {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  const fail = (why: string): never => {
    throw new Error(`${path}：${why}`)
  }
  if (typeof parsed !== 'object' || parsed === null) return fail('须为 JSON 对象')
  const body = parsed as Record<string, unknown>
  if (body['rule'] !== COMMIT_ATTRIBUTION_RULE) fail(`rule 须为 ${COMMIT_ATTRIBUTION_RULE}`)
  if (typeof body['decision'] !== 'string' || !body['decision'].startsWith('https://'))
    fail('decision 须为决定评论的链接')
  if (!Array.isArray(body['commits'])) return fail('commits 须为数组')
  const commits = body['commits'].map((entry: unknown, index) => {
    const item = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<
      string,
      unknown
    >
    const sha = item['sha']
    const reason = item['reason']
    if (typeof sha !== 'string' || !SHA.test(sha))
      fail(`commits[${index}].sha 须为完整的 40 位提交号`)
    if (typeof reason !== 'string' || reason.trim() === '')
      fail(`commits[${index}].reason 不能为空`)
    return { sha: sha as string, reason: reason as string }
  })
  if (new Set(commits.map(c => c.sha)).size !== commits.length) fail('commits 有重复')
  return { decision: body['decision'] as string, commits }
}

/** 去掉基线里确切提交的共同作者违规。违规按 `commit <短号>` 定位，用读到的完整提交号对回基线。 */
export function applyAttributionBaseline(
  violations: readonly Violation[],
  commits: readonly CommitRecord[],
  baseline: AttributionBaseline,
): Violation[] {
  const listed = new Set(baseline.commits.map(c => c.sha))
  const exempt = new Set(
    commits.filter(c => listed.has(c.sha)).map(c => `commit ${c.sha.slice(0, 9)}`),
  )
  return violations.filter(
    v =>
      !(
        v.rule === COMMIT_ATTRIBUTION_RULE &&
        exempt.has(v.path) &&
        v.message.startsWith(CO_AUTHOR_MESSAGE)
      ),
  )
}
