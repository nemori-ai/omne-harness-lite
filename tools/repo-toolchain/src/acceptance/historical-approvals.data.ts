// Compiled historical acceptance-lock approvals. Only the reviewed tool artifact owns this list.
// Repository inputs, configuration, environment variables and arguments cannot add approvals.

export interface HistoricalApproval {
  readonly commit: string
  /**
   * The parent that the change is registered against. The tool checks only that it is one of the
   * commit's parents. By registration convention a merge entry names the one parent where the path
   * differs. That convention is not checked. The lock lists such a path only in its `-m` listing
   * (no task context); its `--cc` listing (task context) shows no paths for a clean merge.
   */
  readonly parent: string
  readonly path: string
  /** NULL_OBJECT_ID when the path does not exist on that side, as `git diff --raw` reports it. */
  readonly oldBlob: string
  readonly newBlob: string
  readonly diffSha256: string
  readonly decisionUrl: string
}

/** Git's null object id: the side of a change where the path does not exist. */
export const NULL_OBJECT_ID = '0000000000000000000000000000000000000000'

const D010_DECISION =
  'https://github.com/nemori-ai/omne-harness-lite/issues/638#issuecomment-6367449357'
const ISSUE_769_DECISION =
  'https://github.com/nemori-ai/omne-harness-lite/issues/769#issuecomment-6411908205'
const MODEL_ACCEPTANCE = 'packages/model/model/acceptance'
const TRANSPORT_ACCEPTANCE = 'packages/model/pi-ai-transport/acceptance'

