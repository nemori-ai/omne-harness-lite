/**
 * Walks one event from a source to a recipient's inbox without Cordis and without SQL.
 * Every step prints its input and what the group answered, and fails the run when the
 * answer is not the expected one.
 */
import assert from 'node:assert/strict'
import {
  createInbox,
  createSending,
  createSourceRegistry,
  createSubscriptions,
} from '@omne-harness/notification'
import {
  context,
  createMemoryStore,
  fakeAuthority,
  fakeClock,
  fakeConsent,
} from '@omne-harness/notification/testing'
import {
  eventTypeNameSchema,
  sourceNameSchema,
  type RecipientRef,
  type SendRequestInput,
} from '@omne-harness/notification-contract'

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
})
const inbox = createInbox({ authority, store, clock, pageLimit: 50 })
const consent = fakeConsent()
const subscriptions = createSubscriptions({
  authority,
  store,
  sources,
  consent,
  clock,
  beatRange: { min: 5, max: 1440 },
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
console.log('通知走查：发送、入箱、处置、订阅')
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
const asTriager = context('tenant-demo', { kind: 'agent', recipient: triager })
const agentChange = { ...strongForRepo, recipient: triager, note: '失败了就开一张卡' } as const
const asked = await subscriptions.set(asTriager, agentChange)
show('受托的 agent 给自己订：owner 的方式是逐条确认，答「要 owner 确认」', agentChange, asked)
assert.equal(asked.kind, 'needs-confirmation')
const content = asked.kind === 'needs-confirmation' ? asked.request.content : ''

const wrong = await subscriptions.set(
  asTriager,
  { ...agentChange, note: '失败了就直接回滚' },
  {
    decision: 'card-17',
    content,
    approved: true,
  },
)
show('拿 owner 对另一份内容的同意来订：拒绝', '备注改成「失败了就直接回滚」', wrong)
assert.deepEqual(wrong, { kind: 'refused', reason: 'confirmation-mismatch' })

const agreed = await subscriptions.set(asTriager, agentChange, {
  decision: 'card-17',
  content,
  approved: true,
})
show('带着 owner 对同一份内容的同意重提：成立，依据是这次答复', 'card-17', agreed)
assert.deepEqual(agreed.kind === 'done' && agreed.value.basis, {
  kind: 'granular',
  decision: 'card-17',
})

const lowered = await subscriptions.set(asTriager, { ...agentChange, level: 'weak' })
show('agent 自己调低：不要同意，依据不变', '强改弱', lowered)
assert.deepEqual(lowered.kind === 'done' && lowered.value.basis, {
  kind: 'granular',
  decision: 'card-17',
})

console.log(`\n走查通过：${step} 步。`)
