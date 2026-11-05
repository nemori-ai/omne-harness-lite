import { succeed } from '@omne-harness/operation-result'
import { canonicalDigest, type ToolAccessGuard, type ToolControlSubjects } from '@omne-harness/tool'
import type { Principal } from './runtime-values.ts'

/** Test identity directory. Rebuilding the adapter keeps the directory, not a credential codec. */
export function testControlSubjects(
  access: ToolAccessGuard<Principal>,
  directory = new Map<string, Principal>(),
): ToolControlSubjects<Principal> {
  const reference = (
    principal: Principal,
    tenant: Parameters<typeof access.qualify>[0]['tenant'],
  ) => {
    const record = canonicalDigest({ subject: principal.subject, tenant })
    return { owner: 'test-control-subjects', record, revision: '1', digest: record }
  }
  return {
    capture: async input => {
      const subject = reference(input.principal, input.tenant)
      directory.set(subject.record, input.principal)
      return succeed(subject)
    },
    matches: async input =>
      canonicalDigest(reference(input.principal, input.tenant)) === canonicalDigest(input.subject)
        ? { kind: 'allowed' }
        : { kind: 'denied', reason: 'different-subject' },
    qualify: async input => {
      const principal = directory.get(input.subject.record)
      if (principal === undefined)
        return { kind: 'unavailable', diagnostic: 'subject directory unavailable' }
      if (canonicalDigest(reference(principal, input.tenant)) !== canonicalDigest(input.subject))
        return { kind: 'unavailable', diagnostic: 'subject reference does not match' }
      return access.qualify({ ...input, principal, action: 'control' })
    },
  }
}
