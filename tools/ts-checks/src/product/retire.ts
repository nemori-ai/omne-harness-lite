// 删卡要有记录：一段提交范围里，每个让卡从 stories.md 消失的提交都要用 trailer 点到它——接受写
// `Accepted-Card: <卡号>`，作废写 `Voided-Card: <卡号>`，一张卡一条；trailer 点到的卡也必须真在那个提交里消失；
// 各 topic 的「已发到」只增不减。规矩正文在 `.meta_harness/design/product/conventions.md`「卡的一生」「卡号」。
// 做法与验收锁同类：看任务基线到 HEAD 之间的提交，每个提交与它的父提交比。
//
// 管不到的：以 squash 合入主线时，主线上那一条提交的说明由合并的人写，这里看不到——规矩要求合并说明里留着 trailer。
// 合并提交只对「每个父提交里都还在、合并之后不见了」的卡负责：只在一边被删的卡，删它的是那一边的提交。
import { InputError } from '../delivery/protocol.ts'
import {
  CUTOVERS_PATH,
  cutoversAt,
  verifySource,
  gitText,
  cardTexts,
  sha256,
  sourceProductRevision,
  type Cutovers,
} from './sources.ts'
import { cardTrailers, readCommits, type CardTrailerKey } from '../commits.ts'
import { git } from '../metrics/git.ts'
import { TOPIC_DIR } from './scenarios.ts'
import { CARD_ID, parseStories } from './stories.ts'

/** 一个版本里的一份 stories.md。 */
export interface Queue {
  readonly path: string
  readonly cards: readonly string[]
  readonly highWater: readonly string[]
}

/** 一个版本的产品区：topic 编号（`016`）→ 那份 stories.md。 */
export type Queues = ReadonlyMap<string, Queue>

export interface RetireCommit {
  readonly sha: string
  readonly subject: string
  readonly trailers: readonly { readonly key: CardTrailerKey; readonly value: string }[]
  /** 每个父提交的产品区；根提交没有。 */
  readonly parents: readonly Queues[]
  readonly result: Queues
  readonly migrated?: readonly string[]
}

export interface Retirement {
  readonly card: string
  readonly key: CardTrailerKey
}

const KEY_WORDS: Readonly<Record<CardTrailerKey, string>> = {
  'Accepted-Card': '接受',
  'Voided-Card': '作废',
  'Migrated-Card': '迁出',
}

const cardsOf = (queues: Queues) => new Set([...queues.values()].flatMap(queue => queue.cards))

/** 「已发到」的序号；没有、不止一行或不合写法时为 undefined（那由对账器报）。 */
function waterOf(queue: Queue | undefined): number | undefined {
  const [only, extra] = queue?.highWater ?? []
  if (only === undefined || extra !== undefined || !CARD_ID.test(only)) return undefined
  return Number(only.slice(7))
}

/** 父提交里每条可读的「已发到」，在这个提交里都还在、且不变小。 */
function highWaterProblems(parent: Queues, result: Queues): string[] {
  const problems: string[] = []
  for (const [topic, before] of parent) {
    const was = waterOf(before)
    if (was === undefined) continue
    const after = result.get(topic)
    const now = waterOf(after)
    const old = before.highWater[0] ?? ''
    if (after === undefined)
      problems.push(
        `${before.path} 被删掉了，「已发到」${old} 随之丢失：切过卡的 topic 要一直留着这份文件`,
      )
    else if (now === undefined)
      problems.push(`${after.path} 的「已发到」${old} 没了或认不出：它只增不减`)
    else if (now < was)
      problems.push(
        `${after.path} 的「已发到」从 ${old} 改小成了 ${after.highWater[0] ?? ''}：它只增不减`,
      )
  }
  return problems
}

/** 这个提交删掉的卡：每个父提交里都在、提交之后不在。 */
function goneCards(parents: readonly Queues[], after: ReadonlySet<string>): string[] {
  const [first, ...rest] = parents
  const before = new Set(first === undefined ? [] : cardsOf(first))
  for (const parent of rest) {
    const kept = cardsOf(parent)
    for (const card of before) if (!kept.has(card)) before.delete(card)
  }
  return [...before].filter(card => !after.has(card)).sort()
}