// One entry for each (commit, path). A commit receives approval only when the protected paths that
// the lock lists for it are exactly the paths registered here for that commit.
export const HISTORICAL_APPROVALS: readonly HistoricalApproval[] = Object.freeze(
  [
    // D010.
    {
      commit: '48ad37d292796326d65055a75e8a1fde44fe4233',
      parent: 'e7aab8ec73002713d2ef6486401816850c984fb1',
      path: 'packages/agent/agent/acceptance/README.md',
      oldBlob: 'f7fac2fc21bfceb51c3dd84542b866eb7bb12c89',
      newBlob: 'fbf0d08732f5d2004c3d63cff6c8be11442da99b',
      diffSha256: 'eee5be00ebfdf300db6978cb2981a1b989dcd977846fc3de2669bb835edf3a2c',
      decisionUrl: D010_DECISION,
    },
    // #769: six commits from 2026-10-20 to 10-23 that entered the track through the gate of that time.
    // 19f457a15: #645 sync merge; the path differs only from its first parent.
    {
      commit: '19f457a1501aca70baae7ff573bddb86089c93ae',
      parent: '2726a8c8bd3b04f65bab4785dbcca21e02f87024',
      path: 'packages/agent/agent/acceptance/README.md',
      oldBlob: 'f7fac2fc21bfceb51c3dd84542b866eb7bb12c89',
      newBlob: 'fbf0d08732f5d2004c3d63cff6c8be11442da99b',
      diffSha256: 'eee5be00ebfdf300db6978cb2981a1b989dcd977846fc3de2669bb835edf3a2c',
      decisionUrl: ISSUE_769_DECISION,
    },
    // 9f3967cc5: #461 member documents.
    {
      commit: '9f3967cc5ec8e8eda4febfacaff50f78d5206b2b',
      parent: '26b6c74e1b15f126425e2996475b7ab1fd043d5b',
      path: `${TRANSPORT_ACCEPTANCE}/README.md`,
      oldBlob: '4e52eb364f0a3705da54151aad66f004c2cd81e7',
      newBlob: '7d7ef9306e63e823440f53aa381222b882348908',
      diffSha256: '9c9113dc168f423ebfcaa86610e6af0953accc2be1c306c3170a0fb32041b37c',
      decisionUrl: ISSUE_769_DECISION,
    },
    {
      commit: '9f3967cc5ec8e8eda4febfacaff50f78d5206b2b',
      parent: '26b6c74e1b15f126425e2996475b7ab1fd043d5b',
      path: `${TRANSPORT_ACCEPTANCE}/fixtures/README.md`,
      oldBlob: '794b57ae3902e48c9408080b31ab9f7df82da57d',
      newBlob: '201cd7fd2a5160e3fa13391b77c4f144670a9827',
      diffSha256: '5f8b1849be2b5e6fadc76da56d23f97ad7210987e464cb08e96dc923a8b1bf05',
      decisionUrl: ISSUE_769_DECISION,
    },
    {
      commit: '9f3967cc5ec8e8eda4febfacaff50f78d5206b2b',
      parent: '26b6c74e1b15f126425e2996475b7ab1fd043d5b',
      path: `${TRANSPORT_ACCEPTANCE}/fixtures/index.md`,
      oldBlob: 'ccda51f9fcb999a06188bb3db4738843e85e4785',
      newBlob: '2d59e565bcfde009603448b85ba181f0311aa25e',
      diffSha256: '98fecd235050e1b89b1dfdc0f06531bb8540b2f8842a64e6a3d86ad413368a01',
      decisionUrl: ISSUE_769_DECISION,
    },
    {
      commit: '9f3967cc5ec8e8eda4febfacaff50f78d5206b2b',
      parent: '26b6c74e1b15f126425e2996475b7ab1fd043d5b',
      path: `${TRANSPORT_ACCEPTANCE}/index.md`,
      oldBlob: '4a1bd66b5b76a23377c9664ab5d56cb550899d6e',
      newBlob: '7a62b98257b47f48709a8532222c25d116943ecf',
      diffSha256: '3b449877945335d1a5981587d3b47e0b4798207bb5d6345c6a6a5cca904773f9',
      decisionUrl: ISSUE_769_DECISION,
    },
    // 69bdedfab: toolchain sync merge; the paths differ only from its first parent.
    {
      commit: '69bdedfabc097585cea516ccec8a6ba1d58003ae',
      parent: '3f10ac0d71f69677e6dd4d05def905231a64a298',
      path: `${MODEL_ACCEPTANCE}/PD-model-invocation.admission-rejection.acceptance.ts`,
      oldBlob: NULL_OBJECT_ID,
      newBlob: 'b551f1a762c9e83840ae998682ba7a39a42d45b4',
      diffSha256: 'f92510e714308d2540480963ba3116ecf81075cfa11163acf822b00be211a3bf',
      decisionUrl: ISSUE_769_DECISION,
    },
    {
      commit: '69bdedfabc097585cea516ccec8a6ba1d58003ae',
      parent: '3f10ac0d71f69677e6dd4d05def905231a64a298',
      path: `${MODEL_ACCEPTANCE}/PD-model-invocation.credential-denied.acceptance.ts`,
      oldBlob: NULL_OBJECT_ID,
      newBlob: '5d6a46b9b123f1b6e288cfa9a6e641cb4bba62ec',
      diffSha256: '98a4277048d8e2974e1b24b27a626b6e3c44ef676caeb0e34c95b4f695f65a47',
      decisionUrl: ISSUE_769_DECISION,
    },
    {
      commit: '69bdedfabc097585cea516ccec8a6ba1d58003ae',
      parent: '3f10ac0d71f69677e6dd4d05def905231a64a298',
      path: `${MODEL_ACCEPTANCE}/PD-model-invocation.success.acceptance.ts`,
      oldBlob: NULL_OBJECT_ID,
      newBlob: '6c27d0afec06d242af3ee8b9c5251fe506a28b26',
      diffSha256: 'd65fda5375aeff38adf0f69d74c5afbbe44a4fc5572df73b8655ff683c5003ec',
      decisionUrl: ISSUE_769_DECISION,
    },
    {
      commit: '69bdedfabc097585cea516ccec8a6ba1d58003ae',
      parent: '3f10ac0d71f69677e6dd4d05def905231a64a298',
      path: `${MODEL_ACCEPTANCE}/README.md`,
      oldBlob: 'ccae451371a1a19003fb2199b3dc5378727cceb0',
      newBlob: 'ff535d6769178c43d4d387858b2960dc6d8cb3c2',
      diffSha256: 'dd95dd737a8bda058a4f7bc74e025941127603146e5c38d169eb534511a75870',
      decisionUrl: ISSUE_769_DECISION,
    },
    {
      commit: '69bdedfabc097585cea516ccec8a6ba1d58003ae',
      parent: '3f10ac0d71f69677e6dd4d05def905231a64a298',
      path: `${MODEL_ACCEPTANCE}/fixtures/README.md`,
      oldBlob: '201cd7fd2a5160e3fa13391b77c4f144670a9827',
      newBlob: '4a1b17f21cfbf8fbd8a6cc122ff19f2eae11f7f1',
      diffSha256: '513c5d79ca30afc0dc9554eb2e550ef1418a901e0bff7c862f9427d3a1a0a36b',
      decisionUrl: ISSUE_769_DECISION,
    },
    {
      commit: '69bdedfabc097585cea516ccec8a6ba1d58003ae',
      parent: '3f10ac0d71f69677e6dd4d05def905231a64a298',
      path: `${MODEL_ACCEPTANCE}/fixtures/index.md`,
      oldBlob: '2d59e565bcfde009603448b85ba181f0311aa25e',
      newBlob: 'ed72fe68040bf9c69b89999730e8bf8e80a25527',
      diffSha256: 'a31effc46dc4509db3bb42cfddc602da2a5bb46d4e10136abe9f77000af6a896',
      decisionUrl: ISSUE_769_DECISION,
    },
    {
      commit: '69bdedfabc097585cea516ccec8a6ba1d58003ae',
      parent: '3f10ac0d71f69677e6dd4d05def905231a64a298',
      path: `${MODEL_ACCEPTANCE}/fixtures/runtime.ts`,
      oldBlob: NULL_OBJECT_ID,
      newBlob: '24be28c8765e1be3f2434fda6671733cc9db806b',
      diffSha256: '3f060dd7ca4889d726756752cb48dc2c6e423ef69367030ae0139949b79bbd79',
      decisionUrl: ISSUE_769_DECISION,
    },
    {
      commit: '69bdedfabc097585cea516ccec8a6ba1d58003ae',
      parent: '3f10ac0d71f69677e6dd4d05def905231a64a298',
      path: `${MODEL_ACCEPTANCE}/index.md`,
      oldBlob: '7a62b98257b47f48709a8532222c25d116943ecf',
      newBlob: '83ededfe813614539c63c521f263498ca6a14a6c',
      diffSha256: '0ca167590ccedbff242697ac7f7bb707e9afc57b36ec2a0d5a2a3db360735140',
      decisionUrl: ISSUE_769_DECISION,
    },
    // 837d333fd: toolchain sync merge; the paths differ only from its first parent.
    {
      commit: '837d333fdac65e6d2f7b62f7bd4bf73c066c857d',
      parent: 'cced1ffbfaec385e05d4d8466fea659c4ab8cfbc',
      path: `${MODEL_ACCEPTANCE}/PD-model-invocation.admission-rejection.acceptance.ts`,
      oldBlob: NULL_OBJECT_ID,
      newBlob: 'b551f1a762c9e83840ae998682ba7a39a42d45b4',
      diffSha256: 'f92510e714308d2540480963ba3116ecf81075cfa11163acf822b00be211a3bf',
      decisionUrl: ISSUE_769_DECISION,
    },
    {
      commit: '837d333fdac65e6d2f7b62f7bd4bf73c066c857d',
      parent: 'cced1ffbfaec385e05d4d8466fea659c4ab8cfbc',
      path: `${MODEL_ACCEPTANCE}/PD-model-invocation.credential-denied.acceptance.ts`,
      oldBlob: NULL_OBJECT_ID,
      newBlob: '5d6a46b9b123f1b6e288cfa9a6e641cb4bba62ec',
      diffSha256: '98a4277048d8e2974e1b24b27a626b6e3c44ef676caeb0e34c95b4f695f65a47',
      decisionUrl: ISSUE_769_DECISION,
    },
    {
      commit: '837d333fdac65e6d2f7b62f7bd4bf73c066c857d',
      parent: 'cced1ffbfaec385e05d4d8466fea659c4ab8cfbc',
      path: `${MODEL_ACCEPTANCE}/PD-model-invocation.success.acceptance.ts`,
      oldBlob: NULL_OBJECT_ID,
      newBlob: '6c27d0afec06d242af3ee8b9c5251fe506a28b26',
      diffSha256: 'd65fda5375aeff38adf0f69d74c5afbbe44a4fc5572df73b8655ff683c5003ec',
      decisionUrl: ISSUE_769_DECISION,
    },
    {
      commit: '837d333fdac65e6d2f7b62f7bd4bf73c066c857d',
      parent: 'cced1ffbfaec385e05d4d8466fea659c4ab8cfbc',
      path: `${MODEL_ACCEPTANCE}/README.md`,
      oldBlob: 'ccae451371a1a19003fb2199b3dc5378727cceb0',
      newBlob: 'ff535d6769178c43d4d387858b2960dc6d8cb3c2',
      diffSha256: 'dd95dd737a8bda058a4f7bc74e025941127603146e5c38d169eb534511a75870',
      decisionUrl: ISSUE_769_DECISION,
    },
    {
      commit: '837d333fdac65e6d2f7b62f7bd4bf73c066c857d',
      parent: 'cced1ffbfaec385e05d4d8466fea659c4ab8cfbc',
      path: `${MODEL_ACCEPTANCE}/fixtures/README.md`,
      oldBlob: '201cd7fd2a5160e3fa13391b77c4f144670a9827',
      newBlob: '4a1b17f21cfbf8fbd8a6cc122ff19f2eae11f7f1',
      diffSha256: '513c5d79ca30afc0dc9554eb2e550ef1418a901e0bff7c862f9427d3a1a0a36b',
      decisionUrl: ISSUE_769_DECISION,
    },
    {
      commit: '837d333fdac65e6d2f7b62f7bd4bf73c066c857d',
      parent: 'cced1ffbfaec385e05d4d8466fea659c4ab8cfbc',
      path: `${MODEL_ACCEPTANCE}/fixtures/index.md`,
      oldBlob: '2d59e565bcfde009603448b85ba181f0311aa25e',
      newBlob: 'ed72fe68040bf9c69b89999730e8bf8e80a25527',
      diffSha256: 'a31effc46dc4509db3bb42cfddc602da2a5bb46d4e10136abe9f77000af6a896',
      decisionUrl: ISSUE_769_DECISION,
    },
    {
      commit: '837d333fdac65e6d2f7b62f7bd4bf73c066c857d',
      parent: 'cced1ffbfaec385e05d4d8466fea659c4ab8cfbc',
      path: `${MODEL_ACCEPTANCE}/fixtures/runtime.ts`,
      oldBlob: NULL_OBJECT_ID,
      newBlob: '24be28c8765e1be3f2434fda6671733cc9db806b',
      diffSha256: '3f060dd7ca4889d726756752cb48dc2c6e423ef69367030ae0139949b79bbd79',
      decisionUrl: ISSUE_769_DECISION,
    },
    {
      commit: '837d333fdac65e6d2f7b62f7bd4bf73c066c857d',
      parent: 'cced1ffbfaec385e05d4d8466fea659c4ab8cfbc',
      path: `${MODEL_ACCEPTANCE}/index.md`,
      oldBlob: '7a62b98257b47f48709a8532222c25d116943ecf',
      newBlob: '83ededfe813614539c63c521f263498ca6a14a6c',
      diffSha256: '0ca167590ccedbff242697ac7f7bb707e9afc57b36ec2a0d5a2a3db360735140',
      decisionUrl: ISSUE_769_DECISION,
    },
    // 14b0fcfcb: Node engine merge for #549; the paths differ only from its second parent.
    {
      commit: '14b0fcfcb1effda5d41f40bc5293c51eee5c4b6e',
      parent: '6dd1fefa1dcb6646d4221d01767220e2bfc04b05',
      path: `${MODEL_ACCEPTANCE}/PD-model-invocation.admission-rejection.acceptance.ts`,
      oldBlob: 'b551f1a762c9e83840ae998682ba7a39a42d45b4',
      newBlob: '7958c50949fd3f71b9a279479d31e2b38410c024',
      diffSha256: 'f6e347c3266316b46a56ad2c722edd5754bc09b6a788ff49ce500d2b5ec4049f',
      decisionUrl: ISSUE_769_DECISION,
    },
    {
      commit: '14b0fcfcb1effda5d41f40bc5293c51eee5c4b6e',
      parent: '6dd1fefa1dcb6646d4221d01767220e2bfc04b05',
      path: `${MODEL_ACCEPTANCE}/PD-model-invocation.credential-denied.acceptance.ts`,
      oldBlob: '5d6a46b9b123f1b6e288cfa9a6e641cb4bba62ec',
      newBlob: '81292c76bf84dd2bf6537d4750ab695ae531bbf1',
      diffSha256: 'a9d32bea1d10639c350b371383fc238ebece299096566f1df6150e9d09df393f',
      decisionUrl: ISSUE_769_DECISION,
    },
    {
      commit: '14b0fcfcb1effda5d41f40bc5293c51eee5c4b6e',
      parent: '6dd1fefa1dcb6646d4221d01767220e2bfc04b05',
      path: `${MODEL_ACCEPTANCE}/PD-model-invocation.success.acceptance.ts`,
      oldBlob: '6c27d0afec06d242af3ee8b9c5251fe506a28b26',
      newBlob: '6e9d8a5c0b0758713b2c7e4d670d303fd1f6a5e1',
      diffSha256: '9f70ab6cf123d62b3520e418ff9afc43e46f238e277a74372084c63c20bcf9cd',
      decisionUrl: ISSUE_769_DECISION,
    },
    // 06acd53ca: toolchain merge for #549; the paths differ only from its second parent.
    {
      commit: '06acd53ca13e66fc7867a7daec0ff7683c2ee6ac',
      parent: 'ec0de1dba1f7e02cdbef6f35815c23f41c5a9b68',
      path: `${MODEL_ACCEPTANCE}/PD-model-invocation.admission-rejection.acceptance.ts`,
      oldBlob: 'b551f1a762c9e83840ae998682ba7a39a42d45b4',
      newBlob: '946519832b6a863cb94ce967f7d07370cfa567d8',
      diffSha256: '810c035f8358fb4a6293d01e9fc4ff95c2cab2e7363592a310038898fda6ad6c',
      decisionUrl: ISSUE_769_DECISION,
    },
    {
      commit: '06acd53ca13e66fc7867a7daec0ff7683c2ee6ac',
      parent: 'ec0de1dba1f7e02cdbef6f35815c23f41c5a9b68',
      path: `${MODEL_ACCEPTANCE}/PD-model-invocation.credential-denied.acceptance.ts`,
      oldBlob: '5d6a46b9b123f1b6e288cfa9a6e641cb4bba62ec',
      newBlob: '81292c76bf84dd2bf6537d4750ab695ae531bbf1',
      diffSha256: 'a9d32bea1d10639c350b371383fc238ebece299096566f1df6150e9d09df393f',
      decisionUrl: ISSUE_769_DECISION,
    },
    {
      commit: '06acd53ca13e66fc7867a7daec0ff7683c2ee6ac',
      parent: 'ec0de1dba1f7e02cdbef6f35815c23f41c5a9b68',
      path: `${MODEL_ACCEPTANCE}/PD-model-invocation.success.acceptance.ts`,
      oldBlob: '6c27d0afec06d242af3ee8b9c5251fe506a28b26',
      newBlob: '6e9d8a5c0b0758713b2c7e4d670d303fd1f6a5e1',
      diffSha256: '9f70ab6cf123d62b3520e418ff9afc43e46f238e277a74372084c63c20bcf9cd',
      decisionUrl: ISSUE_769_DECISION,
    },
  ].map(approval => Object.freeze(approval)),
)

/** Each (commit, path) has at most one entry; a duplicate is an artifact defect, not a choice. */
export function assertUniqueApprovals(list: readonly HistoricalApproval[]): void {
  const keys = new Set(list.map(item => `${item.commit}\0${item.path}`))
  if (keys.size !== list.length)
    throw new Error('Historical acceptance approvals contain a duplicate (commit, path) entry')
}

assertUniqueApprovals(HISTORICAL_APPROVALS)
