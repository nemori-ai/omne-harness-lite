import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  fstatSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import type { FactsDeployment } from '../integration/published-delivery-facts.ts'
import {
  array,
  canonical,
  digest,
  fields,
  literal,
  object,
  same,
  string,
} from '../integration/parse.ts'
import { collaborationJson } from './collaboration-json.ts'
import { hash256, uuid } from './collaboration-values.ts'
import { InputError } from './protocol.ts'

export type ProducerInstallation = {
  record: { descriptor: string; sha256: string }
  installationDigest: string
  deployment: FactsDeployment
}
type FileEntry = { path: string; sha256: string }
type Inventory = { directories: string[]; files: FileEntry[] }
type Activation = {
  schemaVersion: 1
  installationDigest: string
  installations: ProducerInstallation['record'][]
  imported: Inventory
  predecessor: { gitDir: string; installationDigest: string } | null
}
type Ports = {
  gitDir: string
  current: ProducerInstallation
  resolveInstallation: (record: unknown) => ProducerInstallation
  assertCurrent: () => void
}
const ACTIVE = 'omne-facts-producer.json'
const RETIRED = 'omne-facts-producer-retired.json'
const ADOPTION = 'omne-facts-adoption.json'
const JOURNAL = 'omne-facts-preparation'

function readBytes(path: string): Buffer {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const before = fstatSync(fd)
    if (!before.isFile()) throw new InputError('producer-state-file-required')
    const bytes = readFileSync(fd)
    const after = fstatSync(fd)
    if (
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs
    )
      throw new InputError('producer-state-file-changed')
    return bytes
  } finally {
    closeSync(fd)
  }
}
function readJson(path: string): unknown {
  return collaborationJson(new TextDecoder('utf-8', { fatal: true }).decode(readBytes(path)))
}
function sync(path: string): void {
  const fd = openSync(path, 'r')
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}
function ensureDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 })
  if (!lstatSync(path).isDirectory()) throw new InputError('producer-state-directory-required')
}
function saveBytes(gitDir: string, path: string, bytes: Buffer): void {
  ensureDirectory(dirname(path))
  if (existsSync(path)) {
    same(
      readBytes(path).toString('base64'),
      bytes.toString('base64'),
      'producer-state-existing-conflict',
    )
    sync(path)
  } else {
    const temporary = join(gitDir, `.omne-facts-${randomUUID()}.tmp`)
    const fd = openSync(temporary, 'wx', 0o600)
    try {
      try {
        writeFileSync(fd, bytes)
        fsyncSync(fd)
      } finally {
        closeSync(fd)
      }
      try {
        linkSync(temporary, path)
      } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error
        same(
          readBytes(path).toString('base64'),
          bytes.toString('base64'),
          'producer-state-existing-conflict',
        )
        sync(path)
      }
    } finally {
      rmSync(temporary, { force: true })
    }
  }
  for (let directory = dirname(path); ; directory = dirname(directory)) {
    sync(directory)
    if (directory === gitDir) break
    if (dirname(directory) === directory) throw new InputError('producer-state-path-outside-gitdir')
  }
}
function save(gitDir: string, name: string, value: unknown): void {
  saveBytes(gitDir, join(gitDir, name), Buffer.from(canonical(value)))
}
function inventory(root: string): Inventory {
  if (!existsSync(root)) return { directories: [], files: [] }
  if (!lstatSync(root).isDirectory()) throw new InputError('producer-journal-directory-required')
  const directories = readdirSync(root).sort()
  const files: FileEntry[] = []
  for (const slot of directories) {
    uuid(slot, 'producer.slot')
    const directory = join(root, slot)
    if (!lstatSync(directory).isDirectory())
      throw new InputError('producer-slot-directory-required')
    const names = readdirSync(directory).sort()
    for (const name of names) {
      if (!/^(?:intent|run)-[1-9]\d*\.json$/.test(name))
        throw new InputError('producer-journal-entry-invalid')
      const path = `${slot}/${name}`
      const bytes = readBytes(join(root, path))
      collaborationJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
      files.push({ path, sha256: createHash('sha256').update(bytes).digest('hex') })
    }
  }
  return { directories, files }
}
function parseInventory(value: unknown): Inventory {
  const v = fields(value, ['directories', 'files'], 'producer inventory')
  const directories = array(v.directories, 'producer.directories').map(item =>
    uuid(item, 'producer.slot'),
  )
  const files = array(v.files, 'producer.files').map(item => {
    const entry = fields(item, ['path', 'sha256'], 'producer file')
    const path = string(entry.path, 'producer.path')
    const parts = path.split('/')
    if (
      parts.length !== 2 ||
      !directories.includes(parts[0] ?? '') ||
      !/^(?:intent|run)-[1-9]\d*\.json$/.test(parts[1] ?? '')
    )
      throw new InputError('producer-inventory-path')
    return { path, sha256: hash256(entry.sha256, 'producer.sha256') }
  })
  if (
    new Set(directories).size !== directories.length ||
    new Set(files.map(item => item.path)).size !== files.length
  )
    throw new InputError('producer-inventory-duplicate')
  return { directories, files }
}
function parseActivation(value: unknown, resolveInstallation: Ports['resolveInstallation']) {
  const v = fields(
    value,
    ['schemaVersion', 'installationDigest', 'installations', 'imported', 'predecessor'],
    'producer activation',
  )
  literal(v.schemaVersion, 1, 'producer.schemaVersion')
  const proofs = array(v.installations, 'producer.installations').map(resolveInstallation)
  if (!proofs.length || new Set(proofs.map(item => item.installationDigest)).size !== proofs.length)
    throw new InputError('producer-installations-invalid')
  const installationDigest = hash256(v.installationDigest, 'producer.installationDigest')
  if (!proofs.some(item => item.installationDigest === installationDigest))
    throw new InputError('producer-current-installation-missing')
  const imported = parseInventory(v.imported)
  let predecessor: Activation['predecessor'] = null
  if (v.predecessor !== null) {
    const p = fields(v.predecessor, ['gitDir', 'installationDigest'], 'producer predecessor')
    predecessor = {
      gitDir: string(p.gitDir, 'producer.gitDir'),
      installationDigest: hash256(p.installationDigest, 'producer.installationDigest'),
    }
  }
  const activation: Activation = {
    schemaVersion: 1,
    installationDigest,
    installations: proofs.map(item => item.record),
    imported,
    predecessor,
  }
  return { activation, proofs }
}
function verifyImported(root: string, expected: Inventory): void {
  const actual = inventory(root)
  for (const directory of expected.directories)
    if (!actual.directories.includes(directory))
      throw new InputError('producer-import-directory-missing')
  for (const file of expected.files) {
    const found = actual.files.find(item => item.path === file.path)
    same(found, file, 'producer-import-file-missing-or-changed')
  }
}

