import { noUnifiedHierarchyExit, ownUnitPlacement, scopeMembers } from './scope-cgroup.ts'

const placement = ownUnitPlacement(process.argv[2] ?? '')
if (placement.kind === 'noUnifiedHierarchy') process.exit(noUnifiedHierarchyExit)
const listed =
  placement.kind === 'inUnit' && scopeMembers(placement.directory)?.includes(process.pid) === true
process.exit(listed ? 0 : 1)
