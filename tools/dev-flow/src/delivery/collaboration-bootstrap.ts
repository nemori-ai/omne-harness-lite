import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonical, digest, fields, object, same, string } from '../integration/parse.ts'
import { parsePolicy } from '../integration/policy.ts'
import type { PolicySource } from '../integration/context.ts'
import { repository } from '../integration/git.ts'
import {
  createFactsPreparation,
  parseFactsPreparationPolicy,
  type FactsPreparationPolicy,
} from '../integration/prepare-delivery-facts.ts'
import { readAcceptanceSourcesRest } from './collaboration-acceptance-source.ts'
import { publishedAuthorityReaders } from './collaboration-facts.ts'
import {
  readCollaborationInstallation,
  readCollaborationInstallationRecord,
  parseCollaborationInstallationRecord,
  type CollaborationInstallation,
} from './collaboration-installation.ts'
import {
  initializeProducer,
  transferProducer,
  readProducerState,
  type ProducerInstallation,
} from './collaboration-producer-state.ts'
import type { FactsDeployment } from '../integration/published-delivery-facts.ts'
import { collaborationJson } from './collaboration-json.ts'
import { REST_HEADERS, runGhRead, type GhRead } from './github-read.ts'
import { githubRequestEvidence } from './integration-request-evidence.ts'
import type { RequestBootstrap } from './integration-request.ts'
import { InputError, parseConfig } from './protocol.ts'
import type { ReduceWatchPorts } from './reduce-watch-materials.ts'

/** A source checkout is the supported executable artifact for this installation contract. */
export function collaborationToolRoot(): string {
  const directory = dirname(fileURLToPath(import.meta.url))
  if (!directory.endsWith('/tools/dev-flow/src/delivery'))
    throw new InputError('collaboration-installation-source-runtime-required')
  return resolve(directory, '../../../..')
}

function readFile(repo: string, commit: string, path: string, read: GhRead) {
  const value = object(
    read(
      [
        'api',
        '--method',
        'GET',
        ...REST_HEADERS,
        `repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${commit}`,
      ],
      15_000,
    ),
    'installed source',
  )
  if (value.type !== 'file' || value.path !== path || value.encoding !== 'base64')
    throw new InputError('collaboration-installation-source-invalid')
  const text = new TextDecoder('utf-8', { fatal: true }).decode(
    Buffer.from(string(value.content, 'source.content'), 'base64'),
  )
  return { text, blob: string(value.sha, 'source.sha') }
}

function readPolicy(repo: string, source: PolicySource, read: GhRead) {
  const file = readFile(repo, source.commit, source.path, read)
  if (file.blob !== source.blob || digest(file.text) !== source.digest)
    throw new InputError('collaboration-installation-policy-changed')
  return parsePolicy(collaborationJson(file.text))
}

function configuration(installation: CollaborationInstallation, read: GhRead) {
  const policy = readPolicy(installation.repository, installation.policySource, read)
  same(policy.repository, installation.repository, 'collaboration-installation-policy-repository')
  const config = parseConfig(
    collaborationJson(
      readFile(
        installation.repository,
        installation.policySource.commit,
        policy.deliveryConfig,
        read,
      ).text,
    ),
  )
  if (
    !config.enabled ||
    config.repository !== installation.repository ||
    config.project.id === null ||
    config.writers.stage === null ||
    config.writers.body === null
  )
    throw new InputError('collaboration-installation-delivery-config')
  return { policy, projectId: config.project.id }
}

function proof(record: ProducerInstallation['record'], read: GhRead): ProducerInstallation {
  const { installation } = parseCollaborationInstallationRecord(record)
  if (installation.facts.kind !== 'published')
    throw new InputError('producer-published-installation-required')
  const { projectId } = configuration(installation, read)
  return {
    record,
    installationDigest: digest(canonical(installation)),
    deployment: {
      repository: installation.repository,
      projectId,
      workflow: installation.facts.workflow,
      bot: installation.facts.bot,
    },
  }
}

function producerPorts(
  root: string,
  current: ProducerInstallation,
  historicalWorkflows: readonly FactsDeployment['workflow'][],
  read: GhRead,
) {
  const allowed = new Set([current.deployment.workflow, ...historicalWorkflows].map(canonical))
  const cache = new Map([[current.record.sha256, current]])
  const resolveInstallation = (value: unknown) => {
    const { record } = parseCollaborationInstallationRecord(value)
    const resolved = cache.get(record.sha256) ?? proof(record, read)
    same(resolved.record, record, 'producer-record-conflict')
    const { repository: repo, projectId, bot, workflow } = resolved.deployment
    same(
      { repository: repo, projectId, bot },
      {
        repository: current.deployment.repository,
        projectId: current.deployment.projectId,
        bot: current.deployment.bot,
      },
      'producer-identity-migration-unsupported',
    )
    if (!allowed.has(canonical(workflow)))
      throw new InputError('producer-historical-workflow-not-adopted')
    cache.set(record.sha256, resolved)
    return resolved
  }
  return {
    gitDir: repository(root).gitDir,
    current,
    resolveInstallation,
    assertCurrent: () =>
      same(
        readCollaborationInstallationRecord(root).record,
        current.record,
        'producer-installed-record-changed',
      ),
  }
}