export function readProducerState(ports: Ports) {
  const gitDir = realpathSync(ports.gitDir)
  const path = join(gitDir, ACTIVE)
  if (!existsSync(path) || existsSync(join(gitDir, RETIRED))) return undefined
  const captured = readBytes(path)
  same(
    readBytes(join(gitDir, ADOPTION)).toString('base64'),
    captured.toString('base64'),
    'producer-adoption-conflict',
  )
  sync(path)
  sync(gitDir)
  const { activation, proofs } = parseActivation(
    collaborationJson(new TextDecoder('utf-8', { fatal: true }).decode(captured)),
    ports.resolveInstallation,
  )
  same(
    activation.installationDigest,
    ports.current.installationDigest,
    'producer-installation-conflict',
  )
  const journalRoot = join(gitDir, JOURNAL)
  verifyImported(journalRoot, activation.imported)
  const assertActive = () => {
    ports.assertCurrent()
    if (existsSync(join(gitDir, RETIRED))) throw new InputError('producer-retired')
    same(
      readBytes(path).toString('base64'),
      captured.toString('base64'),
      'producer-activation-changed',
    )
    same(
      readBytes(join(gitDir, ADOPTION)).toString('base64'),
      captured.toString('base64'),
      'producer-adoption-changed',
    )
    verifyImported(journalRoot, activation.imported)
  }
  assertActive()
  return {
    journalRoot,
    priorInstallations: proofs
      .filter(item => item.installationDigest !== ports.current.installationDigest)
      .map(({ installationDigest, deployment }) => ({ installationDigest, deployment })),
    assertActive,
  }
}

export function initializeProducer(ports: Ports): void {
  const gitDir = realpathSync(ports.gitDir)
  ports.assertCurrent()
  if (existsSync(join(gitDir, RETIRED))) throw new InputError('producer-initialization-conflict')
  if (existsSync(join(gitDir, ACTIVE))) {
    const state = readProducerState(ports)
    if (state === undefined) throw new InputError('producer-inactive')
    const previous = parseActivation(
      readJson(join(gitDir, ACTIVE)),
      ports.resolveInstallation,
    ).activation
    if (previous.predecessor !== null) throw new InputError('producer-initialization-conflict')
    sync(join(gitDir, ACTIVE))
    sync(gitDir)
    return
  }
  const imported = inventory(join(gitDir, JOURNAL))
  if (imported.directories.length)
    throw new InputError('producer-existing-journal-requires-transfer')
  const activation: Activation = {
    schemaVersion: 1,
    installationDigest: ports.current.installationDigest,
    installations: [ports.current.record],
    imported,
    predecessor: null,
  }
  save(gitDir, ADOPTION, activation)
  save(gitDir, ACTIVE, activation)
  readProducerState(ports)?.assertActive()
}

