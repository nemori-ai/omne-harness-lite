import { afterEach, describe, expect, it } from 'vitest'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
  existsSync,
  symlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  initializeProducer,
  readProducerState,
  transferProducer,
  type ProducerInstallation,
} from '../src/delivery/collaboration-producer-state.ts'
import { canonical, digest } from '../src/integration/parse.ts'
import { operationJournal } from '../src/delivery/line-state-journal.ts'

const roots: string[] = []
const slot = '11111111-1111-4111-8111-111111111111'
const worker = fileURLToPath(new URL('./fixtures/producer-state-worker.mjs', import.meta.url))
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'producer-continuity-')))
  roots.push(root)
  const proofs: ProducerInstallation[] = ['a', 'b', 'c'].map(id => {
    const descriptor = JSON.stringify({ id })
    return {
      record: { descriptor, sha256: digest(descriptor) },
      installationDigest: id.repeat(64),
      deployment: {
        repository: 'owner/repo',
        projectId: 'P_1',
        bot: { login: 'delivery[bot]', nodeId: 'BOT_1' },
        workflow: {
          id: 12,
          path: '.github/workflows/delivery-facts.yml',
          ref: 'github-gate',
          head: id.repeat(40),
        },
      },
    }
  })
  const paths = ['old', 'next', 'other'].map(name => join(root, name))
  for (const path of paths) mkdirSync(path)
  const resolveInstallation = (record: unknown) => {
    const found = proofs.find(proof => canonical(proof.record) === canonical(record))
    if (found === undefined) throw new Error('unrecognized proof')
    return found
  }
  const ports = (index: number) => ({
    gitDir: paths[index]!,
    current: proofs[index]!,
    resolveInstallation,
    assertCurrent: () => {},
  })
  const intent = {
    schemaVersion: 1,
    generation: 1,
    binding: {
      installationDigest: proofs[0]!.installationDigest,
      deployment: proofs[0]!.deployment,
      dispatch: { url: 'https://github.com/owner/repo/issues/1#issuecomment-2' },
    },
    input: { nonce: '1'.repeat(32) },
    predecessor: null,
  }
  const seed = () =>
    operationJournal(join(paths[0]!, 'omne-facts-preparation'), slot).save('intent-1.json', intent)
  const transfer = (index = 1) =>
    transferProducer({
      ...ports(index),
      fromGitDir: paths[0]!,
      predecessor: proofs[0]!,
      assertSource: () => {},
    })
  writeFileSync(join(root, 'input.json'), JSON.stringify({ proofs, paths }))
  return { root, proofs, paths, ports, intent, seed, transfer }
}
function runWorker(root: string, mode: string, index = 1) {
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--experimental-strip-types', worker, root, mode, String(index)],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let output = ''
    child.stdout.on('data', data => {
      output += data
    })
    child.stderr.on('data', data => {
      output += data
    })
    child.on('error', reject)
    child.on('close', code => resolve({ code, output }))
  })
}

