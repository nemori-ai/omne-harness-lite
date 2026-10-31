import { decodeRevision, type ModelProfile } from '@omne-harness/model-contract'
const adoption = { owner: 'test', name: 'test', revision: '1', digest: 'd' }
const revision = decodeRevision('1')
if ('failure' in revision) throw new Error('Revision fixture')
export const profile: ModelProfile = {
  identity: { scope: { kind: 'factory' }, route: 'route' },
  adoption,
  revision: revision.ok,
  updatedAt: '2026-10-22',
  availability: 'active',
  definition: {
    suppliers: [{ adoption, recipient: 'route', model: 'model' }],
    fallback: false,
    input: ['text'],
    output: ['text'],
    context: {
      window: { provided: '1000', upstream: [] },
      input: null,
      output: { provided: '10', upstream: [] },
      compactionTriggerPercent: '80',
    },
    limits: [],
    parameters: [],
    representation: adoption,
    meter: adoption,
    retryPolicy: adoption,
  },
}
