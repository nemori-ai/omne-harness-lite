import assert from 'node:assert/strict'
import { bootAssembly } from '/repo/packages/core/kernel-basis/dist/testing/index.js'
import { generateHandoffKeyPair, loadSigningKey, issueHandoffWarrant, unwrap } from '/repo/packages/core/identity-values/dist/index.js'
import { composeMigrations } from '/repo/packages/core/storage/dist/index.js'
import { storageSqlPlugin } from '/repo/packages/infra/storage-sql/dist/index.js'
import { credentialsPlugin } from '/repo/packages/tenancy/credential-verification/dist/index.js'
import { accountIdentityPlugin, accountIdentityMigrations } from '/repo/packages/tenancy/account-identity/dist/index.js'
const activation = generateHandoffKeyPair(), purge = generateHandoffKeyPair()
let now = Date.UTC(2026,8,24)
const assembly = await bootAssembly({
  services: [{name:'clock',value:{now:()=>now}}],
  plugins: [
    { plugin: storageSqlPlugin, config: { dialect: 'sqlite', file: '/tmp/ai3.sqlite', synchronous:'full', migrations: composeMigrations(accountIdentityMigrations), upgrade:false } },
    { plugin: credentialsPlugin, config: { cost:1024,blockSize:8,parallelization:1,saltBytes:16,keyBytes:32 } },
    { plugin: accountIdentityPlugin, config: { credentialPolicy:{minLength:8},unactivatedRetention:3600000,activationVerificationKeyPem:activation.publicKeyPem,purgeVerificationKeyPem:purge.publicKeyPem } }
  ]
})
try {
  const accounts=assembly.ctx.get('accounts'),logins=assembly.ctx.get('logins'),storage=assembly.ctx.get('storage')
  const account=unwrap(await accounts.produce('alice','original-password'))
  assert.equal(await accounts.activate(account,issueHandoffWarrant(unwrap(loadSigningKey(activation.privateKeyPem)),'activation',account)),'ok')
  const first=unwrap(await logins.issue('alice','original-password'))
  now+=3599000
  await storage.atomic(unit=>logins.participate(unit).finalizeActivity(first.loginStateId))
  now+=2000
  assert.deepEqual(await logins.verify(first.loginStateId),{ok:account})
  assert.equal(await logins.changeCredential(first.loginStateId,'original-password','replacement-password'),'ok')
  assert.deepEqual(await logins.verify(first.loginStateId),{failure:'login-state-rejected'})
  assert.deepEqual(await logins.issue('alice','original-password'),{failure:'identifier-or-credential-rejected'})
  const fresh=unwrap(await logins.issue('alice','replacement-password'))
  now+=3600000
  assert.deepEqual(await logins.verify(fresh.loginStateId),{failure:'login-state-rejected'})
  console.log(JSON.stringify({status:'PASS',platform:process.platform,arch:process.arch,node:process.version,checks:['register/activate','successful activity extends idle','change invalidates old login','old credential rejected','idle equality rejected'],limits:'Local provider assembly only; no CLI/TUI or remote HTTPS claim'}))
} finally { await assembly.dispose() }