/** trailer 点到的卡；值不合写法、同一张卡点了两次的单列成问题。 */
function namedCards(trailers: RetireCommit['trailers']): {
  readonly named: Map<string, CardTrailerKey>
  readonly problems: string[]
} {
  const named = new Map<string, CardTrailerKey>()
  const problems: string[] = []
  for (const { key, value } of trailers) {
    if (!CARD_ID.test(value)) problems.push(`${key} 的值「${value}」不是卡号`)
    else if (named.has(value))
      problems.push(`${value} 被点了不止一次（${named.get(value) ?? ''} 与 ${key}）`)
    else named.set(value, key)
  }
  return { named, problems }
}

/** 纯函数：一个提交删了哪些卡、点了哪些卡，对不对得上；「已发到」有没有变小。 */
export function judgeRetire(commit: RetireCommit): {
  readonly retired: Retirement[]
  readonly violations: string[]
} {
  const after = cardsOf(commit.result)
  const gone = goneCards(commit.parents, after)
  const anyParent = new Set(commit.parents.flatMap(parent => [...cardsOf(parent)]))
  const { named, problems } = namedCards(commit.trailers)
  for (const card of gone)
    if (!named.has(card))
      problems.push(
        `${card} 从 stories.md 里删掉了，提交里没有 Accepted-Card 或 Voided-Card 点到它`,
      )
  for (const [card, key] of named) {
    if (gone.includes(card)) continue
    problems.push(
      after.has(card)
        ? `${key}: ${card}，可这张卡在这个提交之后还在 stories.md 里`
        : anyParent.has(card)
          ? `${key}: ${card}，可这张卡不是这个提交删掉的（只在一边的父提交里，由那一边删）`
          : `${key}: ${card}，可父提交的 stories.md 里就没有这张卡`,
    )
  }
  const migrated = commit.migrated ?? []
  for (const [card, key] of named)
    if (key === 'Migrated-Card' && !migrated.includes(card))
      problems.push(`${card} 没有本提交新增切换批次`)
  for (const card of migrated)
    if (named.get(card) !== 'Migrated-Card')
      problems.push(`${card} 新迁出批次缺少独立 Migrated-Card trailer`)
  for (const parent of commit.parents) problems.push(...highWaterProblems(parent, commit.result))

  const where = `提交 ${commit.sha.slice(0, 9)}（${commit.subject}）`
  return {
    retired: gone.flatMap(card => {
      const key = named.get(card)
      return key === undefined ? [] : [{ card, key }]
    }),
    violations: [...new Set(problems)].map(problem => `${where}：${problem}`),
  }
}

function lines(text: string): string[] {
  return text.split('\n').filter(line => line !== '')
}

/** 一个版本里产品区下每个 topic 的 stories.md。 */
export function queuesAt(root: string, revision: string, productRoot: string): Queues {
  const queues = new Map<string, Queue>()
  const prefix = `${productRoot.replace(/\/+$/u, '')}/`
  for (const path of lines(git(root, ['ls-tree', '-r', '--name-only', revision, '--', prefix]))) {
    const [dir, name, ...deeper] = path.slice(prefix.length).split('/')
    const topic = TOPIC_DIR.exec(dir ?? '')?.[1]
    if (topic === undefined || name !== 'stories.md' || deeper.length > 0) continue
    const parsed = parseStories(git(root, ['show', `${revision}:${path}`]))
    queues.set(topic, {
      path,
      cards: parsed.cards.map(card => card.id),
      highWater: parsed.highWater,
    })
  }
  return queues
}

export interface RetireReport {
  readonly unknowns: readonly string[]
  readonly base: string
  readonly mergeBase: string
  /** 范围里碰过 stories.md 或带删卡 trailer 的提交，新的在前。 */
  readonly commits: readonly {
    readonly sha: string
    readonly subject: string
    readonly retired: readonly Retirement[]
  }[]
  readonly violations: readonly string[]
}

