const FIXED = new Set(['README.md', 'CONTRIBUTING.md', 'AGENTS.md', 'CLAUDE.md'])

const ALWAYS: readonly RegExp[] = [
  /^docs\/requirements\.md$/u,
  /^docs\/architecture\/.+/u,
  /^docs\/domains\/.+/u,
  /^(packages|apps|tools)\/[^/]+\/SPEC\.md$/u,
  /(^|\/)api\/[^/]+\.api\.md$/u,
  /(^|\/)verification\/(.+\/)?formal-mapping\.md$/u,
  /(^|\/)verification\/(.+\/)?proofs\/(?!README\.md$|index\.md$)[^/]+\.md$/u,
  /(^|\/)UPSTREAM\.md$/u,
  /(^|\/)LICENSE[^/]*\.md$/u,
  /^\.meta_harness\/design\/ubiquitous_language\/.+/u,
  /^\.meta_harness\/design\/product\/.+/u,
  /^\.meta_harness\/agents\/skills\/.+/u,
  /^\.github\/.+/u,
]

const PUBLIC_README = /^(packages\/[^/]+\/[^/]+|apps\/[^/]+|tools\/[^/]+)\/README\.md$/u

export const DOCUMENT_MESSAGE =
  '白名单之外的文档。约束只有四样：架构与领域边界、规格、静态检查、形式化证明；别的不进仓库'

export function isAllowedDocument(
  path: string,
  isPrivateMember: (directory: string) => boolean,
): boolean {
  if (FIXED.has(path) || ALWAYS.some(pattern => pattern.test(path))) return true
  const readme = PUBLIC_README.exec(path)
  return readme?.[1] !== undefined && !isPrivateMember(readme[1])
}

export function outsideAllowlist(
  paths: readonly string[],
  isPrivateMember: (directory: string) => boolean,
): string[] {
  return paths.filter(path => !isAllowedDocument(path, isPrivateMember))
}
