// The program a probe scope runs. It exits `noUnifiedHierarchyExit` when it sees no unified cgroup
// hierarchy (P5), 0 when the directory of the unit named in argv lists it, and 1 otherwise (P6).
import { noUnifiedHierarchyExit, ownUnitPlacement, scopeMembers } from './scope-cgroup.ts'

const placement = ownUnitPlacement(process.argv[2] ?? '')
if (placement.kind === 'noUnifiedHierarchy') process.exit(noUnifiedHierarchyExit)
const listed =
  placement.kind === 'inUnit' && scopeMembers(placement.directory)?.includes(process.pid) === true
process.exit(listed ? 0 : 1)
