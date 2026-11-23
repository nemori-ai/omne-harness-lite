import { describe, expect, it } from 'vitest'
import { declare, install, retire, type Registry } from '@omne-harness/dynamis'
import { answerExtensionPoints } from '@omne-harness/plugin-tools'
import {
  SKILLS,
  contract,
  desktop,
  entry,
  registryOf,
  serverParts,
  sighted,
  unattached,
  type World,
} from './world.ts'

const world = (over: Partial<World> = {}): World => ({
  server: registryOf(...serverParts()),
  clients: [desktop()],
  scope: ['t1'],
  ...over,
})

const SERVER_T1 = [
  'server',
  '  dynamis',
  '    dynamis.points   point   The catalog: one item declares one extension point and carries its contract.   [keyed-one]',
  '      skill.skills',
  '        skill#1  [effective, deployment]',
  '      tool.tools',
  '        tool#1  [effective, deployment]',
  '  skill',
  '    skill.skills     point   The skills each layer holds.                                                   [keyed-one, v1.2]',
  '      pdf-tools',
  '        pdf#1  [effective, this tenant]',
  '  tool',
  '    tool.tools       point   The tools an agent can call.                                                   [list]',
  '      Shell  [effective, shell#1, deployment]',
]
const CLIENT = [
  'client   desktop, connected',
  '  session',
  '    session.area                part    对话     tokens',
  '      session.composer          part    输入区    tokens style',
  '        session.composer.send   part    发送按钮   tokens style render',
  '    session.tool-call           point   How one tool call is drawn in the conversation.',
  '  plugin pill-send   sha256:5b1e   loaded',
]
const NONE =
  'client   none connected. The client tree exists only while a client is connected; the server tree is under side=server.'

describe('tree', () => {
  it('shows both trees as the acting tenant sees them, and ends with the revision', async () => {
    const text = await sighted(world()).text('tree')
    expect(text).toBe(
      ['done OmneExtensionPoints tree', ...SERVER_T1, ...CLIENT, 'tree rev 7c1f.0'].join('\n'),
    )
    expect(text).not.toContain('meeting-notes')
  })

  it('shows another tenant only its own entries', async () => {
    const text = await sighted(world({ scope: ['t2'] })).text('tree', { side: 'server' })
    expect(text).toContain('meeting-notes')
    expect(text).not.toContain('pdf-tools')
  })

  it('cuts below depth under a name, and says how many more there are', async () => {
    const text = await sighted(world()).text('tree', { side: 'client', under: 'session', depth: 1 })
    expect(text).toBe(
      [
        'done OmneExtensionPoints tree',
        'client   desktop, connected',
        '  session',
        '    session.area        part    对话   tokens   (2 inside)',
        '    session.tool-call   point   How one tool call is drawn in the conversation.',
        '2 more under session; give depth 2 or a narrower under.',
        'tree rev 7c1f.0',
      ].join('\n'),
    )
    const server = await sighted(world()).text('tree', { side: 'server', under: 'skill.skills' })
    expect(server.split('\n').slice(1, -1)).toEqual([
      'server',
      '  skill.skills   point   The skills each layer holds.   [keyed-one, v1.2]',
      '    pdf-tools',
      '      pdf#1  [effective, this tenant]',
    ])
  })

  it('says so when no client is connected, and does not draw an empty tree', async () => {
    const text = await sighted(world({ clients: [] })).text('tree', { side: 'client' })
    expect(text).toBe(['done OmneExtensionPoints tree', NONE, 'tree rev 7c1f.0'].join('\n'))
  })

  it('says a tree cannot be read when its port answers unavailable or throws', async () => {
    const text = await sighted(world({ server: 'unavailable' })).text('tree')
    expect(text.split('\n').slice(0, 3)).toEqual([
      'done OmneExtensionPoints tree',
      'server   cannot be read now',
      'client   desktop, connected',
    ])
    const w = world()
    Object.defineProperty(w, 'clients', {
      get: () => {
        throw new Error('the reports cannot be read')
      },
    })
    expect(await sighted(w).text('tree')).toContain('\nclient   cannot be read now\n')
    const v = world()
    Object.defineProperty(v, 'server', {
      get: () => {
        throw new Error('the registry cannot be read')
      },
    })
    expect(await sighted(v).text('find', { query: 'send' })).toContain(
      '\nserver   cannot be read now\n',
    )
  })

  it.each(['tree', 'find', 'show'])('%s fails when neither tree can be read', async command => {
    const s = sighted(world({ server: 'unavailable', clients: 'unavailable' }))
    const params = command === 'find' ? { query: 'x' } : command === 'show' ? { name: 'x' } : {}
    expect(await s.failure(command, params)).toEqual({
      kind: 'unavailable',
      operation: `OmneExtensionPoints.${command}`,
      reason: 'neither extension tree can be read now; nothing was read',
    })
  })

  it('a name under which nothing is fails with the names nearest to it', async () => {
    const failure = await sighted(world()).failure('tree', { under: 'session.composr' })
    expect(failure).toEqual({
      kind: 'invalid',
      reason:
        'there is no host, point or part "session.composr" now. Nearest: session.composer, session.composer.send, session.area. tree lists every name.',
    })
  })
})

