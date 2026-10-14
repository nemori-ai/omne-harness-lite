import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'

const MIN_SQLITE = [3, 51, 3]

function versionAtLeast(text, floor) {
  const parts = String(text).split('.').map(part => Number(part))
  for (let i = 0; i < floor.length; i += 1) {
    const got = parts[i] ?? 0
    if (got > floor[i]) return true
    if (got < floor[i]) return false
  }
  return true
}

function providerSource() {
  return `
    import { parentPort } from 'node:worker_threads'
    import { DatabaseSync } from 'node:sqlite'
    import { createHash } from 'node:crypto'

    function canonical(value) {
      if (value === null) return 'null'
      if (typeof value === 'string') return JSON.stringify(value)
      if (typeof value === 'boolean') return value ? 'true' : 'false'
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new Error('facts_not_json')
        return JSON.stringify(value)
      }
      if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
      if (typeof value === 'object') {
        const keys = Object.keys(value).sort()
        return '{' + keys.map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'
      }
      throw new Error('facts_not_json')
    }
    function digestOf(commands) {
      const ordered = [...commands].sort((a, b) => a.participant.localeCompare(b.participant))
      const body = canonical(ordered.map(command => ({ facts: command.facts, participant: command.participant })))
      return createHash('sha256').update(body).digest('hex')
    }

    let db
    let generation = 0
    const queue = []
    const limit = 2

    function pragma(name) {
      return db.prepare('PRAGMA ' + name).get()
    }
    function open(file) {
      db = new DatabaseSync(file)
      db.exec("PRAGMA journal_mode = WAL")
      db.exec("PRAGMA synchronous = FULL")
      db.exec("PRAGMA foreign_keys = ON")
      db.exec(\`CREATE TABLE IF NOT EXISTS registrations (
        tenant TEXT, domain TEXT, version TEXT, participants TEXT,
        PRIMARY KEY (tenant, domain, version))\` )
      db.exec(\`CREATE TABLE IF NOT EXISTS receipts (
        tenant TEXT, domain TEXT, operation TEXT, protocol TEXT, opkey TEXT,
        digest TEXT, kind TEXT,
        PRIMARY KEY (tenant, domain, operation, protocol, opkey))\` )
      db.exec(\`CREATE TABLE IF NOT EXISTS facts (
        tenant TEXT, domain TEXT, opkey TEXT, participant TEXT, payload TEXT)\` )
      const version = db.prepare('select sqlite_version() as v').get().v
      const journal = pragma('journal_mode').journal_mode
      const sync = pragma('synchronous').synchronous
      const fk = pragma('foreign_keys').foreign_keys
      return { version, journal, sync, fk }
    }
    function findReceipt(id) {
      return db.prepare(\`SELECT digest, kind FROM receipts
        WHERE tenant = ? AND domain = ? AND operation = ? AND protocol = ? AND opkey = ?\`)
        .get(id.tenant, id.transactionDomain, id.operation, id.protocolVersion, id.operationKey)
    }
    function port(sql) {
      const word = String(sql).trim().split(/\s+/)[0]
      const upper = word ? word.toUpperCase() : ''
      if (['BEGIN', 'COMMIT', 'ROLLBACK', 'END', 'SAVEPOINT', 'RELEASE'].includes(upper)) {
        return { refused: true, word: upper }
      }
      db.exec(sql)
      return { refused: false }
    }
    function commit(message) {
      if (message.closing) return { kind: 'rejected_before_accept', reason: 'closing' }
      if (message.identity.protocolVersion !== '1') {
        return { kind: 'rejected_before_accept', reason: 'unsupported_protocol' }
      }
      if (!message.commands || message.commands.length === 0) {
        return { kind: 'rejected_before_accept', reason: 'field_missing' }
      }
      if (message.commands.length > 1 && message.enforceCommandLimit) {
        return { kind: 'rejected_before_accept', reason: 'command_limit' }
      }
      if (message.generation !== generation) {
        return { kind: 'rejected_before_accept', reason: 'writer_not_current' }
      }
      if (queue.length >= limit) {
        return { kind: 'rejected_before_accept', reason: 'queue_full' }
      }
      const id = message.identity
      const reg = db.prepare(\`SELECT participants FROM registrations
        WHERE tenant = ? AND domain = ? AND version = ?\`)
        .get(id.tenant, id.transactionDomain, message.combinationVersion)
      if (!reg) return { kind: 'rejected_before_accept', reason: 'combination_unregistered' }
      const names = JSON.parse(reg.participants)
      if (message.commands.some(command => !names.includes(command.participant))) {
        return { kind: 'rejected_before_accept', reason: 'participant_not_in_combination' }
      }
      const participants = message.commands.map(command => command.participant)
      if (new Set(participants).size !== participants.length) {
        return { kind: 'rejected_before_accept', reason: 'participant_repeated' }
      }
      let digest
      try { digest = digestOf(message.commands) }
      catch { return { kind: 'rejected_before_accept', reason: 'facts_not_json' } }
      const existing = findReceipt(id)
      if (existing && existing.digest === digest) {
        return { kind: existing.kind, identity: id, inputDigest: digest, replayed: true }
      }
      if (existing) {
        return { kind: 'identity_conflict', existing: { kind: existing.kind, identity: id, inputDigest: existing.digest } }
      }
      queue.push(id.operationKey)
      try {
        db.exec('BEGIN IMMEDIATE')
        if (message.failSecond) {
          db.prepare('INSERT INTO facts (tenant, domain, opkey, participant, payload) VALUES (?, ?, ?, ?, ?)')
            .run(id.tenant, id.transactionDomain, id.operationKey, 'a', '{}')
          db.exec('CREATE TABLE probe_ddl (id INTEGER PRIMARY KEY)')
          db.exec('INSERT INTO probe_ddl (id) VALUES (1)')
          db.exec('INSERT INTO probe_ddl (id) VALUES (1)')
        } else {
          for (const command of message.commands) {
            db.prepare('INSERT INTO facts (tenant, domain, opkey, participant, payload) VALUES (?, ?, ?, ?, ?)')
              .run(id.tenant, id.transactionDomain, id.operationKey, command.participant, canonical(command.facts))
          }
        }
        db.prepare(\`INSERT INTO receipts (tenant, domain, operation, protocol, opkey, digest, kind)
          VALUES (?, ?, ?, ?, ?, ?, 'committed')\`)
          .run(id.tenant, id.transactionDomain, id.operation, id.protocolVersion, id.operationKey, digest)
        db.exec('COMMIT')
        queue.pop()
        return { kind: 'committed', identity: id, inputDigest: digest }
      } catch (error) {
        db.exec('ROLLBACK')
        queue.pop()
        db.exec('BEGIN IMMEDIATE')
        db.prepare(\`INSERT INTO receipts (tenant, domain, operation, protocol, opkey, digest, kind)
          VALUES (?, ?, ?, ?, ?, ?, 'rolled_back')\`)
          .run(id.tenant, id.transactionDomain, id.operation, id.protocolVersion, id.operationKey, digest)
        db.exec('COMMIT')
        const left = db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'probe_ddl'").get().n
        return { kind: 'rolled_back', identity: id, inputDigest: digest, ddlLeft: left, error: String(error) }
      }
    }
    function query(id) {
      if (id.tenant !== 'tenant-a') return { kind: 'unknown' }
      const row = findReceipt(id)
      if (!row) return { kind: 'unknown', proofsIncomplete: true }
      return { kind: row.kind, identity: id, inputDigest: row.digest }
    }

    parentPort.on('message', message => {
      if (message.type === 'open') {
        generation = message.generation
        parentPort.postMessage({ ok: true, ...open(message.file) })
        return
      }
      if (message.type === 'register') {
        const body = message.registration
        db.prepare(\`INSERT INTO registrations (tenant, domain, version, participants)
          VALUES (?, ?, ?, ?)\`)
          .run(body.tenant, body.transactionDomain, body.combinationVersion, JSON.stringify(body.participants))
        parentPort.postMessage({ kind: 'registered' })
        return
      }
      if (message.type === 'commit') {
        const result = commit(message)
        if (message.exitBeforeResponse) process.exit(0)
        parentPort.postMessage(result)
        return
      }
      if (message.type === 'query') {
        parentPort.postMessage(query(message.identity))
        return
      }
      if (message.type === 'execute') {
        parentPort.postMessage(port(message.sql))
        return
      }
      if (message.type === 'hold') {
        generation = message.generation
        parentPort.postMessage({ held: true, generation })
      }
    })
  `
}

