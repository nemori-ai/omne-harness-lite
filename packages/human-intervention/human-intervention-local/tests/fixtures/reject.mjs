export default {
  participant: 'fixture.hitl.reject',
  protocol: 'fixture-hitl-reject/1',
  execute() {
    return { kind: 'failed', diagnostic: 'injected-business-failure' }
  },
}