describe('find', () => {
  it('finds a part by the Chinese words a person uses', async () => {
    expect(await sighted(world()).text('find', { query: '发送按钮' })).toBe(
      [
        'done OmneExtensionPoints find',
        'session.composer.send   part   发送按钮 — 输入区右侧，发出当前输入。   depths: tokens style render   client',
        '1 found.',
        'tree rev 7c1f.0',
      ].join('\n'),
    )
  })

  it('finds by English words without regard to case, best match first, on one side', async () => {
    const text = await sighted(world()).text('find', { query: 'SKILLS layer', side: 'server' })
    expect(text.split('\n').slice(1, -1)).toEqual([
      'skill.skills   point   The skills each layer holds.      server',
      '1 found.',
    ])
  })

  it('shows at most limit, and says how many there were', async () => {
    const text = await sighted(world()).text('find', { query: 'session', limit: 2 })
    expect(text.split('\n').slice(1, -1)).toEqual([
      'session.area       part   对话 — 对话页。            depths: tokens         client',
      'session.composer   part   输入区 — 对话页底部写消息的区域。   depths: tokens style   client',
      '2 more match. Narrow the words, or walk the tree under: session.',
    ])
  })
})

describe('show', () => {
  it('a part: where it is and, for every depth it opens, the member that changes it', async () => {
    expect(await sighted(world()).text('show', { name: 'session.composer.send' })).toBe(
      [
        'done OmneExtensionPoints show',
        'session.composer.send   part, client   发送按钮',
        '输入区右侧，发出当前输入。',
        'in: 对话 › 输入区',
        'depths, shallow first:',
        '  tokens   data   member: {"point":"shell.tokens","key":"session.composer.send","data":{<token>:<value>}}',
        '  style    data   member: {"point":"shell.part-style","key":"session.composer.send","data":{"base":{<css property>:<value>},"hover":{…},"disabled":{…}}}',
        '  render   code   member: {"point":"shell.part-render","key":"session.composer.send","module":<file>,"export":<name>}',
        'tree rev 7c1f.0',
      ].join('\n'),
    )
  })

  it('a part that opens two depths lists only those two', async () => {
    const lines = (await sighted(world()).text('show', { name: 'session.composer' })).split('\n')
    expect(lines.slice(1, 4)).toEqual([
      'session.composer   part, client   输入区',
      '对话页底部写消息的区域。',
      'in: 对话',
    ])
    expect(
      lines.filter(line => line.includes('member:')).map(line => line.trim().split(' ')[0]),
    ).toEqual(['tokens', 'style'])
  })

  it('a client point: its name and what it is, nothing the report does not carry', async () => {
    expect(await sighted(world()).text('show', { name: 'session.tool-call' })).toBe(
      [
        'done OmneExtensionPoints show',
        'session.tool-call   point, client',
        'How one tool call is drawn in the conversation.',
        'tree rev 7c1f.0',
      ].join('\n'),
    )
  })

  it('a server point: its rules from its contract, and what the asker sees placed there', async () => {
    const t1 = await sighted(world()).text('show', { name: SKILLS })
    expect(t1).toBe(
      [
        'done OmneExtensionPoints show',
        'skill.skills   point, server   v1.2',
        'The skills each layer holds.',
        'key: the skill name',
        'holds: one per key; among several, the most specific scope wins; two at the same scope are a conflict',
        'may change: while running',
        'a member gives: data. fields: label (string)',
        'the host gives it: the directory of the skill',
        'when it throws: the skill is not offered',
        'now:',
        '  pdf-tools   pdf#1 this tenant   [in effect]',
        'tree rev 7c1f.0',
      ].join('\n'),
    )
    const t2 = await sighted(world({ scope: ['t2'] })).text('show', { name: SKILLS })
    expect(t2).toContain('  meeting-notes   notes#1 this tenant   [in effect]')
    expect(t2).not.toContain('pdf-tools')
  })

  it('a point with nothing placed, and an entry that breaks the rules', async () => {
    const empty = await sighted(world({ scope: ['t3'] })).text('show', { name: SKILLS })
    expect(empty).toContain('now:\n  (nothing placed)')
    const server = registryOf(...serverParts(), ['bad', [entry(SKILLS, 'broken', { item: {} })]])
    const text = await sighted(world({ server })).text('show', { name: SKILLS })
    expect(text).toContain(
      '  broken   bad#1 deployment   [not in effect: breach (the item lacks label (string))]',
    )
  })

  it('a name that is not there fails with the names nearest to it now', async () => {
    expect(await sighted(world()).failure('show', { name: 'skill.skill' })).toEqual({
      kind: 'invalid',
      reason:
        'there is no point or part "skill.skill" now. Nearest: skill.skills, tool.tools, session.area. tree lists every name.',
    })
    const blind = await sighted(world({ clients: 'unavailable' })).failure('show', {
      name: 'session.x',
    })
    expect(blind.reason).toContain('The client tree cannot be read now, so it may be there.')
  })
})

