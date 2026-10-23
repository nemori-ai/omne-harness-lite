import assert from 'node:assert/strict'
import { initial, transitions, violations } from './model.mjs'

const queries = {
  material: 'query-original-material',
  journal: 'query-original-journal-operation',
  ack: 'query-original-ack-receipt',
}
const results = []
function advance(state, name, key = 0) {
  const edge = transitions(state).find(e => e.name === name && e.key === key)
  assert.ok(edge, `Reachable action ${name}[${key}]`)
  assert.deepEqual(violations(state, edge), [], `Valid action ${name}[${key}]`)
  return edge.next
}
function pending(domain, state = initial(2), key = 0) {
  let next = advance(state, 'push-original', key)
  if (domain === 'material') return next
  for (const action of [
    'material-commit-response-lost',
    'query-original-material',
    'submit-original-journal-operation',
  ])
    next = advance(next, action, key)
  if (domain === 'journal') return next
  for (const action of [
    'journal-commit-response-lost',
    'query-original-journal-operation',
    'read-associated-custody-and-observe-saved',
    'handoff-original-result-evidence',
  ])
    next = advance(next, action, key)
  return next
}
function terminal(domain, actual, state = initial(2), key = 0) {
  return advance(
    pending(domain, state, key),
    `${domain}-${actual === 'committed' ? 'commit-response-lost' : 'authority-excludes-write'}`,
    key,
  )
}
function expect(name, state, edge, required) {
  const found = violations(state, edge)
  if (!required.length) assert.deepEqual(found, [], name)
  for (const property of required)
    assert.ok(found.includes(property), `${name}: missing ${property}, got ${found}`)
  results.push({ name, expected: required, actual: found, before: state, edge })
}

const f1Actions = [
  'push-original',
  'material-commit-response-lost',
  'query-original-material',
  'submit-original-journal-operation',
  'journal-commit-response-lost',
  'query-original-journal-operation',
  'read-associated-custody-and-observe-saved',
  'handoff-original-result-evidence',
]
let f1 = initial(1)
for (const action of f1Actions) f1 = advance(f1, action)
const f1Edge = transitions(f1, 'query-erases-other-unknown').find(
  e => e.name === 'query-original-material',
)
assert.equal(f1Edge.next.records[0].ack, 'pending')
assert.equal(f1Edge.next.records[0].ackKnown, 'absent')
expect('independent F1 exact ninth transition', f1, f1Edge, [
  'P4_unknown_preserved',
  'P4_query_scope',
  'P10_knowledge_sound',
])

for (const domain of ['material', 'journal', 'ack']) {
  for (const actual of ['committed', 'absent']) {
    const state = terminal(domain, actual)
    const edge = transitions(state).find(e => e.name === queries[domain] && e.key === 0)
    expect(`${domain} legitimate ${actual}`, state, edge, [])
    const falseResult = actual === 'committed' ? 'absent' : 'committed'
    const falseEdge = structuredClone(edge)
    falseEdge.observation = falseResult
    falseEdge.query.result = falseResult
    falseEdge.next.records[0][`${domain}Known`] = falseResult
    expect(`${domain} false ${falseResult}`, state, falseEdge, [
      'P10_knowledge_sound',
      'P4_unknown_preserved',
    ])
    const rewriteActual = structuredClone(falseEdge)
    rewriteActual.next.records[0][domain] = falseResult
    expect(`${domain} query must not rewrite actual fact`, state, rewriteActual, [
      'P10_knowledge_sound',
    ])
    for (const field of ['key', 'domain', 'operation']) {
      const wrong = structuredClone(edge)
      wrong.query[field] = `other:${wrong.query[field]}`
      expect(`${domain} ${actual} wrong ${field}`, state, wrong, [
        'P4_query_scope',
        'P4_unknown_preserved',
      ])
    }
    const mismatchedReply = structuredClone(edge)
    mismatchedReply.query.result = falseResult
    expect(`${domain} ${actual} reply contradicts observation`, state, mismatchedReply, [
      'P10_knowledge_sound',
    ])
    const spoofName = structuredClone(edge)
    spoofName.name = 'query-original-unrelated'
    expect(`${domain} ${actual} name prefix grants no authority`, state, spoofName, [
      'P4_query_scope',
      'P4_unknown_preserved',
    ])
    const wrongRecord = structuredClone(edge)
    wrongRecord.key = 1
    expect(`${domain} ${actual} query for another key`, state, wrongRecord, [
      'P4_query_scope',
      'P4_unknown_preserved',
      'P9_other_key_unchanged',
    ])
    const revoked = structuredClone(state)
    revoked.authority = 'revoked'
    const revokedEdge = structuredClone(edge)
    revokedEdge.next.authority = 'revoked'
    expect(`${domain} ${actual} revoked read cannot resolve`, revoked, revokedEdge, [
      'P4_query_scope',
      'P4_unknown_preserved',
      'P7_current_qualification',
    ])
    const operationRebound = structuredClone(edge)
    const field = domain === 'ack' ? 'ackOperation' : 'receiveOperation'
    operationRebound.next.records[0][field] = 'replacement'
    expect(`${domain} ${actual} query cannot replace original operation`, state, operationRebound, [
      'P4_stable_operation',
      'P4_unknown_preserved',
    ])
    if (actual === 'absent') {
      const known = edge.next
      const start = {
        material: 'push-original',
        journal: 'submit-original-journal-operation',
        ack: 'handoff-original-result-evidence',
      }[domain]
      const retried = transitions(known).find(e => e.name === start && e.key === 0)
      expect(`${domain} original retry after authoritative absence`, known, retried, [])
    }
  }
  let both = terminal(domain, 'committed')
  both = terminal(domain, 'committed', both, 1)
  const oneQuery = transitions(both).find(e => e.name === queries[domain] && e.key === 0)
  const cross = structuredClone(oneQuery)
  cross.next.records[1][`${domain}Known`] = 'committed'
  expect(`${domain} another key cannot borrow truthful result`, both, cross, [
    'P4_query_scope',
    'P4_unknown_preserved',
    'P9_other_key_unchanged',
  ])
  const known = oneQuery.next
  const downgrade = transitions(known).find(
    e => e.name === 'retention-expired-report-only' && e.key === 0,
  )
  downgrade.next.records[0][`${domain}Known`] = 'unknown'
  expect(`${domain} unrelated action cannot erase resolved knowledge`, known, downgrade, [
    'P4_query_scope',
  ])
}
for (const [queried, resolved] of [
  ['material', 'journal'],
  ['journal', 'ack'],
]) {
  const state = terminal(resolved, 'absent')
  const edge = transitions(state).find(e => e.name === queries[queried] && e.key === 0)
  const wrong = structuredClone(edge)
  wrong.next.records[0][`${resolved}Known`] = 'absent'
  expect(`${queried} cannot infer truthful ${resolved} absence`, state, wrong, [
    'P4_query_scope',
    'P4_unknown_preserved',
  ])
  assert.ok(
    !violations(state, wrong).includes('P10_knowledge_sound'),
    'Truthful but unqueried knowledge is a separate scope defect',
  )
}
console.log(JSON.stringify({ status: 'passed', cases: results.length, results }, null, 2))
