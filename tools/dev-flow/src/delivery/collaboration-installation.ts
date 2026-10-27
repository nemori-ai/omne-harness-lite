import { randomUUID } from 'node:crypto'
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import type { PolicySource } from '../integration/context.ts'
import { clean, repository } from '../integration/git.ts'
import {
  array,
  canonical,
  digest,
  fields,
  integer,
  literal,
  object,
  same,
  string,
} from '../integration/parse.ts'
import { POLICY_PATH } from '../integration/policy.ts'
import type { FactsDeployment } from '../integration/published-delivery-facts.ts'
import { ACCEPTANCE_SOURCES_PATH, parseAccountIdentity } from './collaboration-acceptance-source.ts'
import { collaborationJson } from './collaboration-json.ts'
import type { Evidence } from './collaboration-records.ts'
import { evidenceList, fullSha, hash256, nonempty } from './collaboration-values.ts'
import { InputError } from './protocol.ts'

const INSTALLATION_FILE = 'omne-collaboration-installation.json'
type PublishedInstallationFacts = {
  kind: 'published'
  workflow: FactsDeployment['workflow']
  bot: FactsDeployment['bot']
}
export type CollaborationInstallation = {
  repository: string
  toolCommit: string
  policySource: PolicySource
  acceptanceSource: PolicySource
  basis: [Evidence, ...Evidence[]]
} & (
  | { schemaVersion: 1 | 2; facts: { kind: 'direct' } }
  | { schemaVersion: 1; facts: PublishedInstallationFacts }
  | {
      schemaVersion: 2
      facts: PublishedInstallationFacts & { historicalWorkflows: FactsDeployment['workflow'][] }
    }
)

function parseWorkflow(value: unknown): FactsDeployment['workflow'] {
  const v = fields(value, ['id', 'path', 'ref', 'head'], 'facts.workflow')
  return {
    id: integer(v.id, 'facts.workflow.id'),
    path: literal(v.path, '.github/workflows/delivery-facts.yml', 'facts.workflow.path'),
    ref: literal(v.ref, 'github-gate', 'facts.workflow.ref'),
    head: fullSha(v.head, 'facts.workflow.head'),
  }
}

function source(value: unknown, path: string): PolicySource {
  const v = fields(value, ['commit', 'path', 'blob', 'digest'], 'installation source')
  return {
    commit: fullSha(v.commit, 'source.commit'),
    path: literal(v.path, path, 'source.path'),
    blob: fullSha(v.blob, 'source.blob'),
    digest: hash256(v.digest, 'source.digest'),
  }
}

export function parseCollaborationInstallation(value: unknown): CollaborationInstallation {
  const v = fields(
    value,
    [
      'schemaVersion',
      'repository',
      'toolCommit',
      'policySource',
      'acceptanceSource',
      'basis',
      'facts',
    ],
    'installation',
  )
  const repo = string(v.repository, 'installation.repository')
  if (!/^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*$/.test(repo))
    throw new InputError('collaboration-installation-repository')
  const schemaVersion =
    v.schemaVersion === 2 ? 2 : literal(v.schemaVersion, 1, 'installation.schemaVersion')
  const common = {
    repository: repo,
    toolCommit: fullSha(v.toolCommit, 'installation.toolCommit'),
    policySource: source(v.policySource, POLICY_PATH),
    acceptanceSource: source(v.acceptanceSource, ACCEPTANCE_SOURCES_PATH),
    basis: nonempty(evidenceList(v.basis), 'installation.basis'),
  }
  const mode = object(v.facts, 'installation.facts')
  if (mode.kind === 'direct') {
    fields(mode, ['kind'], 'installation.facts')
    return { ...common, schemaVersion, facts: { kind: 'direct' } }
  }
  fields(
    mode,
    schemaVersion === 1
      ? ['kind', 'workflow', 'bot']
      : ['kind', 'workflow', 'bot', 'historicalWorkflows'],
    'installation.facts',
  )
  const facts: PublishedInstallationFacts = {
    kind: literal(mode.kind, 'published', 'installation.facts.kind'),
    workflow: parseWorkflow(mode.workflow),
    bot: parseAccountIdentity(mode.bot),
  }
  if (schemaVersion === 1) return { ...common, schemaVersion, facts }
  const historicalWorkflows = array(mode.historicalWorkflows, 'facts.historicalWorkflows').map(
    parseWorkflow,
  )
  const keys = [facts.workflow, ...historicalWorkflows].map(canonical)
  if (new Set(keys).size !== keys.length)
    throw new InputError('collaboration-installation-workflow-duplicated')
  return { ...common, schemaVersion, facts: { ...facts, historicalWorkflows } }
}

function descriptor(text: string, expectedDigest: string): CollaborationInstallation {
  if (digest(text) !== hash256(expectedDigest, 'installation.sha256'))
    throw new InputError('collaboration-installation-digest-mismatch')
  return parseCollaborationInstallation(collaborationJson(text))
}

function installationPath(root: string): string {
  return join(repository(root).gitDir, INSTALLATION_FILE)
}

function requireToolCommit(root: string, installation: CollaborationInstallation): void {
  if (clean(root).head !== installation.toolCommit)
    throw new InputError('collaboration-installation-tool-commit-mismatch')
}

function syncDirectory(path: string): void {
  const directory = openSync(path, 'r')
  try {
    fsyncSync(directory)
  } finally {
    closeSync(directory)
  }
}

/** Explicit operator adoption. Ordinary commands only read the installation. */
export function installCollaboration(
  root: string,
  text: string,
  expectedDigest: string,
): CollaborationInstallation {
  const installation = descriptor(text, expectedDigest)
  requireToolCommit(root, installation)
  const target = installationPath(root)
  const record = JSON.stringify({ descriptor: text, sha256: expectedDigest }) + '\n'
  if (existsSync(target)) {
    same(readFileSync(target, 'utf8'), record, 'collaboration-installation-already-adopted')
    syncDirectory(dirname(target))
    return readCollaborationInstallation(root, installation.repository)
  }
  const temporary = `${target}.${randomUUID()}.tmp`
  const file = openSync(temporary, 'wx', 0o600)
  try {
    try {
      writeFileSync(file, record)
      fsyncSync(file)
    } finally {
      closeSync(file)
    }
    try {
      linkSync(temporary, target)
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error
      same(readFileSync(target, 'utf8'), record, 'collaboration-installation-already-adopted')
    }
    syncDirectory(dirname(target))
  } finally {
    rmSync(temporary)
  }
  return readCollaborationInstallation(root, installation.repository)
}

export function readCollaborationInstallation(
  root: string,
  repo: string,
): CollaborationInstallation {
  const path = installationPath(root)
  if (!existsSync(path)) throw new InputError('collaboration-installation-required')
  const record = fields(
    collaborationJson(readFileSync(path, 'utf8')),
    ['descriptor', 'sha256'],
    'installation record',
  )
  const installation = descriptor(
    string(record.descriptor, 'installation.descriptor'),
    string(record.sha256, 'installation.sha256'),
  )
  if (installation.repository !== repo)
    throw new InputError('collaboration-installation-repository-mismatch')
  requireToolCommit(root, installation)
  return installation
}
