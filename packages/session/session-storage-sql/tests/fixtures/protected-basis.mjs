// A named fixture producer of the Session commit basis. It publishes the basis that its command
// states, or stops the transaction when the command says that the basis does not hold.
export default {
  participant: 'fixture.protected-basis',
  protocol: '1',
  execute(facts, port) {
    if (facts.holds !== true)
      return { kind: 'failed', diagnostic: 'the fixture basis does not hold' }
    port.provideFact({ key: 'session.commit-basis', protocol: '1' }, facts.basis)
    return { kind: 'participated', response: null }
  },
}
