import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonical, digest, object, same, string } from '../integration/parse.ts'
import { parsePolicy } from '../integration/policy.ts'
import type { PolicySource } from '../integration/context.ts'
import { repository } from '../integration/git.ts'
import { createFactsPreparation } from '../integration/prepare-delivery-facts.ts'
import { readAcceptanceSourcesRest } from './collaboration-acceptance-source.ts'
import { publishedAuthorityReaders } from './collaboration-facts.ts'
import { readCollaborationInstallation } from './collaboration-installation.ts'
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

export function openCollaborationInstallation(root: string, repo: string, transport: GhRead) {
  const installation = readCollaborationInstallation(root, repo)
  const read: GhRead = (argv, timeout) => {
    if (
      argv[0] !== 'api' ||
      argv[argv.indexOf('--method') + 1] !== 'GET' ||
      argv.includes('graphql')
    )
      throw new InputError('collaboration-installation-read-only')
    return transport(argv, timeout)
  }
  const policy = readPolicy(repo, installation.policySource, read)
  same(policy.repository, repo, 'collaboration-installation-policy-repository')
  const config = parseConfig(
    collaborationJson(
      readFile(repo, installation.policySource.commit, policy.deliveryConfig, read).text,
    ),
  )
  if (
    !config.enabled ||
    config.repository !== repo ||
    config.project.id === null ||
    config.writers.stage === null ||
    config.writers.body === null
  )
    throw new InputError('collaboration-installation-delivery-config')
  const sources = readAcceptanceSourcesRest(repo, installation.acceptanceSource, read)
  const readers: Pick<ReduceWatchPorts, 'authorityFor'> & {
    taskFactsFor: ReduceWatchPorts['taskFactsFor']
  } =
    installation.facts.kind === 'published'
      ? publishedAuthorityReaders(
          policy,
          {
            repository: repo,
            projectId: config.project.id,
            workflows: [
              installation.facts.workflow,
              ...(installation.schemaVersion === 2 ? installation.facts.historicalWorkflows : []),
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
  const prepareFacts =
    installation.facts.kind === 'published' && installation.schemaVersion === 1
      ? createFactsPreparation({
          deployment: {
            repository: repo,
            projectId: config.project.id,
            workflow: installation.facts.workflow,
            bot: installation.facts.bot,
          },
          installationDigest: digest(canonical(installation)),
          journalRoot: join(repository(root).gitDir, 'omne-facts-preparation'),
          call: transport,
        })
      : undefined
  return { installation, policy, request, watch, authorityFor: readers.authorityFor, prepareFacts }
}

export function deployedCollaboration(repo: string) {
  return openCollaborationInstallation(collaborationToolRoot(), repo, runGhRead)
}
