// @module-tag slow
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import { onReleaseTree, toolCallsByRequest } from '../support/release-tree.ts'
import { run, sessionIn } from '../support/workspace-guidance.ts'

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
