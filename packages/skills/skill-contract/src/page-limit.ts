// The most bytes of one read page, the value that the SPEC "读取的形状规则" fixes. Not configurable in this
// version. The implementation of `SkillAccess` slices by it and the access suite checks by it.
export const PAGE_LIMIT = 65_536
