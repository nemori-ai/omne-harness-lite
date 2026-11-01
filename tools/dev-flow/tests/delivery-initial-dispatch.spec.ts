import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, realpathSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  fencedShellCommands,
  generateInitialDispatch,
  initialDispatchFields,
  initialDispatchPath,
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

const COMMAND_FIELDS = [
  'prepare_commands',
  'handoff_post_command',
  'wait_command',
  'events_receiver_health_command',
] as const

type EvidenceOptions = {
  skip?: readonly string[]
  exitCodes?: Readonly<Record<string, number>>
  extra?: readonly string[]
}

function evidenceFor(input: InitialDispatchInput, options: EvidenceOptions = {}) {
  const body = renderInitialDispatch(template, input)
  return evidenceOf(
    body,
    [...fencedShellCommands(body), ...(options.extra ?? [])].filter(
      command => !(options.skip ?? []).includes(command),
    ),
    options.exitCodes,
  )
}

function evidenceOf(
  body: string,
  commands: readonly string[],
  exitCodes: Readonly<Record<string, number>> = {},
) {
  return parseRehearsalEvidence({
    schemaVersion: 1,
    messageSha256: createHash('sha256').update(body).digest('hex'),
    commands: commands.map(command => ({
      command,
      exitCode: exitCodes[command] ?? 0,
      outputSummary: `ran ${command}`,
    })),
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
      'wave_boundary_ref',
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
      'wave_queue_ref',
    ])
      expect(names).not.toContain(name)
    const body = renderInitialDispatch(template, fixture().input)
    expect(body).toContain('`line` 技能')
    expect(body).toContain('references/work-paradigm.md')
    expect(body).toContain('前台阻塞')
    expect(body).toContain('「进度更新」')
    expect(body).toContain('「本波进度」')
    expect(body).toContain('事件接收器的健康状态和自检结果不阻止开工')
    expect(body).toContain('线父分支')
    expect(body).toContain('「线负责人的思维模型」')
    expect(body).toContain('「执行中前台并行关注的事」')
    expect(body).toContain('「Reduce 与你的分工」')
    expect(body).toContain('本波有几张卡')
    expect(body).toContain('scripts/with-test-slot.mjs')
  })
  it('places every command field inside a shell code block and has no other code block', () => {
    const f = fixture()
    expect(fencedShellCommands(renderInitialDispatch(template, f.input))).toEqual(
      COMMAND_FIELDS.map(name => f.input.fields[name]),
    )
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
    expect(result.matchedCommands).toBe(COMMAND_FIELDS.length)
    expect(result.extraEntries).toEqual([])
    expect(result.nonZeroExits).toEqual([])
    expect(result.remainingGuards).toHaveLength(4)
    expect(result.next).toContain('Opening and human forwarding are separate facts')
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
    const evidence = evidenceFor(f.input, { skip: [f.input.fields.wait_command!] })
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
    const evidence = evidenceFor(f.input, { exitCodes: { [f.input.fields.wait_command!]: 3 } })
    const result = validateInitialDispatch(f.dir, template, f.input, evidence)
    expect(result.nonZeroExits).toEqual([{ command: f.input.fields.wait_command, exitCode: 3 }])
  })
  it('matches evidence whose command differs from the message only in whitespace', () => {
    const f = fixture()
    generateInitialDispatch(f.dir, template, f.input)
    const body = renderInitialDispatch(template, f.input)
    const spaced = COMMAND_FIELDS.map(name => `  ${f.input.fields[name]!.replace(' ', '   ')} `)
    const result = validateInitialDispatch(f.dir, template, f.input, evidenceOf(body, spaced))
    expect(result.matchedCommands).toBe(COMMAND_FIELDS.length)
    expect(result.extraEntries).toEqual([])
  })
  it('reports evidence entries that match no command of the message apart from the matches', () => {
    const f = fixture()
    generateInitialDispatch(f.dir, template, f.input)
    const extra = 'pnpm lines-cli check --line runtime'
    const result = validateInitialDispatch(
      f.dir,
      template,
      f.input,
      evidenceFor(f.input, { extra: [extra] }),
    )
    expect(result.matchedCommands).toBe(COMMAND_FIELDS.length)
    expect(result.extraEntries).toEqual([extra])
  })
  it('requires evidence for a shell block that a field value brings into the message', () => {
    const f = fixture()
    f.input.fields.machine_and_host = 'devbox\n\n```sh\nhidden-field-command --flag\n```\n'
    generateInitialDispatch(f.dir, template, f.input)
    const body = renderInitialDispatch(template, f.input)
    const templateOnly = evidenceOf(
      body,
      COMMAND_FIELDS.map(name => f.input.fields[name]!),
    )
    expect(() => validateInitialDispatch(f.dir, template, f.input, templateOnly)).toThrow(
      'initial-dispatch-rehearsal-missing: 1 command(s) without evidence: hidden-field-command --flag',
    )
  })
  it('refuses a message where a field value closes the shell block of the template', () => {
    const f = fixture()
    f.input.fields.prepare_commands = 'echo one\n```\necho two'
    generateInitialDispatch(f.dir, template, f.input)
    expect(() => validateInitialDispatch(f.dir, template, f.input, evidenceFor(f.input))).toThrow(
      'initial-dispatch-non-shell-block: the untagged code block',
    )
  })
  it('refuses two evidence entries for one command, so a command cannot have two answers', () => {
    const entry = (command: string, exitCode: number) => ({
      command,
      exitCode,
      outputSummary: 'ran',
    })
    expect(() =>
      parseRehearsalEvidence({
        schemaVersion: 1,
        messageSha256: 'a'.repeat(64),
        commands: [entry('gh issue view 7', 0), entry('  gh  issue view   7', 1)],
      }),
    ).toThrow('rehearsal evidence.commands[1] repeats the command of commands[0]')
  })
  it('reads the evidence schema version before any other field', () => {
    expect(() =>
      parseRehearsalEvidence({ schemaVersion: 2, messageSha256: 'abc', commands: 'none' }),
    ).toThrow('rehearsal evidence.schemaVersion must be 1')
  })
  const digest = 'a'.repeat(64)
  const command = (extra: Record<string, unknown>) => ({
    schemaVersion: 1,
    messageSha256: digest,
    commands: [{ command: 'x', exitCode: 0, outputSummary: 'ok', ...extra }],
  })
  it.each([
    [
      'no commands array',
      { schemaVersion: 1, messageSha256: digest },
      'rehearsal evidence.commands must be an array',
    ],
    [
      'short digest',
      { schemaVersion: 1, messageSha256: 'abc', commands: [] },
      'rehearsal evidence.messageSha256: SHA-256 digest required',
    ],
    [
      'missing output summary',
      command({ outputSummary: undefined }),
      'rehearsal evidence.commands[0].outputSummary must be a nonempty string',
    ],
    [
      'fractional exit code',
      command({ exitCode: 0.5 }),
      'exitCode must be an integer from 0 to 255',
    ],
    [
      'exit code above 255',
      command({ exitCode: 256 }),
      'exitCode must be an integer from 0 to 255',
    ],
    ['negative exit code', command({ exitCode: -1 }), 'exitCode must be an integer from 0 to 255'],
    [
      'unknown field',
      command({ stdout: 'raw' }),
      'rehearsal evidence.commands[0]: unknown fields stdout',
    ],
  ])('rejects malformed rehearsal evidence: %s', (_, value, message) => {
    expect(() => parseRehearsalEvidence(value)).toThrow(message)
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
    const render = driverRun(['render', '--input', spec, '--root', f.dir])
    expect(render.status).toBe(0)
    expect(render.stderr).not.toContain('DO_NOT_EXECUTE')
    expect(JSON.parse(render.stdout).status).toBe('GENERATED')
    const withoutEvidence = driverRun(['validate', '--input', spec, '--root', f.dir])
    expect(withoutEvidence.status).toBe(2)
    expect(withoutEvidence.stderr).toContain('initial-dispatch-rehearsal-evidence-required')
    expect(withoutEvidence.stdout).not.toContain('STRUCTURE_CHECKED')
    writeFileSync(evidenceFile, JSON.stringify(evidenceFor(f.input)))
    const validated = driverRun([
      'validate',
      '--input',
      spec,
      '--root',
      f.dir,
      '--rehearsal-evidence',
      evidenceFile,
    ])
    expect(validated.status).toBe(0)
    expect(JSON.parse(validated.stdout).status).toBe('STRUCTURE_CHECKED')
    const invalid = driverRun(['render', '--input', spec, '--input', spec])
    expect(invalid.status).toBe(2)
    expect(invalid.stderr).toContain('initial-dispatch-duplicate-option')
  })
  it('lists the template fields from the tool checkout whatever the working directory', () => {
    const f = fixture()
    const listed = driverRun(['fields'], f.dir)
    expect(listed.status).toBe(0)
    expect(JSON.parse(listed.stdout).fields).toEqual(initialDispatchFields(template))
    const help = driverRun(['--help'], f.dir)
    expect(help.status).toBe(0)
    expect(help.stdout).toContain('line-initial-dispatch-cli.ts validate --input FILE')
  })
  it.each([
    [
      'render',
      ['--input', 'spec.json', '--rehearsal-evidence', 'rehearsal.json'],
      '--rehearsal-evidence',
    ],
    ['fields', ['--input', 'spec.json'], '--input'],
  ])('refuses an option that %s does not take, before writing', (command, options, option) => {
    const f = fixture()
    writeFileSync(join(f.dir, 'spec.json'), JSON.stringify(f.input))
    writeFileSync(join(f.dir, 'rehearsal.json'), JSON.stringify(evidenceFor(f.input)))
    const result = driverRun([command, ...options, '--root', f.dir], f.dir)
    expect(result.status).toBe(2)
    expect(result.stderr).toContain(`initial-dispatch-options: ${command} does not accept`)
    expect(result.stderr).toContain(option)
    expect(result.stdout).toBe('')
    expect(existsSync(initialDispatchPath(f.dir, f.input))).toBe(false)
  })
  it('names the input file that holds invalid JSON', () => {
    const f = fixture()
    const spec = join(f.dir, 'spec.json')
    writeFileSync(spec, '{"schemaVersion": 1,')
    const result = driverRun(['render', '--input', spec, '--root', f.dir])
    expect(result.status).toBe(2)
    expect(JSON.parse(result.stderr).message).toBe(`${spec}: json-invalid`)
  })
  it('exits 2 on validate when a field brings a non-shell code block into the message', () => {
    const f = fixture()
    f.input.fields.machine_and_host = 'devbox\n\n```text\nlooks like a command\n```\n'
    const spec = join(f.dir, 'spec.json')
    const evidenceFile = join(f.dir, 'rehearsal.json')
    writeFileSync(spec, JSON.stringify(f.input))
    expect(driverRun(['render', '--input', spec, '--root', f.dir]).status).toBe(0)
    const body = renderInitialDispatch(template, f.input)
    writeFileSync(
      evidenceFile,
      JSON.stringify(
        evidenceOf(
          body,
          COMMAND_FIELDS.map(name => f.input.fields[name]!),
        ),
      ),
    )
    const result = driverRun([
      'validate',
      '--input',
      spec,
      '--root',
      f.dir,
      '--rehearsal-evidence',
      evidenceFile,
    ])
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('initial-dispatch-non-shell-block: the \\"text\\" code block')
    expect(result.stdout).toBe('')
  })
})

