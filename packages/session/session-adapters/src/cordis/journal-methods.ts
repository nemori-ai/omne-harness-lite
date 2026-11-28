// The methods of the journal provider that only read: they take no Session snapshot.
export const READS: ReadonlySet<string> = new Set([
  'load',
  'readCancellationInstallation',
  'inputs',
  'readReplyAdmissions',
  'query',
  'inputAcceptance',
  'output.read',
  'materials.read',
  'materials.describe',
  'entries.read',
  'entries.receivedOf',
  'received.query',
  'targets.forExecution',
  'targets.resolve',
  'toolTargets.forExecution',
  'toolTargets.resolve',
])

// A preserve names its execution only to route the write: the provider does not load it.
export const ROUTE_ONLY: ReadonlySet<string> = new Set(['preserve'])
