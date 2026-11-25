// A fixture participant: it answers the current evidence the worker provided, whole or as sizes.
const CURRENT = { key: 'governance.adoption-current', protocol: 'governance-adoption-current/1' }

export default {
  participant: 'fixture.current-evidence',
  protocol: '1',
  execute(facts, port) {
    const evidence = port.requireFact(CURRENT)
    if (facts.request !== 'sizes') return { kind: 'participated', response: evidence }
    return {
      kind: 'participated',
      response: {
        bytes: Buffer.byteLength(JSON.stringify(evidence)),
        bindings: evidence.enforcementBindings.length,
        targets: evidence.targets.length,
      },
    }
  },
}
