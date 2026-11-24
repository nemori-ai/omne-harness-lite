// @module-tag slow
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import { sessionModelHistoryReadinessKey } from '@omne-harness/session-adapters/cordis'
import { decodeCompactionOutcome } from '@omne-harness/agent-contract'
import { succeed } from '@omne-harness/operation-result'
import { historyOf, onReleaseTree, pollUntil, toolCallsByRequest } from '../support/release-tree.ts'

import { command, registered, sessionIn, run } from '../support/workspace-guidance.ts'

it(
  'C1 the first model request receives only the selected workspace root guidance',
  { tags: ['slow'], timeout: 360_000 },
  async () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'workspace-guidance-')))
    onTestFinished(() => rmSync(base, { recursive: true, force: true }))
    const root = join(base, 'workspace')
    const child = join(root, 'pay')
    mkdirSync(child, { recursive: true })
    writeFileSync(join(base, 'AGENTS.md'), 'OUTSIDE_GUIDANCE_856')
    writeFileSync(join(child, 'AGENTS.md'), 'CHILD_GUIDANCE_629')
    writeFileSync(join(root, 'AGENTS.md'), 'ROOT_GUIDANCE_471')
    const captured: { role: string; content: unknown }[][] = []
    await onReleaseTree(
      {
        script: toolCallsByRequest(body => {
          captured.push(
            (JSON.parse(body) as { messages: { role: string; content: unknown }[] }).messages,
          )
          return []
        }),
        extraHistoryKinds: ['message.system_reminder'],
      },
      async tree => {
        const entries = await run(tree, await sessionIn(tree, root))
        expect(captured).toHaveLength(1)
        const messages = captured[0]!
        expect(JSON.stringify(messages.filter(m => m.role === 'system'))).not.toContain(
          'ROOT_GUIDANCE_471',
        )
        const guidance = messages.filter(m =>
          JSON.stringify(m.content).includes('ROOT_GUIDANCE_471'),
        )
        expect(guidance).toHaveLength(1)
        expect(JSON.stringify(guidance)).toContain('AGENTS.md')
        expect(JSON.stringify(messages)).not.toMatch(/OUTSIDE_GUIDANCE_856|CHILD_GUIDANCE_629/u)
        expect(
          JSON.stringify(entries.filter(entry => entry.kind === 'message.system_reminder')),
        ).toContain('ROOT_GUIDANCE_471')
        const empty = join(base, 'empty')
        mkdirSync(empty)
        await run(tree, await sessionIn(tree, empty))
        expect(captured).toHaveLength(2)
        expect(JSON.stringify(captured[1])).not.toMatch(
          /ROOT_GUIDANCE_471|OUTSIDE_GUIDANCE_856|CHILD_GUIDANCE_629/u,
        )
      },
    )
  },
)

it(
  'C2 a completed first write introduces its directory and parent in the following request',
  { tags: ['slow'], timeout: 360_000 },
  async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'workspace-write-')))
    onTestFinished(() => rmSync(root, { recursive: true, force: true }))
    const leaf = join(root, 'src', 'pay')
    mkdirSync(leaf, { recursive: true })
    writeFileSync(join(root, 'src', 'AGENTS.md'), 'PARENT_GUIDANCE_107')
    writeFileSync(join(leaf, 'AGENTS.md'), 'LEAF_GUIDANCE_313')
    const requests: string[] = []
    const script = toolCallsByRequest(body => {
      requests.push(body)
      return requests.length === 1
        ? [
            {
              id: 'pay-write',
              tool: 'Files',
              arguments: JSON.stringify({
                command: 'write',
                intent: 'create payment note',
                params: { path: 'src/pay/note.txt', text: 'one write', mode: 'create' },
              }),
            },
          ]
        : []
    })
    await onReleaseTree(
      { script, permission: 'bypass-permissions', extraHistoryKinds: ['message.system_reminder'] },
      async tree => {
        const entries = await run(tree, await sessionIn(tree, root))
        expect(readFileSync(join(leaf, 'note.txt'), 'utf8')).toBe('one write')
        expect(requests).toHaveLength(2)
        expect(requests[0]).not.toMatch(/PARENT_GUIDANCE_107|LEAF_GUIDANCE_313/u)
        expect(requests[1]).toContain('PARENT_GUIDANCE_107')
        expect(requests[1]).toContain('LEAF_GUIDANCE_313')
        const result = entries.findIndex(entry => entry.kind === 'message.tool')
        const guidance = entries.findIndex(
          entry =>
            entry.kind === 'message.system_reminder' &&
            JSON.stringify(entry.payload).includes('LEAF_GUIDANCE_313'),
        )
        expect(result).toBeGreaterThanOrEqual(0)
        expect(guidance).toBeGreaterThan(result)
      },
    )
  },
)

