import { describe, expect, it } from 'vitest'
import { describeCall, exitOf } from '../../../src/rows/goal-session/observed.ts'

const RAN = [
  'done process={"id":"414e09a3-8652-4d6b-b1ad-e7123b1f185e","generation":"6C8C5448"} output_mode=separate stop=not-requested',
  'completed exit={"kind":"code","code":3} duration_ms=6',
  'residue=none',
  'stdout observed_bytes=16 facility_discarded_bytes=0',
  '{"p95_ms": 780}',
].join('\n')
const WROTE =
  'done request="2713766c-9ddd-46cd-afba-733e541fd6ec"\npath="CHANGELOG.md" resolved_path="/w/CHANGELOG.md" version="1795627449604:8" write_effect=unreported'
const wrapped = (command: string, params: object) => ({ command, intent: 'do it', params })

describe('the exit code a Shell run reports', () => {
  it('is read from the line of its completion, and is none when the run reports no code', () => {
    expect(exitOf(RAN)).toBe(3)
    expect(exitOf(RAN.replace('"code":3', '"code":0'))).toBe(0)
    expect(exitOf('done process={} output_mode=separate\nrunning')).toBeNull()
    expect(exitOf('completed exit={"kind":"signal","signal":"SIGKILL"} duration_ms=6')).toBeNull()
    expect(exitOf('completed exit={not json} duration_ms=6')).toBeNull()
    expect(exitOf('echo completed exit={"kind":"code","code":0} duration_ms=1')).toBeNull()
  })
})

describe('a tool call of this release as a judging reads it', () => {
  it('reads a one-shot Shell run as its script, its exit code and its result; it writes nothing a judging counts', () => {
    const script = 'echo \'{"p95_ms": 780}\'; exit 3'
    const args = wrapped('execute', { script })
    expect(describeCall({ tool: 'Shell', arguments: args, result: RAN })).toEqual({
      tool: 'Shell execute',
      command: script,
      path: null,
      exit: 3,
      writes: false,
      output: RAN,
    })
    const info = { tool: 'Shell', arguments: wrapped('info', {}), result: 'done shell=zsh' }
    expect(describeCall(info)).toMatchObject({ tool: 'Shell info', command: null, exit: null })
  })

  it('reads a Files write that was done as a write of its path, and shows what was written, not the receipt', () => {
    const args = wrapped('write', { path: 'CHANGELOG.md', mode: 'create', text: '- faster' })
    expect(describeCall({ tool: 'Files', arguments: args, result: WROTE })).toEqual({
      tool: 'Files write',
      command: null,
      path: 'CHANGELOG.md',
      exit: null,
      writes: true,
      output: '- faster',
    })
  })

  it('shows the new text of an edit, and of each edit of a patch under the path of its first', () => {
    const edit = wrapped('edit', { path: 'a.md', old_text: 'slow', new_text: 'fast' })
    expect(describeCall({ tool: 'Files', arguments: edit, result: 'done edit' })).toMatchObject({
      path: 'a.md',
      writes: true,
      output: 'fast',
    })
    const edits = [
      { path: 'a.md', old_text: 'x', new_text: 'one' },
      { path: 'b.md', old_text: 'y', new_text: 'two' },
    ]
    const patch = wrapped('patch', { edits })
    expect(describeCall({ tool: 'Files', arguments: patch, result: 'done patch' })).toMatchObject({
      tool: 'Files patch',
      path: 'a.md',
      writes: true,
      output: 'one\ntwo',
    })
  })

  it('a Files call that was not done wrote nothing, and a call that only reads never does: both show their result', () => {
    const args = wrapped('write', { path: 'CHANGELOG.md', text: '- faster' })
    const refused = 'rejected reason=conflict'
    expect(describeCall({ tool: 'Files', arguments: args, result: refused })).toMatchObject({
      writes: false,
      output: refused,
    })
    const read = wrapped('read', { path: 'CHANGELOG.md' })
    expect(describeCall({ tool: 'Files', arguments: read, result: 'done\n- faster' })).toEqual({
      tool: 'Files read',
      command: null,
      path: 'CHANGELOG.md',
      exit: null,
      writes: false,
      output: 'done\n- faster',
    })
    const removed = wrapped('delete', { path: 'old.md' })
    expect(describeCall({ tool: 'Files', arguments: removed, result: 'done' })).toMatchObject({
      writes: true,
      output: 'done',
    })
  })

  it('reads a call of any other tool by its name and its result, with or without the command wrapping', () => {
    const plain = { tool: 'Agents', arguments: { path: 'x' }, result: 'ok' }
    expect(describeCall(plain)).toEqual({
      tool: 'Agents',
      command: null,
      path: 'x',
      exit: null,
      writes: false,
      output: 'ok',
    })
    expect(describeCall({ tool: 'Tools', arguments: null, result: 'ok' })).toMatchObject({
      tool: 'Tools',
      path: null,
    })
  })
})
