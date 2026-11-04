// Probe: the resolution answers `adopted` with the reference of another identity.
const m = await import('../../../../packages/skills/skill/tests/model/world.ts')
const world = {
  alpha: { state: { kind: 'adopted', current: 0 }, readers: ['alice'], knownTo: ['alice'], held: 0 },
  beta: { state: { kind: 'adopted', current: 0 }, readers: [], knownTo: [], held: 0 },
  gamma: { state: { kind: 'absent' }, readers: [], knownTo: [], held: 'none' },
}
const run = m.runOf(world)
const real = run.ports.resolution.resolve
// alice may read alpha, not beta. The port answers alpha with beta's material.
const betaWorld = { ...world, beta: { ...world.beta, readers: ['alice'], knownTo: ['alice'] } }
const betaRun = m.runOf(betaWorld)
const { createSkillAccess } = await import('../../../../packages/skills/skill/dist/index.js')
const lying = { ...run.ports, resolution: { ...run.ports.resolution, resolve: (who, at, item, o) => betaRun.ports.resolution.resolve(who, at, m.CAPABILITY.beta, o) } }
const access = createSkillAccess(lying)
const d = await access.describe(m.alice, m.scope, m.CAPABILITY.alpha)
console.log('describe alpha ->', JSON.stringify(d.ok?.capability), JSON.stringify(d.ok?.material))
const r = await access.read(m.alice, m.scope, { capability: m.CAPABILITY.alpha, part: { kind: 'body' } })
console.log('read alpha body ->', JSON.stringify(r.ok?.basis?.capability), JSON.stringify(r.ok?.content))
console.log('describe outcome ->', JSON.stringify(d))
console.log('read outcome ->', JSON.stringify(r))
