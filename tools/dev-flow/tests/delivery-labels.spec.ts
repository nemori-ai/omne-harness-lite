import { describe, expect, it } from 'vitest'
import { syncLabels } from '../src/delivery/labels.ts'
import type { GhCommand } from '../src/delivery/github-read.ts'
import { table } from './fixtures/lines.ts'

const url = 'https://github.com/owner/repo/issues/7'
const body = (contract = 'additive') =>
  `## 身份与责任\n\n- 主工作类型：feature\n- 交付线：model\n- 性质：impl\n- 契约变更：${contract}\n\n## 目标与范围\n\n正文。`
/** A GitHub stand-in that applies label writes to one Issue and records every call. */
function github(labels: string[], text = body()) {
  const state = { labels: [...labels] },
    calls: string[][] = []
  const call: GhCommand = argv => {
    calls.push([...argv])
    const method = argv[2],
      path = argv.find(arg => arg.startsWith('repos/')) ?? ''
    if (method === 'GET' && path === 'repos/owner/repo/issues/7')
      return {
        number: 7,
        html_url: url,
        body: text,
        labels: state.labels.map(name => ({ name })),
        milestone: { title: 'M1' },
      }
    if (method === 'POST' && path === 'repos/owner/repo/issues/7/labels') {
      for (const arg of argv)
        if (arg.startsWith('labels[]=')) state.labels.push(arg.slice('labels[]='.length))
      return state.labels.map(name => ({ name }))
    }
    if (method === 'DELETE' && path.startsWith('repos/owner/repo/issues/7/labels/')) {
      const name = decodeURIComponent(path.split('/').at(-1) ?? '')
      state.labels = state.labels.filter(label => label !== name)
      return state.labels.map(item => ({ name: item }))
    }
    throw new Error(`unexpected call ${argv.join(' ')}`)
  }
  return { call, calls, state }
}
const run = (gh: ReturnType<typeof github>, apply: boolean) =>
  syncLabels({ repository: 'owner/repo', number: 7, apply, lines: table(), call: gh.call })

describe('attribute label sync', () => {
  it('prints the difference without writing', () => {
    const gh = github(['line:platform', 'nature:impl', 'kind:feature', 'level:subtask'])
    expect(run(gh, false)).toEqual({
      plan: {
        issue: url,
        current: ['kind:feature', 'line:platform', 'nature:impl'],
        target: ['contract:additive', 'kind:feature', 'line:model', 'nature:impl'],
        add: ['contract:additive', 'line:model'],
        remove: ['line:platform'],
      },
      applied: false,
    })
    expect(gh.calls.every(call => call[2] === 'GET')).toBe(true)
  })

  it('applies only the four families and verifies the readback', () => {
    const gh = github(['line:platform', 'contract:breaking', 'kind:feature', 'linear:x'])
    const result = run(gh, true)
    expect(result).toMatchObject({
      applied: true,
      readback: ['contract:additive', 'kind:feature', 'line:model', 'nature:impl'],
      verified: true,
    })
    expect(gh.state.labels.sort()).toEqual([
      'contract:additive',
      'kind:feature',
      'line:model',
      'linear:x',
      'nature:impl',
    ])
    expect(gh.calls.map(call => call[2])).toEqual(['GET', 'POST', 'DELETE', 'DELETE', 'GET'])
    expect(gh.calls.filter(call => call[2] === 'DELETE').map(call => call.at(-1))).toEqual([
      'repos/owner/repo/issues/7/labels/contract%3Abreaking',
      'repos/owner/repo/issues/7/labels/line%3Aplatform',
    ])
  })

  it('projects contract change none to no contract label and writes nothing when equal', () => {
    const gh = github(['kind:feature', 'line:model', 'nature:impl'], body('none'))
    expect(run(gh, true)).toMatchObject({ plan: { add: [], remove: [] }, verified: true })
    expect(gh.calls.map(call => call[2])).toEqual(['GET', 'GET'])
  })

  it('reports a readback that differs from the target', () => {
    const gh = github([])
    const call: GhCommand = (argv, timeout) => (argv[2] === 'POST' ? [] : gh.call(argv, timeout))
    expect(
      syncLabels({ repository: 'owner/repo', number: 7, apply: true, lines: table(), call }),
    ).toMatchObject({ verified: false, readback: [] })
  })

  it('does not verify old labels after the body kind changes during the write', () => {
    const gh = github([])
    let reads = 0
    const call: GhCommand = (argv, timeout) => {
      const result = gh.call(argv, timeout)
      if (argv[2] === 'GET' && ++reads === 2)
        return {
          ...(result as object),
          body: body().replace('主工作类型：feature', '主工作类型：bug'),
        }
      return result
    }
    expect(
      syncLabels({ repository: 'owner/repo', number: 7, apply: true, lines: table(), call }),
    ).toMatchObject({ verified: false, readback: expect.arrayContaining(['kind:feature']) })
  })

  it('refuses a card whose attributes cannot project labels and writes nothing', () => {
    const gh = github([], body('minor'))
    expect(() => run(gh, true)).toThrow('Card attributes cannot project labels')
    expect(gh.calls.map(call => call[2])).toEqual(['GET'])
  })

  it('names a failed write and keeps API output out of the message', () => {
    const gh = github(['line:platform'])
    const call: GhCommand = (argv, timeout) => {
      if (argv[2] === 'DELETE') throw new Error('secret API body')
      return gh.call(argv, timeout)
    }
    expect(() =>
      syncLabels({ repository: 'owner/repo', number: 7, apply: true, lines: table(), call }),
    ).toThrow(/Label write 2 of 2 failed\. Earlier writes stay applied/)
  })

  it('refuses a pull request or another Issue', () => {
    const gh = github([])
    const call: GhCommand = (argv, timeout) =>
      Object.assign({}, gh.call(argv, timeout), { pull_request: {} })
    expect(() =>
      syncLabels({ repository: 'owner/repo', number: 7, apply: false, lines: table(), call }),
    ).toThrow('pull request')
  })

  it('replaces conflicting kind labels from the body while preserving other families', () => {
    const gh = github(['kind:bug', 'kind:maintenance', 'level:subtask', 'domain:agent'])
    expect(run(gh, true)).toMatchObject({
      plan: { remove: ['kind:bug', 'kind:maintenance'] },
      verified: true,
    })
    expect(gh.state.labels).toEqual(
      expect.arrayContaining(['kind:feature', 'level:subtask', 'domain:agent']),
    )
    expect(
      gh.state.labels.some(label => label === 'kind:bug' || label === 'kind:maintenance'),
    ).toBe(false)
  })

  it.each([
    body().replace('- 主工作类型：feature\n', ''),
    body().replace('主工作类型：feature', '主工作类型：task'),
    body().replace('主工作类型：feature', '主工作类型：feature\n- 主工作类型：bug'),
  ])('refuses an absent, invalid or repeated body kind before writing', text => {
    const gh = github(['kind:feature'], text)
    expect(() => run(gh, true)).toThrow('Card work kind cannot project labels')
    expect(gh.calls.map(call => call[2])).toEqual(['GET'])
  })
})
