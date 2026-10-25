import { pathToFileURL } from 'node:url'

export const mutations = {
  'material-is-saved': 'P2_saved_conjunction',
  'unknown-allows-release': 'P1_release_requires_ack',
  'ack-unknown-allows-release': 'P1_release_requires_ack',
  'journal-without-protection': 'P2_saved_conjunction',
  'retry-new-responsibility': 'P3_single_responsibility',
  'cleanup-drops-late': 'P5_late_conservation',
  'denied-erases-unknown': 'P4_unknown_preserved',
  'retry-new-operation': 'P4_stable_operation',
  'conflict-overwrites': 'P3_conflict_preserves',
  'account-is-result-ack': 'P6_result_ack_provenance',
  'revoked-can-push': 'P7_current_qualification',
  'cleanup-undoes-ack': 'P8_cleanup_keeps_ack',
  'query-erases-other-unknown': 'P4_unknown_preserved',
}

for (const domain of ['material', 'journal', 'ack']) {
  for (const target of ['material', 'journal', 'ack']) {
    if (target !== domain) mutations[`${domain}-query-changes-${target}`] = 'P4_query_scope'
  }
  for (const result of ['absent', 'committed'])
    mutations[`${domain}-query-false-${result}`] = 'P10_knowledge_sound'
  for (const field of ['key', 'domain', 'operation'])
    mutations[`${domain}-query-wrong-${field}`] = 'P4_query_scope'
  mutations[`${domain}-query-wrong-result`] = 'P10_knowledge_sound'
}

const record = key => ({
  key,
  body: `frozen:${key}`,
  source: true,
  material: 'none',
  materialKnown: 'none',
  journal: 'none',
  journalKnown: 'none',
  responsibility: 0,
  association: false,
  dedup: false,
  protection: false,
  receiveOperation: `receive:${key}`,
  saved: false,
  ackOperation: `ack:${key}`,
  ack: 'none',
  ackKnown: 'none',
  ackEvidence: null,
  cleanup: 'pending',
  lateAccepted: 0,
  lateFacts: 0,
  latePending: 0,
  lateDelivered: 0,
})
export function initial(keys = 2) {
  return {
    authority: 'original',
    records: Array.from({ length: keys }, (_, i) => record(`result-${i}`)),
  }
}
const authorized = state => state.authority !== 'revoked'
const clone = value => structuredClone(value)
const uncertain = r =>
  r.materialKnown === 'unknown' || r.journalKnown === 'unknown' || r.ackKnown === 'unknown'
const custody = r =>
  r.material === 'committed' &&
  r.journal === 'committed' &&
  r.responsibility === 1 &&
  r.association &&
  r.dedup &&
  r.protection