describe('explicit facts producer custody', () => {
  it('requires explicit first custody and repeats it without resetting later journal entries', () => {
    const f = fixture()
    expect(readProducerState(f.ports(0))).toBeUndefined()
    initializeProducer(f.ports(0))
    f.seed()
    initializeProducer(f.ports(0))
    expect(readProducerState(f.ports(0))).toBeDefined()
    expect(
      readFileSync(join(f.paths[0]!, 'omne-facts-preparation', slot, 'intent-1.json'), 'utf8'),
    ).toBe(canonical(f.intent))
  })

  it('refuses initial custody when an old journal already exists', () => {
    const f = fixture()
    f.seed()
    expect(() => initializeProducer(f.ports(0))).toThrow('requires-transfer')
    expect(readProducerState(f.ports(0))).toBeUndefined()
  })

  it('copies all original bytes, retires the previous writer and preserves destination growth on retry', () => {
    const f = fixture()
    initializeProducer(f.ports(0))
    f.seed()
    const old = readProducerState(f.ports(0))!
    f.transfer()
    expect(() => old.assertActive()).toThrow('retired')
    expect(readProducerState(f.ports(0))).toBeUndefined()
    const active = readProducerState(f.ports(1))!
    expect(active.priorInstallations).toEqual([
      { installationDigest: f.proofs[0]!.installationDigest, deployment: f.proofs[0]!.deployment },
    ])
    const original = readFileSync(
      join(f.paths[0]!, 'omne-facts-preparation', slot, 'intent-1.json'),
    )
    expect(readFileSync(join(active.journalRoot, slot, 'intent-1.json'))).toEqual(original)
    operationJournal(active.journalRoot, slot).save('run-1.json', { runId: 202 })
    f.transfer()
    expect(JSON.parse(readFileSync(join(active.journalRoot, slot, 'run-1.json'), 'utf8'))).toEqual({
      runId: 202,
    })
    expect(() => initializeProducer(f.ports(1))).toThrow('initialization-conflict')
  })

  it('imports a legacy producer without an activation record but with its exact descriptor proof', () => {
    const f = fixture()
    f.seed()
    f.transfer()
    expect(readProducerState(f.ports(1))?.priorInstallations).toHaveLength(1)
    expect(existsSync(join(f.paths[0]!, 'omne-facts-producer-retired.json'))).toBe(true)
  })

  it('retains all ancestry through another stopped-writer transfer', () => {
    const f = fixture()
    initializeProducer(f.ports(0))
    f.seed()
    f.transfer()
    transferProducer({
      ...f.ports(2),
      fromGitDir: f.paths[1]!,
      predecessor: f.proofs[1]!,
      assertSource: () => {},
    })
    expect(
      readProducerState(f.ports(2))?.priorInstallations.map(p => p.installationDigest),
    ).toEqual([f.proofs[0]!.installationDigest, f.proofs[1]!.installationDigest])
  })

  it.each(['missing-file', 'modified-file', 'changed-activation', 'changed-adoption'])(
    'refuses corrupted imported state: %s',
    defect => {
      const f = fixture()
      f.seed()
      f.transfer()
      const active = readProducerState(f.ports(1))!
      const file = join(active.journalRoot, slot, 'intent-1.json')
      if (defect === 'missing-file') rmSync(file)
      if (defect === 'modified-file') writeFileSync(file, '{}')
      if (defect === 'changed-activation')
        writeFileSync(join(f.paths[1]!, 'omne-facts-producer.json'), '{}')
      if (defect === 'changed-adoption')
        writeFileSync(join(f.paths[1]!, 'omne-facts-adoption.json'), '{}')
      expect(() => active.assertActive()).toThrow()
    },
  )

  it.each([
    'malformed',
    'unrecognized-installation',
    'wrong-deployment',
    'unexpected-file',
    'symlink',
  ])('refuses unsafe source inventory: %s', defect => {
    const f = fixture()
    f.seed()
    const directory = join(f.paths[0]!, 'omne-facts-preparation', slot)
    const path = join(directory, 'intent-1.json')
    if (defect === 'malformed') writeFileSync(path, '{')
    if (defect === 'unrecognized-installation')
      writeFileSync(
        path,
        JSON.stringify({
          ...f.intent,
          binding: { ...f.intent.binding, installationDigest: 'f'.repeat(64) },
        }),
      )
    if (defect === 'wrong-deployment')
      writeFileSync(
        path,
        JSON.stringify({
          ...f.intent,
          binding: { ...f.intent.binding, deployment: f.proofs[1]!.deployment },
        }),
      )
    if (defect === 'unexpected-file') writeFileSync(join(directory, 'unknown.json'), '{}')
    if (defect === 'symlink') {
      rmSync(path)
      symlinkSync(join(f.root, 'input.json'), path)
    }
    expect(f.transfer).toThrow()
    expect(readProducerState(f.ports(1))).toBeUndefined()
  })

  it('does not activate a different destination after source retirement', () => {
    const f = fixture()
    f.seed()
    f.transfer()
    expect(() => f.transfer(2)).toThrow('already-retired')
    expect(readProducerState(f.ports(2))).toBeUndefined()
  })

  it('refuses transfer from an incomplete producer adoption', () => {
    const f = fixture()
    initializeProducer(f.ports(0))
    f.seed()
    rmSync(join(f.paths[0]!, 'omne-facts-adoption.json'))
    expect(f.transfer).toThrow()
    expect(readProducerState(f.ports(1))).toBeUndefined()
  })

  it('refuses a transfer retry when the original retirement record was removed', () => {
    const f = fixture()
    f.seed()
    f.transfer()
    rmSync(join(f.paths[0]!, 'omne-facts-producer-retired.json'))
    expect(f.transfer).toThrow()
  })

  it('detects source journal growth during copying before retirement or activation', () => {
    const f = fixture()
    f.seed()
    let checks = 0
    expect(() =>
      transferProducer({
        ...f.ports(1),
        fromGitDir: f.paths[0]!,
        predecessor: f.proofs[0]!,
        assertSource: () => {
          if (++checks === 2)
            operationJournal(join(f.paths[0]!, 'omne-facts-preparation'), slot).save('run-1.json', {
              runId: 202,
            })
        },
      }),
    ).toThrow('source-journal-changed')
    expect(existsSync(join(f.paths[0]!, 'omne-facts-producer-retired.json'))).toBe(false)
    expect(readProducerState(f.ports(1))).toBeUndefined()
  })

  it('keeps a staged transfer from being activated as an initial producer', async () => {
    const f = fixture()
    f.seed()
    expect((await runWorker(f.root, 'copy-crash')).code).toBe(23)
    expect(() => initializeProducer(f.ports(1))).toThrow()
    expect(readProducerState(f.ports(1))).toBeUndefined()
    f.transfer()
    expect(readProducerState(f.ports(1))).toBeDefined()
  })

  it.each(['copy-crash', 'copy-directory-crash', 'retire-crash', 'activate-crash'])(
    'resumes the same transfer after %s',
    async mode => {
      const f = fixture()
      f.seed()
      const crashed = await runWorker(f.root, mode)
      expect(crashed.code, crashed.output).toBe(23)
      f.transfer()
      expect(readProducerState(f.ports(1))?.priorInstallations).toHaveLength(1)
      expect(readProducerState(f.ports(0))).toBeUndefined()
    },
  )

  it('allows only one destination when two transfer processes race', async () => {
    const f = fixture()
    f.seed()
    const outcomes = await Promise.all([
      runWorker(f.root, 'normal', 1),
      runWorker(f.root, 'normal', 2),
    ])
    expect(outcomes.map(item => item.code).sort()).toEqual([0, 2])
    expect(
      [readProducerState(f.ports(1)), readProducerState(f.ports(2))].filter(Boolean),
    ).toHaveLength(1)
  })

  it('converges concurrent identical transfers without resetting state', async () => {
    const f = fixture()
    f.seed()
    const outcomes = await Promise.all([runWorker(f.root, 'normal'), runWorker(f.root, 'normal')])
    expect(
      outcomes.map(item => item.code),
      JSON.stringify(outcomes),
    ).toEqual([0, 0])
    expect(readProducerState(f.ports(1))?.priorInstallations).toHaveLength(1)
  })
})
