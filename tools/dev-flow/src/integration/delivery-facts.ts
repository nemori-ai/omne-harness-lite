import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { setTimeout as wait } from 'node:timers/promises'
import type { GhRead } from '../delivery/github-read.ts'
import type { AdmissionProject } from '../delivery/admission.ts'
import type { DeliveryConfig } from '../delivery/protocol.ts'
import type { Policy } from './policy.ts'
import { fields, integer, literal, object, section, string, IntegrationError } from './parse.ts'

/**
 * Delivery facts for a cloud session: the `delivery-facts` workflow on `github-gate` reads the
 * dispatch eligibility, the Project membership and the Stage with the delivery identity and posts
 * them on the task card. `start` dispatches that workflow, waits for the comment and adopts it
 * only after every check in `fetchDeliveryFacts` holds; `readAuthority` then binds the authority
 * part to the dispatch comment it reads itself. The direct path never calls this module.
 */
export const DELIVERY_IDENTITY = 'omne-harness-lite-delivery[bot]'
export const FACTS_WORKFLOW = 'delivery-facts.yml'
export const FACTS_WORKFLOW_PATH = `.github/workflows/${FACTS_WORKFLOW}`
export const FACTS_BRANCH = 'github-gate'
export const FACTS_MARKER = 'omne-delivery-facts:v1'
/** From the dispatch to adopted facts; the limit the card fixes. */
export const FACTS_BUDGET_MS = 180_000
export const FACTS_POLL_MS = 5_000
/**
 * A run created up to this long before the recorded dispatch time is still accepted: GitHub
 * reports `created_at` with one-second resolution and the local clock may drift. The nonce,
 * not this bound, ties the run to this dispatch.
 */
export const FACTS_CLOCK_SKEW_MS = 60_000

export type FactsSource = 'workflow' | 'direct'
/** `OMNE_DELIVERY_FACTS` overrides the host detection; `CCR_AGENT_PROXY_ENABLED=1` is the cloud. */
export function factsSource(env: Readonly<Record<string, string | undefined>>): FactsSource {
  const override = env['OMNE_DELIVERY_FACTS']
  if (override !== undefined) {
    if (override === 'workflow' || override === 'direct') return override
    throw new IntegrationError('input-error', 'OMNE_DELIVERY_FACTS must be workflow or direct')
  }
  return env['CCR_AGENT_PROXY_ENABLED'] === '1' ? 'workflow' : 'direct'
}