function driverRun(args: string[], cwd?: string) {
  return spawnSync(process.execPath, ['--experimental-strip-types', driver, ...args], {
    encoding: 'utf8',
    ...(cwd === undefined ? {} : { cwd }),
  })
}

describe('fenced shell commands follow CommonMark fences', () => {
  const block = (...lines: string[]) => lines.join('\n')
  it('reads commands with continuations and skips blank lines, comments and inline code', () => {
    const markdown = block(
      'Inline `rm -rf /` is not a command.',
      '```sh',
      '# 不适用：idle',
      '',
      'node wait-cli.ts comment \\',
      '  --issue 914   --timeout 540',
      'gh issue comment 914 --body-file x.md',
      '```',
      '```bash',
      'gh issue comment 914 --body-file x.md',
      'trailing continuation \\',
      '```',
    )
    expect(fencedShellCommands(markdown)).toEqual([
      'node wait-cli.ts comment --issue 914 --timeout 540',
      'gh issue comment 914 --body-file x.md',
      'trailing continuation',
    ])
  })
  it('takes the first word of the info string as the language', () => {
    const markdown = block('```sh title=x', 'titled-cmd', '```', '', '```sh', 'later-cmd', '```')
    expect(fencedShellCommands(markdown)).toEqual(['titled-cmd', 'later-cmd'])
  })
  it('reads the language in any case', () => {
    expect(fencedShellCommands(block('```Bash', 'upper-cmd', '```'))).toEqual(['upper-cmd'])
  })
  it('keeps a fence line with an info string inside the block', () => {
    expect(fencedShellCommands(block('```sh', 'first', '```bash', 'second', '```'))).toEqual([
      'first',
      '```bash',
      'second',
    ])
  })
  it('closes a tilde block only with tildes', () => {
    expect(fencedShellCommands(block('~~~sh', 'tilde-cmd', '```', 'still-inside', '~~~'))).toEqual([
      'tilde-cmd',
      '```',
      'still-inside',
    ])
  })
  it('closes a block only with a fence at least as long as the opening fence', () => {
    expect(fencedShellCommands(block('````sh', 'four-cmd', '```', 'still-inside', '````'))).toEqual(
      ['four-cmd', '```', 'still-inside'],
    )
  })
  it('accepts fences indented up to three spaces, and four spaces make no fence', () => {
    expect(fencedShellCommands(block('   ```sh', 'indented-cmd', '   ```'))).toEqual([
      'indented-cmd',
    ])
    expect(fencedShellCommands(block('    ```sh', 'code-text', '    ```'))).toEqual([])
  })
  it('reads CRLF line endings', () => {
    expect(fencedShellCommands('```sh\r\nfoo  bar\r\n```\r\n')).toEqual(['foo bar'])
  })
  it('refuses an unclosed block', () => {
    expect(() => fencedShellCommands(block('text', '```sh', 'never-closed'))).toThrow(
      'initial-dispatch-fence-unclosed: the code block at line 2',
    )
  })
  it.each([
    ['a text block', block('```text', 'not a command', '```'), '"text"'],
    ['an untagged block', block('```', 'untagged-cmd', '```'), 'untagged'],
  ])('refuses %s', (_, markdown, kind) => {
    expect(() => fencedShellCommands(markdown)).toThrow(
      `initial-dispatch-non-shell-block: the ${kind} code block at line 1`,
    )
  })
})
