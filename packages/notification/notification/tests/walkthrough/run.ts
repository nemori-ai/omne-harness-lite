/**
 * Walks one event from a source to a recipient's inbox without Cordis and without SQL.
 * Every step prints its input and what the group answered, and fails the run when the
 * answer is not the expected one.
 */
import assert from 'node:assert/strict'
import {
  createChannelRegistry,
  createDelivery,
  createInbox,
  createSending,
  createSourceRegistry,
  createSubscriptions,
  type RecipientDefaults,
} from '@omne-harness/notification'
import {
  context,
  createMemoryStore,
  fakeAuthority,
  fakeChannel,
  fakeClock,
  fakeConsent,
  fakeHints,
  fakeStanding,
} from '@omne-harness/notification/testing'
import {
  channelNameSchema,
  eventTypeNameSchema,
  sourceNameSchema,
  type RecipientRef,
  type SendRequestInput,
} from '@omne-harness/notification-contract'

const defaults: RecipientDefaults = {
  person: { channel: channelNameSchema.parse('in-app'), minLevel: 'weak' },
  agent: { channel: channelNameSchema.parse('session'), minLevel: 'weak' },
}
const store = createMemoryStore()
const authority = fakeAuthority()
const clock = fakeClock('2026-11-18T06:00:00.000Z')
const sources = createSourceRegistry()
const sending = createSending({
  authority,
  store,
  sources,
  clock,
  limits: { bodyLength: 4000, causalDepth: 3 },
  defaults,
})
const inbox = createInbox({ authority, store, clock, pageLimit: 50 })
const consent = fakeConsent()
const subscriptions = createSubscriptions({
  authority,
  store,
  sources,
  consent,
  clock,
  defaults,
  beatRange: { min: 5, max: 1440 },
})
const channels = createChannelRegistry()
const inApp = fakeChannel('in-app')
const sessionInput = fakeChannel('session', { defaultMinIntervalMs: 10 * 60_000 })
channels.register(inApp)
channels.register(sessionInput)
const hints = fakeHints()
const delivery = createDelivery({
  store,
  channels,
  sources,
  authority,
  standing: fakeStanding(),
  clock,
  hints,
  defaults,
  config: {
    listLimit: 3,
    retry: { maxAttempts: 3, backoffMs: [60_000] },
    deliverTimeoutMs: 1000,
    defaultBeatMinutes: 30,
  },
})
const owner = context('tenant-demo')
const person: RecipientRef = { kind: 'person' }

let step = 0
function show(title: string, input: unknown, answer: unknown): void {
  step += 1
  console.log(`\n── ${step}. ${title}`)
  console.log('   输入：', JSON.stringify(input))
  console.log('   答复：', JSON.stringify(answer))
}

const request = (eventId: string, title: string): SendRequestInput => ({
  identity: { tenant: 'tenant-demo', source: 'demo.builds', eventId },
  event: {
    type: 'finished',
    subject: 'repo/harness',
    at: '2026-11-18T05:59:30.000Z',
    content: { title, body: `${title}。详情见构建页。`, locator: { kind: 'build', ref: eventId } },
    replaceKey: null,
    renotify: false,
    named: [],
    origin: null,
  },
})

sources.register({
  name: sourceNameSchema.parse('demo.builds'),
  label: '演示：构建',
  types: [
    {
      name: eventTypeNameSchema.parse('finished'),
      label: '构建结束',
      description: '一次构建结束了，成功或失败。',
      kind: { kind: 'event' },
      subject: { presence: 'required', hint: '仓库路径，例如 repo/harness' },
      subscribable: ['person', 'agent'],
      nameable: ['person'],
      defaults: { person: 'weak', agent: 'off' },
      external: false,
    },
  ],
})
console.log('通知走查：发送、入箱、处置、订阅、合并')
console.log('来源 demo.builds 已登记，事件类型 finished 对人的缺省是弱。')

// 发送
const first = request('build-41', '构建 41 失败')
const accepted = await sending.send(owner, first)
show('发送：来源交一个事件', first.identity, accepted)
assert.equal(accepted.kind, 'done')
assert.deepEqual(accepted.kind === 'done' && accepted.value.recipients, [person])

const again = await sending.send(owner, first)
show('同一个发送身份再发一次：认回，不写', first.identity, again)
assert.deepEqual(again.kind === 'done' && again.recalled, true)

