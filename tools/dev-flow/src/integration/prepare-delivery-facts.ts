import { randomBytes } from 'node:crypto'
import { operationJournal } from '../delivery/line-state-journal.ts'
import { REST_HEADERS, type GhCommand } from '../delivery/github-read.ts'
import { InputError } from '../delivery/protocol.ts'
import { hash256, utcTime } from '../delivery/collaboration-values.ts'
import { digest, fields, integer, object, same, string, IntegrationError } from './parse.ts'
import {
  PublishedFactsMissing,
  readPublishedDeliveryFacts,
  type FactsDeployment,
  type PublishedFacts,
} from './published-delivery-facts.ts'
import {
  factsRunName,
  findPreparedFactsRun,
  parseFactsRunConclusion,
  readPreparedFactsRun,
  type FactsRunInput,
  type PreparedFactsRun,
} from './prepared-facts-run.ts'
import { dispatchReceipt } from './release-run-protocol.ts'

export type FactsPreparationResult =
  | { status: 'ready'; facts: PublishedFacts }
  | { status: 'pending'; generation: number; run: PreparedFactsRun }
  | {
      status: 'failed'
      generation: number | null
      run: PreparedFactsRun | null
      diagnostic: string
    }
  | {
      status: 'unknown'
      generation: number | null
      run: PreparedFactsRun | null
      diagnostic: string
    }

type Binding = {
  installationDigest: string
  deployment: FactsDeployment
  dispatch: PublishedFactsMissing['dispatch']
}
type Intent = {
  schemaVersion: 1
  generation: number
  binding: Binding
  input: FactsRunInput
  predecessor: { generation: number; nonce: string; run: PreparedFactsRun } | null
}
type PreparationPorts = {
  deployment: FactsDeployment
  installationDigest: string
  journalRoot: string
  call: GhCommand
  now?: () => number
  nonce?: () => string
}

function slotId(dispatch: string): string {
  const h = digest(dispatch)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}

function parseIntent(
  value: unknown,
  generation: number,
  binding: Binding,
  previous: Intent | null,
): Intent {
  const v = fields(
    value,
    ['schemaVersion', 'generation', 'binding', 'input', 'predecessor'],
    'facts intent',
  )
  if (v.schemaVersion !== 1 || v.generation !== generation)
    throw new InputError('facts-preparation-intent-version')
  same(v.binding, binding, 'facts-preparation-operation-conflict')
  const input = fields(v.input, ['issue', 'authority', 'nonce'], 'facts inputs')
  const nonce = string(input.nonce, 'nonce')
  if (!/^[0-9a-f]{32}$/.test(nonce)) throw new InputError('facts-preparation-nonce')
  const match = /\/issues\/([1-9]\d*)#issuecomment-[1-9]\d*$/.exec(binding.dispatch.url)
  if (input.authority !== binding.dispatch.url || input.issue !== match?.[1])
    throw new InputError('facts-preparation-input-conflict')
  let predecessor: Intent['predecessor'] = null
  if (previous === null) {
    if (v.predecessor !== null) throw new InputError('facts-preparation-predecessor')
  } else {
    const p = fields(v.predecessor, ['generation', 'nonce', 'run'], 'facts predecessor')
    const r = fields(
      p.run,
      ['id', 'attempt', 'status', 'conclusion', 'createdAt'],
      'predecessor run',
    )
    const conclusion = parseFactsRunConclusion(r.conclusion)
    if (
      p.generation !== previous.generation ||
      p.nonce !== previous.input.nonce ||
      r.attempt !== 1 ||
      r.status !== 'completed' ||
      conclusion === 'success' ||
      conclusion === null
    )
      throw new InputError('facts-preparation-predecessor')
    predecessor = {
      generation: previous.generation,
      nonce: previous.input.nonce,
      run: {
        id: integer(r.id, 'predecessor.run.id'),
        attempt: 1,
        status: 'completed',
        conclusion,
        createdAt: utcTime(r.createdAt, 'predecessor.createdAt'),
      },
    }
  }
  const parsed = {
    schemaVersion: 1 as const,
    generation,
    binding,
    input: {
      issue: string(input.issue, 'issue'),
      authority: binding.dispatch.url,
      nonce,
    },
    predecessor,
  }
  factsRunName(parsed.input)
  return parsed
}

