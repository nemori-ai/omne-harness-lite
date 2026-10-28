import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeRecordComment, commentDigest } from '../src/delivery/collaboration-comments.ts'
import {
  writeSequencedRecord,
  type RecordWriteIntent,
} from '../src/delivery/collaboration-write.ts'
import type { GhCommand } from '../src/delivery/github-read.ts'
import {
  backend,
  historyBackend,
  policy,
  rawComment,
  taskBinding,
} from './fixtures/collaboration-authority.ts'
import { state, TIME, UUID } from './fixtures/collaboration.ts'

function fixture() {
  const source = backend()
  const record = state()
  record.writer.authorization = taskBinding().dispatch
  const checkpoints: RecordWriteIntent[] = []
  const writes: string[] = []
  let failPost = false,
    dropPost = false,
    failRead = false
  let afterPost = () => {}
  const call: GhCommand = (args, timeout) => {
    if (args[2] === 'POST') {
      expect(checkpoints).toHaveLength(1)
      const body = args.at(-1)?.slice('body='.length) ?? ''
      writes.push(body)
      if (!dropPost) source.comments.push(rawComment(20, body, TIME))
      afterPost()
      if (failPost) throw new Error('response lost')
      return { id: 20 }
    }
    if (failRead && writes.length > 0) throw new Error('read unavailable')
    if (args.at(-1) === 'user') return { login: 'owner', type: 'User' }
    return source.read(args, timeout)
  }
  const common = { record, call, authority: () => ({ policy }) }
  return {
    source,
    record,
    checkpoints,
    writes,
    common,
    publish: () =>
      writeSequencedRecord({
        ...common,
        mode: 'publish',
        checkpoint: intent => checkpoints.push(intent),
      }),
    recover: () => writeSequencedRecord({ ...common, mode: 'recover' }),
    loseResponse: () => {
      failPost = true
    },
    drop: () => {
      dropPost = true
    },
    readUnavailable: () => {
      failRead = true
    },
    readAvailable: () => {
      failRead = false
    },
    onPost: (action: () => void) => {
      afterPost = action
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(TIME))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('sequenced comment publication and recovery', () => {
  it('saves exact intent before one POST and confirms only the independently read comment', () => {
    const f = fixture()
    expect(f.publish()).toEqual({
      kind: 'confirmed',
      reference: {
        issue: 100,
        commentId: 20,
        sha256: commentDigest(encodeRecordComment(f.record)),
      },
    })
    expect(f.checkpoints).toEqual([
      {
        repo: 'owner/repo',
        issue: 100,
        operationId: f.record.operationId,
        body: encodeRecordComment(f.record),
        sha256: commentDigest(encodeRecordComment(f.record)),
      },
    ])
    expect(f.writes).toHaveLength(1)
  })

  it('recovers a committed write despite a lost POST response, without creating a second comment', () => {
    const f = fixture()
    f.loseResponse()
    expect(f.publish().kind).toBe('confirmed')
    expect(f.recover().kind).toBe('confirmed')
    expect(f.publish().kind).toBe('confirmed')
    expect(f.writes).toHaveLength(1)
  })

  it('never posts when an unknown attempt remains absent, even after repeated complete reads', () => {
    const f = fixture()
    f.drop()
    f.loseResponse()
    expect(f.publish()).toEqual({ kind: 'unknown', reason: 'record-not-observed' })
    expect(f.recover()).toEqual({ kind: 'unknown', reason: 'record-not-observed' })
    expect(f.recover()).toEqual({ kind: 'unknown', reason: 'record-not-observed' })
    expect(f.writes).toHaveLength(1)
    expect(f.checkpoints).toHaveLength(1)
  })

  it('keeps POST success unknown when readback fails and recovers after reads return', () => {
    const f = fixture()
    f.readUnavailable()
    expect(f.publish()).toEqual({ kind: 'unknown', reason: 'post-or-readback-failed' })
    expect(() => f.recover()).toThrow('read unavailable')
    f.readAvailable()
    expect(f.recover().kind).toBe('confirmed')
    expect(f.writes).toHaveLength(1)
  })

  it('does not POST if persisting the attempt fails', () => {
    const f = fixture()
    expect(() =>
      writeSequencedRecord({
        ...f.common,
        mode: 'publish',
        checkpoint: () => {
          throw new Error('disk full')
        },
      }),
    ).toThrow('disk full')
    expect(f.writes).toEqual([])
  })

  it('refuses a stale revision before checkpoint or POST', () => {
    const f = fixture()
    f.source.comments.push(
      rawComment(19, encodeRecordComment({ ...f.record, operationId: UUID }), TIME),
    )
    expect(() => f.publish()).toThrow('revision-conflict')
    expect(f.checkpoints).toEqual([])
    expect(f.writes).toEqual([])
  })

  it('publishes the next revision only with the actual predecessor', () => {
    const f = fixture()
    f.source.comments.push(
      rawComment(19, encodeRecordComment({ ...f.record, operationId: UUID }), TIME),
    )
    f.record.revision = 2
    f.record.previousRecordId = 19
    expect(f.publish().kind).toBe('confirmed')
    expect(f.writes).toHaveLength(1)
  })

  it('rejects an edited operation including whitespace-only changes', () => {
    const f = fixture()
    f.source.comments.push(rawComment(20, encodeRecordComment(f.record) + '\n', TIME))
    expect(() => f.recover()).toThrow('operation-conflict')
    expect(f.writes).toEqual([])
  })

  it('refuses another actor before POST', () => {
    const f = fixture()
    f.record.writer.login = 'stranger'
    expect(() => f.publish()).toThrow('writer-untrusted')
    expect(f.writes).toEqual([])
  })

  it('refuses a writer before its authority interval starts', () => {
    const f = fixture()
    vi.setSystemTime(new Date('2026-10-27T08:00:00Z'))
    expect(() => f.publish()).toThrow('writer-untrusted')
    expect(f.writes).toEqual([])
  })

  it.each(['2026-10-27T09:30:00Z', '2026-10-27T12:00:00Z'])(
    'never posts with an already stopped epoch, including a skewed client clock %s',
    time => {
      const source = historyBackend()
      const record = state()
      record.writer.authorization = taskBinding().dispatch
      vi.setSystemTime(new Date(time))
      const checkpoint = vi.fn()
      const call = vi.fn<GhCommand>((args, timeout) => {
        if (args.at(-1) === 'user') return { login: 'owner', type: 'User' }
        return source.read(args, timeout)
      })
      expect(() =>
        writeSequencedRecord({
          record,
          call,
          authority: () => ({ policy }),
          mode: 'publish',
          checkpoint,
        }),
      ).toThrow('writer-untrusted')
      expect(checkpoint).not.toHaveBeenCalled()
      expect(call.mock.calls.some(([args]) => args[2] === 'POST')).toBe(false)
    },
  )

  it('preserves post-write authority failures as diagnostics without retrying', () => {
    const f = fixture()
    f.onPost(() => {
      f.source.reviewers.splice(0)
    })
    expect(() => f.publish()).toThrow()
    expect(f.writes).toHaveLength(1)
    expect(f.checkpoints).toHaveLength(1)
  })

  it('does not accept a lookalike record from an unauthorized author', () => {
    const f = fixture()
    f.source.comments.push(rawComment(20, encodeRecordComment(f.record), TIME, 'stranger'))
    expect(() => f.recover()).toThrow('writer-untrusted')
    expect(f.writes).toEqual([])
  })

  it('reports concurrent same-revision conflict after POST without overwriting or retrying', () => {
    const f = fixture()
    f.onPost(() =>
      f.source.comments.push(
        rawComment(21, encodeRecordComment({ ...f.record, operationId: UUID }), TIME),
      ),
    )
    expect(() => f.publish()).toThrow('revision-conflict')
    expect(() => f.recover()).toThrow('revision-conflict')
    expect(f.writes).toHaveLength(1)
  })
})
