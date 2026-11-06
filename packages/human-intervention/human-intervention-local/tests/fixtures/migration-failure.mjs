export default {
  owner: 'hitl.requests',
  id: 'fixture-after-relational-adoption',
  up() {},
  verify() {
    return { kind: 'failed', diagnostic: 'injected-after-relational-adoption' }
  },
}