const conflict = await sending.send(owner, request('build-41', '构建 41 成功'))
show('同一个发送身份换了内容：冲突，不覆盖', '标题改成「构建 41 成功」', conflict)
assert.deepEqual(conflict, { kind: 'refused', reason: 'conflict' })

// 入箱
const page = await inbox.list(owner, {
  recipient: person,
  filter: 'unresolved',
  after: null,
  limit: 10,
})
show('入箱：答了已接下，通知已经在收件人的箱里', '列箱（没了结的）', page)
assert.equal(page.kind === 'done' && page.value.entries.length, 1)

const ref = { recipient: person, identity: { ...first.identity } as never }
const view = await inbox.read(owner, ref)
show('读一条：全文，读不会把它标成看过', first.identity, view)
assert.equal(view.kind === 'done' && view.value.marks.seenAt, null)

// 处置
clock.advance(60_000)
const done = await inbox.mark(owner, ref, 'done')
show('处置：标成办完', '办完', done)
assert.equal(done.kind === 'done' && done.value.resolved?.how, 'done')

const dismiss = await inbox.mark(owner, ref, 'dismiss')
show('办完之后直接划掉：拒绝，要先恢复', '划掉', dismiss)
assert.deepEqual(dismiss, { kind: 'refused', reason: 'restore-first' })

const empty = await inbox.list(owner, {
  recipient: person,
  filter: 'unresolved',
  after: null,
  limit: 10,
})
show('再列箱（没了结的）：没有了；它仍在「全部」里', '列箱（没了结的）', empty)
assert.equal(empty.kind === 'done' && empty.value.entries.length, 0)

const other = await inbox.read(context('tenant-other'), ref)
show('另一个租户来读这一条：和不存在是同一个拒绝', 'tenant-other', other)
assert.deepEqual(other, { kind: 'refused', reason: 'not-found' })

// 订阅
const strongForRepo = {
  recipient: person,
  source: 'demo.builds',
  type: 'finished',
  scope: { kind: 'subject-prefix', prefix: 'repo/' },
  level: 'strong',
  note: null,
  term: { kind: 'standing' },
} as const
const ownerSet = await subscriptions.set(owner, strongForRepo)
show('订阅：owner 把 repo/ 开头的构建结果设成强', strongForRepo, ownerSet)
assert.equal(ownerSet.kind === 'done' && ownerSet.value.basis.kind, 'owner')

await sending.send(owner, request('build-42', '构建 42 失败'))
const afterSubscription = await inbox.read(owner, {
  recipient: person,
  identity: { ...request('build-42', '').identity } as never,
})
show('之后的发送按订阅算：强，缘由是命中的那条订阅', 'build-42', afterSubscription)
assert.equal(afterSubscription.kind === 'done' && afterSubscription.value.level, 'strong')
assert.equal(
  afterSubscription.kind === 'done' && afterSubscription.value.cause.kind,
  'subscription',
)

const earlier = await inbox.read(owner, ref)
show('订阅之前入箱的那条不变：仍是弱', 'build-41', earlier)
assert.equal(earlier.kind === 'done' && earlier.value.level, 'weak')

const triager: RecipientRef = { kind: 'agent', ref: 'session-triage' }
const asTriager = {
  ...context('tenant-demo', { kind: 'agent', recipient: triager }),
  call: 'call-17',
}
const agentChange = { ...strongForRepo, recipient: triager, note: '失败了就开一张卡' } as const
const without = await subscriptions.set(asTriager, agentChange)
show('受托的 agent 给自己订，这次调用的放行没带同意：拒绝，不写', agentChange, without)
assert.deepEqual(without, { kind: 'refused', reason: 'consent-required' })

const once = '{"holder":"session-triage","via":"once"}'
consent.set({ kind: 'consented', basis: { kind: 'granular', scope: 'session', grant: once } })
const agreed = await subscriptions.set(asTriager, agentChange)
show('这次调用凭一笔单次授权放行：成立，依据是逐条，存着授权引用', once, agreed)
assert.deepEqual(agreed.kind === 'done' && agreed.value.basis, { kind: 'granular', grant: once })

