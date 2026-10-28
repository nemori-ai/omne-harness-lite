import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, realpathSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  fencedShellCommands,
  generateInitialDispatch,
  initialDispatchFields,
  INITIAL_DISPATCH_TEMPLATE,
  parseInitialDispatchInput,
  parseRehearsalEvidence,
  renderInitialDispatch,
  validateInitialDispatch,
  type InitialDispatchInput,
} from '../src/delivery/line-initial-dispatch.ts'

const root = resolve(import.meta.dirname, '../../..')
const template = readFileSync(resolve(root, INITIAL_DISPATCH_TEMPLATE), 'utf8')
const driver = resolve(root, 'tools/dev-flow/src/delivery/line-initial-dispatch-cli.ts')
const directories: string[] = []
afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true })
})
function fixture() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'dispatch-message-')))
  directories.push(dir)
  const fields = Object.fromEntries(
    initialDispatchFields(template).map(name => [name, `Fixture ${name}`]),
  )
  fields.dispatch_revision = '1'
  return {
    dir,
    input: parseInitialDispatchInput({
      schemaVersion: 1,
      milestone: 4,
      line: 'runtime',
      revision: 1,
      fields,
    }),
  }
}

function evidenceFor(input: InitialDispatchInput, skip: string[] = []) {
  const body = renderInitialDispatch(template, input)
  return parseRehearsalEvidence({
    schemaVersion: 1,
    messageSha256: createHash('sha256').update(body).digest('hex'),
    commands: fencedShellCommands(body)
      .filter(command => !skip.includes(command))
      .map(command => ({ command, exitCode: 0, outputSummary: `ran ${command}` })),
  })
}

