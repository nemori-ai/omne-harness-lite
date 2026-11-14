import { identityProtocol } from '@omne-harness/identity-protocol'

const limits = {
  maxBytes: 4096,
  maxDepth: 8,
  maxItems: 32,
  maxMembers: 16,
  maxStringLength: 256,
  maxNumberLength: 16,
}

export function run(): readonly string[] {
  const { body } = identityProtocol.operations['issue-login']
  const written = body.write({ loginIdentifier: 'someone', credential: 'secret' }, limits)
  if (!written.ok) return ['write: rejected']
  const read = body.read(written.value, limits)
  return ['write: ok', `read: ${read.ok ? read.value.loginIdentifier : 'rejected'}`]
}

for (const line of run()) console.log(line)
