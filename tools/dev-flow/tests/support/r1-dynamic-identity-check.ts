// The r1 identity rule as a test-only counterpart. r1 trusted three live facts and no stored
// identity: the `users/<login>` lookup, the comment author and the live publish reviewer. The C1
// cases call this one function to show that a fixture really reproduces the rename-reuse hole
// that r1 let through. It never ships in production code.
import { publishReviewers } from '../../src/delivery/baseline.ts'
import { REST_HEADERS, type GhRead } from '../../src/delivery/github-read.ts'

export type R1Verdict = { passed: boolean; failures: string[] }

export function r1DynamicIdentityCheck({
  repository,
  ownerLogin,
  author,
  call,
}: {
  repository: string
  /** The owner login of the trusted line table. */
  ownerLogin: string
  /** The actual author of the review comment. */
  author: { login: string; nodeId: string }
  call: GhRead
}): R1Verdict {
  const failures: string[] = []
  const user = call(['api', '--method', 'GET', ...REST_HEADERS, `users/${ownerLogin}`], 15_000)
  const login = (user as { login?: unknown } | null)?.login
  if (login !== ownerLogin) failures.push('users-login-differs')
  if (author.login !== ownerLogin) failures.push('author-not-owner')
  if (!publishReviewers(repository, call)(author)) failures.push('author-not-live-reviewer')
  return { passed: failures.length === 0, failures }
}