export function transitions(state, mutation = 'none') {
  const out = []
  function global(name, change) {
    const next = clone(state)
    change(next)
    out.push({ name, key: null, next })
  }
  if (state.authority === 'original')
    global('revoke-current-qualification', s => {
      s.authority = 'revoked'
    })
  if (state.authority === 'revoked')
    global('appoint-custody-successor', s => {
      s.authority = 'successor'
    })
  for (const [i, r] of state.records.entries()) {
    function emit(name, change = () => {}, observation = null, query = null) {
      const next = clone(state)
      change(next.records[i])
      out.push({ name, key: i, observation, query, next })
    }
    function query(domain, name, operation) {
      const response = { key: r.key, domain, operation, result: r[domain] }
      for (const field of ['key', 'domain', 'operation']) {
        if (mutation === `${domain}-query-wrong-${field}`)
          response[field] = `other:${response[field]}`
      }
      if (mutation === `${domain}-query-wrong-result`)
        response.result = r[domain] === 'absent' ? 'committed' : 'absent'
      for (const result of ['absent', 'committed']) {
        if (mutation === `${domain}-query-false-${result}`) response.result = result
      }
      emit(
        name,
        n => {
          n[`${domain}Known`] =
            mutation === `${domain}-query-wrong-result` ? r[domain] : response.result
          if (mutation === 'query-erases-other-unknown' && domain === 'material') {
            if (n.ackKnown === 'unknown') n.ackKnown = 'absent'
          }
          for (const target of ['material', 'journal', 'ack']) {
            if (
              mutation === `${domain}-query-changes-${target}` &&
              n[`${target}Known`] !== 'none'
            ) {
              n[`${target}Known`] = 'absent'
            }
          }
        },
        response.result,
        response,
      )
    }
    const canAct = authorized(state)
    if (canAct || mutation === 'revoked-can-push') {
      if (r.material === 'none' || r.materialKnown === 'absent') {
        emit('push-original', n => {
          n.material = 'pending'
          n.materialKnown = 'unknown'
        })
      } else if (r.source) {
        emit(
          'retry-same-key-same-body',
          n => {
            if (mutation === 'retry-new-operation') n.receiveOperation = `new:${r.key}`
            if (mutation === 'retry-new-responsibility' && r.responsibility > 0)
              n.responsibility = 2
          },
          'recognize-original',
        )
        emit(
          'push-same-key-conflicting-body',
          n => {
            if (mutation === 'conflict-overwrites') n.body = 'conflicting-body'
          },
          'conflict',
        )
      }
      if (r.material === 'committed' || r.material === 'absent') {
        query('material', 'query-original-material', r.receiveOperation)
      }
      if (
        r.materialKnown === 'committed' &&
        (r.journal === 'none' || r.journalKnown === 'absent')
      ) {
        emit('submit-original-journal-operation', n => {
          n.journal = 'pending'
          n.journalKnown = 'unknown'
        })
      }
      if (r.journal === 'committed' || r.journal === 'absent') {
        query('journal', 'query-original-journal-operation', r.receiveOperation)
      }
      if (
        r.materialKnown === 'committed' &&
        (r.journalKnown === 'committed' || mutation === 'material-is-saved')
      ) {
        emit(
          'read-associated-custody-and-observe-saved',
          n => {
            n.saved = true
          },
          'saved',
        )
      }
      if (r.saved && (r.ack === 'none' || r.ackKnown === 'absent')) {
        emit('handoff-original-result-evidence', n => {
          n.ack = 'pending'
          n.ackKnown = 'unknown'
          n.ackEvidence = 'result'
        })
      }
      if (mutation === 'account-is-result-ack' && r.lateDelivered && r.ack === 'none') {
        emit('handoff-account-evidence-as-result', n => {
          n.ack = 'pending'
          n.ackKnown = 'unknown'
          n.ackEvidence = 'account'
        })
      }
      if (r.ack === 'committed' || r.ack === 'absent') {
        query('ack', 'query-original-ack-receipt', r.ackOperation)
      }
    } else {
      emit(
        'push-denied-now',
        n => {
          if (mutation === 'denied-erases-unknown') {
            for (const field of ['materialKnown', 'journalKnown', 'ackKnown'])
              if (n[field] === 'unknown') n[field] = 'absent'
          }
        },
        'denied',
      )
      emit('query-denied-now', () => {}, 'denied')
    }
    for (const domain of ['material', 'journal', 'ack']) {
      if (r[domain] === 'pending') {
        emit(
          `${domain}-commit-response-lost`,
          n => {
            n[domain] = 'committed'
            if (domain === 'journal') {
              n.responsibility = 1
              n.association = true
              n.dedup = true
              n.protection = mutation !== 'journal-without-protection'
            }
          },
          'outcome-unknown',
        )
        emit(
          `${domain}-authority-excludes-write`,
          n => {
            n[domain] = 'absent'
          },
          'outcome-unknown',
        )
      }
    }
    emit(
      'cancel-current-wait',
      () => {},
      uncertain(r) || r.material === 'committed' ? 'outcome-unknown' : 'cancelled-before-accept',
    )
    emit(
      'new-request-unavailable',
      () => {},
      uncertain(r) || r.material === 'committed' ? 'outcome-unknown' : 'unavailable',
    )
    emit('crash-and-recover-stable-record', () => {}, 'no-new-knowledge')
    if (r.journal === 'committed')
      emit('observe-ordinary-committed-revision', () => {}, 'committed-revision-only')
    if (r.ack === 'committed')
      emit('observe-ack-committed-revision-only', () => {}, 'committed-revision-only')
    if (
      r.source &&
      (r.ackKnown === 'committed' ||
        (mutation === 'unknown-allows-release' && uncertain(r)) ||
        (mutation === 'ack-unknown-allows-release' && r.ackKnown === 'unknown'))
    ) {
      emit('cleanup-fails', n => {
        n.cleanup = 'blocked'
        if (mutation === 'cleanup-undoes-ack') n.ackKnown = 'none'
      })
      emit('cleanup-releases-body', n => {
        n.source = false
        n.cleanup = 'released'
        if (mutation === 'cleanup-drops-late') {
          n.lateFacts = 0
          n.latePending = 0
        }
      })
    }
    for (let revision = 0; revision < 2; revision += 1) {
      const bit = 1 << revision
      if ((r.lateAccepted & bit) === 0) {
        emit(`accept-late-revision-${revision + 1}`, n => {
          n.lateAccepted |= bit
          n.lateFacts |= bit
          n.latePending |= bit
        })
      }
      if (canAct && r.saved && r.latePending & bit) {
        emit(
          `save-and-deliver-account-${revision + 1}`,
          n => {
            n.latePending &= ~bit
            n.lateDelivered |= bit
          },
          'account-saved',
        )
      }
    }
    if (r.lateAccepted === 3)
      emit('reject-new-late-revision-capacity', () => {}, 'backpressured-source-retains')
    emit('retention-expired-report-only')
  }
  return out
}