const standing = '{"holder":"tenant-demo","layer":"tenant","via":"verdict"}'
consent.set({ kind: 'consented', basis: { kind: 'blanket', scope: 'standing', grant: standing } })
const lowered = await subscriptions.set(asTriager, { ...agentChange, level: 'weak' })
show('agent 自己调低也是一次订阅：凭裁定放行，依据换成持续的全权', '强改弱', lowered)
assert.deepEqual(lowered.kind === 'done' && lowered.value.basis, {
  kind: 'blanket',
  scope: 'standing',
  grant: standing,
})

// 合并
const tenant = owner.tenant
const pushed = (channel: typeof inApp) =>
  channel.deliveries.map(({ unit }) => ({
    kind: unit.kind,
    body: unit.body.kind,
    members: unit.members.map(member => member.eventId),
  }))

const strongAgain = { ...agentChange, note: '失败了就开一张卡' } as const
const raised = await subscriptions.set(asTriager, strongAgain)
assert.equal(raised.kind, 'done')

clock.set('2026-11-18T06:05:00.000Z')
await sending.send(owner, request('build-43', '构建 43 失败'))
await delivery.advance(tenant)
show('合并：第一条强通知立刻推给 agent，一条通知一个单元，带全文', 'build-43', pushed(sessionInput))
assert.deepEqual(pushed(sessionInput), [{ kind: 'strong', body: 'single', members: ['build-43'] }])

clock.set('2026-11-18T06:06:00.000Z')
await sending.send(owner, request('build-44', '构建 44 失败'))
await sending.send(owner, request('build-45', '构建 45 失败'))
await delivery.advance(tenant)
show('最小间隔（10 分钟）里又来两条：不推，排队；请时钟在间隔结束时叫醒', '06:06', {
  pushed: pushed(sessionInput).length,
  wake: hints.wakes.find(wake => wake.at === '2026-11-18T06:15:00.000Z'),
})
assert.equal(sessionInput.deliveries.length, 1)

clock.set('2026-11-18T06:15:00.000Z')
await delivery.advance(tenant)
show('间隔结束：攒下的两条合成一个单元，一份摘要', '06:15', pushed(sessionInput).at(-1))
assert.deepEqual(pushed(sessionInput).at(-1), {
  kind: 'strong',
  body: 'digest',
  members: ['build-44', 'build-45'],
})

sessionInput.answer({ kind: 'unknown' })
clock.set('2026-11-18T06:26:00.000Z')
await sending.send(owner, request('build-46', '构建 46 失败'))
await delivery.advance(tenant)
clock.set('2026-11-18T06:27:00.000Z')
await delivery.advance(tenant)
const [firstTry, secondTry] = sessionInput.deliveries.slice(-2)
show('一次投递结果不知道：退避后再投，是同一个单元、同一个身份', 'build-46', {
  sameIdentity: firstTry?.unit.id === secondTry?.unit.id,
  members: secondTry?.unit.members.map(member => member.eventId),
})
assert.deepEqual(firstTry?.unit, secondTry?.unit)

const before = store.commits()
clock.set('2026-11-18T06:30:00.000Z')
await delivery.advance(tenant)
show('节拍到点：把还没了结的合成一份摘要，各去处一次', '06:30', {
  agent: pushed(sessionInput).at(-1),
  person: pushed(inApp).at(-1),
})
assert.equal(pushed(sessionInput).at(-1)?.kind, 'beat')
assert.equal(pushed(inApp).at(-1)?.kind, 'beat')

for (const eventId of ['build-42', 'build-43', 'build-44', 'build-45', 'build-46']) {
  const identity = { ...request(eventId, '').identity } as never
  await inbox.mark(owner, { recipient: person, identity }, 'seen')
  await inbox.mark(owner, { recipient: triager, identity }, 'done')
}
const settled = store.commits()
clock.set('2026-11-18T07:00:00.000Z')
const deliveredBefore = inApp.deliveries.length + sessionInput.deliveries.length
await delivery.advance(tenant)
show('下一拍没有该提醒的：不形成单元，不写任何事实，不投递', '07:00', {
  commits: store.commits() - settled,
  deliveries: inApp.deliveries.length + sessionInput.deliveries.length - deliveredBefore,
})
assert.equal(store.commits(), settled)
assert.equal(inApp.deliveries.length + sessionInput.deliveries.length, deliveredBefore)
assert.ok(settled > before)

console.log(`\n走查通过：${step} 步。`)
