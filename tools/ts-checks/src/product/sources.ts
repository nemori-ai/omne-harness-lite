import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, lstatSync, readlinkSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import {
  InputError,
  array,
  record,
  text,
  parseConfig,
  parseCapture,
  bindCapture,
  type Finding,
  type IssueIdentity,
} from '../delivery/protocol.ts'
import { observeProductFields, isDeliveryCardBody } from '../delivery/observe.ts'
import { git } from '../metrics/git.ts'
import { linkedScenario, readStories } from './stories.ts'

export const CUTOVERS_PATH = 'docs/engineering/source-cutovers.json'
export const DELIVERY_CONFIG_PATH = 'docs/engineering/github-delivery.json'
export type ScenarioRef = { readonly topic: string; readonly id: string }
export type SourceCard =
  | {
      readonly kind: 'legacy'
      readonly id: string
      readonly path: string
      readonly topic: string
      readonly title: string
      readonly scenarios: readonly ScenarioRef[]
    }
  | {
      readonly kind: 'issue'
      readonly identity: IssueIdentity
      readonly aliases: readonly { readonly id: string; readonly productRevision: number }[]
      readonly read:
        | {
            readonly kind: 'known'
            readonly title: string
            readonly revision: number
            readonly scenarios: readonly ScenarioRef[]
            readonly state: 'open' | 'closed'
            readonly stage: string | null
          }
        | { readonly kind: 'unknown'; readonly reason: string }
    }
export type AliasResolution =
  | { readonly kind: 'legacy'; readonly id: string; readonly path: string }
  | { readonly kind: 'issue'; readonly identity: IssueIdentity; readonly observed: boolean }
  | { readonly kind: 'unknown'; readonly reason: string }
  | { readonly kind: 'conflict'; readonly sources: readonly string[] }
export type CurrentSources = {
  readonly schemaVersion: 1
  readonly kind: 'current-source-observation'
  readonly root: string
  readonly productRoot: string
  readonly head: string
  readonly dailyEnabled: boolean
  readonly inputRoles: {
    readonly config: { readonly selection: 'default' | 'explicit'; readonly path: string }
    readonly cutovers: { readonly path: string }
    readonly capture: { readonly kind: 'none' } | { readonly kind: 'file'; readonly path: string }
  }
  readonly bindings: readonly { readonly path: string; readonly sha256: string | null }[]
  readonly cards: readonly SourceCard[]
  readonly aliases: readonly { readonly id: string; readonly resolution: AliasResolution }[]
  readonly completeness: 'complete' | 'partial' | 'unknown'
  readonly findings: readonly Finding[]
}
export type GitSource = { readonly commit: string; readonly path: string; readonly blob: string }
export type IssueRevision = {
  readonly repository: string
  readonly nodeId: string
  readonly url: string
  readonly revision: number
  readonly bodySha256: string
}
export type SourceAdoption = {
  readonly source: string
  readonly decider: string
  readonly scope: readonly string[]
}
export type MigrationBatch = {
  readonly id: string
  readonly source: GitSource
  readonly removals: readonly {
    readonly card: string
    readonly cardSha256: string
    readonly target: IssueRevision
    readonly readback: {
      readonly source: string
      readonly captureSha256: string
      readonly issueUpdatedAt: string
      readonly alias: string
    }
  }[]
  readonly adoption: SourceAdoption
  readonly consumers: readonly string[]
}
export type TopicCutover = {
  readonly topic: string
  readonly history: readonly GitSource[]
  readonly batches: readonly MigrationBatch[]
}
export type Cutovers = {
  readonly schemaVersion: 1
  readonly kind: 'legacy-source-cutovers'
  readonly repository: string
  readonly topics: readonly TopicCutover[]
}
export const sha256 = (value: string | Buffer): string =>
  createHash('sha256').update(value).digest('hex')
