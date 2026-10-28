import type { Policy } from '../integration/policy.ts'
import { same } from '../integration/parse.ts'
import {
  readPublishedDeliveryFacts,
  type FactsReadDeployment,
} from '../integration/published-delivery-facts.ts'
import type { CollaborationAuthorityInput } from './collaboration-authority.ts'
import type { GhRead } from './github-read.ts'

export function publishedAuthorityReaders(
  policy: Policy,
  deployment: FactsReadDeployment,
  read: GhRead,
) {
  same(
    policy.repository,
    deployment.repository,
    'Published facts deployment repository differs from policy',
  )
  const taskFactsFor = (dispatch: string) =>
    readPublishedDeliveryFacts(deployment, dispatch, read).authority
  const authorityFor: (
    reduceIssue: number,
  ) => Omit<CollaborationAuthorityInput, 'read' | 'reduceIssue'> = () => ({
    policy,
    factsFor: taskFactsFor,
  })
  return { authorityFor, taskFactsFor }
}