export function transferProducer(
  ports: Ports & {
    fromGitDir: string
    predecessor: ProducerInstallation
    assertSource: () => void
  },
): void {
  const gitDir = realpathSync(ports.gitDir),
    from = realpathSync(ports.fromGitDir)
  if (gitDir === from) throw new InputError('producer-transfer-same-directory')
  ports.assertCurrent()
  ports.assertSource()
  if (existsSync(join(gitDir, RETIRED))) throw new InputError('producer-retired')
  if (existsSync(join(gitDir, ACTIVE))) {
    const state = readProducerState(ports)
    if (state === undefined) throw new InputError('producer-inactive')
    const completed = parseActivation(
      readJson(join(gitDir, ACTIVE)),
      ports.resolveInstallation,
    ).activation
    same(
      completed.predecessor,
      { gitDir: from, installationDigest: ports.predecessor.installationDigest },
      'producer-transfer-predecessor-conflict',
    )
    same(
      readJson(join(from, RETIRED)),
      {
        schemaVersion: 1,
        destination: gitDir,
        installationDigest: ports.current.installationDigest,
        transferDigest: digest(canonical(completed)),
      },
      'producer-source-retirement-changed',
    )
    sync(join(from, RETIRED))
    sync(from)
    sync(join(gitDir, ACTIVE))
    sync(gitDir)
    return
  }
  const sourceBytes = existsSync(join(from, ACTIVE)) ? readBytes(join(from, ACTIVE)) : undefined
  const oldActivation =
    sourceBytes !== undefined
      ? parseActivation(
          collaborationJson(new TextDecoder('utf-8', { fatal: true }).decode(sourceBytes)),
          ports.resolveInstallation,
        )
      : undefined
  if (oldActivation !== undefined) {
    same(
      readBytes(join(from, ADOPTION)).toString('base64'),
      sourceBytes?.toString('base64'),
      'producer-source-adoption-conflict',
    )
    same(
      oldActivation.activation.installationDigest,
      ports.predecessor.installationDigest,
      'producer-source-installation-conflict',
    )
    verifyImported(join(from, JOURNAL), oldActivation.activation.imported)
  }
  const proofs = oldActivation?.proofs ?? [ports.predecessor]
  for (const proof of proofs)
    same(ports.resolveInstallation(proof.record), proof, 'producer-source-proof-changed')
  const imported = inventory(join(from, JOURNAL))
  for (const entry of imported.files) {
    if (!entry.path.includes('/intent-')) continue
    const intent = object(readJson(join(from, JOURNAL, entry.path)), 'producer intent')
    const binding = object(intent.binding, 'producer intent binding')
    const proof = proofs.find(item => item.installationDigest === binding.installationDigest)
    if (proof === undefined) throw new InputError('producer-intent-installation-unrecognized')
    same(binding.deployment, proof.deployment, 'producer-intent-deployment-conflict')
  }
  const activation: Activation = {
    schemaVersion: 1,
    installationDigest: ports.current.installationDigest,
    installations: [
      ...proofs.filter(item => item.installationDigest !== ports.current.installationDigest),
      ports.current,
    ].map(item => item.record),
    imported,
    predecessor: { gitDir: from, installationDigest: ports.predecessor.installationDigest },
  }
  const retirement = {
    schemaVersion: 1,
    destination: gitDir,
    installationDigest: ports.current.installationDigest,
    transferDigest: digest(canonical(activation)),
  }
  if (existsSync(join(from, RETIRED)))
    same(readJson(join(from, RETIRED)), retirement, 'producer-source-already-retired')
  save(gitDir, ADOPTION, activation)
  const journalRoot = join(gitDir, JOURNAL)
  const existing = inventory(journalRoot)
  for (const directory of existing.directories)
    if (!imported.directories.includes(directory))
      throw new InputError('producer-transfer-unexpected-slot')
  for (const file of existing.files)
    same(
      imported.files.find(item => item.path === file.path),
      file,
      'producer-transfer-existing-file-conflict',
    )
  for (const directory of imported.directories) {
    ensureDirectory(join(journalRoot, directory))
    sync(join(journalRoot, directory))
  }
  for (const entry of imported.files) {
    const bytes = readBytes(join(from, JOURNAL, entry.path))
    same(
      createHash('sha256').update(bytes).digest('hex'),
      entry.sha256,
      'producer-source-file-changed',
    )
    saveBytes(gitDir, join(journalRoot, entry.path), bytes)
  }
  if (existsSync(journalRoot)) {
    sync(journalRoot)
    sync(gitDir)
  }
  same(inventory(journalRoot), imported, 'producer-transfer-incomplete')
  ports.assertSource()
  ports.assertCurrent()
  if (sourceBytes !== undefined) {
    same(
      readBytes(join(from, ACTIVE)).toString('base64'),
      sourceBytes.toString('base64'),
      'producer-source-activation-changed',
    )
    same(
      readBytes(join(from, ADOPTION)).toString('base64'),
      sourceBytes.toString('base64'),
      'producer-source-adoption-changed',
    )
  } else if (existsSync(join(from, ACTIVE)) || existsSync(join(from, ADOPTION))) {
    throw new InputError('producer-source-activation-changed')
  }
  same(inventory(join(from, JOURNAL)), imported, 'producer-source-journal-changed')
  save(from, RETIRED, retirement)
  save(gitDir, ACTIVE, activation)
  readProducerState(ports)?.assertActive()
}
