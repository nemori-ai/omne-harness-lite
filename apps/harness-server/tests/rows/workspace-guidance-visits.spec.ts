// @module-tag slow
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import { onReleaseTree, toolCallsByRequest } from '../support/release-tree.ts'
import { command, run, saveGuidanceEvidence, sessionIn } from '../support/workspace-guidance.ts'

it.each(['read', 'write'] as const)(
  'C2/C4 granted outside %s operations preserve both tool answers and only add guidance for the visited workspace child',
  { tags: ['slow'], timeout: 360_000 },
  async operation => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'guidance-reach-')))
    onTestFinished(() => rmSync(base, { recursive: true, force: true }))
    const root = join(base, 'app')
    const inside = join(root, 'leaf')
    const outside = join(base, 'other')
    mkdirSync(inside, { recursive: true })
    mkdirSync(outside)
    writeFileSync(join(root, 'AGENTS.md'), 'REACH_ROOT_723')
    writeFileSync(join(inside, 'AGENTS.md'), 'REACH_INSIDE_723')
    writeFileSync(join(outside, 'AGENTS.md'), 'REACH_OUTSIDE_723')
    const files = ['INNER_FILE_842', 'OUTER_FILE_842']
    if (operation === 'read') {
      writeFileSync(join(inside, 'note'), files[0]!)
      writeFileSync(join(outside, 'note'), files[1]!)
    }
    const requests: string[] = []
    const script = toolCallsByRequest(body => {
      requests.push(body)
      if (requests.length !== 1) return []
      return [inside, outside].map((directory, index) => ({
        id: 'reach_' + operation + '_' + String(index),
        tool: 'Files',
        arguments: JSON.stringify({
          command: operation,
          intent: operation + ' both files',
          params: {
            path: join(directory, 'note'),
            ...(operation === 'write' ? { mode: 'create', text: files[index] } : {}),
          },
        }),
      }))
    })
    await onReleaseTree({ script, permission: 'bypass-permissions' }, async tree => {
      await command(tree, [
        'setting',
        'set',
        '--independent',
        'workspace/outside-files',
        'access',
        '--value',
        JSON.stringify(operation === 'read' ? 'read' : 'read-write'),
      ])
      await run(tree, await sessionIn(tree, root))
      expect(requests).toHaveLength(2)
      expect(requests[0]).toContain('REACH_ROOT_723')
      expect(requests[0]).not.toContain('REACH_INSIDE_723')
      const after = requests[1]!
      saveGuidanceEvidence('outside-' + operation + '-guidance.json', { requests })
      if (operation === 'read') {
        for (const text of files) expect(after).toContain(text)
      } else {
        expect(readFileSync(join(inside, 'note'), 'utf8')).toBe(files[0])
        expect(readFileSync(join(outside, 'note'), 'utf8')).toBe(files[1])
      }
      const { messages } = JSON.parse(after) as {
        messages: { role: string; tool_call_id?: string; content: unknown }[]
      }
      const replies = messages.filter(message => message.role === 'tool')
      expect(replies.map(reply => reply.tool_call_id).sort()).toEqual([
        'reach_' + operation + '_0',
        'reach_' + operation + '_1',
      ])
      const reminder = messages.findIndex(message =>
        JSON.stringify(message.content).includes('REACH_INSIDE_723'),
      )
      for (const reply of replies) {
        expect(reply.content).toMatch(/^done /u)
        expect(messages.indexOf(reply)).toBeLessThan(reminder)
      }
      expect(after).not.toContain('REACH_OUTSIDE_723')
      expect(after.split('REACH_INSIDE_723')).toHaveLength(2)
    })
  },
)

