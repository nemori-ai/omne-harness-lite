import type { Verdict } from './cell.ts'

export type Expectation = Readonly<{ expected: Verdict; failsBecause?: string }>

const AFTER_RESTART_NO_END =
  'o3: after the restart the run gets a new attempt and then never reaches run.terminal'

export const expectations: Readonly<Record<string, Expectation>> = {
  'K-0': { expected: 'pass' },
  'K-1/t2': { expected: 'pass' },
  'K-1/t1': { expected: 'pass' },
  'K-2/t2': { expected: 'pass' },
  'K-2/t1': { expected: 'pass' },
  'K-c': { expected: 'pass' },
  'H-1': { expected: 'pass' },
  'H-2': {
    expected: 'fail',
    failsBecause: 'page: it reads every history page at once instead of the newest page only',
  },
  'H-3': {
    expected: 'fail',
    failsBecause: 'page: scrolling up loads nothing because everything was already read',
  },
  'H-4': { expected: 'pass' },
  'H-5': { expected: 'pass' },
  'H-6': { expected: 'pass' },
  'H-7': { expected: 'pass' },
  'Q-1': { expected: 'pass' },
  'Q-2': { expected: 'pass' },
  'Q-K': { expected: 'pass' },
  'Q-K2': { expected: 'pass' },
  'Q-取消': { expected: 'pass' },
  'Q-G': { expected: 'pass' },
  'Q-X': {
    expected: 'fail',
    failsBecause:
      'o4: after the kill the run that took the first input never ends, so the appended input is never taken',
  },
  'Q-R': { expected: 'untestable' },
  'Q-失败': { expected: 'pass' },
  'Q-取消/已取走': { expected: 'pass' },
  'G-0': { expected: 'pass' },
  'G-1/单步': { expected: 'pass' },
  'G-1/多步': { expected: 'pass' },
  'G-1/超时': { expected: 'fail', failsBecause: AFTER_RESTART_NO_END },
  'G-2/t1': {
    expected: 'fail',
    failsBecause: `the ordered stop ends the command; ${AFTER_RESTART_NO_END}`,
  },
  'G-2/t2': {
    expected: 'fail',
    failsBecause: `the ordered stop ends the command; ${AFTER_RESTART_NO_END}`,
  },
  'G-开页': {
    expected: 'fail',
    failsBecause:
      'page: right after startup the session list answers basis-unavailable and the page waits for a manual retry',
  },
  'G-开页/协议': { expected: 'pass' },
  'G-多租户/协议': { expected: 'pass' },
  'R-0': { expected: 'pass' },
  'R-1/t2': { expected: 'untestable' },
  'R-1/t1': { expected: 'untestable' },
  'R-2/t2': { expected: 'untestable' },
  'R-2/t1': { expected: 'untestable' },
  'D-1': { expected: 'pass' },
  'D-2': { expected: 'pass' },
  'X-1': { expected: 'fail', failsBecause: AFTER_RESTART_NO_END },
  'X-2': {
    expected: 'fail',
    failsBecause: `the command finishes but its result is not taken back; ${AFTER_RESTART_NO_END}`,
  },
  'X-事实': { expected: 'pass' },
  'X-健康': {
    expected: 'fail',
    failsBecause: 'o7: a run with no end keeps the idle server working about once a second',
  },
}
