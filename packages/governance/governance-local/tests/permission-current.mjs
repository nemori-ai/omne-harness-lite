export default {
  participant: 'fixture.permission-current',
  protocol: '1',
  execute(facts, port) {
    port.provideFact(
      { key: 'governance.permission-current', protocol: 'governance-permission-current/2' },
      facts.current,
    )
    return { kind: 'participated', response: null }
  },
}