it(
  'C3 parallel siblings keep distinct sources for identical bodies and revisits only add the new version',
  { tags: ['slow'], timeout: 360_000 },
  async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'guidance-parallel-')))
    onTestFinished(() => rmSync(root, { recursive: true, force: true }))
    for (const leaf of ['pay', 'docs', 'next'])
      mkdirSync(join(root, 'src', leaf), { recursive: true })
    writeFileSync(join(root, 'AGENTS.md'), 'ROOT_55917')
    writeFileSync(join(root, 'src', 'AGENTS.md'), 'SHARED_62585')
    for (const leaf of ['pay', 'docs', 'next'])
      writeFileSync(
        join(root, 'src', leaf, 'AGENTS.md'),
        leaf === 'next' ? 'GUIDE_next' : 'GUIDE_SHARED_BYTES_672',
      )
    const alternatePay = existsSync(join(root, 'src', 'PAY')) ? 'PAY' : 'pay'
    const batches = [['docs', 'pay'], ['next'], ['pay', 'docs'], [alternatePay]]
    const requests: string[] = []
    const script = toolCallsByRequest(body => {
      requests.push(body)
      const step = requests.length
      if (step === 3) writeFileSync(join(root, 'src', 'pay', 'AGENTS.md'), 'GUIDE_pay_v2')
      const leaves = batches[step - 1] ?? []
      return leaves.map(leaf => ({
        id: 'call_' + step + '_' + leaf,
        tool: 'Files',
        arguments: JSON.stringify({
          command: 'write',
          intent: 'write note',
          params: { path: 'src/' + leaf + '/note' + step + '.txt', text: 'ok', mode: 'create' },
        }),
      }))
    })
    await onReleaseTree({ script, permission: 'bypass-permissions' }, async tree => {
      await run(tree, await sessionIn(tree, root))
      expect(requests).toHaveLength(batches.length + 1)
      for (const [index, request] of requests.entries()) {
        expect(request.split('ROOT_55917')).toHaveLength(2)
        expect(request.split('SHARED_62585')).toHaveLength(index >= 1 ? 2 : 1)
        expect(request.split('GUIDE_SHARED_BYTES_672')).toHaveLength(index >= 1 ? 3 : 1)
        expect(request.split('GUIDE_next')).toHaveLength(index >= 2 ? 2 : 1)
        expect(request.split('GUIDE_pay_v2')).toHaveLength(index >= 3 ? 2 : 1)
      }
      for (const [step, leaves] of batches.entries())
        for (const leaf of leaves)
          expect(readFileSync(join(root, 'src', leaf, 'note' + (step + 1) + '.txt'), 'utf8')).toBe(
            'ok',
          )
    })
  },
)

it(
  'C4 both switch entrances preserve the request prefix and reuse a retained root body on returning',
  { tags: ['slow'], timeout: 360_000 },
  async () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'guidance-switch-')))
    onTestFinished(() => rmSync(base, { recursive: true, force: true }))
    const a = join(base, 'a')
    const b = join(base, 'b')
    for (const [root, text] of [
      [a, 'GUIDE_A_911'],
      [b, 'GUIDE_B_884'],
    ] as const) {
      mkdirSync(root)
      writeFileSync(join(root, 'AGENTS.md'), text)
    }
    type WireMessage = { role: string; content: unknown }
    const requests: WireMessage[][] = []
    const script = toolCallsByRequest(body => {
      requests.push((JSON.parse(body) as { messages: WireMessage[] }).messages)
      const target = requests.length === 3 ? b : requests.length === 4 ? a : null
      return target === null
        ? []
        : [
            {
              id: 'switch_' + requests.length,
              tool: 'SwitchWorkspace',
              arguments: JSON.stringify({ directory: target }),
            },
          ]
    })
    await onReleaseTree({ script, permission: 'bypass-permissions' }, async tree => {
      const first = await registered(tree, a)
      const second = await registered(tree, b)
      const session = await sessionIn(tree, first)
      await run(tree, session)
      for (const [target, ordinal] of [
        [second, 2],
        [first, 3],
      ] as const) {
        await command(tree, ['select-workspace', '--session', session, ...target])
        await run(tree, session, ordinal)
      }
      expect(requests).toHaveLength(5)
      for (const [index, request] of requests.entries()) {
        const body = JSON.stringify(request)
        expect(body.split('GUIDE_A_911')).toHaveLength(2)
        expect(body.split('GUIDE_B_884')).toHaveLength(index === 0 ? 1 : 2)
        if (index > 0) {
          const prior = requests[index - 1]!
          expect(request.slice(0, prior.length)).toEqual(prior)
        }
        const manifests = request.filter(m =>
          JSON.stringify(m).includes('session.workspace-guidance'),
        )
        const latest = JSON.stringify(manifests.at(-1))
        expect(latest).toContain([a, b, a, b, a][index])
      }
    })
  },
)

