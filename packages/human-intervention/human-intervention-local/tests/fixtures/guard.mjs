export default {
  participant: 'fixture.hitl.guard',
  protocol: 'fixture-hitl-guard/1',
  execute(facts) {
    return facts.verdict === 'live'
      ? { kind: 'participated', response: facts }
      : { kind: 'conflict', basis: { reason: 'fixture-work-ended' } }
  },
}