export function adoptCollaborationProducer(
  root: string,
  mode: { kind: 'initial' } | { kind: 'transfer'; fromRoot: string },
  read: GhRead = runGhRead,
) {
  const { record, installation } = readCollaborationInstallationRecord(root)
  const current = proof(record, read)
  const historicalWorkflows =
    installation.schemaVersion !== 1 && installation.facts.kind === 'published'
      ? installation.facts.historicalWorkflows
      : []
  const ports = producerPorts(root, current, historicalWorkflows, read)
  if (mode.kind === 'initial') initializeProducer(ports)
  else {
    const source = readCollaborationInstallationRecord(mode.fromRoot)
    const predecessor = ports.resolveInstallation(source.record)
    transferProducer({
      ...ports,
      fromGitDir: repository(mode.fromRoot).gitDir,
      predecessor,
      assertSource: () =>
        same(
          readCollaborationInstallationRecord(mode.fromRoot).record,
          source.record,
          'producer-source-installation-changed',
        ),
    })
  }
  const state = readProducerState(ports)
  if (state === undefined) throw new InputError('producer-activation-missing')
  return { installationDigest: current.installationDigest, journalRoot: state.journalRoot }
}

export type CollaborationOptions = Readonly<{ factsPreparation?: Partial<FactsPreparationPolicy> }>

export function openCollaborationInstallation(
  root: string,
  repo: string,
  transport: GhRead,
  options: CollaborationOptions = {},
) {
  const input = fields(options, ['factsPreparation'], 'collaboration-options')
  if ('factsPreparation' in input && input.factsPreparation === undefined)
    throw new InputError('collaboration-options.factsPreparation-required')
  const factsPolicy = parseFactsPreparationPolicy(input.factsPreparation)
  const { record, installation } = readCollaborationInstallationRecord(root)
  same(installation.repository, repo, 'collaboration-installation-repository-mismatch')
  const read: GhRead = (argv, timeout) => {
    if (
      argv[0] !== 'api' ||
      argv[argv.indexOf('--method') + 1] !== 'GET' ||
      argv.includes('graphql')
    )
      throw new InputError('collaboration-installation-read-only')
    return transport(argv, timeout)
  }
  const { policy, projectId } = configuration(installation, read)
  const sources = readAcceptanceSourcesRest(repo, installation.acceptanceSource, read)
  const readers: Pick<ReduceWatchPorts, 'authorityFor'> & {
    taskFactsFor: ReduceWatchPorts['taskFactsFor']
  } =
    installation.facts.kind === 'published'
      ? publishedAuthorityReaders(
          policy,
          {
            repository: repo,
            projectId,
            workflows: [
              installation.facts.workflow,
              ...(installation.schemaVersion !== 1 ? installation.facts.historicalWorkflows : []),
            ],
            bot: installation.facts.bot,
          },
          read,
        )
      : { authorityFor: (_issue: number) => ({ policy }), taskFactsFor: undefined }
  const request: RequestBootstrap = {
    policy,
    ...(readers.taskFactsFor === undefined
      ? {}
      : {
          factsFor: readers.taskFactsFor,
          taskAuthority: readers.taskFactsFor,
        }),
  }
  const evidence = githubRequestEvidence(read)
  const watch: ReduceWatchPorts = {
    read,
    sources,
    authorityFor: readers.authorityFor,
    ...(readers.taskFactsFor === undefined ? {} : { taskFactsFor: readers.taskFactsFor }),
    readEvidence: item => evidence(repo, item),
  }
  same(
    readCollaborationInstallation(root, repo),
    installation,
    'collaboration-installation-changed-during-open',
  )
  let prepareFacts: ReturnType<typeof createFactsPreparation> | undefined
  if (installation.facts.kind === 'published') {
    const current: ProducerInstallation = {
      record,
      installationDigest: digest(canonical(installation)),
      deployment: {
        repository: repo,
        projectId,
        workflow: installation.facts.workflow,
        bot: installation.facts.bot,
      },
    }
    const historicalWorkflows =
      installation.schemaVersion !== 1 ? installation.facts.historicalWorkflows : []
    const state = readProducerState(producerPorts(root, current, historicalWorkflows, read))
    if (state !== undefined)
      prepareFacts = createFactsPreparation(
        {
          deployment: current.deployment,
          installationDigest: current.installationDigest,
          historicalWorkflows,
          priorInstallations: state.priorInstallations,
          assertActive: state.assertActive,
          journalRoot: state.journalRoot,
          call: transport,
        },
        factsPolicy,
      )
  }

  same(
    readCollaborationInstallationRecord(root).record,
    record,
    'collaboration-installation-record-changed-during-open',
  )
  return { installation, policy, request, watch, authorityFor: readers.authorityFor, prepareFacts }
}

export function deployedCollaboration(repo: string, options?: CollaborationOptions) {
  return openCollaborationInstallation(collaborationToolRoot(), repo, runGhRead, options)
}