function startWorker(file, generation) {
  const worker = new Worker(providerSource(), { eval: true })
  const pending = new Map()
  let seq = 0
  worker.on('message', message => {
    const id = message.__id
    if (id === undefined) {
      const first = pending.keys().next().value
      const wait = pending.get(first)
      pending.delete(first)
      wait?.(message)
      return
    }
  })
  function ask(message) {
    return new Promise(resolve => {
      const id = ++seq
      pending.set(id, resolve)
      worker.postMessage(message)
    })
  }
  return { worker, ask, ready: ask({ type: 'open', file, generation }) }
}

const root = mkdtempSync(join(tmpdir(), 'sqlite-provider-probe-'))
const file = join(root, 'provider.sqlite')
const observations = []

function record(name, value) {
  observations.push({ name, value })
}

const identity = {
  tenant: 'tenant-a',
  transactionDomain: 'domain-1',
  operation: 'save',
  protocolVersion: '1',
  operationKey: 'op-1',
}
const commands = [{ participant: 'calendar', facts: { title: 'stand-up' } }]

const first = startWorker(file, 1)
const opened = await first.ready
record('config-readback', {
  node: process.version,
  sqlite: opened.version,
  floorOk: versionAtLeast(opened.version, MIN_SQLITE),
  journal: opened.journal,
  synchronous: opened.sync,
  foreignKeys: opened.fk,
  file,
})
if (!versionAtLeast(opened.version, MIN_SQLITE)) {
  console.log(JSON.stringify({ ok: false, observations }, null, 2))
  process.exit(1)
}