export type AuthorityFacts = {
  url: string
  author: string
  authorNodeId: string
  reviewer: boolean
  bodySha256: string
  updatedAt: string
}
export type DeliveryFacts = {
  nonce: string
  run: number
  issue: number
  authority: AuthorityFacts
  project: AdmissionProject
}
export type FactsPorts = {
  /** Runs `gh api`; the dispatch answers 204 without a body, so empty output is `undefined`. */
  gh: GhRead
  now: () => number
  sleep: (ms: number) => Promise<void>
  nonce: () => string
}
export const runGh: GhRead = (argv, timeoutMs) => {
  const stdout = execFileSync('gh', [...argv], {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  })
  return stdout.trim() === '' ? undefined : JSON.parse(stdout)
}
export const defaultPorts: FactsPorts = {
  gh: runGh,
  now: Date.now,
  sleep: ms => wait(ms),
  nonce: () => randomBytes(16).toString('hex'),
}
const API_HEADERS = [
  '-H',
  'Accept: application/vnd.github+json',
  '-H',
  'X-GitHub-Api-Version: 2026-03-10',
]
function unknown(message: string): IntegrationError {
  return new IntegrationError('unknown', message)
}
/** Strict shape of the facts block. Any parse failure is one fixed message without API content. */
function parseFacts(value: unknown): DeliveryFacts {
  try {
    const v = fields(
      value,
      ['schemaVersion', 'nonce', 'run', 'issue', 'authority', 'project'],
      'facts',
    )
    const a = fields(
      v.authority,
      ['url', 'author', 'authorNodeId', 'reviewer', 'bodySha256', 'updatedAt'],
      'facts.authority',
    )
    const p = fields(v.project, ['id', 'item', 'stage'], 'facts.project')
    literal(v.schemaVersion, 1, 'facts.schemaVersion')
    const nonce = string(v.nonce, 'facts.nonce'),
      bodySha256 = string(a.bodySha256, 'facts.authority.bodySha256')
    if (!/^[0-9a-f]{32}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(bodySha256))
      throw new IntegrationError('input-error', 'facts digest format')
    if (typeof a.reviewer !== 'boolean')
      throw new IntegrationError('input-error', 'facts.authority.reviewer must be a boolean')
    return {
      nonce,
      run: integer(v.run, 'facts.run'),
      issue: integer(v.issue, 'facts.issue'),
      authority: {
        url: string(a.url, 'facts.authority.url'),
        author: string(a.author, 'facts.authority.author'),
        authorNodeId: string(a.authorNodeId, 'facts.authority.authorNodeId'),
        reviewer: a.reviewer,
        bodySha256,
        updatedAt: string(a.updatedAt, 'facts.authority.updatedAt'),
      },
      project: {
        id: string(p.id, 'facts.project.id'),
        item: string(p.item, 'facts.project.item'),
        stage: p.stage === null ? null : string(p.stage, 'facts.project.stage'),
      },
    }
  } catch {
    throw unknown('Delivery facts block is malformed. API output omitted.')
  }
}
/**
 * Dispatches `delivery-facts.yml` on `github-gate` for the task card and waits for the facts
 * comment. Adopts it only when the comment, its block and the workflow run satisfy every check;
 * everything else, including the time limit, is `unknown`. Only REST paths are read.
 */