const queries = {
  material: {
    action: 'query-original-material',
    start: 'push-original',
    operationField: 'receiveOperation',
    prefix: 'receive',
  },
  journal: {
    action: 'query-original-journal-operation',
    start: 'submit-original-journal-operation',
    operationField: 'receiveOperation',
    prefix: 'receive',
  },
  ack: {
    action: 'query-original-ack-receipt',
    start: 'handoff-original-result-evidence',
    operationField: 'ackOperation',
    prefix: 'ack',
  },
}

function queryFacts(before, edge, index, domain) {
  const original = before.records[index]
  const current = edge.next.records[index]
  const definition = queries[domain]
  const expectedOperation = `${definition.prefix}:${original.key}`
  const bound =
    edge.name === definition.action &&
    edge.key === index &&
    edge.query?.key === original.key &&
    edge.query?.domain === domain &&
    edge.query?.operation === expectedOperation &&
    original[definition.operationField] === expectedOperation &&
    current[definition.operationField] === expectedOperation &&
    current.key === original.key &&
    before.authority !== 'revoked'
  const authoritative =
    (original[domain] === 'committed' || original[domain] === 'absent') &&
    current[domain] === original[domain] &&
    edge.query?.result === original[domain] &&
    edge.observation === original[domain] &&
    current[`${domain}Known`] === original[domain]
  return { bound, authoritative }
}

export function violations(before, edge) {
  const after = edge.next
  const failed = new Set()
  for (const [i, r] of after.records.entries()) {
    const prior = before.records[i]
    if (!r.source && (!custody(r) || r.ack !== 'committed' || r.ackKnown !== 'committed'))
      failed.add('P1_release_requires_ack')
    if (r.saved && !custody(r)) failed.add('P2_saved_conjunction')
    if (r.responsibility > 1) failed.add('P3_single_responsibility')
    if (
      edge.key === i &&
      edge.name === 'push-same-key-conflicting-body' &&
      JSON.stringify(r) !== JSON.stringify(prior)
    )
      failed.add('P3_conflict_preserves')
    if (r.receiveOperation !== `receive:${r.key}` || r.ackOperation !== `ack:${r.key}`)
      failed.add('P4_stable_operation')
    for (const domain of ['material', 'journal', 'ack']) {
      const field = `${domain}Known`
      const query = queryFacts(before, edge, i, domain)
      if (edge.key === i && edge.name === queries[domain].action) {
        if (!query.bound) failed.add('P4_query_scope')
        if (!query.authoritative) failed.add('P10_knowledge_sound')
      }
      if (
        prior[field] === 'unknown' &&
        r[field] !== 'unknown' &&
        !(query.bound && query.authoritative)
      )
        failed.add('P4_unknown_preserved')
      if (r[field] !== prior[field]) {
        const definition = queries[domain]
        const expectedOperation = `${definition.prefix}:${prior.key}`
        const beginsOriginalOperation =
          r[field] === 'unknown' &&
          (prior[field] === 'none' || prior[field] === 'absent') &&
          (prior[domain] === 'none' || prior[domain] === 'absent') &&
          r[domain] === 'pending' &&
          edge.key === i &&
          edge.name === definition.start &&
          before.authority !== 'revoked' &&
          prior[definition.operationField] === expectedOperation &&
          r[definition.operationField] === expectedOperation
        if (!(beginsOriginalOperation || (query.bound && query.authoritative)))
          failed.add('P4_query_scope')
      }
      if ((r[field] === 'committed' || r[field] === 'absent') && r[field] !== r[domain])
        failed.add('P10_knowledge_sound')
    }
    if (
      (r.lateFacts & r.lateAccepted) !== r.lateAccepted ||
      (r.latePending | r.lateDelivered) !== r.lateAccepted ||
      (r.latePending & r.lateDelivered) !== 0
    )
      failed.add('P5_late_conservation')
    if (r.ack !== 'none' && r.ackEvidence !== 'result') failed.add('P6_result_ack_provenance')
    if (
      edge.key === i &&
      /^(push-original|retry-same-key|handoff-|query-original-|read-associated|save-and-deliver)/.test(
        edge.name,
      ) &&
      before.authority === 'revoked'
    )
      failed.add('P7_current_qualification')
    if (
      edge.key === i &&
      edge.name === 'cleanup-fails' &&
      prior.ackKnown === 'committed' &&
      (r.ackKnown !== 'committed' || !r.source || r.cleanup !== 'blocked')
    )
      failed.add('P8_cleanup_keeps_ack')
    if (edge.key !== null && edge.key !== i && JSON.stringify(prior) !== JSON.stringify(r))
      failed.add('P9_other_key_unchanged')
  }
  return [...failed]
}

