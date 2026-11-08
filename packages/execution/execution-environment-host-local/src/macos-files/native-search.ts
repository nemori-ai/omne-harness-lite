export const nativeSearchSource = String.raw`
typedef struct {
  FILE *out; unsigned char *pattern; size_t pattern_size;
  int content, recursive, truncated, stop;
  int64_t offset, limit, hits, entry_limit, byte_limit, file_limit, entries, bytes;
  dev_t dev;
} search;
static int64_t find_pattern(const unsigned char *bytes, size_t size, const unsigned char *pattern, size_t length) {
  if (length > size) return -1;
  for (size_t i = 0; i <= size - length; i++) if (memcmp(bytes + i, pattern, length) == 0) return (int64_t)i;
  return -1;
}
static char *child_path(const char *parent, const char *name) {
  size_t length = strlen(parent);
  while (length && parent[length - 1] == '/') length--;
  char *path = allocate(length + strlen(name) + 2);
  memcpy(path, parent, length); path[length] = '/'; strcpy(path + length + 1, name);
  return path;
}
static void record_hit(search *walk, const char *path, const struct stat *s, int64_t at) {
  int64_t index = walk->hits++;
  if (index >= walk->offset && index < walk->offset + walk->limit) {
    char token[96]; identity(s, token, sizeof token);
    if (index != walk->offset) fputc(',', walk->out);
    fprintf(walk->out, "{\"path\":"); quote(walk->out, path);
    fprintf(walk->out, ",\"token\":"); quote(walk->out, token);
    fprintf(walk->out, ",\"offsetBytes\":%" PRId64 "}", at);
  }
  if (walk->hits > walk->offset + walk->limit) walk->stop = 1;
}
static void search_file(search *walk, int parent, const char *name, const char *path, struct stat entry) {
  if (entry.st_size > walk->file_limit) { walk->truncated = 1; return; }
  if (entry.st_size > walk->byte_limit - walk->bytes) { walk->truncated = walk->stop = 1; return; }
  int fd = hold(openat(parent, name, O_RDONLY | O_NOFOLLOW | O_NONBLOCK | O_CLOEXEC));
  if (fd < 0) {
    if (errno == ELOOP || errno == ENOENT) return;
    refuse("unknown");
  }
  struct stat s = descriptor_stat(fd);
  if (!S_ISREG(s.st_mode)) { release(fd); return; }
  if (rooted && (s.st_nlink > 1 || s.st_dev != walk->dev)) refuse("notAuthorized");
  if (s.st_size > walk->file_limit) { walk->truncated = 1; release(fd); return; }
  if (s.st_size > walk->byte_limit - walk->bytes) { walk->truncated = walk->stop = 1; release(fd); return; }
  int64_t bound = walk->file_limit;
  if (walk->byte_limit - walk->bytes < bound) bound = walk->byte_limit - walk->bytes;
  size_t size;
  unsigned char *bytes = read_bytes(fd, 0, bound, &size);
  walk->bytes += (int64_t)size;
  struct stat after = descriptor_stat(fd);
  if (after.st_size > (int64_t)size) walk->truncated = 1;
  int64_t at = find_pattern(bytes, size, walk->pattern, walk->pattern_size);
  if (at >= 0) record_hit(walk, path, &s, at);
  free(bytes); release(fd);
}
static void search_directory(search *walk, int fd, const char *prefix);
static void enter_search(search *walk, int parent, const char *name, const char *path) {
  int fd = hold(openat(parent, name, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC));
  if (fd < 0) {
    if (errno == ENOTDIR || errno == ELOOP || errno == ENOENT) return;
    refuse("unknown");
  }
  struct stat s = descriptor_stat(fd);
  if (s.st_dev == walk->dev) search_directory(walk, fd, path);
  release(fd);
}
static void search_directory(search *walk, int fd, const char *prefix) {
  names entries = directory_names(fd);
  for (size_t i = 0; i < entries.count && !walk->stop; i++) {
    if (++walk->entries > walk->entry_limit) { walk->truncated = walk->stop = 1; break; }
    const char *name = entries.values[i];
    struct stat s;
    if (fstatat(fd, name, &s, AT_SYMLINK_NOFOLLOW) != 0) refuse("unknown");
    char *path = child_path(prefix, name);
    if (!walk->content) {
      if (find_pattern((unsigned char *)name, strlen(name), walk->pattern, walk->pattern_size) >= 0) record_hit(walk, path, &s, -1);
    } else if (S_ISREG(s.st_mode)) search_file(walk, fd, name, path, s);
    if (!walk->stop && walk->recursive && S_ISDIR(s.st_mode) && s.st_dev == walk->dev) enter_search(walk, fd, name, path);
    free(path);
  }
  free_names(entries);
}
static void search_operation(document *d, root r, FILE *out) {
  search walk = {0}; walk.out = out;
  page(d, &walk.offset, &walk.limit);
  walk.pattern = decode(string_field(d, "pattern", 0), &walk.pattern_size);
  if (!walk.pattern_size) refuse("invalidInput");
  walk.content = bool_field(d, "content"); walk.recursive = bool_field(d, "recursive");
  walk.entry_limit = number_field(d, "entryBudget", 10000);
  walk.byte_limit = number_field(d, "byteBudget", 67108864);
  walk.file_limit = number_field(d, "fileBytes", 8388608);
  if (walk.entry_limit < 1 || walk.byte_limit < 1 || walk.file_limit < 1) refuse("invalidInput");
  const char *path = string_field(d, "path", 0);
  struct stat s; int fd = named_directory(d, r, &s); walk.dev = s.st_dev;
  fprintf(out, "{\"info\":"); metadata(out, &s, "."); fprintf(out, ",\"hits\":[");
  search_directory(&walk, fd, path);
  fprintf(out, "],\"next\":%" PRId64 ",\"truncated\":%s", walk.hits > walk.offset + walk.limit ? walk.offset + walk.limit : -1, walk.truncated ? "true" : "false");
  result_defaults(out, HAS_HITS | HAS_NEXT | HAS_TRUNCATED); fputc('}', out);
  free(walk.pattern);
}
`
