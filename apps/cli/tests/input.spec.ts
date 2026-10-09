import { readFileSync } from 'node:fs'
import { chmod, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildIntent, payloadJSON, readInputFile, readSecrets } from '../src/input.ts'
import { commands, parseInvocation } from '../src/parser.ts'
import { validIntent } from '../src/validation.ts'
const signal = () => new AbortController().signal
const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(r => rm(r, { recursive: true, force: true })))
})
async function file(bytes: string | Buffer, mode = 0o600) {
  const root = await mkdtemp(join(tmpdir(), 'omne-cli-input-'))
  roots.push(root)
  const path = join(root, 'input')
  await writeFile(path, bytes, { mode })
  return { root, path }
}
function invocation(args: string[]) {
  const result = parseInvocation(args)
  if (result.kind !== 'command') throw new Error('invalid fixture')
  return result
}
describe('exact command and nonsecret syntax', () => {
  it('ships the exact accepted command registry', () => {
    expect(readFileSync(new URL('../commands/governance.json', import.meta.url), 'utf8')).toBe(
      readFileSync(new URL('./fixtures/commands.json', import.meta.url), 'utf8'),
    )
  })
  for (const command of commands) {
    it(`only accepts declared options for ${command.command.join(' ')}`, () => {
      const args = [
        ...command.command,
        ...(command.action === 'configure'
          ? ['--endpoint', 'https://center.invalid/', '--system-ca']
          : []),
      ]
      expect(parseInvocation(args).kind).toBe('command')
      expect(parseInvocation(['machine', ...args]).machine).toBe(true)
      expect(parseInvocation([...args, '--unknown', 'value']).kind).toBe('error')
      expect(parseInvocation([...args, '--state-dir', '/one', '--state-dir', '/two']).kind).toBe(
        'error',
      )
      if (!command.refresh) expect(parseInvocation([...args, '--refresh']).kind).toBe('error')
      if (!command.secretFields.includes('credential'))
        expect(parseInvocation([...args, '--credential-file', '/must-not-read']).kind).toBe('error')
      if (command.payloadSource === 'none')
        expect(parseInvocation([...args, '--payload-file', '/must-not-read']).kind).toBe('error')
    })
  }
  it.each([
    '{"a":1,"a":2}',
    '{"a":1,"\\u0061":2}',
    '{"x":{"a":1,"a":2}}',
    '{"x":9007199254740990.5}',
    '{"x":9007199254740993}',
    '{"x":1e3}',
    '{"x":01}',
    '{"x":true,}',
    '[]',
    'null',
    '{} trailing',
    '{"x":"\u0000"}',
  ])('rejects %s before numeric/schema coercion', text => {
    expect(() => payloadJSON(text)).toThrow('invalid-json')
  })
  it('keeps exact strings, safe integers and object keys without prototype mutation', () => {
    const value = payloadJSON('{"__proto__":{"name":"literal"},"x":[true,null,42],"id":" Case "}')
    expect(value['id']).toBe(' Case ')
    expect(value['x']).toEqual([true, null, 42])
    expect(Object.getPrototypeOf(value)).toBeNull()
  })
  it('constructs all accepted input projections using canonical examples without copying secrets', async () => {
    const examples: { definition: string; valid: boolean; value: Record<string, unknown> }[] =
      JSON.parse(
        readFileSync(
          new URL(
            '../../../packages/core/governance-client-operations/tests/fixtures/action-examples.json',
            import.meta.url,
          ),
          'utf8',
        ),
      )
    for (const command of commands.filter(c => c.action !== 'configure')) {
      const sample = examples.find(
        e =>
          e.valid &&
          e.definition === 'Input' &&
          e.value['action'] === command.action &&
          (command.action !== 'invoke' || e.value['operation'] === command.operation),
      )
      expect(sample).toBeDefined()
      const payload = { ...((sample!.value['payload'] as Record<string, unknown>) ?? {}) }
      if (command.operation === 'capability.organization-governance/v2#S-21') {
        payload['name'] = 'test organization'
      }
      for (const field of command.secretFields) delete payload[field]
      const input = await file(JSON.stringify(payload))
      const args = [
        ...command.command,
        ...(command.payloadSource === 'none' ? [] : ['--payload-file', input.path]),
      ]
      const intent = await buildIntent(invocation(args), signal())
      expect(validIntent(intent)).toBe(true)
    }
  })
})
describe('owned input files', () => {
  it('preserves exact UTF8, trailing newline and a literal secret BOM', async () => {
    const { path } = await file('\ufeff秘密\n')
    expect(await readInputFile(path, 1024, true, signal())).toBe('\ufeff秘密\n')
    await expect(readInputFile(path, 1024, false, signal())).rejects.toThrow('invalid-encoding')
  })
  it('rejects invalid UTF8 rather than replacing bytes', async () => {
    const { path } = await file(Buffer.from([0xc0, 0xaf]))
    await expect(readInputFile(path, 32, true, signal())).rejects.toThrow('invalid-encoding')
  })
  it('rejects group-readable secrets and final symlinks', async () => {
    const { root, path } = await file('SENTINEL')
    await chmod(path, 0o640)
    await expect(readInputFile(path, 64, true, signal())).rejects.toThrow('secret-permissions')
    await chmod(path, 0o600)
    const link = join(root, 'link')
    await symlink(path, link)
    await expect(readInputFile(link, 64, true, signal())).rejects.toThrow('secret-source')
  })
  it('rejects a FIFO without an opposing endpoint and refuses character devices', async () => {
    const { root } = await file('unused')
    const fifo = join(root, 'fifo')
    execFileSync('mkfifo', [fifo])
    await expect(readInputFile(fifo, 64, true, signal())).rejects.toThrow('secret-source')
    await expect(readInputFile('/dev/null', 64, true, signal())).rejects.toThrow('secret-source')
  }, 2000)
  it('rejects limits, cancellation and missing secret sources without opening stdin', async () => {
    const { path } = await file('12345')
    await expect(readInputFile(path, 4, true, signal())).rejects.toThrow('input-too-large')
    const controller = new AbortController()
    controller.abort()
    await expect(readInputFile(path, 64, true, controller.signal)).rejects.toThrow(
      'input-cancelled',
    )
    await expect(
      readSecrets(invocation(['login', '--login-identifier', 'person']), signal()),
    ).rejects.toThrow('tty-unsupported')
  })
  it('rejects secrets in a payload file and ambiguous login identifier sources', async () => {
    const { path } = await file('{"loginIdentifier":"person","credential":null}')
    await expect(
      buildIntent(invocation(['login', '--payload-file', path]), signal()),
    ).rejects.toThrow('secret-source')
    await writeFile(path, '{"loginIdentifier":"person"}')
    await expect(
      buildIntent(
        invocation(['login', '--payload-file', path, '--login-identifier', 'other']),
        signal(),
      ),
    ).rejects.toThrow('invalid-options')
  })
})
