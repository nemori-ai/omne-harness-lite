// The content merge and the conversation built from it: one case per situation of SPEC.md「内容的合并」.
import { describe, expect, it } from 'vitest'
import {
  applyDelta,
  applySnapshot,
  EMPTY_CONTENT,
  mergeHistory,
  readThroughTo,
  settleLive,
  type Content,
} from '../src/model/content.ts'
import { conversationItems, type Part } from '../src/model/conversation.ts'
import { toTree } from '../src/model/plain.ts'
import {
  assistantEntry,
  deltaTree,
  messageEntry,
  plainEntry,
  snapshotTree,
  toolCallBlock,
  toolResultEntry,
  userEntry,
} from './fixtures/frames.ts'

function withLive(blocks: readonly (readonly [string, string])[], anchor = '5'): Content {
  const applied = applySnapshot(EMPTY_CONTENT, snapshotTree('1', '1', blocks), anchor)
  if (applied.kind !== 'applied') throw new Error('snapshot not applied')
  return applied.content
}

describe('内容的合并', () => {
  it('C1 历史按日志次序合并，同一条目以新读到的为准', () => {
    const first = mergeHistory(EMPTY_CONTENT, [userEntry('2', '2', 'b'), userEntry('1', '1', 'a')])
    const second = mergeHistory(first, [userEntry('2', '2', 'b2'), userEntry('10', '10', 'c')])
    expect(second.entries.map(entry => entry.entryId)).toEqual(['1', '2', '10'])
    // Merging a page does not move how far history is read: only a finished traversal does.
    expect(second.readThrough).toBeNull()
  })
  it('历史读到哪个修订：取读完的那一轮固定的上界，只增不减', () => {
    const read = readThroughTo(EMPTY_CONTENT, '9')
    expect(read.readThrough).toBe('9')
    expect(readThroughTo(read, '10').readThrough).toBe('10')
    expect(readThroughTo(read, '8').readThrough).toBe('9')
  })
  it('C2 快照替换进行中的回复', () => {
    const content = withLive([['0', '旧']])
    const applied = applySnapshot(content, snapshotTree('3', '3', [['0', '新']]), '7')
    expect(applied.kind === 'applied' && applied.content.live).toMatchObject({
      cursor: '3',
      anchor: '7',
      blocks: [{ value: '新' }],
    })
  })
  it('C3 增量按 index 替换已有块、追加新块', () => {
    const content = withLive([['0', '你']])
    const applied = applyDelta(
      content,
      deltaTree({ cursor: '1', revision: '1' }, '2', '2', [
        ['0', '你好'],
        ['1', '！'],
      ]),
    )
    expect(
      applied.kind === 'applied' &&
        applied.content.live?.blocks.map(block => block.kind === 'growing' && block.value),
    ).toEqual(['你好', '！'])
  })
  it('C4 增量的基线对不上，或还没有快照：不应用', () => {
    expect(
      applyDelta(withLive([]), deltaTree({ cursor: '1', revision: '0' }, '2', '2', [])).kind,
    ).toBe('base-mismatch')
    expect(
      applyDelta(withLive([]), deltaTree({ cursor: '0', revision: '1' }, '2', '2', [])).kind,
    ).toBe('base-mismatch')
    expect(
      applyDelta(EMPTY_CONTENT, deltaTree({ cursor: '1', revision: '1' }, '2', '2', [])).kind,
    ).toBe('base-mismatch')
  })
  it('C5 读不懂的值：不应用', () => {
    expect(applySnapshot(EMPTY_CONTENT, toTree({ projection: 'other' }), '1').kind).toBe(
      'unreadable',
    )
    expect(applyDelta(withLive([]), snapshotTree('1', '1', [])).kind).toBe('unreadable')
  })
  it('C6 锚点之后提交的助手消息替换进行中的回复；之前的不替换', () => {
    const content = withLive([['0', '你好']], '5')
    expect(mergeHistory(content, [assistantEntry('1', '5', '旧的')]).live).not.toBeNull()
    expect(mergeHistory(content, [assistantEntry('2', '6', '你好')]).live).toBeNull()
  })
  it('C7 这一轮结束且历史读到了最后的修订：进行中的回复收起', () => {
    const content = { ...withLive([['0', 'x']]), readThrough: '8' }
    expect(settleLive(content, '9').live).not.toBeNull()
    expect(settleLive(content, '8').live).toBeNull()
  })
  it('没有进行中的一轮、也没有进行中的回复：关于回复的标记不留', () => {
    const waiting = { ...EMPTY_CONTENT, liveStatus: { kind: 'refreshing' } as const }
    expect(settleLive(waiting, '3').liveStatus).toBeNull()
    expect(settleLive(EMPTY_CONTENT, '3')).toBe(EMPTY_CONTENT)
  })
})

function parts(content: Content, runActive = false): readonly Part[] {
  return conversationItems(content, runActive).flatMap(item => ('parts' in item ? item.parts : []))
}

