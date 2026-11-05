// The program the prerequisite probe runs inside its probe scope (P5). It exits 0 when the kernel
// lists this process in the unified cgroup directory of its own unit, which is what the gates rely
// on, and 3 otherwise. It is a script: nothing imports it.
import { ownScopeDirectory, scopeMembers } from './scope-cgroup.ts'

const directory = ownScopeDirectory(process.argv[2] ?? '')
const members = directory === undefined ? undefined : scopeMembers(directory)
process.exit(members?.includes(process.pid) === true ? 0 : 3)
