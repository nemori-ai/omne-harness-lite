import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  symlinkSync,
  readdirSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { git } from '../src/integration/git.ts'
import { loadIntegration } from '../src/integration/context.ts'
import { baselines } from '../src/core/task-context.ts'
import { readTaskBinding, parseTaskBinding } from '../src/delivery/binding.ts'
import { newOperation } from '../src/integration/records.ts'
import { parseDescriptor } from '../src/integration/policy.ts'

const roots: string[] = []
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'omne-integration-'))
  roots.push(root)
  git(root, ['init'])
  git(root, ['symbolic-ref', 'HEAD', 'refs/heads/main'])
  const name = git(process.cwd(), ['config', 'user.name']),
    email = git(process.cwd(), ['config', 'user.email'])
  git(root, ['config', 'user.name', name])
  git(root, ['config', 'user.email', email])
  writeFileSync(join(root, '.gitignore'), 'tmp/\n')
  git(root, ['add', '.'])
  git(root, ['commit', '-m', 'Initial fixture'])
  return root
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
describe('integration construction and binding', () => {
  it('keeps uncommitted construction pending without requiring context or a remote', () => {
    const root = fixture()
    mkdirSync(join(root, 'docs/engineering'), { recursive: true })
    writeFileSync(
      join(root, 'docs/engineering/integration-bootstrap.json'),
      'candidate bytes do not select policy',
    )
    expect(loadIntegration(root)).toMatchObject({
      kind: 'pending',
      reason: 'descriptor-not-committed',
    })
    expect(baselines(root, 'main')).toMatchObject({
      state: 'pending',
      targetBase: 'main',
      audits: [],
    })
  })
  it('keeps adoption unknown in a new clone while checks fall back to the explicit base', () => {
    const root = fixture()
    mkdirSync(join(root, 'docs/engineering'), { recursive: true })
    const source = readFileSync(
      new URL('../../../docs/engineering/integration-bootstrap.json', import.meta.url),
      'utf8',
    )
    writeFileSync(join(root, 'docs/engineering/integration-bootstrap.json'), source)
    git(root, ['add', '.'])
    git(root, ['commit', '-m', 'Committed descriptor'])
    expect(loadIntegration(root)).toMatchObject({ kind: 'unknown' })
    expect(baselines(root, 'main')).toMatchObject({
      state: 'pending',
      targetBase: 'main',
      audits: [],
    })
    rmSync(join(root, 'docs/engineering/integration-bootstrap.json'))
    expect(loadIntegration(root)).toMatchObject({ kind: 'unknown' })
  })
  it('does not let an adopted latch fall back when its descriptor disappears', () => {
    const root = fixture()
    git(root, ['config', '--local', 'omne.integrationAdopted', 'true'])
    expect(loadIntegration(root)).toMatchObject({ kind: 'unknown' })
  })
  it('rejects an operation output alias before writing any formal bytes', () => {
    const root = fixture()
    mkdirSync(join(root, 'tmp'))
    mkdirSync(join(root, 'formal'))
    symlinkSync(join(root, 'formal'), join(root, 'tmp/integration'))
    expect(() => newOperation(root)).toThrow('alias')
    expect(readdirSync(join(root, 'formal'))).toEqual([])
  })
  it('rejects ambiguous, unbound and old task identities', () => {
    const issue = {
      repository: 'owner/repo',
      id: 'I_1',
      url: 'https://github.com/owner/repo/issues/1',
      number: 1,
    }
    const binding = {
      schemaVersion: 1,
      issue,
      revision: 2,
      attempt: 'attempt-1',
      responsible: 'human',
      branch: 'human/task',
      route: { kind: 'track', track: 'runtime' },
      completionTarget: 'main',
      taskBase: 'a'.repeat(40),
      writeScope: ['src'],
      dispatch: `${issue.url}#issuecomment-1`,
      conditions: [],
      authorization: [],
    }
    const block = `\`\`\`json omne-integration-binding:v1\n${JSON.stringify(binding)}\n\`\`\``
    expect(readTaskBinding(`- 交付修订: 2\n${block}`, issue)).toEqual(binding)
    expect(() => readTaskBinding(`- 交付修订: 2\n${block}\n${block}`, issue)).toThrow('Duplicate')
    expect(() => readTaskBinding(`- 交付修订: 1\n${block}`, issue)).toThrow('revision')
    expect(() => readTaskBinding(`- 交付修订: 2\n${block}`, { ...issue, id: 'I_2' })).toThrow(
      'identity',
    )
    expect(() => parseTaskBinding({ ...binding, extra: true })).toThrow('unknown fields')
    expect(() => parseTaskBinding({ ...binding, branch: 'integration/runtime' })).toThrow(
      'human prefix',
    )
    expect(() => parseDescriptor({ schemaVersion: 1 })).toThrow()
  })
})