export function explore({
  keys = 1,
  depth = Infinity,
  mutation = 'none',
  maxStates = 600000,
} = {}) {
  const start = initial(keys)
  const nodes = [{ state: start, parent: -1, action: null, depth: 0 }]
  const seen = new Map([[JSON.stringify(start), 0]])
  const actions = {}
  let transitionCount = 0
  let frontier = 0
  function trace(index, edge) {
    const chain = [
      {
        action: `${edge.name}[${edge.key ?? 'global'}]`,
        observation: edge.observation,
        query: edge.query,
        state: edge.next,
      },
    ]
    for (let at = index; at >= 0; at = nodes[at].parent) {
      chain.push({ action: nodes[at].action ?? 'initial', state: nodes[at].state })
    }
    return chain.reverse()
  }
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    if (node.depth === depth) {
      frontier += 1
      continue
    }
    for (const edge of transitions(node.state, mutation)) {
      transitionCount += 1
      actions[edge.name] = (actions[edge.name] ?? 0) + 1
      const failed = violations(node.state, edge)
      if (failed.length)
        return {
          status: 'counterexample',
          keys,
          depth: Number.isFinite(depth) ? depth : null,
          mutation,
          states: nodes.length,
          transitions: transitionCount,
          failed,
          trace: trace(index, edge),
          actions,
        }
      const signature = JSON.stringify(edge.next)
      if (!seen.has(signature)) {
        if (nodes.length >= maxStates)
          return {
            status: 'resource-limit',
            keys,
            mutation,
            states: nodes.length,
            transitions: transitionCount,
          }
        seen.set(signature, nodes.length)
        nodes.push({
          state: edge.next,
          parent: index,
          action: `${edge.name}[${edge.key ?? 'global'}]`,
          depth: node.depth + 1,
        })
      }
    }
  }
  return {
    status: frontier ? 'bounded-prefix-pass' : 'closed-graph-pass',
    keys,
    depth: Number.isFinite(depth) ? depth : null,
    mutation,
    states: nodes.length,
    transitions: transitionCount,
    frontier,
    maxReachedDepth: Math.max(...nodes.map(n => n.depth)),
    actions,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mutation = process.argv[2] ?? 'none'
  if (mutation !== 'none' && !Object.hasOwn(mutations, mutation))
    throw new Error(`Unknown mutation ${mutation}`)
  const keys = Number(process.argv[3] ?? 1)
  const depth = process.argv[4] === undefined ? Infinity : Number(process.argv[4])
  const result = explore({ mutation, keys, depth })
  console.log(JSON.stringify(result, null, 2))
  process.exitCode = result.status.endsWith('pass') ? 0 : result.status === 'counterexample' ? 1 : 2
}
