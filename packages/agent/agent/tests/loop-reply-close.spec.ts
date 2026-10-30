import { describe, expect, it } from 'vitest'
import { fail } from '@omne-harness/operation-result'
import { agentEvaluator } from '@omne-harness/agent'
import { judgeContentBlock } from '@omne-harness/content-block'
import {
  decodeResultVersion,
  decodeModelOperationId,
  type ResultPart,
  type Termination,
} from '@omne-harness/model-contract'
import type { JournalCommit } from '@omne-harness/agent-contract'
import { createExecutionCoordinator } from '../src/loop/coordinator.ts'
import {
  acceptedInput,
  consumption,
  evidence,
  execution,
  failure,
  ok,
  operation,
  producedResult,
  type Principal,
  withLineage,
} from './journal-support.ts'
import { options } from './factory-support.ts'
import {
  alice,
  eventually,
  invoke,
  loopAssembly,
  type LoopAssembly,
  handoffOperationOf,
} from './loop-support.ts'

function coordinator(assembly: LoopAssembly) {
  return createExecutionCoordinator({
    ports: assembly.dependencies,
    binding: options().binding,
    evaluator: agentEvaluator,
    access: alice,
    execution: execution(),
    operation: operation('invoke-exec-1'),
    initial: acceptedInput('input-exec-1', 'hello exec-1'),
    grant: null,
    idle() {},
  })
}

async function load(assembly: LoopAssembly, id = 'exec-1') {
  return ok(await assembly.dependencies.journal.load({ ...alice, execution: execution(id) }))
}

function recordCommits(commits: JournalCommit<Principal>[]) {
  return (d: LoopAssembly['dependencies']): LoopAssembly['dependencies'] => ({
    ...d,
    journal: {
      ...d.journal,
      commit(input) {
        commits.push(input)
        return d.journal.commit(input)
      },
    },
  })
}

const judgedText = judgeContentBlock({
  kind: 'text',
  id: 'blk_01234567890123456789012345',
  visibility: { toHuman: true, toModel: true },
  text: 'reply',
})
if ('rejected' in judgedText) throw new Error(judgedText.rejected)
const textBlock = judgedText.ok

async function settled(
  parts: readonly ResultPart[],
  termination: Termination,
  commits: JournalCommit<Principal>[],
) {
  const assembly = await loopAssembly([execution()], d => ({
    ...recordCommits(commits)(d),
    models: {
      ...d.models,
      calls: {
        ...d.models.calls,
        async admit(input) {
          const admitted = await d.models.calls.admit(input)
          if ('ok' in admitted) {
            assembly.controls.models.settle({
              tenant: input.tenant,
              call: input.call,
              version: ok(decodeResultVersion('mrver_final')),
              termination,
              parts,
              source: evidence('settled'),
              pageSize: 10,
              pageTargetBytes: 65536,
            })
            await assembly.controls.pusher?.settled({ tenant: input.tenant, call: input.call })
          }
          return admitted
        },
      },
    },
  }))
  return assembly
}

