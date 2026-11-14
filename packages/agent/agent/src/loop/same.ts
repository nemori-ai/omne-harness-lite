import type { Authority, DurableEvidence, SelectedModel } from '@omne-harness/agent-contract'

export function sameRecipient(left: SelectedModel, right: SelectedModel): boolean {
  const a = left.recipient
  const b = right.recipient
  return (
    a.route === b.route &&
    a.profile.owner === b.profile.owner &&
    a.profile.name === b.profile.name &&
    a.profile.revision === b.profile.revision &&
    a.profile.digest === b.profile.digest
  )
}

function sameEvidence(left: DurableEvidence, right: DurableEvidence): boolean {
  return (
    left.owner === right.owner &&
    left.record === right.record &&
    left.revision === right.revision &&
    left.digest === right.digest
  )
}

export function sameAuthority(left: Authority | null, right: Authority): boolean {
  return (
    left !== null &&
    left.execution === right.execution &&
    left.executionAttachment === right.executionAttachment &&
    left.instance === right.instance &&
    left.generation === right.generation &&
    sameEvidence(left.source, right.source)
  )
}