/** Bootstrap fixes installation and storage. Callers supply only the dispatch and explicit retry choice. */
export function createFactsPreparation(ports: PreparationPorts) {
  hash256(ports.installationDigest, 'installationDigest')
  return (dispatch: string, options: { retryFailed?: boolean } = {}): FactsPreparationResult => {
    let generation: number | null = null,
      observed: PreparedFactsRun | null = null
    const unknown = (diagnostic: string): FactsPreparationResult => ({
      status: 'unknown',
      generation,
      run: observed,
      diagnostic,
    })
    const now = ports.now ?? Date.now,
      deadline = now() + 30_000
    let calls = 0
    const call: GhCommand = (args, timeout) => {
      if (++calls > 128 || now() >= deadline)
        throw new InputError('facts-preparation-observation-budget')
      return ports.call(args, Math.min(timeout, Math.max(1, deadline - now())))
    }
    const get = (path: string) => call(['api', '--method', 'GET', ...REST_HEADERS, path], 15_000)
    try {
      let published: PublishedFacts | null = null
      let snapshot: PublishedFactsMissing['dispatch']
      try {
        published = readPublishedDeliveryFacts(ports.deployment, dispatch, call)
        const { reviewer: _reviewer, ...identity } = published.authority
        snapshot = identity
      } catch (error) {
        if (!(error instanceof PublishedFactsMissing)) throw error
        snapshot = error.dispatch
      }
      const binding: Binding = {
        installationDigest: ports.installationDigest,
        deployment: ports.deployment,
        dispatch: snapshot,
      }
      const journal = operationJournal(ports.journalRoot, slotId(dispatch))
      let intent: Intent | null = null
      const nonces = new Set<string>()
      for (let next = 1; ; next++) {
        if (next > 1000) throw new InputError('facts-preparation-generation-limit')
        const saved = journal.read(`intent-${next}.json`)
        if (saved === undefined) break
        intent = parseIntent(saved, next, binding, intent)
        if (nonces.has(intent.input.nonce)) throw new InputError('facts-preparation-nonce-reused')
        nonces.add(intent.input.nonce)
      }
      if (intent === null && published !== null) return { status: 'ready', facts: published }

      const observe = (item: Intent): PreparedFactsRun | null => {
        const saved = journal.read(`run-${item.generation}.json`)
        if (saved !== undefined) {
          const record = fields(saved, ['input', 'runId'], 'facts run receipt')
          same(record.input, item.input, 'facts-preparation-receipt-conflict')
          return readPreparedFactsRun(
            ports.deployment,
            item.input,
            integer(record.runId, 'runId'),
            call,
          )
        }
        return findPreparedFactsRun(ports.deployment, item.input, call)
      }
      if (intent !== null) {
        generation = intent.generation
        observed = observe(intent)
        if (observed === null) return unknown('facts-preparation-dispatch-unresolved-no-repost')
        if (observed.status !== 'completed') return { status: 'pending', generation, run: observed }
        if (observed.conclusion === 'success') {
          const facts = readPublishedDeliveryFacts(ports.deployment, dispatch, call)
          if (
            !facts.observations.some(
              o => o.facts.run === observed?.id && o.facts.nonce === intent?.input.nonce,
            )
          )
            return unknown('facts-preparation-operation-facts-missing')
          return { status: 'ready', facts }
        }
        if (!options.retryFailed || published !== null)
          return {
            status: 'failed',
            generation,
            run: observed,
            diagnostic: 'facts-preparation-run-failed',
          }
      }

      const previous = intent
      const prefix = `repos/${ports.deployment.repository}`
      const workflow = object(
        get(`${prefix}/actions/workflows/${ports.deployment.workflow.id}`),
        'workflow',
      )
      const ref = object(
        get(`${prefix}/git/ref/heads/${ports.deployment.workflow.ref}`),
        'workflow ref',
      )
      if (
        workflow.id !== ports.deployment.workflow.id ||
        workflow.path !== ports.deployment.workflow.path ||
        workflow.state !== 'active' ||
        ref.ref !== `refs/heads/${ports.deployment.workflow.ref}` ||
        object(ref.object, 'ref.object').sha !== ports.deployment.workflow.head
      )
        throw new InputError('facts-preparation-deployment-changed')
      try {
        readPublishedDeliveryFacts(ports.deployment, dispatch, call)
        return unknown('facts-preparation-facts-appeared-before-dispatch')
      } catch (error) {
        if (!(error instanceof PublishedFactsMissing)) throw error
        same(error.dispatch, snapshot, 'facts-preparation-dispatch-changed')
      }
      if (previous !== null) {
        const fresh = observe(previous)
        same(fresh, observed, 'facts-preparation-predecessor-changed')
      }
      const issue = /\/issues\/([1-9]\d*)#/.exec(dispatch)?.[1]
      const nonce = (ports.nonce ?? (() => randomBytes(16).toString('hex')))()
      if (nonces.has(nonce)) throw new InputError('facts-preparation-nonce-reused')
      intent = parseIntent(
        {
          schemaVersion: 1,
          generation: (previous?.generation ?? 0) + 1,
          binding,
          input: { issue, authority: dispatch, nonce },
          predecessor:
            previous === null
              ? null
              : { generation: previous.generation, nonce: previous.input.nonce, run: observed },
        },
        (previous?.generation ?? 0) + 1,
        binding,
        previous,
      )
      generation = intent.generation
      journal.save(`intent-${generation}.json`, intent)
      let receipt: ReturnType<typeof dispatchReceipt>
      try {
        receipt = dispatchReceipt(
          call(
            [
              'api',
              '--method',
              'POST',
              ...REST_HEADERS,
              `${prefix}/actions/workflows/${ports.deployment.workflow.id}/dispatches`,
              '-f',
              `ref=${ports.deployment.workflow.ref}`,
              ...Object.entries(intent.input).flatMap(([key, value]) => [
                '-f',
                `inputs[${key}]=${value}`,
              ]),
            ],
            15_000,
          ),
          ports.deployment.repository,
        )
      } catch {
        return unknown('facts-preparation-dispatch-response-unknown-no-repost')
      }
      journal.save(`run-${generation}.json`, {
        input: intent.input,
        runId: receipt.workflow_run_id,
      })
      observed = observe(intent)
      if (observed === null) return unknown('facts-preparation-dispatch-unresolved-no-repost')
      if (observed.status !== 'completed') return { status: 'pending', generation, run: observed }
      if (observed.conclusion !== 'success')
        return {
          status: 'failed',
          generation,
          run: observed,
          diagnostic: 'facts-preparation-run-failed',
        }
      const facts = readPublishedDeliveryFacts(ports.deployment, dispatch, call)
      if (
        !facts.observations.some(
          o => o.facts.run === observed?.id && o.facts.nonce === intent?.input.nonce,
        )
      )
        return unknown('facts-preparation-operation-facts-missing')
      return { status: 'ready', facts }
    } catch (error) {
      if (error instanceof IntegrationError && error.code === 'refused')
        return { status: 'failed', generation, run: observed, diagnostic: error.message }
      return unknown(
        error instanceof InputError || error instanceof IntegrationError
          ? error.message
          : 'facts-preparation-storage-or-network-unavailable',
      )
    }
  }
}