it(
  'C2 confirmed Files visits include both copy endpoints and exclude merely listed children and failed opens',
  { tags: ['slow'], timeout: 360_000 },
  async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'guidance-files-')))
    onTestFinished(() => rmSync(root, { recursive: true, force: true }))
    const names = ['listing', 'listing/hidden', 'opened', 'source', 'target', 'failed']
    const markers = names.map((_, index) => 'FILES_GUIDANCE_' + String(index) + '_596')
    for (const [index, name] of names.entries()) {
      mkdirSync(join(root, name), { recursive: true })
      writeFileSync(join(root, name, 'AGENTS.md'), markers[index]!)
    }
    writeFileSync(join(root, 'opened', 'note'), 'actual opened data')
    writeFileSync(join(root, 'source', 'note'), 'actual copied data')
    const calls = [
      { command: 'list', params: { path: 'listing' } },
      { command: 'open', params: { path: 'opened/note' } },
      { command: 'copy', params: { path: 'source/note', target: 'target/note' } },
      { command: 'open', params: { path: 'failed/missing' } },
    ]
    const requests: string[] = []
    const script = toolCallsByRequest(body => {
      const call = calls[requests.length]
      requests.push(body)
      return call
        ? [
            {
              id: 'files_' + call.command + String(requests.length),
              tool: 'Files',
              arguments: JSON.stringify({ ...call, intent: 'inspect workspace files' }),
            },
          ]
        : []
    })
    await onReleaseTree({ script, permission: 'bypass-permissions' }, async tree => {
      await run(tree, await sessionIn(tree, root))
      expect(requests).toHaveLength(5)
      expect(readFileSync(join(root, 'target', 'note'), 'utf8')).toBe('actual copied data')
      const visible = [[], [0], [0, 2], [0, 2, 3, 4], [0, 2, 3, 4]]
      for (const [index, request] of requests.entries()) {
        for (const [source, marker] of markers.entries())
          expect(
            request.split(marker).length - 1,
            'request ' + String(index) + ' source ' + names[source],
          ).toBe(visible[index]!.includes(source) ? 1 : 0)
      }
    })
  },
)

it(
  'C2 Shell reports its established cwd and a retained terminal completion cwd',
  { tags: ['slow'], timeout: 360_000 },
  async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'guidance-shell-')))
    onTestFinished(() => rmSync(root, { recursive: true, force: true }))
    const names = ['once', 'transient', 'terminal', 'observed', 'printed', 'override']
    const markers = names.map((_, i) => 'SHELL_GUIDANCE_' + String(i) + '_841')
    for (const [index, name] of names.entries()) {
      mkdirSync(join(root, name))
      writeFileSync(join(root, name, 'AGENTS.md'), markers[index]!)
    }
    const requests: string[] = []
    let completedOutput = ''
    let terminal: { id: string; generation: string } | undefined
    const script = toolCallsByRequest(body => {
      requests.push(body)
      const command = requests.length === 2 ? 'create_session' : 'execute'
      const messages = (
        JSON.parse(body) as { messages: { role: string; content: string | { text?: string }[] }[] }
      ).messages
      const result = messages.findLast(message => message.role === 'tool')?.content
      const text =
        typeof result === 'string' ? result : (result?.map(block => block.text).join('') ?? '')
      if (requests.length === 4) completedOutput = text
      if (requests.length === 3) {
        const reference = text.match(/terminal=(\{[^{}]*\})/u)
        if (!reference) return []
        terminal = JSON.parse(reference[1]!) as typeof terminal
      }
      const params =
        requests.length === 1
          ? { cwd: join(root, 'once'), script: "cd ../transient && printf '%s' ../printed" }
          : requests.length === 2
            ? { cwd: join(root, 'terminal') }
            : requests.length === 3
              ? {
                  terminal,
                  script:
                    "cd '" +
                    join(root, 'observed') +
                    "' && pwd && printf '%s' '" +
                    join(root, 'printed') +
                    "'",
                }
              : requests.length === 4
                ? { terminal, cwd: join(root, 'override'), script: 'pwd -P' }
                : null
      return params
        ? [
            {
              id: 'shell_' + String(requests.length),
              tool: 'Shell',
              arguments: JSON.stringify({
                command,
                intent: 'observe shell working directory',
                params,
              }),
            },
          ]
        : []
    })
    await onReleaseTree({ script, permission: 'bypass-permissions' }, async tree => {
      await run(tree, await sessionIn(tree, root))
      expect(terminal).toBeDefined()
      expect(completedOutput).toContain(join(root, 'observed'))
      expect(completedOutput).toContain(join(root, 'printed'))
      expect(requests).toHaveLength(5)
      const visible = [[], [0], [0, 2], [0, 2, 3], [0, 2, 3, 5]]
      for (const [index, request] of requests.entries())
        for (const [source, marker] of markers.entries())
          expect(
            request.split(marker).length - 1,
            'request ' + String(index) + ' source ' + names[source],
          ).toBe(visible[index]!.includes(source) ? 1 : 0)
    })
  },
)
