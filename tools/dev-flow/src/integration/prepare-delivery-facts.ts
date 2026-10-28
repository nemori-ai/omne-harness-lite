import { randomBytes } from 'node:crypto'
import { readdirSync } from 'node:fs'
import { operationJournal } from '../delivery/operation-journal.ts'
import { REST_HEADERS, type GhCommand } from '../delivery/github-read.ts'
import { parseReadPolicy, type ReadPolicy } from '../delivery/collaboration-read.ts'
import { InputError } from '../delivery/protocol.ts'
import { hash256, utcTime } from '../delivery/collaboration-values.ts'
import {
  canonical,
  digest,
  fields,
  integer,
  object,
  same,
  string,
  IntegrationError,
} from './parse.ts'
import {
  PublishedFactsMissing,
  readPublishedDeliveryFacts,
  type FactsDeployment,
  type FactsReadDeployment,
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
export type PreparationPorts = {
  deployment: FactsDeployment
  installationDigest: string
  historicalWorkflows: readonly FactsDeployment['workflow'][]
  priorInstallations: readonly { installationDigest: string; deployment: FactsDeployment }[]
  assertActive: () => void
  journalRoot: string
  call: GhCommand
  now?: () => number
  nonce?: () => string
}

export type FactsPreparationPolicy = Readonly<ReadPolicy & { totalMs: number; maxCalls: number }>

export function parseFactsPreparationPolicy(value: unknown = {}): FactsPreparationPolicy {
  const input = fields(value, ['networkMs', 'totalMs', 'maxCalls'], 'facts-preparation-policy')
  const network = parseReadPolicy('networkMs' in input ? { networkMs: input.networkMs } : {})
  const totalMs =
    'totalMs' in input ? integer(input.totalMs, 'facts-preparation-policy.totalMs') : 30_000
  const maxCalls =
    'maxCalls' in input ? integer(input.maxCalls, 'facts-preparation-policy.maxCalls') : 128
  if (totalMs > 2_147_483_647) throw new InputError('facts-preparation-policy.totalMs-too-large')
  return Object.freeze({ ...network, totalMs, maxCalls })
}

function slotId(dispatch: string): string {
  const h = digest(dispatch)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}

function parseIntent(
  value: unknown,
  generation: number,
  dispatch: Binding['dispatch'],
  installations: ReadonlyMap<string, FactsDeployment>,
  previous: Intent | null,
): Intent {
  const v = fields(
    value,
    ['schemaVersion', 'generation', 'binding', 'input', 'predecessor'],
    'facts intent',
  )
  if (v.schemaVersion !== 1 || v.generation !== generation)
    throw new InputError('facts-preparation-intent-version')
  const savedBinding = fields(
    v.binding,
    ['installationDigest', 'deployment', 'dispatch'],
    'facts binding',
  )
  const installationDigest = hash256(savedBinding.installationDigest, 'installationDigest')
  const deployment = installations.get(installationDigest)
  if (deployment === undefined) throw new InputError('facts-preparation-operation-conflict')
  const binding: Binding = { installationDigest, deployment, dispatch }
  same(savedBinding, binding, 'facts-preparation-operation-conflict')
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

function adoptedInstallations(ports: PreparationPorts) {
  const workflows = new Set<string>()
  for (const workflow of [ports.deployment.workflow, ...ports.historicalWorkflows]) {
    const key = canonical(workflow)
    if (workflows.has(key)) throw new InputError('facts-preparation-workflow-duplicated')
    workflows.add(key)
  }
  const installations = new Map<string, FactsDeployment>()
  for (const installation of [ports, ...ports.priorInstallations]) {
    const { installationDigest, deployment } = installation
    hash256(installationDigest, 'installationDigest')
    const { workflow, ...identity } = deployment
    const { workflow: _currentWorkflow, ...currentIdentity } = ports.deployment
    same(identity, currentIdentity, 'facts-preparation-installation-identity-conflict')
    if (!workflows.has(canonical(workflow)))
      throw new InputError('facts-preparation-installation-workflow-unreadable')
    const existing = installations.get(installationDigest)
    if (existing !== undefined)
      same(existing, deployment, 'facts-preparation-installation-digest-conflict')
    installations.set(installationDigest, deployment)
  }
  return installations
}

function journalGenerations(directory: string): number[] {
  const intents = new Set<number>(),
    runs = new Set<number>()
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const match = /^(intent|run)-([1-9]\d*)\.json$/.exec(entry.name)
    if (!entry.isFile() || match === null) throw new InputError('facts-preparation-journal-entry')
    const generation = Number(match[2])
    if (!Number.isSafeInteger(generation) || generation > 1000)
      throw new InputError('facts-preparation-generation-limit')
    const records = match[1] === 'intent' ? intents : runs
    records.add(generation)
  }
  const generations = [...intents].sort((a, b) => a - b)
  if (generations.some((generation, index) => generation !== index + 1))
    throw new InputError('facts-preparation-generation-gap')
  if ([...runs].some(generation => !intents.has(generation)))
    throw new InputError('facts-preparation-orphan-run')
  return generations
}

function readRunReceipt(journal: ReturnType<typeof operationJournal>, intent: Intent) {
  const saved = journal.read(`run-${intent.generation}.json`)
  if (saved === undefined) return undefined
  const record = fields(saved, ['input', 'runId'], 'facts run receipt')
  same(record.input, intent.input, 'facts-preparation-receipt-conflict')
  return integer(record.runId, 'runId')
}

/** Bootstrap fixes installation and storage. Callers supply only the dispatch and explicit retry choice. */
export function createFactsPreparation(
  ports: PreparationPorts,
  options?: Partial<FactsPreparationPolicy>,
) {
  const policy = parseFactsPreparationPolicy(options)
  const readPolicy = { networkMs: policy.networkMs }
  const installations = adoptedInstallations(ports)
  const readerDeployment: FactsReadDeployment = {
    ...ports.deployment,
    workflows: [ports.deployment.workflow, ...ports.historicalWorkflows],
  }
  const assertActive = () => {
    try {
      ports.assertActive()
    } catch (error) {
      throw new InputError(
        error instanceof Error ? error.message : 'facts-preparation-producer-inactive',
      )
    }
  }
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
      deadline = now() + policy.totalMs
    let calls = 0
    const call: GhCommand = (args, timeout) => {
      const remaining = deadline - now()
      if (++calls > policy.maxCalls || remaining <= 0)
        throw new InputError('facts-preparation-observation-budget')
      return ports.call(args, Math.min(timeout, remaining))
    }
    const get = (path: string) =>
      call(['api', '--method', 'GET', ...REST_HEADERS, path], policy.networkMs)
    try {
      assertActive()
      let published: PublishedFacts | null = null
      let snapshot: PublishedFactsMissing['dispatch']
      try {
        published = readPublishedDeliveryFacts(readerDeployment, dispatch, call, readPolicy)
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
      assertActive()
      const journal = operationJournal(ports.journalRoot, slotId(dispatch))
      let intent: Intent | null = null
      let previousRunId: number | undefined
      const nonces = new Set<string>()
      for (const next of journalGenerations(journal.directory)) {
        const saved = journal.read(`intent-${next}.json`)
        intent = parseIntent(saved, next, snapshot, installations, intent)
        if (previousRunId !== undefined && intent.predecessor?.run.id !== previousRunId)
          throw new InputError('facts-preparation-predecessor-receipt-conflict')
        previousRunId = readRunReceipt(journal, intent)
        if (nonces.has(intent.input.nonce)) throw new InputError('facts-preparation-nonce-reused')
        nonces.add(intent.input.nonce)
      }
      if (intent === null && published !== null) return { status: 'ready', facts: published }

      const observe = (item: Intent): PreparedFactsRun | null => {
        const runId = readRunReceipt(journal, item)
        if (runId !== undefined) {
          return readPreparedFactsRun(item.binding.deployment, item.input, runId, call, readPolicy)
        }
        return findPreparedFactsRun(item.binding.deployment, item.input, call, readPolicy)
      }
      if (intent !== null) {
        generation = intent.generation
        observed = observe(intent)
        if (observed === null) return unknown('facts-preparation-dispatch-unresolved-no-repost')
        if (observed.status !== 'completed') return { status: 'pending', generation, run: observed }
        if (observed.conclusion === 'success') {
          const facts = readPublishedDeliveryFacts(readerDeployment, dispatch, call, readPolicy)
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
        readPublishedDeliveryFacts(readerDeployment, dispatch, call, readPolicy)
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
      if ((previous?.generation ?? 0) >= 1000)
        throw new InputError('facts-preparation-generation-limit')
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
        snapshot,
        installations,
        previous,
      )
      generation = intent.generation
      assertActive()
      journal.save(`intent-${generation}.json`, intent)
      assertActive()
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
            policy.networkMs,
          ),
          ports.deployment.repository,
        )
      } catch {
        return unknown('facts-preparation-dispatch-response-unknown-no-repost')
      }
      assertActive()
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
      const facts = readPublishedDeliveryFacts(readerDeployment, dispatch, call, readPolicy)
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