describe('#515 reply admission and iteration close', () => {
  it('NA-I3-1: admission and its continuation hold at one revision before I4', async () => {
    const commits: JournalCommit<Principal>[] = []
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      journal: {
        ...d.journal,
        async commit(input) {
          commits.push(input)
          const committed = await d.journal.commit(input)
          if (input.replyAdmission !== null && 'ok' in committed) {
            const saved = ok(await d.journal.load({ ...alice, execution: execution() }))
            expect(saved.revision).toBe(committed.ok.revision)
            expect(saved.checkpoint.position).toBe('Q4')
            expect(saved.replyAdmissions.lastAdmission).toEqual(input.replyAdmission.source)
            const page = ok(
              await d.journal.readReplyAdmissions({
                ...alice,
                execution: execution(),
                through: saved.replyAdmissions.through,
                after: null,
                limit: 100,
              }),
            )
            expect(page.kind === 'page' && page.items.map(item => item.fact)).toEqual([
              input.replyAdmission,
            ])
          }
          return committed
        },
      },
    }))
    const c = coordinator(assembly)
    ok(await c.accept())
    assembly.release.open()
    ok(await c.runExecution())
    const admitted = commits.filter(item => item.replyAdmission !== null)
    expect(admitted).toHaveLength(1)
    const commit = admitted[0]
    if (commit === undefined) throw new Error('no admission commit')
    expect(commit.checkpoint.position).toBe('Q4')
    const fact = commit.replyAdmission
    if (fact === null) throw new Error('no admission fact')
    expect(fact).toMatchObject({ decision: 'admitted', step: 'step-1', action: 'step-1/main' })
    expect(commits.find(item => item.checkpoint.position === 'I4')?.expected).not.toBe(
      commit.expected,
    )
    const saved = await load(assembly)
    const page = ok(
      await assembly.dependencies.journal.readReplyAdmissions({
        ...alice,
        execution: execution(),
        through: saved.replyAdmissions.through,
        after: null,
        limit: 100,
      }),
    )
    expect(page.kind === 'page' && page.items.map(item => item.fact)).toEqual([fact])
    expect(
      assembly.controls.handoff.prepare.calls.filter(
        call => call.request.source.kind === 'model-reply',
      ),
    ).toHaveLength(1)
  })

  it('NA-I3-1: a lost handoff receipt is recalled with the original operation and candidate', async () => {
    const commits: JournalCommit<Principal>[] = []
    let lost = true
    const assembly = await loopAssembly([execution()], d => ({
      ...recordCommits(commits)(d),
      handoff: {
        ...d.handoff,
        async prepare(input) {
          const prepared = await d.handoff.prepare(input)
          if (input.request.source.kind === 'model-reply' && lost) {
            lost = false
            return fail({ kind: 'commit-unknown', operation: handoffOperationOf(input) })
          }
          return prepared
        },
      },
    }))
    const c = coordinator(assembly)
    ok(await c.accept())
    assembly.release.open()
    expect(failure(await c.runExecution())).toMatchObject({
      node: 'Q1',
      failure: { kind: 'commit-unknown' },
    })
    expect(commits.filter(item => item.replyAdmission !== null)).toHaveLength(0)
    ok(await c.runExecution())
    const replies = assembly.controls.handoff.prepare.calls.filter(
      call => call.request.source.kind === 'model-reply',
    )
    expect(replies).toHaveLength(2)
    expect(replies[1]).toEqual(replies[0])
    expect(commits.filter(item => item.replyAdmission !== null)).toHaveLength(1)
    expect(
      commits.flatMap(item => item.events).filter(event => event.kind === 'message'),
    ).toHaveLength(1)
  })

  it('NA-I4-1: an admitted reply without tool calls commits its empty batch before I8', async () => {
    const commits: JournalCommit<Principal>[] = []
    const assembly = await loopAssembly([execution()], recordCommits(commits))
    const c = coordinator(assembly)
    ok(await c.accept())
    assembly.release.open()
    ok(await c.runExecution())
    const empty = commits.find(item => item.operation.startsWith('I4/'))
    expect(empty?.checkpoint).toMatchObject({
      position: 'I8',
      batch: { actions: [], slots: [], barrier: { kind: 'closed', judging: [], asked: [] } },
    })
    const producer = commits
      .flatMap(commit => commit.events)
      .find(event => event.kind === 'producer')
    expect(producer).toBeDefined()
    expect(empty?.checkpoint.batch?.source).toEqual(producer?.result)
    expect((await load(assembly)).checkpoint.batch).toBeNull()
  })

  it('NA-I8-1: an empty queue and no outstanding wait propose completion before terminal commit', async () => {
    const commits: JournalCommit<Principal>[] = []
    let terminals = 0
    const assembly = await loopAssembly([execution()], d => ({
      ...recordCommits(commits)(d),
      journal: {
        ...recordCommits(commits)(d).journal,
        tryFinish(input) {
          terminals++
          const proposal = commits.find(item => item.operation.startsWith('I8/'))
          expect(proposal?.checkpoint.position).toBe('F1')
          expect(proposal?.state.kind).toBe('advancing')
          return d.journal.tryFinish(input)
        },
      },
    }))
    const c = coordinator(assembly)
    ok(await c.accept())
    assembly.release.open()
    ok(await c.runExecution())
    expect(terminals).toBe(1)
    expect((await load(assembly)).state).toMatchObject({
      kind: 'ended',
      conclusion: { kind: 'complete' },
    })
  })

  it('NA-I8-2: input accepted while a call is in flight enters only the next step', async () => {
    const commits: JournalCommit<Principal>[] = []
    const assembly = await loopAssembly([execution()], recordCommits(commits))
    const c = coordinator(assembly)
    ok(await c.accept())
    const running = c.runExecution()
    await eventually(async () => (await load(assembly)).checkpoint.position === 'M6')
    ok(
      await assembly.dependencies.journal.submit(
        withLineage({
          ...alice,
          execution: execution(),
          operation: operation('second-input'),
          value: acceptedInput('second', 'another question'),
        }),
      ),
    )
    assembly.release.open()
    ok(await running)
    ok(await c.runExecution())
    const batches = commits.flatMap(item =>
      item.events.flatMap(event => (event.kind === 'input-taken' ? [event.batch] : [])),
    )
    expect(batches.map(batch => batch.ordered)).toEqual([['input-exec-1'], ['second']])
    const admitted = commits.flatMap(item =>
      item.replyAdmission === null ? [] : [item.replyAdmission],
    )
    expect(admitted.map(item => item.step)).toEqual(['step-1', 'step-2'])
    expect(new Set(admitted.map(item => item.call)).size).toBe(2)
    expect(new Set(admitted.map(item => item.action)).size).toBe(2)
  })

  it('NA-I8-2: after terminal release a new invoke starts the next execution first step', async () => {
    const assembly = await loopAssembly([execution(), execution('exec-2')])
    ok(await invoke(assembly))
    assembly.release.open()
    await eventually(async () => (await load(assembly)).state.kind === 'ended')
    // E9 releases the slot after the terminal and original responsibility records.
    await eventually(async () => {
      const controller = new AbortController()
      const seen = assembly.provider.observation
        .observe({ ...alice, signal: controller.signal })
        [Symbol.asyncIterator]()
      const first = await seen.next()
      controller.abort()
      await seen.return?.()
      return first.value?.kind === 'state' && first.value.value.kind === 'idle'
    })
    ok(await invoke(assembly, 'exec-2'))
    await eventually(async () => (await load(assembly, 'exec-2')).state.kind === 'ended')
    expect((await load(assembly, 'exec-2')).checkpoint.step).toBe('step-1')
  })

  it('NA-I8-3: an unprocessed responsibility waits at I8 despite an empty action batch and queue', async () => {
    const commits: JournalCommit<Principal>[] = []
    let injected = false
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      journal: {
        ...d.journal,
        async commit(input) {
          commits.push(input)
          const result = await d.journal.commit(input)
          if (!injected && input.operation.startsWith('I4/') && 'ok' in result) {
            injected = true
            ok(
              await d.journal.recordResult({
                ...alice,
                execution: execution(),
                operation: operation('owed-result'),
                result: producedResult('waiting'),
                consumption: consumption('waiting'),
                transfer: { kind: 'none' },
                release: { kind: 'pending' },
              }),
            )
          }
          return result
        },
      },
    }))
    const c = coordinator(assembly)
    ok(await c.accept())
    assembly.release.open()
    ok(await c.runExecution())
    const saved = await load(assembly)
    expect(saved.state).toMatchObject({
      kind: 'waiting',
      waits: [{ kind: 'dependency', owner: 'agentJournal', position: 'I8' }],
    })
    expect(saved.checkpoint.position).toBe('I8')
    expect(commits.filter(item => item.state.kind === 'settling')).toEqual([])
    const waiting = commits.filter(item => item.events.some(event => event.kind === 'waiting'))
    expect(waiting).toHaveLength(1)
    // An explicit serial retry returns through I8, not through an E4/wait table defect.
    ok(await c.runExecution())
    expect((await load(assembly)).state.kind).toBe('waiting')
    expect(commits.filter(item => item.state.kind === 'settling')).toEqual([])
  })
  it('NA-I3-2: final failure without content fixes the real no-reply candidate before F1', async () => {
    const commits: JournalCommit<Principal>[] = []
    const assembly = await settled(
      [],
      {
        kind: 'failed',
        fault: { cause: 'upstream-unavailable', diagnostic: 'final', upstreamStatus: null },
      },
      commits,
    )
    const c = coordinator(assembly)
    ok(await c.accept())
    ok(await c.runExecution())
    const candidate = commits.find(item => item.finish !== null)
    expect(candidate?.state).toEqual({ kind: 'settling' })
    expect(candidate?.finish).toMatchObject({
      conclusion: { kind: 'fail' },
      failure: { kind: 'no-reply', source: evidence('settled'), step: 'step-1' },
    })
    expect(commits.some(item => item.operation.startsWith('I8/'))).toBe(false)
    expect(
      assembly.controls.handoff.prepare.calls.filter(
        call => call.request.source.kind === 'model-reply',
      ),
    ).toEqual([])
  })

  it('ordinary output-limit sealed text is admitted with its real trim and settlement', async () => {
    const commits: JournalCommit<Principal>[] = []
    const trims = [{ removed: '1', reason: 'upstream-output-limit' }]
    const assembly = await settled(
      [{ kind: 'sealed', block: textBlock, trims }],
      { kind: 'completed', reason: 'limit' },
      commits,
    )
    const c = coordinator(assembly)
    ok(await c.accept())
    ok(await c.runExecution())
    expect(commits.filter(item => item.replyAdmission !== null)).toHaveLength(1)
    expect((await load(assembly)).state).toMatchObject({
      kind: 'ended',
      conclusion: { kind: 'complete' },
    })
    expect(
      commits.flatMap(item => item.events).filter(event => event.kind === 'message'),
    ).toHaveLength(1)
    const completion = (await load(assembly)).entries?.find(
      entry => entry.kind === 'received',
    )?.material
    if (!completion) throw new Error('missing received material')
    const material = ok(
      await assembly.dependencies.materials.read({ ...alice, source: completion }),
    )
    expect(JSON.stringify(material)).toContain('upstream-output-limit')
    expect(JSON.stringify(material)).toContain('removed')
  })

  it.each([
    { kind: 'completed', reason: 'limit' },
    {
      kind: 'failed',
      fault: {
        cause: 'upstream-unavailable',
        diagnostic: 'after first content',
        upstreamStatus: null,
      },
    },
    { kind: 'interrupted', control: ok(decodeModelOperationId('mop_interrupt')) },
  ] satisfies Termination[])(
    'partial %j cannot enter reply admission or authorize actions',
    async termination => {
      const commits: JournalCommit<Principal>[] = []
      const assembly = await settled(
        [{ kind: 'partial', content: 'tool-arguments', value: '{', trims: [] }],
        termination,
        commits,
      )
      const c = coordinator(assembly)
      ok(await c.accept())
      ok(await c.runExecution())
      expect(commits.filter(item => item.replyAdmission !== null)).toEqual([])
      expect(commits.some(item => item.operation.startsWith('I4/'))).toBe(false)
      expect(commits.find(item => item.operation.startsWith('I3/'))?.checkpoint.position).toBe('I8')
      expect(commits.find(item => item.operation.startsWith('I8/'))?.checkpoint.position).toBe('F1')
    },
  )
})
