// Behavior probe for TS retry libraries. Node 24. Run: node probe.mjs
import * as cockatiel from 'cockatiel';
import pRetry, { AbortError } from 'p-retry';
import retryLib from 'retry';
import { backOff } from 'exponential-backoff';
import asyncRetry from 'async-retry';
import { retry as tsRetry } from 'ts-retry-promise';
import { retry as attemptRetry, defaultCalculateDelay } from '@lifeomic/attempt';
import promiseRetry from 'promise-retry';

const out = (k, v) => console.log(`${k}: ${JSON.stringify(v)}`);
out('node', process.version);

// P1 pure delay computation without executing anything
{
  const { ExponentialBackoff, noJitterGenerator } = cockatiel;
  const seq = (factory, n) => { const r = []; let b = factory.next({}); for (let i = 0; i < n; i++) { r.push(Math.round(b.duration)); b = b.next({}); } return r; };
  out('P1 cockatiel noJitter exponent=2 initial=100 max=10000', seq(new ExponentialBackoff({ generator: noJitterGenerator, initialDelay: 100, maxDelay: 10000 }), 6));
  out('P1 cockatiel noJitter exponent=3 initial=100 max=10000', seq(new ExponentialBackoff({ generator: noJitterGenerator, exponent: 3, initialDelay: 100, maxDelay: 10000 }), 6));
  out('P1 cockatiel decorrelated exponent=3 initial=100 max=10000 (random)', seq(new ExponentialBackoff({ exponent: 3, initialDelay: 100, maxDelay: 10000 }), 6));
  out('P1 retry.createTimeout factor=3 min=100 max=10000', [0, 1, 2, 3, 4, 5].map(i => retryLib.createTimeout(i, { factor: 3, minTimeout: 100, maxTimeout: 10000, randomize: false })));
  const t = retryLib.timeouts({ retries: 6, factor: 2, minTimeout: 1000, randomize: true });
  out('P1 retry.timeouts randomize=true (sorted ascending?)', t);
  out('P1 attempt.defaultCalculateDelay factor=3 delay=100 max=10000', [1, 2, 3, 4, 5, 6].map(n => defaultCalculateDelay({ attemptNum: n }, { delay: 100, factor: 3, maxDelay: 10000, jitter: false, minDelay: 0 })));
}

// P2 abort during backoff sleep: how long until the promise settles, how many calls
async function timeAbort(name, run) {
  const ac = new AbortController();
  let calls = 0;
  const t0 = performance.now();
  setTimeout(() => ac.abort(new Error('user-abort')), 100);
  let result;
  try { await run(ac.signal, () => { calls++; throw new Error('boom'); }); result = 'resolved'; } catch (e) { result = `rejected(${e?.message ?? e})`; }
  out(`P2 ${name}`, { settledAfterMs: Math.round(performance.now() - t0), calls, result });
}
await timeAbort('cockatiel retry constant 1500ms maxAttempts 3', (signal, fn) =>
  cockatiel.retry(cockatiel.handleAll, { maxAttempts: 3, backoff: new cockatiel.ConstantBackoff(1500) }).execute(() => fn(), signal));
await timeAbort('p-retry minTimeout 1500 factor 1 retries 3', (signal, fn) =>
  pRetry(() => fn(), { retries: 3, minTimeout: 1500, factor: 1, signal }));

// P3 final failure: is there a wasted sleep after the last attempt?
async function timeExhaust(name, run) {
  let calls = 0;
  const t0 = performance.now();
  try { await run(() => { calls++; return Promise.reject(new Error('boom')); }); } catch {}
  out(`P3 ${name}`, { totalMs: Math.round(performance.now() - t0), calls });
}
await timeExhaust('ts-retry-promise retries=1 delay=300 FIXED', f => tsRetry(f, { retries: 1, delay: 300 }));
await timeExhaust('p-retry retries=1 minTimeout=300', f => pRetry(f, { retries: 1, minTimeout: 300 }));
await timeExhaust('cockatiel maxAttempts=1 constant 300', f => cockatiel.retry(cockatiel.handleAll, { maxAttempts: 1, backoff: new cockatiel.ConstantBackoff(300) }).execute(f));
await timeExhaust('exponential-backoff numOfAttempts=2 startingDelay=300', f => backOff(f, { numOfAttempts: 2, startingDelay: 300 }));
await timeExhaust('async-retry retries=1 minTimeout=300 (randomize default true)', f => asyncRetry(() => f(), { retries: 1, minTimeout: 300 }));
await timeExhaust('@lifeomic/attempt maxAttempts=2 delay=300', f => attemptRetry(() => f(), { maxAttempts: 2, delay: 300 }));
await timeExhaust('promise-retry retries=1 minTimeout=300', f => promiseRetry((retry) => f().catch(retry), { retries: 1, minTimeout: 300 }));

// P4 p-retry TypeError short-circuit: a non-network TypeError is never retried
{
  let calls = 0;
  try { await pRetry(() => { calls++; throw new TypeError('x is not a function'); }, { retries: 3, minTimeout: 1, shouldRetry: () => true }); } catch {}
  out('P4 p-retry non-network TypeError calls (shouldRetry=>true)', calls);
}

// P5 "switch target by failure reason": provider chosen per attempt from last error
{
  const providers = ['A', 'B', 'C'];
  const seen = [];
  let lastCause;
  const pol = cockatiel.retry(cockatiel.handleWhen(e => e.cause === 'upstream_unavailable'), { maxAttempts: providers.length - 1, backoff: new cockatiel.ConstantBackoff(1) });
  pol.onRetry(r => { lastCause = r.error?.cause; });
  try {
    await pol.execute(({ attempt }) => { const p = providers[attempt]; seen.push(p); const e = new Error(p); e.cause = p === 'B' ? 'request_rejected' : 'upstream_unavailable'; throw e; });
  } catch (e) { out('P5 cockatiel per-attempt provider; stops on non-handled cause', { seen, finalError: e.message, lastCauseSeenByHook: lastCause }); }
  const seen2 = [];
  try {
    await pRetry((n) => { const p = providers[n - 1]; seen2.push(p); const e = new Error(p); e.cause = 'upstream_unavailable'; throw e; },
      { retries: providers.length - 1, minTimeout: 1, shouldRetry: ({ error }) => error.cause === 'upstream_unavailable' });
  } catch (e) { out('P5 p-retry per-attempt provider via attemptNumber', { seen: seen2, finalError: e.message }); }
}

// P6 Node built-in abortable sleep (no library): node:timers/promises setTimeout with signal
{
  const { setTimeout: sleep } = await import('node:timers/promises');
  const ac = new AbortController();
  const t0 = performance.now();
  setTimeout(() => ac.abort(new Error('user-abort')), 100);
  let r; try { await sleep(1500, undefined, { signal: ac.signal }); r = 'resolved'; } catch (e) { r = `rejected(${e.name}; cause=${e.cause?.message})`; }
  out('P6 node:timers/promises setTimeout 1500ms aborted at 100ms', { settledAfterMs: Math.round(performance.now() - t0), result: r });
}
