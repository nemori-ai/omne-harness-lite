import type { TaskBinding } from '../../src/delivery/binding.ts'

/** A version 1 binding of card `number` in `owner/repo` with the given write scope. */
export function binding(number: number, writeScope: string[]): TaskBinding {
  return {
    schemaVersion: 1,
    issue: {
      repository: 'owner/repo',
      id: `I_${number}`,
      number,
      url: `https://github.com/owner/repo/issues/${number}`,
    },
    revision: 1,
    attempt: `${number}-r1-a1`,
    responsible: 'human',
    branch: `human/issue-${number}`,
    route: { kind: 'track', track: 'legacy-refactor' },
    completionTarget: 'track',
    taskBase: 'a'.repeat(40),
    writeScope,
    dispatch: `https://github.com/owner/repo/issues/${number}#issuecomment-1`,
    conditions: [],
    authorization: [],
  }
}