/** 读 Git：任务基线到 HEAD 之间，删卡的提交带没带记录。 */
export function inspectRetire(root: string, base: string, productRoot: string): RetireReport {
  if (git(root, ['rev-parse', '--is-shallow-repository']) === 'true')
    throw new InputError('retire requires complete Git history')
  const mergeBase = git(root, ['merge-base', base, 'HEAD'])
  const stories = new RegExp(
    `^${productRoot.replace(/\/+$/u, '').replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&')}/PF-\\d{3}[^/]*/stories\\.md$`,
    'u',
  )
  const commits: RetireReport['commits'][number][] = []
  const unknowns = new Set<string>()
  const violations: string[] = []
  for (const record of readCommits(root, `${mergeBase}..HEAD`)) {
    const trailers = cardTrailers(record)
    // `-m` 让合并提交相对每个父提交各列一次改动。
    const touched = lines(
      git(root, [
        'diff-tree',
        '--no-commit-id',
        '--name-only',
        '--no-renames',
        '-r',
        '-m',
        record.sha,
      ]),
    ).some(path => stories.test(path) || path === CUTOVERS_PATH)
    if (!touched && trailers.length === 0) continue
    const parents = lines(git(root, ['rev-list', '--parents', '-n', '1', record.sha]))
      .join(' ')
      .split(' ')
      .slice(1)
    const subject = record.message.split('\n', 1)[0] ?? ''
    const currentCutovers = cutoversAt(root, record.sha)
    for (const topic of currentCutovers?.topics ?? [])
      for (const batch of topic.batches) {
        unknowns.add(`${topic.topic}/${batch.id} 采用权限与内容承接未核：${batch.adoption.source}`)
        for (const removal of batch.removals)
          unknowns.add(`${removal.card} 首次远端读回真实性未核：${removal.readback.source}`)
      }
    const parentCutovers = parents.map(parent => cutoversAt(root, parent))
    const migration = migrationProblems(
      root,
      record.sha,
      productRoot,
      parents,
      parentCutovers,
      currentCutovers,
    )
    violations.push(...migration.problems.map(p => `提交 ${record.sha.slice(0, 9)}：${p}`))
    const judged = judgeRetire({
      sha: record.sha,
      subject,
      trailers,
      parents: parents.map((parent, index) =>
        anchoredQueues(root, parent, productRoot, parentCutovers[index], violations),
      ),
      result: anchoredQueues(root, record.sha, productRoot, currentCutovers, violations),
      migrated: migration.added,
    })
    commits.push({ sha: record.sha, subject, retired: judged.retired })
    violations.push(...judged.violations)
  }
  return { base, mergeBase, commits, violations, unknowns: [...unknowns] }
}

export const RETIRE_BLIND_SPOT =
  '管不到：以 squash 合入主线时，主线上那一条提交的说明由合并的人写，这里看不到——规矩要求合并说明里留着这些 trailer。'

