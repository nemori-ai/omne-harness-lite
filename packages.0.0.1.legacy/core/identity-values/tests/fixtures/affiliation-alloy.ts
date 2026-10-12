// Actual Alloy evaluation of the adopted model; see provenance.querySuffix.
// Relations below are copied from the solver result, not recomputed by a test oracle.
export const affiliationFixture = {
  provenance: {
    model: 'packages.0.0.1.legacy/core/organization-governance/verification/models/Affiliation.als',
    modelSha256: '9c03a63012fd88ce088babb60f5fece2c0ff3954046a154a6f955890c4639d52',
    tool: 'Alloy 6.2.0',
    solver: 'SAT4J',
    sourceSha256: '73406e5fd57a2cb777139d419e661cb36705f54f5016e288f6c26027d490a1dd',
    scope: 'exactly 6 Organization, exactly 1 Config, exactly 1 FixtureResult',
    querySuffix:
      '\n// W1 pure-module correspondence fixture: use the adopted definitions unchanged.\none sig Root, Branch, Leaf, Other, PersonalOne, PersonalTwo extends Organization {}\none sig FixtureResult {\n    ancestors : Organization -> Organization,\n    shared : Organization -> Organization\n}\npred coreCorrespondenceFixture {\n    TeamOrganization = Root + Branch + Leaf + Other\n    PersonalOrganization = PersonalOne + PersonalTwo\n    Config.parent = Branch -> Root + Leaf -> Branch\n    FixtureResult.ancestors = { o, a : Organization | a in ancestorChain[Config, o] }\n    FixtureResult.shared = { a, b : Organization | shareAncestor[Config, a, b] }\n}\nrun coreCorrespondenceFixture for 6 but exactly 6 Organization, exactly 1 Config, exactly 1 FixtureResult\n',
  },
  organizations: ['Branch$0', 'Leaf$0', 'Other$0', 'PersonalOne$0', 'PersonalTwo$0', 'Root$0'],
  parent: [
    ['Branch$0', 'Root$0'],
    ['Leaf$0', 'Branch$0'],
  ],
  ancestors: [
    ['Branch$0', 'Root$0'],
    ['Leaf$0', 'Root$0'],
    ['Leaf$0', 'Branch$0'],
  ],
  shared: [
    ['Root$0', 'Root$0'],
    ['Root$0', 'Branch$0'],
    ['Root$0', 'Leaf$0'],
    ['Branch$0', 'Root$0'],
    ['Branch$0', 'Branch$0'],
    ['Branch$0', 'Leaf$0'],
    ['Leaf$0', 'Root$0'],
    ['Leaf$0', 'Branch$0'],
    ['Leaf$0', 'Leaf$0'],
    ['Other$0', 'Other$0'],
    ['PersonalOne$0', 'PersonalOne$0'],
    ['PersonalTwo$0', 'PersonalTwo$0'],
  ],
} as const
