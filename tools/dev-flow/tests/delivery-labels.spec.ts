import { describe, expect, it } from 'vitest'
import { syncLabels } from '../src/delivery/labels.ts'
import type { GhRead } from '../src/delivery/github-read.ts'
import { table } from './fixtures/lines.ts'

const url = 'https://github.com/owner/repo/issues/7'
const body = (contract = 'additive') =>
  `## 身份与责任\n\n- 交付线：model\n- 性质：impl\n- 契约变更：${contract}\n\n## 目标与范围\n\n正文。`
/** A GitHub stand-in that applies label writes to one Issue and records every call. */
function github(labels: string[], text = body()) {
  const state = { labels: [...labels] },
    calls: string[][] = []
  const call: GhRead = argv => {
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
        current: ['line:platform', 'nature:impl'],
        target: ['contract:additive', 'line:model', 'nature:impl'],
        add: ['contract:additive', 'line:model'],
        remove: ['line:platform'],
      },
      applied: false,
    })
    expect(gh.calls.every(call => call[2] === 'GET')).toBe(true)
  })

  it('applies only the three families and verifies the readback', () => {
    const gh = github(['line:platform', 'contract:breaking', 'kind:feature', 'linear:x'])
    const result = run(gh, true)
    expect(result).toMatchObject({
      applied: true,
      readback: ['contract:additive', 'line:model', 'nature:impl'],
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
    const gh = github(['line:model', 'nature:impl'], body('none'))
    expect(run(gh, true)).toMatchObject({ plan: { add: [], remove: [] }, verified: true })
    expect(gh.calls.map(call => call[2])).toEqual(['GET', 'GET'])
  })

  it('reports a readback that differs from the target', () => {
    const gh = github([])
    const call: GhRead = (argv, timeout) => (argv[2] === 'POST' ? [] : gh.call(argv, timeout))
    expect(
      syncLabels({ repository: 'owner/repo', number: 7, apply: true, lines: table(), call }),
    ).toMatchObject({ verified: false, readback: [] })
  })

  it('refuses a card whose attributes cannot project labels and writes nothing', () => {
    const gh = github([], body('minor'))
    expect(() => run(gh, true)).toThrow('Card attributes cannot project labels')
    expect(gh.calls.map(call => call[2])).toEqual(['GET'])
  })

  it('names a failed write and keeps API output out of the message', () => {
    const gh = github(['line:platform'])
    const call: GhRead = (argv, timeout) => {
      if (argv[2] === 'DELETE') throw new Error('secret API body')
      return gh.call(argv, timeout)
    }
    expect(() =>
      syncLabels({ repository: 'owner/repo', number: 7, apply: true, lines: table(), call }),
    ).toThrow(/Label write 2 of 2 failed\. Earlier writes stay applied/)
  })

  it('refuses a pull request or another Issue', () => {
    const gh = github([])
    const call: GhRead = (argv, timeout) =>
      Object.assign({}, gh.call(argv, timeout), { pull_request: {} })
    expect(() =>
      syncLabels({ repository: 'owner/repo', number: 7, apply: false, lines: table(), call }),
    ).toThrow('pull request')
  })
})
