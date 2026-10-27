import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseReduceCommand } from '../src/delivery/reduce-command.ts'
import { reduceCli } from '../src/delivery/reduce-cli.ts'
import { parseReduceSupervision } from '../src/delivery/reduce-supervision-input.ts'
import { runInstalledSupervision } from '../src/delivery/reduce-supervision.ts'
import { context, state, release, UUID, evidence } from './fixtures/collaboration.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'reduce-assembly-')))
  roots.push(root)
  const file = join(root, 'events.jsonl')
  writeFileSync(file, '')
  return {
    root,
    input: {
      schemaVersion: 1,
      context,
      owner: 'owner',
      epoch: UUID,
      operationId: UUID,
      journalRoot: root,
      phase: 'SERVE',
      deadline: new Date(Date.now() + 60_000).toISOString(),
      timeoutMs: 1000,
      file,
      runs: [],
      candidates: [],
      local: [],
      release: null,
    },
  }
}

describe('installed reduce command boundaries', () => {
  it('emits one structured failure and a separate diagnostic from the actual CLI', () => {
    const f = fixture()
    const file = join(f.root, 'bad.json')
    writeFileSync(file, '{"schemaVersion":1,"schemaVersion":2}')
    const cli = fileURLToPath(new URL('../src/delivery/reduce-cli.ts', import.meta.url))
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', cli, 'next', '--input', file],
      {
        encoding: 'utf8',
        timeout: 10_000,
      },
    )
    expect(result.status).toBe(2)
    expect(JSON.parse(result.stdout)).toMatchObject({
      schemaVersion: 1,
      operation: 'next',
      status: 'error',
      errorCode: 'reduce-command-failed',
      retryable: false,
      sideEffects: 'unknown',
      evidence: [],
    })
    expect(result.stderr.trim()).not.toBe('')
  })
  it('reads its actual CLI help without contacting GitHub or requiring an installation', () => {
    const cli = fileURLToPath(new URL('../src/delivery/reduce-cli.ts', import.meta.url))
    const output = execFileSync(process.execPath, ['--experimental-strip-types', cli, '--help'], {
      cwd: tmpdir(),
      encoding: 'utf8',
      timeout: 10_000,
    })
    expect(output).toContain('check-release|release|supervise|ack')
    expect(output).toContain('No automatic workflow approval')
  })
  it('keeps readiness checking separate from release and requires original write journals', () => {
    const record = release()
    expect(
      parseReduceCommand('check-release', { schemaVersion: 1, record, readinessEvidence: evidence })
        .kind,
    ).toBe('check-release')
    expect(() =>
      parseReduceCommand('release', { schemaVersion: 1, record, readinessEvidence: evidence }),
    ).toThrow('journalRoot')
    expect(() =>
      parseReduceCommand('claim', {
        schemaVersion: 1,
        record: state(),
        journalRoot: '/tmp/journal',
        checkpoint: '',
      }),
    ).toThrow('reduce-claim-state-required')
  })
  it.each(['path', 'phase', 'target', 'authority'] as const)(
    'rejects incomplete or untrusted supervision input: %s',
    failure => {
      const f = fixture()
      const value =
        failure === 'path'
          ? { ...f.input, file: 'relative.jsonl' }
          : failure === 'phase'
            ? { ...f.input, phase: 'INVENTED' }
            : failure === 'target'
              ? { ...f.input, phase: 'RELEASE_WAVE' }
              : { ...f.input, gateWorkflowHead: 'f'.repeat(40) }
      expect(() => parseReduceSupervision(value)).toThrow()
    },
  )
  it('delivers and persists a real local receiver failure before remote bootstrap can block it', async () => {
    const f = fixture()
    // Missing receiver ownership is an infrastructure fact, never evidence of an idle remote queue.
    const first = await runInstalledSupervision(f.input)
    expect(first.status).toBe('actionable')
    const signal = first.pending.find(item => item.signal.signalKind === 'infrastructure')
    expect(signal).toBeDefined()
    if (signal === undefined) throw new Error('missing infrastructure signal')
    const second = await runInstalledSupervision(f.input)
    expect(second.pending).toEqual(first.pending)
    const file = join(f.root, 'ack.json')
    writeFileSync(
      file,
      JSON.stringify({
        schemaVersion: 1,
        supervision: f.input,
        id: signal.id,
        evidence: 'Owner inspected the missing receiver and will restart it.',
      }),
    )
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    try {
      expect(await reduceCli(['ack', '--input', file])).toBe(0)
    } finally {
      out.mockRestore()
    }
    const ack = JSON.parse(readFileSync(join(f.root, UUID, `handled-${signal.id}.json`), 'utf8'))
    expect(ack.id).toBe(signal.id)
  })
})
