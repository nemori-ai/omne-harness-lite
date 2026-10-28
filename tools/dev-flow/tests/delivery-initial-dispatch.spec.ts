import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  generateInitialDispatch,
  initialDispatchFields,
  INITIAL_DISPATCH_TEMPLATE,
  parseInitialDispatchInput,
  renderInitialDispatch,
  validateInitialDispatch,
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

describe('initial dispatch materialization without implicit authority', () => {
  it('uses only the message and preserves all concrete fields', () => {
    const f = fixture()
    const body = renderInitialDispatch(template, f.input)
    expect(body).not.toContain('这是供 reduce 具体化')
    expect(body).not.toContain('{{')
    expect(body).toContain(f.input.fields.line_name)
    expect(body).toContain('不在 Issue comment 向 reduce 求方案')
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
    const result = validateInitialDispatch(f.dir, template, f.input)
    expect(result.status).toBe('STRUCTURE_CHECKED')
    expect(result.remainingGuards).toHaveLength(5)
    expect(result.next).toContain('Opening, human forwarding and claim readback are separate facts')
  })
  it('rejects modified generated output', () => {
    const f = fixture()
    const result = generateInitialDispatch(f.dir, template, f.input)
    writeFileSync(result.path, 'different message')
    expect(() => validateInitialDispatch(f.dir, template, f.input)).toThrow('file-changed')
  })
  it.each(['missing', 'extra', 'unresolved', 'revision', 'secret', 'channel'] as const)(
    'rejects %s fields before writing',
    bad => {
      const f = fixture()
      if (bad === 'missing') delete f.input.fields.line_name
      if (bad === 'extra') f.input.fields.unrecognized = 'value'
      if (bad === 'unresolved') f.input.fields.line_name = '{{unfinished}}'
      if (bad === 'revision') f.input.fields.dispatch_revision = '2'
      if (bad === 'secret') f.input.fields.receiver_config_ref_no_secrets = 'ghp_' + 'x'.repeat(30)
      if (bad === 'channel')
        f.input.fields.receiver_config_ref_no_secrets = 'https://smee.io/private-channel'
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
    f.input.fields.preflight_recipe = 'echo DO_NOT_EXECUTE >&2'
    writeFileSync(spec, JSON.stringify(f.input))
    const run = (command: string) =>
      JSON.parse(
        execFileSync(
          process.execPath,
          ['--experimental-strip-types', driver, command, '--input', spec, '--root', f.dir],
          { encoding: 'utf8' },
        ),
      )
    expect(run('render').status).toBe('GENERATED')
    expect(run('validate').status).toBe('STRUCTURE_CHECKED')
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