export async function fetchDeliveryFacts(
  policy: Policy,
  config: DeliveryConfig,
  scope: { task: string; authority: string },
  ports: FactsPorts = defaultPorts,
): Promise<DeliveryFacts> {
  const match = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/([1-9]\d*)$/.exec(scope.task)
  if (match?.[1] !== config.repository || match[2] === undefined)
    throw unknown('Delivery facts require a same-repository task Issue URL')
  const issue = Number(match[2]),
    projectId = config.project.id
  if (!Number.isSafeInteger(issue)) throw unknown('Delivery facts task Issue number is invalid')
  const comment =
    /^https:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/[1-9]\d*#issuecomment-[1-9]\d*$/.exec(
      scope.authority,
    )
  if (comment?.[1] !== config.repository)
    throw unknown('Delivery facts require a same-repository dispatch comment URL')
  if (projectId === null) throw unknown('Delivery facts require a configured Project')
  const nonce = ports.nonce()
  if (!/^[0-9a-f]{32}$/.test(nonce)) throw unknown('Delivery facts nonce is malformed')
  const dispatchedAt = ports.now(),
    deadline = dispatchedAt + FACTS_BUDGET_MS,
    prefix = `repos/${config.repository}`
  function remaining(): number {
    return deadline - ports.now()
  }
  function call(argv: string[], failure: string): unknown {
    const left = remaining()
    if (left <= 0) throw unknown('Delivery facts timed out')
    try {
      return ports.gh(argv, Math.min(policy.timeouts.networkMs, left))
    } catch {
      throw unknown(`${failure}. API output omitted.`)
    }
  }
  function get(path: string, failure: string): unknown {
    return call(['api', '--method', 'GET', ...API_HEADERS, `${prefix}/${path}`], failure)
  }
  call(
    [
      'api',
      '--method',
      'POST',
      ...API_HEADERS,
      '-f',
      `ref=${FACTS_BRANCH}`,
      '-f',
      `inputs[issue]=${issue}`,
      '-f',
      `inputs[authority]=${scope.authority}`,
      '-f',
      `inputs[nonce]=${nonce}`,
      `${prefix}/actions/workflows/${FACTS_WORKFLOW}/dispatches`,
    ],
    'Delivery facts dispatch failed',
  )
  function comments(): Record<string, unknown>[] {
    const items: Record<string, unknown>[] = []
    for (let page = 1; page <= 20; page += 1) {
      const result = get(
        `issues/${issue}/comments?per_page=100&page=${page}`,
        'Delivery facts comment read failed',
      )
      if (!Array.isArray(result)) throw unknown('Delivery facts comment page is malformed')
      for (const item of result) {
        if (typeof item !== 'object' || item === null || Array.isArray(item))
          throw unknown('Delivery facts comment is malformed')
        items.push(item as Record<string, unknown>)
      }
      if (result.length < 100) return items
    }
    throw unknown('Delivery facts comment page limit reached')
  }
  /** The one comment that carries this nonce, checked and parsed; `undefined` while none exists. */
  function adopt(): DeliveryFacts | undefined {
    const candidates = comments().flatMap(item => {
      const body = item.body
      // The nonce is 32 lowercase hex digits, which JSON never escapes, so every comment whose
      // block carries it also contains it verbatim. Any author counts toward duplication.
      return typeof body === 'string' && body.includes(FACTS_MARKER) && body.includes(nonce)
        ? [{ user: item.user, body, created: item.created_at, updated: item.updated_at }]
        : []
    })
    if (candidates.length > 1) throw unknown('Delivery facts comment is duplicated')
    const candidate = candidates[0]
    if (candidate === undefined) return undefined
    const user = candidate.user
    if (typeof user !== 'object' || user === null || Array.isArray(user))
      throw unknown('Delivery facts comment author is unreadable')
    const { login, type } = user as Record<string, unknown>
    if (login !== DELIVERY_IDENTITY)
      throw unknown('Delivery facts comment author is not the delivery identity')
    if (type !== 'Bot') throw unknown('Delivery facts comment author is not a Bot')
    // Collaborators with write access can edit any comment; facts must be as the workflow wrote them.
    if (typeof candidate.created !== 'string' || candidate.updated !== candidate.created)
      throw unknown('Delivery facts comment was edited or has no timestamps')
    let block: unknown
    try {
      block = section(candidate.body, FACTS_MARKER)
    } catch {
      throw unknown('Delivery facts block is malformed. API output omitted.')
    }
    if (block === undefined) throw unknown('Delivery facts block is missing')
    const facts = parseFacts(block)
    if (facts.nonce !== nonce) throw unknown('Delivery facts nonce mismatch')
    if (facts.issue !== issue) throw unknown('Delivery facts Issue mismatch')
    if (facts.authority.url !== scope.authority)
      throw unknown('Delivery facts authority URL mismatch')
    if (facts.project.id !== projectId) throw unknown('Delivery facts Project mismatch')
    return facts
  }
  /** Checks the run the comment names; `false` while the run has not completed. */
  function runCompleted(run: number): boolean {
    let r: Record<string, unknown>
    try {
      r = object(get(`actions/runs/${run}`, 'Delivery facts run read failed'), 'run')
    } catch (error) {
      if (error instanceof IntegrationError && error.code === 'unknown') throw error
      throw unknown('Delivery facts run is malformed. API output omitted.')
    }
    if (r.id !== run) throw unknown('Delivery facts run identity mismatch')
    if (r.path !== FACTS_WORKFLOW_PATH) throw unknown('Delivery facts run path mismatch')
    if (r.head_branch !== FACTS_BRANCH) throw unknown('Delivery facts run branch mismatch')
    if (r.event !== 'workflow_dispatch') throw unknown('Delivery facts run event mismatch')
    const created = typeof r.created_at === 'string' ? Date.parse(r.created_at) : Number.NaN
    if (Number.isNaN(created) || created < dispatchedAt - FACTS_CLOCK_SKEW_MS)
      throw unknown('Delivery facts run predates this dispatch')
    if (r.status !== 'completed') return false
    if (r.conclusion !== 'success') throw unknown('Delivery facts run did not succeed')
    return true
  }
  for (;;) {
    const facts = adopt()
    if (facts !== undefined && runCompleted(facts.run)) return facts
    const left = remaining()
    if (left <= 0) throw unknown('Delivery facts timed out')
    await ports.sleep(Math.min(FACTS_POLL_MS, left))
  }
}
