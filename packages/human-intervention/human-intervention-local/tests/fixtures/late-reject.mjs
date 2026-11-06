export default {
  participant: 'fixture.hitl.late-reject',
  protocol: 'fixture-hitl-reject/1',
  execute() {
    return { kind: 'failed', diagnostic: 'injected-after-wait-writer' }
  },
}