await first.ask({
  type: 'register',
  registration: {
    tenant: 'tenant-a',
    transactionDomain: 'domain-1',
    combinationVersion: 'v1',
    participants: ['calendar'],
  },
})

const stale = await first.ask({
  type: 'commit',
  generation: 2,
  identity,
  combinationVersion: 'v1',
  commands,
})
record('writer-not-current', stale)
const staleQuery = await first.ask({ type: 'query', identity })
record('query-while-old-generation-held', staleQuery)

const committed = await first.ask({
  type: 'commit',
  generation: 1,
  identity,
  combinationVersion: 'v1',
  commands,
})
record('first-commit', committed)
const replay = await first.ask({
  type: 'commit',
  generation: 1,
  identity,
  combinationVersion: 'v1',
  commands: [{ participant: 'calendar', facts: { title: 'stand-up' } }],
})
record('same-digest-replay', replay)
const conflict = await first.ask({
  type: 'commit',
  generation: 1,
  identity,
  combinationVersion: 'v1',
  commands: [{ participant: 'calendar', facts: { title: 'other' } }],
})
record('different-digest', conflict)

const otherTenant = await first.ask({
  type: 'query',
  identity: { ...identity, tenant: 'tenant-b' },
})
record('cross-tenant-query', otherTenant)

const abort = new AbortController()
const observed = first.ask({
  type: 'commit',
  generation: 1,
  identity: { ...identity, operationKey: 'op-observe' },
  combinationVersion: 'v1',
  commands,
})
abort.abort()
record('observer-left', { aborted: abort.signal.aborted, workerStillAnswered: await observed })

const rollback = await first.ask({
  type: 'commit',
  generation: 1,
  failSecond: true,
  identity: { ...identity, operationKey: 'op-rollback' },
  combinationVersion: 'v1',
  commands,
})
record('rollback', rollback)

const exitPromise = new Promise(resolve => first.worker.once('exit', resolve))
first.ask({
  type: 'commit',
  generation: 1,
  exitBeforeResponse: true,
  identity: { ...identity, operationKey: 'op-exit' },
  combinationVersion: 'v1',
  commands,
})
const exitCode = await exitPromise
const second = startWorker(file, 1)
await second.ready
const afterExit = await second.ask({
  type: 'query',
  identity: { ...identity, operationKey: 'op-exit' },
})
record('worker-exit-then-query', { exitCode, afterExit })

await second.worker.terminate()
const third = startWorker(file, 1)
await third.ready
const registrationStillThere = await third.ask({
  type: 'commit',
  generation: 1,
  identity: { ...identity, operationKey: 'op-after-restart' },
  combinationVersion: 'v1',
  commands,
})
record('registration-after-restart', registrationStillThere)

const blocked = new Set(['BEGIN', 'COMMIT', 'ROLLBACK', 'END', 'SAVEPOINT', 'RELEASE'])
const portResults = []
for (const sql of ['commit', 'ROLLBACK', 'select 1']) {
  portResults.push(await third.ask({ type: 'execute', sql }))
}
record('port-refuses-transaction-sql', portResults)

record('unsupported-protocol', await third.ask({
  type: 'commit',
  generation: 1,
  identity: { ...identity, protocolVersion: '9', operationKey: 'op-proto' },
  combinationVersion: 'v1',
  commands,
}))
record('empty-commands', await third.ask({
  type: 'commit',
  generation: 1,
  identity: { ...identity, operationKey: 'op-empty' },
  combinationVersion: 'v1',
  commands: [],
}))
record('command-limit', await third.ask({
  type: 'commit',
  generation: 1,
  enforceCommandLimit: true,
  identity: { ...identity, operationKey: 'op-limit' },
  combinationVersion: 'v1',
  commands: [commands[0], commands[0]],
}))
record('closing', await third.ask({
  type: 'commit',
  generation: 1,
  closing: true,
  identity: { ...identity, operationKey: 'op-close' },
  combinationVersion: 'v1',
  commands,
}))

let unanswered = 1
const admissionQueueLimit = 1
const beforeSend = unanswered >= admissionQueueLimit
  ? { kind: 'rejected_before_accept', reason: 'queue_full', sent: false }
  : { sent: true }
record('queue-full-before-send', beforeSend)
record('slow-sql-saturation', { ran: false, reason: 'not run in this probe' })

await third.worker.terminate()

const summary = {
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  sqlite: opened.version,
  baselineClaim: false,
  observations,
}
console.log(JSON.stringify(summary, null, 2))
rmSync(root, { recursive: true, force: true })