describe('a point declared while the system runs', () => {
  it('is read by tree and show without any change to the tool', async () => {
    const w = world()
    const s = sighted(w)
    expect(await s.failure('show', { name: 'reports.sections' })).toMatchObject({ kind: 'invalid' })
    const sections = contract('reports.sections', {
      summary: 'The sections of a weekly report.',
      arity: 'keyed-list',
      binding: 'build',
      item: { kind: 'pure', fields: { render: 'function' } },
      onError: 'the section is left out',
    })
    w.server = registryOf(
      ...serverParts(),
      ['weekly-reports', [declare(sections)]],
      ['sales', [entry('reports.sections', 'sales', { id: 'q1', item: { render: () => '' } })]],
    )
    expect(await s.text('tree', { side: 'server', under: 'reports' })).toContain(
      '  reports.sections   point   The sections of a weekly report.   [keyed-list, build]',
    )
    const shown = await s.text('show', { name: 'reports.sections' })
    expect(shown.split('\n').slice(1, 12)).toEqual([
      'reports.sections   point, server   v1.1',
      'The sections of a weekly report.',
      'key: the name of an implementation',
      'holds: a list per key; two different items in one place are a conflict and neither is used',
      'may change: only when the application is built',
      'a member gives: a pure function. fields: render (function)',
      'the host gives it: nothing',
      'when it throws: the section is left out',
      'now:',
      '  sales / q1   sales#1 deployment   [in effect]',
      'tree rev 7c1f.0',
    ])
  })
})

describe('changes', () => {
  const grown = (): Registry => {
    const outcome = install(registryOf(...serverParts()), { fiber: 'weekly', generation: 1 }, [
      declare(contract('reports.sections')),
      entry(SKILLS, 'release-notes', { scope: ['t1'] }),
      entry(SKILLS, 'other-notes', { scope: ['t2'] }),
    ])
    if (outcome.kind !== 'installed') throw new Error(outcome.detail)
    return outcome.registry
  }

  it('without since says the current revision', async () => {
    expect(await sighted(world()).text('changes')).toBe(
      [
        'done OmneExtensionPoints changes',
        'now at 7c1f.0. Give since=<a revision you saw> to list what appeared, went away or changed state after it.',
        'tree rev 7c1f.0',
      ].join('\n'),
    )
  })

  it('lists what appeared, went away or changed state, as the acting tenant sees it', async () => {
    const s = sighted(world())
    const before = registryOf(...serverParts())
    s.revisions.record(before)
    const after = grown()
    s.revisions.record(after)
    s.revisions.record(retire(after, { fiber: 'pdf', generation: 1 }))
    expect(await s.text('changes', { since: '7c1f.1' })).toBe(
      [
        'done OmneExtensionPoints changes',
        'since 7c1f.1:',
        '  + point    reports.sections               server                 declared by weekly#1 deployment   (show reports.sections for its rules)',
        '  + placed   skill.skills / release-notes   weekly#1 this tenant   [in effect]',
        '  ~ state    skill.skills / pdf-tools       pdf#1 this tenant      in effect → not in effect: retiring',
        'tree rev 7c1f.3',
      ].join('\n'),
    )
    expect(await s.text('changes', { since: '7c1f.3' })).toContain(
      'since 7c1f.3:\n  nothing changed',
    )
  })

  it.each(['7a90.1', '7c1f.9', '7c1f', 'nonsense'])('%s is not known', async since => {
    const s = sighted(world())
    s.revisions.record(registryOf())
    expect(await s.text('changes', { since })).toBe(
      [
        'done OmneExtensionPoints changes',
        `${since} is not known: it is from before this server started, or older than the revisions kept. The tree as it is now: use tree.`,
        'tree rev 7c1f.1',
      ].join('\n'),
    )
  })
})

describe('a call with no sight attached', () => {
  it('fails as unavailable; help still answers', async () => {
    expect(
      await answerExtensionPoints({ command: 'show', params: { name: 'x' } }, unattached()),
    ).toEqual({
      failure: {
        kind: 'unavailable',
        operation: 'OmneExtensionPoints.show',
        reason: 'the extension trees are not attached to this call',
      },
    })
    const help = await answerExtensionPoints({ command: 'help', params: {} }, unattached())
    expect(help).toHaveProperty('ok')
  })
})
