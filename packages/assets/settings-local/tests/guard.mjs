import canonicalize from 'canonicalize'
import { settingsSqlGuardFact, settingsSqlOperationBinding } from '../dist/index.js'
const same = (left, right) => canonicalize(left) === canonicalize(right)
export default {
  participant: 'fixture.settings.guard',
  protocol: 'fixture-settings/1',
  execute(facts, port) {
    if (facts.configure) {
      port.execute(
        'INSERT INTO fixture_settings_authority (id, authority) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET authority=excluded.authority',
        ['current', canonicalize(facts)],
      )
      port.provideFact(settingsSqlGuardFact, null)
      return { kind: 'participated', response: null }
    }
    const binding = facts.binding
    const row = port.execute(
      'SELECT authority FROM fixture_settings_authority WHERE id = ? LIMIT 1',
      ['current'],
    ).rows[0]
    const authority = row ? JSON.parse(row[0]) : null
    const fail = reason => ({
      kind: 'conflict',
      basis: {
        binding: settingsSqlOperationBinding(binding),
        failure: { kind: 'rejected', reason },
      },
    })
    if (
      !authority ||
      !same(authority.scope, binding.domain.scope) ||
      !same(authority.target, binding.command.target) ||
      authority.principalRef !== binding.principalRef ||
      authority.mode === 'deny'
    )
      return fail('forbidden')
    if (authority.mode === 'missing') return { kind: 'participated', response: null }
    const fact = {
      binding,
      definition: authority.definition,
      definitionRef: authority.definitionRef,
      grants: authority.grants,
      sourceIds: authority.sourceIds,
    }
    if (authority.mode === 'misbound') fact.binding = { ...binding, commandDigest: '0'.repeat(64) }
    if (authority.mode === 'layout') fact.sourceIds = [...fact.sourceIds].reverse()
    if (authority.mode === 'definition')
      fact.definitionRef = { ...fact.definitionRef, digest: '0'.repeat(64) }
    if (authority.mode === 'no-grants') fact.grants = []
    port.provideFact(settingsSqlGuardFact, authority.mode === 'boolean' ? { allowed: true } : fact)
    return { kind: 'participated', response: null }
  },
}