it(
  'C4 a Shell result returning after A to B to A keeps its original visit out of the new binding',
  { tags: ['slow'], timeout: 360_000 },
  async () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'guidance-late-')))
    onTestFinished(() => rmSync(base, { recursive: true, force: true }))
    const a = join(base, 'A'),
      b = join(base, 'B')
    const leaf = join(a, 'src', 'pay')
    mkdirSync(leaf, { recursive: true })
    mkdirSync(b)
    writeFileSync(join(leaf, 'AGENTS.md'), 'STALE_BODY_410')
    const requests: string[] = []
    const script = toolCallsByRequest(body => {
      requests.push(body)
      return requests.length === 1
        ? [
            {
              id: 'late-shell',
              tool: 'Shell',
              arguments: JSON.stringify({
                command: 'execute',
                intent: 'wait for switch',
                params: {
                  cwd: leaf,
                  script:
                    'printf started > started; while [ ! -f go ]; do sleep 0.1; done; printf completed > completed',
                },
              }),
            },
          ]
        : []
    })
    await onReleaseTree(
      {
        script,
        permission: 'bypass-permissions',
        extraHistoryKinds: ['call.execution-fact', 'message.system_reminder'],
      },
      async tree => {
        const first = await registered(tree, a),
          second = await registered(tree, b)
        const session = await sessionIn(tree, first)
        await command(tree, ['send-input', '--session', session, '--text', 'Begin.'])
        try {
          await pollUntil(
            'the original shell starts in A/pay',
            () => existsSync(join(leaf, 'started')),
            Boolean,
          )
          await command(tree, ['select-workspace', '--session', session, ...second])
          await command(tree, ['select-workspace', '--session', session, ...first])
        } finally {
          writeFileSync(join(leaf, 'go'), '')
        }
        const entries = await pollUntil(
          'the original run completes',
          () => historyOf(tree, session),
          seen => seen.some(e => e.kind === 'run.terminal'),
        )
        expect(readFileSync(join(leaf, 'completed'), 'utf8')).toBe('completed')
        expect(requests).toHaveLength(2)
        expect(requests[1]).not.toContain('STALE_BODY_410')
        const evidence = entries.filter(
          e => e.kind === 'call.execution-fact' && JSON.stringify(e.payload).includes(leaf),
        )
        expect(evidence.length).toBeGreaterThan(0)
      },
    )
  },
)

