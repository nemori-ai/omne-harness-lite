export function repositoryEnv(base: Readonly<NodeJS.ProcessEnv>): NodeJS.ProcessEnv {
  const env = { ...base }
  for (const key of [
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_INDEX_FILE',
    'GIT_COMMON_DIR',
    'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_NAMESPACE',
    'GIT_SHALLOW_FILE',
  ])
    delete env[key]
  return env
}
