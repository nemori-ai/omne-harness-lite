import type { HistoryEntry, ProtocolDriver } from '../support/matrix/protocol-driver.ts'
import {
  TURN_MS,
  messageText,
  sameHistory,
  shellCommand,
  signedIn,
  type Cell,
  type CellTools,
} from './cell.ts'
import { historyMatches, settled } from './cells-g.ts'

const SMALL_PAGE = 2048

async function turns(
  tools: CellTools,
  client: ProtocolDriver,
  session: string,
  count: number,
  size = 300,
): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    tools.stub.push({ kind: 'reply', text: `reply-${String(index)}-${'h'.repeat(size)}` })
    await client.send(session, `turn ${String(index)}`)
    await tools.waitLog(
      session,
      `turn ${String(index)} terminal`,
      log => log.terminals.length === index + 1 && settled(log),
      TURN_MS,
    )
  }
}

const ids = (entries: readonly HistoryEntry[]) => entries.map(entry => entry.entryId)

export const hCells: readonly Cell[] = [
  {
    id: 'H-1',
    block: 'H',
    layer: 'protocol',
    run: async tools => {
      const client = await signedIn(tools)
      const session = await client.createSession()
      await turns(tools, client, session, 2, 20)
      const other = await client.createSession()
      await turns(tools, client, other, 1, 20)
      const page = await client.readHistoryPage(session, 65_536)
      tools.check(
        'o1 a short session comes back in one page',
        page.outcome === 'succeeded' && page.exhausted,
        `exhausted ${String(page.exhausted)}`,
      )
      const log = tools.log(session)
      const same = log === null ? { ok: false, detail: 'no log' } : sameHistory(log, page.entries)
      tools.check('o1 the page equals the log', same.ok, same.detail)
    },
  },
  {
    id: 'H-2',
    block: 'H',
    layer: 'page',
    probe: 'h-block.mjs (long-session.mjs builds the session)',
  },
  {
    id: 'H-3',
    block: 'H',
    layer: 'page',
    probe: 'h-block.mjs (long-session.mjs builds the session)',
  },
  {
    id: 'H-4',
    block: 'H',
    layer: 'protocol',
    run: async tools => {
      const client = await signedIn(tools)
      const session = await client.createSession()
      await turns(tools, client, session, 8)
      const first = await client.readHistoryPage(session, SMALL_PAGE)
      tools.check(
        'the first page is not the whole session',
        first.outcome === 'succeeded' && !first.exhausted && first.next !== null,
        `exhausted ${String(first.exhausted)}`,
      )
      tools.stub.push({ kind: 'reply', text: 'h4-new-reply' })
      await client.send(session, 'h4 new message')
      await tools.waitLog(session, 'new turn terminal', log => log.terminals.length === 9, TURN_MS)
      const older: (readonly HistoryEntry[])[] = []
      let cursor = first.next
      let pages = 1
      while (cursor !== null) {
        const page = await client.readFrom(session, cursor)
        if (page.outcome !== 'succeeded') break
        older.push(page.entries)
        pages += 1
        cursor = page.exhausted ? null : page.next
      }
      const chain = [...older.reverse().flat(), ...first.entries]
      const unique = new Set(ids(chain)).size === chain.length
      tools.check(
        'older pages join the first page with no repeat',
        unique,
        `${String(chain.length)} entries, ${String(new Set(ids(chain)).size)} distinct, ${String(pages)} pages`,
      )
      tools.check(
        'the paged chain does not mix in the new message',
        !chain.some(entry => messageText(entry).includes('h4 new message')),
      )
      const fresh = await client.readHistory(session, SMALL_PAGE)
      const log = tools.log(session)
      const same = log === null ? { ok: false, detail: 'no log' } : sameHistory(log, fresh.entries)
      tools.check(
        'a fresh read has the new message at the bottom, nothing lost',
        same.ok &&
          messageText(
            fresh.entries.filter(entry => entry.kind === 'message.assistant').at(-1) ?? {
              entryId: '',
              revision: '',
              kind: '',
              payload: null,
            },
          ) === 'h4-new-reply',
        same.detail,
      )
      const before = new Set(ids(chain))
      const freshBefore = fresh.entries.filter(entry => before.has(entry.entryId))
      tools.check(
        'the chain is the same as the older part of a fresh read',
        JSON.stringify(ids(freshBefore)) === JSON.stringify(ids(chain)),
        `${String(freshBefore.length)} vs ${String(chain.length)}`,
      )
    },
  },
  {
    id: 'H-5',
    block: 'H',
    layer: 'protocol',
    run: async tools => {
      const client = await signedIn(tools)
      const session = await client.createSession()
      const words = ['p0', 'p1', 'p2', 'p3']
      const [head, ...rest] = words.map(word => ({
        name: 'Shell',
        arguments: shellCommand(`echo out-${word}`),
      }))
      if (head === undefined) return
      tools.stub.push(
        { kind: 'tool-call', name: head.name, arguments: head.arguments, more: rest },
        { kind: 'reply', text: 'h5-done' },
      )
      await client.send(session, 'h5 parallel')
      const log = await tools.waitLog(session, 'run terminal', entry => settled(entry), TURN_MS)
      tools.check(
        'the run completed',
        log?.terminals[0] === 'completed',
        JSON.stringify(log?.terminals),
      )
      const history = await client.readHistory(session)
      const results = history.entries
        .filter(entry => entry.kind === 'message.tool')
        .map(entry => JSON.stringify(entry.payload))
      const paired = words.every(
        word => results.filter(text => text.includes(`out-${word}`)).length === 1,
      )
      tools.check(
        'every parallel call has its own result, once',
        paired && results.length === words.length,
        `${String(results.length)} results`,
      )
      const calls = history.entries
        .filter(entry => entry.kind === 'message.assistant')
        .flatMap(entry =>
          [...JSON.stringify(entry.payload).matchAll(/call_\d_[a-z0-9]+/g)].map(match => match[0]),
        )
      const callIds = new Set(calls)
      const resultIds = results.flatMap(text =>
        [...text.matchAll(/call_\d_[a-z0-9]+/g)].map(match => match[0]),
      )
      tools.check(
        'each result names one of the calls',
        resultIds.length === words.length && resultIds.every(id => callIds.has(id)),
        `${String(callIds.size)} calls, ${JSON.stringify(resultIds)}`,
      )
      await historyMatches(tools, client, session)
    },
  },
  {
    id: 'H-6',
    block: 'H',
    layer: 'protocol',
    run: async tools => {
      const client = await signedIn(tools)
      const session = await client.createSession()
      await turns(tools, client, session, 4)
      const before = await client.readHistory(session, SMALL_PAGE)
      await tools.env.restart('stop')
      const back = tools.driver(client.account)
      tools.check('logged in again', (await back.login()) === 'succeeded')
      const after = await back.readHistory(session, SMALL_PAGE)
      tools.check(
        'the cold read equals the read before the restart',
        after.outcome === 'succeeded' &&
          JSON.stringify(ids(after.entries)) === JSON.stringify(ids(before.entries)),
        `${String(before.entries.length)} -> ${String(after.entries.length)}`,
      )
    },
  },
  {
    id: 'H-7',
    block: 'H',
    layer: 'protocol',
    run: async tools => {
      const client = await signedIn(tools)
      const left = await client.createSession()
      await turns(tools, client, left, 1, 10)
      const right = await client.createSession()
      await turns(tools, client, right, 1, 10)
      const reads = await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
          client.readHistory(index % 2 === 0 ? left : right),
        ),
      )
      const logs = { left: tools.log(left), right: tools.log(right) }
      const mixed = reads.filter((read, index) => {
        const log = index % 2 === 0 ? logs.left : logs.right
        return log === null || !sameHistory(log, read.entries).ok
      })
      tools.check(
        'every read shows only its own session',
        mixed.length === 0,
        `${String(mixed.length)} of ${String(reads.length)} reads differ`,
      )
    },
  },
]