describe('initial dispatch materialization without implicit authority', () => {
  it('uses only the message and preserves all concrete fields', () => {
    const f = fixture()
    const body = renderInitialDispatch(template, f.input)
    expect(body).not.toContain('这是供 reduce 具体化')
    expect(body).not.toContain('{{')
    expect(body).toContain(f.input.fields.line_name)
    expect(body).toContain('不用普通评论向 reduce 求方案')
  })
  it('asks for onboarding fields and no longer asks for removed collaboration records', () => {
    const names = initialDispatchFields(template)
    for (const name of [
      'milestone_close_condition',
      'line_later_wave_plan',
      'line_work_kind',
      'role_policy_ref',
      'binding_refs',
      'prepare_commands',
      'handoff_post_command',
      'wait_command',
    ])
      expect(names).toContain(name)
    for (const name of [
      'authority_ref',
      'dispatch_record_ref',
      'preflight_recipe',
      'receiver_config_ref_no_secrets',
      'current_reduce_and_watch_recipe',
      'ready_and_failed_submit_recipes',
    ])
      expect(names).not.toContain(name)
    const body = renderInitialDispatch(template, fixture().input)
    expect(body).toContain('`line` 技能')
    expect(body).toContain('references/work-paradigm.md')
    expect(body).toContain('前台阻塞')
    expect(body).toContain('「进度更新」')
    expect(body).toContain('「本波进度」')
    expect(body).toContain('事件接收器的健康状态和自检结果不阻止开工')
  })
  it('places every command field inside a shell code block', () => {
    const f = fixture()
    const commands = fencedShellCommands(renderInitialDispatch(template, f.input))
    for (const name of [
      'prepare_commands',
      'handoff_post_command',
      'wait_command',
      'events_receiver_commands',
    ])
      expect(commands).toContain(f.input.fields[name])
  })
  it('reads fenced shell commands with continuations and skips comments and other fences', () => {
    const markdown = [
      'Inline `rm -rf /` is not a command.',
      '```sh',
      '# 不适用：idle',
      '',
      'node wait-cli.ts comment \\',
      '  --issue 914   --timeout 540',
      'gh issue comment 914 --body-file x.md',
      '```',
      '```markdown',
      'not a command',
      '```',
      '```bash',
      'gh issue comment 914 --body-file x.md',
      '```',
    ].join('\n')
    expect(fencedShellCommands(markdown)).toEqual([
      'node wait-cli.ts comment --issue 914 --timeout 540',
      'gh issue comment 914 --body-file x.md',
    ])
  })
  it('reuses identical bytes but refuses changes under the same revision', () => {
    const f = fixture()
    const generated = generateInitialDispatch(f.dir, template, f.input)
    expect(generated).toMatchObject({ status: 'GENERATED', reused: false })
    expect(generated.path).toBe(join(f.dir, 'tmp/milestone-4/dispatch/runtime-r1.md'))
    expect(generateInitialDispatch(f.dir, template, f.input).reused).toBe(true)
    f.input.fields.line_name = 'Changed line name'
    expect(() => generateInitialDispatch(f.dir, template, f.input)).toThrow('revision-conflict')
    expect(readFileSync(generated.path, 'utf8')).not.toContain('Changed line name')
  })
  it('does not promote a structure check into VALIDATED, opening or forwarding', () => {
    const f = fixture()
    generateInitialDispatch(f.dir, template, f.input)
    const result = validateInitialDispatch(f.dir, template, f.input, evidenceFor(f.input))
    expect(result.status).toBe('STRUCTURE_CHECKED')
    expect(result.rehearsedCommands).toBeGreaterThan(0)
    expect(result.nonZeroExits).toEqual([])
    expect(result.remainingGuards).toHaveLength(4)
    expect(result.next).toContain('Opening, human forwarding and claim readback are separate facts')
  })
  it('rejects modified generated output', () => {
    const f = fixture()
    const result = generateInitialDispatch(f.dir, template, f.input)
    writeFileSync(result.path, 'different message')
    expect(() => validateInitialDispatch(f.dir, template, f.input, evidenceFor(f.input))).toThrow(
      'file-changed',
    )
  })
  it('refuses rehearsal evidence that lacks a command of the message', () => {
    const f = fixture()
    generateInitialDispatch(f.dir, template, f.input)
    const evidence = evidenceFor(f.input, [f.input.fields.wait_command!])
    expect(() => validateInitialDispatch(f.dir, template, f.input, evidence)).toThrow(
      `initial-dispatch-rehearsal-missing: 1 command(s) without evidence: ${f.input.fields.wait_command}`,
    )
  })
  it('refuses rehearsal evidence recorded for another message', () => {
    const f = fixture()
    generateInitialDispatch(f.dir, template, f.input)
    const evidence = { ...evidenceFor(f.input), messageSha256: '0'.repeat(64) }
    expect(() => validateInitialDispatch(f.dir, template, f.input, evidence)).toThrow(
      'rehearsal-message-mismatch',
    )
  })
  it('reports non-zero rehearsal exits for the reduce owner to explain', () => {
    const f = fixture()
    generateInitialDispatch(f.dir, template, f.input)
    const evidence = evidenceFor(f.input)
    const wait = evidence.commands.find(entry => entry.command === f.input.fields.wait_command)!
    wait.exitCode = 3
    const result = validateInitialDispatch(f.dir, template, f.input, evidence)
    expect(result.nonZeroExits).toEqual([{ command: f.input.fields.wait_command, exitCode: 3 }])
  })
  it.each([
    ['no commands array', { schemaVersion: 1, messageSha256: 'a'.repeat(64) }],
    ['short digest', { schemaVersion: 1, messageSha256: 'abc', commands: [] }],
    [
      'missing output summary',
      {
        schemaVersion: 1,
        messageSha256: 'a'.repeat(64),
        commands: [{ command: 'x', exitCode: 0 }],
      },
    ],
    [
      'fractional exit code',
      {
        schemaVersion: 1,
        messageSha256: 'a'.repeat(64),
        commands: [{ command: 'x', exitCode: 0.5, outputSummary: 'ok' }],
      },
    ],
    [
      'unknown field',
      {
        schemaVersion: 1,
        messageSha256: 'a'.repeat(64),
        commands: [{ command: 'x', exitCode: 0, outputSummary: 'ok', stdout: 'raw' }],
      },
    ],
  ])('rejects malformed rehearsal evidence: %s', (_, value) => {
    expect(() => parseRehearsalEvidence(value)).toThrow()
  })
  it.each(['missing', 'extra', 'unresolved', 'revision', 'secret', 'channel'] as const)(
    'rejects %s fields before writing',
    bad => {
      const f = fixture()
      if (bad === 'missing') delete f.input.fields.line_name
      if (bad === 'extra') f.input.fields.unrecognized = 'value'
      if (bad === 'unresolved') f.input.fields.line_name = '{{unfinished}}'
      if (bad === 'revision') f.input.fields.dispatch_revision = '2'
      if (bad === 'secret') f.input.fields.machine_and_host = 'ghp_' + 'x'.repeat(30)
      if (bad === 'channel') f.input.fields.machine_and_host = 'https://smee.io/private-channel'
      expect(() => generateInitialDispatch(f.dir, template, f.input)).toThrow('initial-dispatch-')
    },
  )
  it('rejects traversal line names', () => {
    const f = fixture()
    expect(() => parseInitialDispatchInput({ ...f.input, line: '../../outside' })).toThrow(
      'line-invalid',
    )
  })
  it('runs the actual driver without executing input commands or sending messages', () => {
    const f = fixture()
    const spec = join(f.dir, 'spec.json')
    const evidenceFile = join(f.dir, 'rehearsal.json')
    f.input.fields.prepare_commands = 'echo DO_NOT_EXECUTE >&2'
    writeFileSync(spec, JSON.stringify(f.input))
    const run = (command: string, extra: string[] = []) =>
      JSON.parse(
        execFileSync(
          process.execPath,
          [
            '--experimental-strip-types',
            driver,
            command,
            '--input',
            spec,
            '--root',
            f.dir,
            ...extra,
          ],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
        ),
      )
    expect(run('render').status).toBe('GENERATED')
    const withoutEvidence = spawnSync(
      process.execPath,
      ['--experimental-strip-types', driver, 'validate', '--input', spec, '--root', f.dir],
      { encoding: 'utf8' },
    )
    expect(withoutEvidence.status).toBe(2)
    expect(withoutEvidence.stderr).toContain('initial-dispatch-rehearsal-evidence-required')
    expect(withoutEvidence.stdout).not.toContain('STRUCTURE_CHECKED')
    writeFileSync(evidenceFile, JSON.stringify(evidenceFor(f.input)))
    expect(run('validate', ['--rehearsal-evidence', evidenceFile]).status).toBe('STRUCTURE_CHECKED')
    const invalid = spawnSync(
      process.execPath,
      ['--experimental-strip-types', driver, 'render', '--input', spec, '--input', spec],
      { encoding: 'utf8' },
    )
    expect(invalid.status).toBe(2)
    expect(invalid.stderr).toContain('initial-dispatch-duplicate-option')
    const listed = JSON.parse(
      execFileSync(process.execPath, ['--experimental-strip-types', driver, 'fields'], {
        encoding: 'utf8',
      }),
    )
    expect(listed.fields).toEqual(initialDispatchFields(template))
  })
})
