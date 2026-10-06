import { execFileSync } from 'node:child_process'
import { expect, test } from 'vitest'

test('fixed codec loads on first validation and reuses the native module cache', () => {
  const result = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import { createRequire } from 'node:module';
    const require = createRequire(process.cwd() + '/package.json');
    const generated = require.resolve('./generated/ordinary.cjs');
    const api = await import('@omne-harness-lite/runtime-context-local');
    await import('@omne-harness-lite/runtime-context-local/cordis');
    if (require.cache[generated]) throw Error('eager fixed validator');
    const {mkdtemp, rm} = await import('node:fs/promises');
    const {join} = await import('node:path');
    const {tmpdir} = await import('node:os');
    const {openStorage} = await import('@omne-harness-lite/storage-sql');
    const {composeMigrations} = await import('@omne-harness-lite/storage');
    const {openJsonlSessionLog} = await import('@omne-harness-lite/session-log-jsonl');
    const dir = await mkdtemp(join(tmpdir(), 'omne-context-cache-'));
    const storage = await openStorage({dialect:'sqlite',file:join(dir,'context.sqlite'),migrations:composeMigrations(api.runtimeContextMigrations),upgrade:false});
    const log = await openJsonlSessionLog({dir,processOwnership:{current:'cache-test',observeExit:async()=> 'exited'}});
    const owner = api.createRuntimeContext({log,storage,access:{authorize:async()=>({kind:'rejected',reason:'notAuthorized'})},now:()=> '2026-10-06T00:00:00Z'});
    const initializer = owner.initializer;
    if (require.cache[generated]) throw Error('eager factory validation');
    const scope = { tenant: {organization:'org',account:'alice'}, session:'session' };
    const seed = {required:[],initial:[],fixed:[]};
    const first = await initializer.initializeContextSession(scope, seed);
    if (first.kind !== 'applied') throw Error('first validation failed');
    const cached = require.cache[generated];
    if (!cached) throw Error('validator not cached');
    await initializer.initializeContextSession(scope, seed);
    if (require.cache[generated] !== cached) throw Error('validator reloaded');
    owner.closeAdmission();
    await owner.drain();
    await log.close();
    await storage.close();
    await rm(dir, {recursive:true,force:true});
    console.log('lazy-native-cache: passed');
  `,
    ],
    { encoding: 'utf8' },
  )
  expect(result.trim()).toBe('lazy-native-cache: passed')
})