describe('对话的条目', () => {
  it('V1 工具调用与它的结果按调用编号配成一对，配上的工具消息不单独画', () => {
    const content = mergeHistory(EMPTY_CONTENT, [
      messageEntry('1', '1', 'assistant', [
        toolCallBlock('call_b', 'Read', {}),
        toolCallBlock('call_a', 'Shell', { command: 'ls' }),
      ]),
      toolResultEntry('2', '2', 'call_a', 'A 的结果'),
      toolResultEntry('3', '3', 'call_b', 'B 的结果'),
    ])
    const items = conversationItems(content, false)
    expect(items.map(item => item.kind === 'message' && item.role)).toEqual(['assistant'])
    const calls = parts(content).filter(part => part.kind === 'tool-call')
    expect(
      calls.map(call => call.kind === 'tool-call' && [call.callId, call.result?.parts[0]]),
    ).toEqual([
      ['call_b', expect.objectContaining({ text: 'B 的结果' })],
      ['call_a', expect.objectContaining({ text: 'A 的结果' })],
    ])
  })
  it('V8 同一个调用的第二个结果不顶替第一个，单独画出来', () => {
    const content = mergeHistory(EMPTY_CONTENT, [
      messageEntry('1', '1', 'assistant', [toolCallBlock('call_a', 'Shell', {})]),
      toolResultEntry('2', '2', 'call_a', '第一个'),
      toolResultEntry('3', '3', 'call_a', '第二个'),
    ])
    const items = conversationItems(content, false)
    expect(items[0]).toMatchObject({
      parts: [{ kind: 'tool-call', result: { parts: [{ text: '第一个' }] } }],
    })
    expect(items[1]).toMatchObject({
      role: 'tool',
      parts: [{ kind: 'tool-result', callId: 'call_a' }],
    })
  })
  it('V2 没有对应调用的结果单独画成工具消息', () => {
    const content = mergeHistory(EMPTY_CONTENT, [toolResultEntry('1', '1', 'nobody', '孤儿')])
    const items = conversationItems(content, false)
    expect(items).toMatchObject([
      { kind: 'message', role: 'tool', parts: [{ kind: 'tool-result', callId: 'nobody' }] },
    ])
  })
  it('V3 Ask 的调用是问题卡：没有结果且这一轮在进行是等待答复', () => {
    const ask = {
      command: 'ask',
      params: {
        questions: [
          {
            title: '选哪个？',
            description: '会影响部署',
            options: [
              { label: 'A（推荐）', description: '快' },
              { label: 'B', description: '稳' },
            ],
          },
        ],
      },
    }
    const content = mergeHistory(EMPTY_CONTENT, [
      messageEntry('1', '1', 'assistant', [toolCallBlock('q1', 'Ask', ask)]),
    ])
    const card = parts(content, true).find(part => part.kind === 'tool-call')
    expect(card).toMatchObject({
      ask: {
        status: 'waiting',
        questions: [
          {
            title: '选哪个？',
            options: [
              { label: 'A（推荐）', description: '快' },
              { label: 'B', description: '稳' },
            ],
          },
        ],
      },
    })
  })
  it('V4 Ask 有结果是已答复；这一轮结束而没有结果是已失效', () => {
    const ask = {
      command: 'ask',
      params: { questions: [{ title: 'Q', description: 'd', options: [] }] },
    }
    const call = messageEntry('1', '1', 'assistant', [toolCallBlock('q1', 'Ask', ask)])
    const answered = mergeHistory(EMPTY_CONTENT, [call, toolResultEntry('2', '2', 'q1', '选了 A')])
    expect(parts(answered, true).find(part => part.kind === 'tool-call')).toMatchObject({
      ask: { status: 'answered' },
    })
    const ended = mergeHistory(EMPTY_CONTENT, [
      call,
      plainEntry('3', '3', 'run.terminal', { terminal: { outcome: 'cancelled' } }),
    ])
    expect(parts(ended, true).find(part => part.kind === 'tool-call')).toMatchObject({
      ask: { status: 'expired' },
    })
    expect(
      parts(mergeHistory(EMPTY_CONTENT, [call]), false).find(part => part.kind === 'tool-call'),
    ).toMatchObject({ ask: { status: 'expired' } })
  })
  it('V5 不认识的条目种类与部件种类：看得见的占位，写明种类名', () => {
    const content = mergeHistory(EMPTY_CONTENT, [
      plainEntry('1', '1', 'session.something-new', {}),
      messageEntry('2', '2', 'assistant', [{ kind: 'hologram' }]),
    ])
    const items = conversationItems(content, false)
    expect(items[0]).toEqual({ kind: 'unknown', key: '1', entryKind: 'session.something-new' })
    expect(parts(content)).toEqual([{ kind: 'unknown', key: '2:0', partKind: 'hologram' }])
  })
  it('V6 一轮的边界与压缩画成标记，滤空的工具消息不画', () => {
    const content = mergeHistory(EMPTY_CONTENT, [
      plainEntry('1', '1', 'run.started', {}),
      plainEntry('2', '2', 'message.compaction', {}),
      messageEntry('3', '3', 'tool', []),
      plainEntry('4', '4', 'run.terminal', { terminal: { outcome: 'completed' } }),
    ])
    const items = conversationItems(content, false)
    expect(items.map(item => (item.kind === 'marker' ? item.label : item.kind))).toEqual([
      '新的一轮开始',
      '前面的对话已压缩',
      '这一轮已完成',
    ])
  })
  it('V7 进行中的回复画在最后，标为进行中；推理状态块不画', () => {
    const content = withLive([['0', '思考']])
    const items = conversationItems(content, true)
    expect(items.at(-1)).toMatchObject({
      kind: 'message',
      role: 'assistant',
      live: true,
      parts: [{ kind: 'text', text: '思考' }],
    })
    const sealed = applySnapshot(
      EMPTY_CONTENT,
      toTree({
        projection: 'model-output-v1',
        phase: 'running',
        cursor: '1',
        revision: '1',
        blocks: [{ kind: 'sealed', index: '0', block: { kind: 'reasoning_state' } }],
      }),
      '1',
    )
    expect(
      sealed.kind === 'applied' && conversationItems(sealed.content, true).at(-1),
    ).toMatchObject({ parts: [] })
  })
})