export function renderRetire(report: RetireReport): string[] {
  const out = [
    `删卡记录（基线 ${report.base}，合并点 ${report.mergeBase.slice(0, 9)}）：碰过 stories.md 或带删卡 trailer 的提交 ${report.commits.length} 个`,
  ]
  for (const commit of report.commits) {
    const retired = commit.retired.map(entry => `${KEY_WORDS[entry.key]} ${entry.card}`)
    out.push(
      `    ${commit.sha.slice(0, 9)}  ${commit.subject}${retired.length === 0 ? '' : `  → ${retired.join('、')}`}`,
    )
  }
  if (report.violations.length === 0) out.push('  删卡都有记录，「已发到」没有变小。')
  else {
    out.push(`  缺记录或对不上 ${report.violations.length} 处：`)
    for (const violation of report.violations) out.push(`    ✗ ${violation}`)
  }
  for (const unknown of report.unknowns) out.push(`  unknown: ${unknown}`)
  out.push(`  ${RETIRE_BLIND_SPOT}`)
  return out
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map(stable).sort())
  if (typeof value === 'object' && value !== null)
    return JSON.stringify(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => [key, stable(value)]),
    )
  return JSON.stringify(value)
}
function migrationProblems(
  root: string,
  revision: string,
  productRoot: string,
  parents: readonly string[],
  prior: readonly (Cutovers | undefined)[],
  current: Cutovers | undefined,
): { added: string[]; problems: string[] } {
  const problems: string[] = [],
    added: string[] = [],
    inherited = new Map<string, string>()
  const currentTopics = new Map(current?.topics.map(t => [t.topic, t]) ?? [])
  for (const previous of prior) {
    if (previous === undefined) continue
    if (current?.repository !== previous.repository) problems.push('既有切换仓库记录被删除或改变')
    for (const topic of previous.topics) {
      const now = currentTopics.get(topic.topic)
      if (now === undefined) problems.push(`${topic.topic} 既有切换记录被删除`)
      for (const anchor of topic.history)
        if (!now?.history.some(a => stable(a) === stable(anchor)))
          problems.push(`${topic.topic} 既有历史锚点被删除或改变`)
      for (const batch of topic.batches) {
        const key = `${topic.topic}/${batch.id}`,
          serialized = stable(batch),
          other = inherited.get(key)
        if (other !== undefined && other !== serialized) problems.push(`${key} 各父版本记录冲突`)
        inherited.set(key, serialized)
        const next = now?.batches.find(b => b.id === batch.id)
        if (next === undefined || stable(next) !== serialized)
          problems.push(`${key} 既有批次被删除或改写`)
      }
    }
  }
  for (const topic of current?.topics ?? [])
    for (const batch of topic.batches) {
      if (inherited.has(`${topic.topic}/${batch.id}`)) continue
      added.push(...batch.removals.map(r => r.card))
      try {
        const originals = cardTexts(verifySource(root, revision, productRoot, batch.source))
        const productRevision = sourceProductRevision(root, batch.source)
        for (const removal of batch.removals) {
          const original = originals.get(removal.card)
          if (original === undefined || sha256(original) !== removal.cardSha256)
            problems.push(`${removal.card} 源卡摘要不符`)
          if (removal.readback.alias !== `${removal.card}@${productRevision}`)
            problems.push(`${removal.card} 原产品修订不符`)
          let present = false
          for (const parent of parents) {
            const raw = gitText(root, parent, batch.source.path),
              before = raw === undefined ? undefined : cardTexts(raw).get(removal.card)
            if (before !== undefined) {
              present = true
              if (sha256(before) !== removal.cardSha256)
                problems.push(`${removal.card} 父版本原文冲突或摘要不符`)
            }
          }
          if (!present) problems.push(`${removal.card} 实际父版本没有源卡`)
        }
      } catch (error) {
        if (!(error instanceof InputError)) throw error
        problems.push(error.message)
      }
    }
  return { added, problems }
}
function anchoredQueues(
  root: string,
  revision: string,
  productRoot: string,
  cutovers: Cutovers | undefined,
  problems: string[],
): Queues {
  const queues = new Map(queuesAt(root, revision, productRoot))
  for (const topic of cutovers?.topics ?? []) {
    const key = topic.topic.slice(3),
      present = queues.get(key)
    let highest = 0,
      highCard = ''
    for (const source of topic.history) {
      try {
        const parsed = parseStories(verifySource(root, revision, productRoot, source)),
          water = parsed.highWater[0]
        if (
          parsed.highWater.length !== 1 ||
          water === undefined ||
          !CARD_ID.test(water) ||
          water.slice(3, 6) !== key
        ) {
          problems.push(`${revision} ${topic.topic} 历史水位无效`)
          continue
        }
        if (Number(water.slice(7)) >= highest) {
          highest = Number(water.slice(7))
          highCard = water
        }
      } catch (error) {
        if (!(error instanceof InputError)) throw error
        problems.push(`${revision} ${error.message}`)
      }
    }
    if (present !== undefined && (waterOf(present) ?? -1) < highest)
      problems.push(`${revision} ${present.path} 当前水位低于历史锚点`)
    if (present === undefined && highCard)
      queues.set(key, { path: `${CUTOVERS_PATH}#${topic.topic}`, cards: [], highWater: [highCard] })
  }
  return queues
}