it.each(['root', 'all', 'none', 'unreadable'] as const)(
  'C5/C6 the next compacted request uses the latest batch, retained sources %s',
  { tags: ['slow'], timeout: 360_000 },
  async retained => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'guidance-compact-')))
    onTestFinished(() => rmSync(root, { recursive: true, force: true }))
    for (const child of ['pay', 'docs']) mkdirSync(join(root, 'src', child), { recursive: true })
    for (const [directory, marker] of [
      ['', 'ROOT'],
      ['src', 'PARENT'],
      ['src/pay', 'PAY'],
      ['src/docs', 'DOCS'],
    ] as const)
      writeFileSync(join(root, directory, 'AGENTS.md'), 'BODY_379_' + marker)
    const requests: string[] = []
    const calls = toolCallsByRequest(body => {
      requests.push(body)
      const leaves = requests.length === 1 ? ['pay', 'docs'] : requests.length === 2 ? ['pay'] : []
      return leaves.map(leaf => ({
        id: 'call_' + requests.length + '_' + leaf,
        tool: 'Files',
        arguments: JSON.stringify({
          command: 'write',
          intent: 'write note',
          params: {
            path: 'src/' + leaf + '/round-' + requests.length,
            text: 'done',
            mode: 'create',
          },
        }),
      }))
    })
    let compactions = 0
    let unreadable = false
    let sentWhileUnreadable = 0
    await onReleaseTree(
      {
        permission: 'bypass-permissions',
        collaboration: 'co-work',
        extraHistoryKinds: ['message.system_reminder'],
        compactionTriggerPercent: '2',
        compactionProvider: {
          binding: {
            authority: 'release/guidance',
            adoption: {
              owner: 'release-test',
              name: 'guidance',
              revision: '1',
              digest: 'guidance/1',
            },
          },
          inject: [],
          executor: () => ({
            async advance(request, generation) {
              compactions++
              const history = request.input.history
              const roots = history.entries
                .filter(
                  e =>
                    e.message.role === 'system_reminder' &&
                    (retained === 'all' ||
                      (retained !== 'none' &&
                        JSON.stringify(e.message.blocks).includes('BODY_379_ROOT'))),
                )
                .map(e => e.ref)
              const result = decodeCompactionOutcome(
                JSON.stringify({
                  kind: 'completed',
                  message: {
                    id: request.input.outputMessageId,
                    role: 'compaction',
                    blocks: [
                      {
                        kind: 'text',
                        id: 'summary',
                        text: 'Continue the pay work. SUMMARY_5891',
                        visibility: { toModel: true, toHuman: true },
                      },
                    ],
                    covers: { from: history.origin, to: history.upper },
                    retained: history.logOrder.filter(
                      ref => history.protected.includes(ref) || roots.includes(ref),
                    ),
                    derivation: generation,
                  },
                }),
              )
              if ('failure' in result || result.ok.kind !== 'completed')
                throw new Error('invalid test compaction')
              return succeed({
                phase: 'terminal',
                physical: 'settled',
                outcome: result.ok,
              } as const)
            },
            cancel: async () => succeed('settled' as const),
          }),
        },
        script: async input => {
          if (unreadable) sentWhileUnreadable++
          const answer = await calls(input)
          if (requests.length !== 2) return answer
          const frame =
            'data: ' +
            JSON.stringify({
              model: (JSON.parse(input.body) as { model: string }).model,
              provider: 'OpenAI',
              choices: [{ delta: { content: 'memo '.repeat(1_000) } }],
            }) +
            '\n\n'
          return { ...answer, body: frame.repeat(12) + answer.body }
        },
      },
      async tree => {
        const session = await sessionIn(tree, root)
        if (retained === 'unreadable') {
          const service = tree.scope.get(sessionModelHistoryReadinessKey)
          if (service === undefined) throw new Error('missing release history readiness service')
          const ensure = service.ensure.bind(service)
          let injected = false
          Reflect.set(service, 'ensure', async (input: Parameters<typeof ensure>[0]) => {
            if (
              !injected &&
              compactions > 0 &&
              (await historyOf(tree, session)).some(e => e.kind === 'message.compaction')
            ) {
              writeFileSync(join(root, 'src/pay/AGENTS.md'), Buffer.from([0xff]))
              injected = unreadable = true
            }
            return ensure(input)
          })
        }
        await command(tree, ['send-input', '--session', session, '--text', 'Begin.'])
        if (retained === 'unreadable') {
          await pollUntil(
            'a committed compression encounters the unreadable pay rules',
            () => {
              const waiting = tree.records.some(record => {
                const text = (record['fields'] as { text?: string } | undefined)?.text
                return (
                  text?.includes('agent run waits for a dependency') && text.includes('guidance')
                )
              })
              return (unreadable && waiting) || sentWhileUnreadable > 0
            },
            observed => observed,
          )
          expect(sentWhileUnreadable).toBe(0)
          const beforeRepair = await historyOf(tree, session)
          expect(beforeRepair.filter(e => e.kind === 'message.compaction')).toHaveLength(1)
          expect(readFileSync(join(root, 'src/pay/round-2'), 'utf8')).toBe('done')
          writeFileSync(join(root, 'src/pay/AGENTS.md'), 'BODY_379_PAY')
          unreadable = false
        }
        const entries = await pollUntil(
          'the original Run completes',
          () => historyOf(tree, session),
          seen => seen.some(entry => entry.kind === 'run.terminal'),
        )
        expect(compactions).toBe(1)
        expect(requests).toHaveLength(3)
        expect(entries.filter(e => e.kind === 'run.started')).toHaveLength(1)
        expect(requests[1]).toContain('BODY_379_DOCS')
        const after = requests[2]!
        expect(after).toContain('SUMMARY_5891')
        if (retained !== 'all') expect(after).not.toContain('BODY_379_DOCS')
        for (const marker of ['ROOT', 'PARENT', 'PAY'])
          expect(after.split('BODY_379_' + marker)).toHaveLength(2)
        const compacted = entries.findIndex(e => e.kind === 'message.compaction')
        expect(compacted).toBeGreaterThanOrEqual(0)
        const restored = entries
          .slice(compacted + 1)
          .filter(
            e =>
              e.kind === 'message.system_reminder' &&
              JSON.stringify(e.payload).includes('BODY_379_PAY'),
          )
        expect(restored).toHaveLength(retained === 'all' ? 0 : 1)
        if (retained !== 'all') expect(JSON.stringify(restored)).toContain('BODY_379_PARENT')
        if (retained === 'none') expect(JSON.stringify(restored)).toContain('BODY_379_ROOT')
        else expect(JSON.stringify(restored)).not.toContain('BODY_379_ROOT')
        expect(readFileSync(join(root, 'src/pay/round-2'), 'utf8')).toBe('done')
      },
    )
  },
)
