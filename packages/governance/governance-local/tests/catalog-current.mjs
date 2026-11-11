export default {
  participant: 'fixture.governance-catalog-current',
  protocol: 'governance-catalog-current/1',
  execute(facts, port) {
    port.provideFact(
      { key: 'governance.catalog-current', protocol: 'governance-catalog-current/1' },
      facts.evidence,
    )
    return { kind: 'participated', response: null }
  },
}