function nonempty(value: unknown, at: string): string {
  const v = text(value, at)
  if (!v.trim()) throw new InputError(`${at} must not be empty`)
  return v
}
function match(value: unknown, pattern: RegExp, at: string): string {
  const v = nonempty(value, at)
  if (!pattern.test(v)) throw new InputError(`${at} has invalid format`)
  return v
}
function positive(value: unknown, at: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new InputError(`${at} must be a positive integer`)
  return value
}
function unique(values: readonly string[], at: string): void {
  if (new Set(values).size !== values.length)
    throw new InputError(`${at} contains duplicate identities`)
}
function finite(value: Record<string, unknown>, keys: readonly string[], at: string): void {
  if (Object.keys(value).some(key => !keys.includes(key)))
    throw new InputError(`${at} contains unsupported fields`)
}
const digest = (v: unknown, at: string) => match(v, /^[a-f0-9]{64}$/, at)
const oid = (v: unknown, at: string) => match(v, /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/, at)
function source(value: unknown): GitSource {
  const v = record(value, 'GitSource')
  finite(v, ['commit', 'path', 'blob'], 'GitSource')
  const path = nonempty(v.path, 'source.path')
  if (
    isAbsolute(path) ||
    path.includes('\\') ||
    path.split('/').some(part => !part || part === '.' || part === '..') ||
    !/^.+\/PF-\d{3}[^/]*\/stories\.md$/.test(path)
  )
    throw new InputError('source.path must be a repository stories path')
  return { commit: oid(v.commit, 'source.commit'), path, blob: oid(v.blob, 'source.blob') }
}
export function parseCutovers(value: unknown): Cutovers {
  const v = record(value, 'cutovers')
  finite(v, ['schemaVersion', 'kind', 'repository', 'topics'], 'cutovers')
  if (v.schemaVersion !== 1 || v.kind !== 'legacy-source-cutovers')
    throw new InputError('unsupported cutovers schema')
  const repository = match(
    v.repository,
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/,
    'cutovers.repository',
  )
  const allCards: string[] = []
  const topics = array(v.topics, 'topics').map(item => {
    const t = record(item, 'topic')
    finite(t, ['topic', 'history', 'batches'], 'topic')
    const topic = match(t.topic, /^PF-\d{3}$/, 'topic.topic')
    const history = array(t.history, 'history').map(source)
    if (!history.length) throw new InputError('history must not be empty')
    unique(
      history.map(s => JSON.stringify(s)),
      'history',
    )
    const batches = array(t.batches, 'batches').map(item => {
      const b = record(item, 'batch')
      finite(b, ['id', 'source', 'removals', 'adoption', 'consumers'], 'batch')
      const removals = array(b.removals, 'removals').map(item => {
        const r = record(item, 'removal')
        finite(r, ['card', 'cardSha256', 'target', 'readback'], 'removal')
        const card = match(r.card, new RegExp(`^ST-${topic.slice(3)}-\\d{2}$`), 'removal.card')
        allCards.push(card)
        const t = record(r.target, 'target')
        finite(t, ['repository', 'nodeId', 'url', 'revision', 'bodySha256'], 'target')
        if (t.repository !== repository) throw new InputError('target repository mismatch')
        const url = match(
          t.url,
          /^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/[1-9]\d*$/,
          'target.url',
        )
        if (!url.startsWith(`https://github.com/${repository}/issues/`))
          throw new InputError('target URL repository mismatch')
        const rb = record(r.readback, 'readback')
        finite(rb, ['source', 'captureSha256', 'issueUpdatedAt', 'alias'], 'readback')
        const alias = match(rb.alias, /^ST-\d{3}-\d{2}@[1-9]\d*$/, 'readback.alias')
        if (alias.split('@')[0] !== card) throw new InputError('readback alias card mismatch')
        const issueUpdatedAt = nonempty(rb.issueUpdatedAt, 'readback.issueUpdatedAt')
        if (!Number.isFinite(Date.parse(issueUpdatedAt)))
          throw new InputError('invalid readback date')
        return {
          card,
          cardSha256: digest(r.cardSha256, 'cardSha256'),
          target: {
            repository,
            nodeId: nonempty(t.nodeId, 'nodeId'),
            url,
            revision: positive(t.revision, 'revision'),
            bodySha256: digest(t.bodySha256, 'bodySha256'),
          },
          readback: {
            source: nonempty(rb.source, 'readback.source'),
            captureSha256: digest(rb.captureSha256, 'captureSha256'),
            issueUpdatedAt,
            alias,
          },
        }
      })
      if (!removals.length) throw new InputError('removals must not be empty')
      const a = record(b.adoption, 'adoption')
      finite(a, ['source', 'decider', 'scope'], 'adoption')
      const scope = array(a.scope, 'scope').map(v => nonempty(v, 'scope member'))
      unique(scope, 'scope')
      if (JSON.stringify([...scope].sort()) !== JSON.stringify(removals.map(r => r.card).sort()))
        throw new InputError('adoption scope must equal removals')
      const consumers = array(b.consumers, 'consumers').map(v => nonempty(v, 'consumer'))
      unique(consumers, 'consumers')
      if (!consumers.length) throw new InputError('consumers must not be empty')
      return {
        id: nonempty(b.id, 'batch.id'),
        source: source(b.source),
        removals,
        adoption: {
          source: nonempty(a.source, 'adoption.source'),
          decider: nonempty(a.decider, 'decider'),
          scope,
        },
        consumers,
      }
    })
    unique(
      batches.map(b => b.id),
      'batches',
    )
    for (const s of [...history, ...batches.map(b => b.source)])
      if (!new RegExp(`^${topic}(?:-|$)`).test(s.path.split('/').at(-2) ?? ''))
        throw new InputError('source topic mismatch')
    return { topic, history, batches }
  })
  unique(
    topics.map(t => t.topic),
    'topics',
  )
  unique(allCards, 'migrated cards')
  const byId = new Map<string, string>(),
    byUrl = new Map<string, string>()
  for (const topic of topics)
    for (const batch of topic.batches)
      for (const removal of batch.removals) {
        const { nodeId, url } = removal.target
        if (
          (byId.has(nodeId) && byId.get(nodeId) !== url) ||
          (byUrl.has(url) && byUrl.get(url) !== nodeId)
        )
          throw new InputError('Issue stable identity has conflicting bindings')
        byId.set(nodeId, url)
        byUrl.set(url, nodeId)
      }
  return { schemaVersion: 1, kind: 'legacy-source-cutovers', repository, topics }
}
export function gitText(root: string, revision: string, path: string): string | undefined {
  git(root, ['cat-file', '-e', `${revision}^{commit}`])
  const entry = git(root, ['ls-tree', revision, '--', path])
  if (!entry) return undefined
  return execFileSync('git', ['show', `${revision}:${path}`], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}
export function cutoversAt(root: string, revision: string): Cutovers | undefined {
  const raw = gitText(root, revision, CUTOVERS_PATH)
  return raw === undefined ? undefined : parseCutovers(JSON.parse(raw))
}
export function cardTexts(raw: string): Map<string, string> {
  const starts = [...raw.matchAll(/^###\s+(ST-\d{3}-\d{2})\s*·[^\n]*(?:\n|$)/gm)]
  const result = new Map<string, string>()
  for (const [i, m] of starts.entries()) {
    const id = m[1]
    if (id === undefined) continue
    if (result.has(id)) throw new InputError('duplicate source card')
    result.set(id, raw.slice(m.index, starts[i + 1]?.index))
  }
  return result
}
export function verifySource(
  root: string,
  revision: string,
  productRoot: string,
  src: GitSource,
): string {
  if (!src.path.startsWith(`${productRoot.replace(/\/$/, '')}/`))
    throw new InputError('source is outside productRoot')
  git(root, ['cat-file', '-e', `${src.commit}^{commit}`])
  const ancestor = spawnSync('git', ['merge-base', '--is-ancestor', src.commit, revision], {
    cwd: root,
    encoding: 'utf8',
  })
  if (ancestor.status === 1) throw new InputError('source commit is not an ancestor')
  if (ancestor.status !== 0) throw new Error(ancestor.stderr || 'cannot inspect source ancestry')
  if (git(root, ['rev-parse', `${src.commit}:${src.path}`]) !== src.blob)
    throw new InputError('source blob mismatch')
  const raw = gitText(root, src.commit, src.path)
  if (raw === undefined) throw new InputError('missing source stories')
  return raw
}
export function sourceProductRevision(root: string, src: GitSource): number {
  const raw = gitText(root, src.commit, `${dirname(src.path)}/README.md`)
  const value = raw?.match(/^revision:\s*([1-9]\d*)\s*$/m)?.[1]
  if (value === undefined) throw new InputError('source product revision is missing')
  return positive(Number(value), 'product revision')
}
export function targetIdentity(target: IssueRevision): IssueIdentity {
  return {
    repository: target.repository,
    id: target.nodeId,
    url: target.url,
    number: Number(target.url.split('/').at(-1)),
  }
}
export function canonicalPath(path: string): string {
  const active = new Set<string>()
  function walk(base: string, parts: readonly string[]): string {
    let current = base
    for (const part of parts) {
      if (!part || part === '.') continue
      if (part === '..') {
        current = dirname(current)
        continue
      }
      const candidate = resolve(current, part)
      let link = false
      try {
        link = lstatSync(candidate).isSymbolicLink()
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !('code' in error) ||
          !['ENOENT', 'ENOTDIR'].includes(String(error.code))
        )
          throw error
      }
      if (link) {
        if (active.has(candidate)) throw new InputError('symlink loop in input path')
        active.add(candidate)
        const target = readlinkSync(candidate)
        current = walk(isAbsolute(target) ? '/' : current, target.split('/'))
        active.delete(candidate)
      } else current = candidate
    }
    return current
  }
  return walk(isAbsolute(path) ? '/' : process.cwd(), path.split('/'))
}
export function inspectCurrentSources(input: {
  readonly root: string
  readonly productRoot: string
  readonly configPath?: string
  readonly capturePath?: string
}): CurrentSources {
  const root = realpathSync(input.root),
    productRoot = realpathSync(resolve(root, input.productRoot)),
    head = git(root, ['rev-parse', 'HEAD'])
  const bindings = new Map<string, string | null>()
  function read(path: string): string | undefined {
    const raw = existsSync(path) ? readFileSync(path, 'utf8') : undefined
    bindings.set(path, raw === undefined ? null : sha256(raw))
    return raw
  }
  const fromRoot = (path: string) => canonicalPath(isAbsolute(path) ? path : `${root}/${path}`)
  const inputRoles: CurrentSources['inputRoles'] = {
    config: {
      selection: input.configPath === undefined ? 'default' : 'explicit',
      path: fromRoot(input.configPath ?? DELIVERY_CONFIG_PATH),
    },
    cutovers: { path: fromRoot(CUTOVERS_PATH) },
    capture:
      input.capturePath === undefined
        ? { kind: 'none' }
        : { kind: 'file', path: fromRoot(input.capturePath) },
  }
  const configRaw = read(inputRoles.config.path)
  if (input.configPath !== undefined && configRaw === undefined)
    throw new InputError('explicit config is missing')
  const config = configRaw === undefined ? undefined : parseConfig(JSON.parse(configRaw))
  const cutoverRaw = read(inputRoles.cutovers.path),
    cutovers = cutoverRaw === undefined ? undefined : parseCutovers(JSON.parse(cutoverRaw))
  if (cutovers !== undefined && (config === undefined || config.repository !== cutovers.repository))
    throw new InputError('cutovers and config repository must match')
  if (cutovers === undefined)
    for (const revision of git(root, ['log', '--format=%H', head, '--', CUTOVERS_PATH])
      .split('\n')
      .filter(Boolean))
      if ((cutoversAt(root, revision)?.topics.length ?? 0) > 0)
        throw new InputError('historical cutovers file is missing')
  const captureRaw = inputRoles.capture.kind === 'none' ? undefined : read(inputRoles.capture.path)
  if (input.capturePath !== undefined && captureRaw === undefined)
    throw new InputError('capture is missing')
  const capture = captureRaw === undefined ? undefined : parseCapture(JSON.parse(captureRaw))
  if (capture !== undefined) {
    if (config === undefined) throw new InputError('capture requires config')
    bindCapture(config, capture)
  }
  const findings: Finding[] = [],
    cards: SourceCard[] = [],
    aliases = new Map<string, AliasResolution>()
  function add(category: Finding['category'], code: string, object: string, message: string): void {
    const clause = 'current-source'
    findings.push({
      id: JSON.stringify([category, code, object, clause]),
      category,
      code,
      object,
      clause,
      revision: null,
      source: object,
      message,
    })
  }
  function alias(id: string, resolution: AliasResolution): void {
    const old = aliases.get(id)
    if (old === undefined) aliases.set(id, resolution)
    else {
      aliases.set(id, {
        kind: 'conflict',
        sources: [JSON.stringify(old), JSON.stringify(resolution)],
      })
      add('deviation', 'source-conflict', id, '旧卡身份对应多个当前来源。')
    }
  }
  for (const file of readStories(productRoot) ?? []) {
    const path = canonicalPath(`${productRoot}/${file.topic}/stories.md`)
    read(path)
    for (const card of file.cards) {
      const scenarios = card.covers.flatMap(link => {
        const s = linkedScenario(file.topic, link)
        return s === undefined ? [] : [{ topic: s.topic.slice(0, 6), id: s.id }]
      })
      cards.push({
        kind: 'legacy',
        id: card.id,
        path,
        topic: file.topic.slice(0, 6),
        title: card.title,
        scenarios,
      })
      alias(card.id, { kind: 'legacy', id: card.id, path })
    }
  }
  const observations =
    capture?.issues.map(issue => ({ issue, product: observeProductFields(issue.body) })) ?? []
  const selected = new Map<
    string,
    { identity: IssueIdentity; aliases: { id: string; productRevision: number }[] }
  >()
  for (const topic of cutovers?.topics ?? []) {
    for (const history of topic.history)
      verifySource(root, head, relative(root, productRoot), history)
    for (const batch of topic.batches) {
      const raw = verifySource(root, head, relative(root, productRoot), batch.source),
        revision = sourceProductRevision(root, batch.source),
        originals = cardTexts(raw)
      for (const removal of batch.removals) {
        const original = originals.get(removal.card)
        if (
          original === undefined ||
          sha256(original) !== removal.cardSha256 ||
          removal.readback.alias !== `${removal.card}@${revision}`
        )
          throw new InputError('migration source card or product revision mismatch')
        const identity = targetIdentity(removal.target),
          entry = selected.get(identity.id) ?? { identity, aliases: [] }
        if (entry.identity.url !== identity.url)
          throw new InputError('stable Issue id has conflicting URLs')
        entry.aliases.push({ id: removal.card, productRevision: revision })
        selected.set(identity.id, entry)
        const observed = observations.filter(o =>
          o.product.aliases.some(a => a.id === removal.card),
        )
        if (
          observed.length > 1 ||
          observed.some(
            o =>
              o.issue.id !== identity.id ||
              o.issue.url !== identity.url ||
              !o.product.aliases.some(a => a.id === removal.card && a.productRevision === revision),
          )
        ) {
          alias(removal.card, { kind: 'conflict', sources: observed.map(o => o.issue.url) })
          add('deviation', 'alias-conflict', removal.card, '当前旧别名与唯一目标不符。')
        } else if (observed.length === 0 && capture?.collection.issues === 'complete') {
          alias(removal.card, { kind: 'conflict', sources: [identity.url] })
          add('deviation', 'missing-target', removal.card, '完整读取未找到目标的精确旧别名。')
        } else alias(removal.card, { kind: 'issue', identity, observed: observed.length === 1 })
        add(
          'unknown',
          'adoption-unverified',
          removal.card,
          `采用权限与首次读回真实性未核。${batch.adoption.source} ${removal.readback.source}`,
        )
      }
    }
  }
  const declaredAliases = new Map<string, string[]>()
  for (const o of observations)
    for (const a of o.product.aliases)
      declaredAliases.set(a.id, [...(declaredAliases.get(a.id) ?? []), o.issue.url])
  for (const [id, sources] of declaredAliases)
    if (sources.length > 1 && ![...selected.values()].some(s => s.aliases.some(a => a.id === id))) {
      aliases.set(id, { kind: 'conflict', sources })
      add('deviation', 'alias-conflict', id, '多个 Issue 声明相同旧别名。')
    }
  for (const o of observations) {
    for (const error of o.product.errors) add('deviation', 'product-field', o.issue.url, error)
    for (const a of o.product.aliases)
      if (
        !selected.size ||
        ![...selected.values()].some(s => s.aliases.some(old => old.id === a.id))
      ) {
        if (aliases.has(a.id))
          add('deviation', 'unadopted-alias', a.id, '未采用的 Issue 别名不能切换旧源。')
      }
    if (
      !selected.has(o.issue.id) &&
      o.product.aliases.length === 0 &&
      isDeliveryCardBody(o.issue.body) &&
      o.issue.url !== config?.creationHandoffIssue
    )
      selected.set(o.issue.id, {
        identity: {
          repository: capture?.repository ?? '',
          id: o.issue.id,
          url: o.issue.url,
          number: o.issue.number,
        },
        aliases: [],
      })
  }
  for (const entry of selected.values()) {
    const o = observations.find(
      o => o.issue.id === entry.identity.id && o.issue.url === entry.identity.url,
    )
    cards.push({
      kind: 'issue',
      ...entry,
      read:
        o === undefined || o.product.revision === null || o.product.errors.length
          ? { kind: 'unknown', reason: '当前 Issue 读数不完整或正文无效。' }
          : {
              kind: 'known',
              title: o.product.title,
              revision: o.product.revision,
              scenarios: o.product.scenarios,
              state: o.issue.state,
              stage: o.issue.stage,
            },
    })
    if (o === undefined)
      add(
        capture?.collection.issues === 'complete' ? 'deviation' : 'unknown',
        'issue-unread',
        entry.identity.url,
        '未读到当前 Issue。',
      )
  }
  if (capture === undefined && config?.enabled)
    add('unknown', 'issue-queue-unread', config.repository, '日常 Issue 队列尚未读取。')
  return {
    schemaVersion: 1,
    kind: 'current-source-observation',
    root,
    productRoot,
    head,
    dailyEnabled: config?.enabled ?? false,
    inputRoles,
    bindings: [...bindings].map(([path, sha256]) => ({ path, sha256 })),
    cards,
    aliases: [...aliases].map(([id, resolution]) => ({ id, resolution })),
    completeness:
      capture === undefined
        ? selected.size || config?.enabled
          ? 'unknown'
          : 'complete'
        : capture.collection.issues === 'unknown'
          ? 'unknown'
          : capture.collection.issues === 'partial' ||
              capture.collection.project !== 'complete' ||
              capture.collection.errors.length > 0
            ? 'partial'
            : 'complete',
    findings,
  }
}
