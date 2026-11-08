export const nativeTreeSource = String.raw`
typedef struct { char **values; size_t count; int lossy; } names;
static int compare_names(const void *a, const void *b) { return strcmp(*(const char *const *)a, *(const char *const *)b); }
static names directory_names(int fd) {
#ifdef OMNE_FILES_TESTING
  if (test_at("readdir", fd, "") != 0) refuse("unknown");
#endif
  names result = {0};
  int copy = dup(fd);
  if (copy < 0) refuse("unknown");
  DIR *directory = fdopendir(copy);
  if (!directory) { close(copy); refuse("unknown"); }
  rewinddir(directory);
  struct dirent *entry;
  int error = 0;
  for (;;) {
    errno = 0; entry = readdir(directory);
    if (!entry) { error = errno; break; }
    if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) continue;
    if (!valid_utf8((unsigned char *)entry->d_name)) { result.lossy = 1; continue; }
    result.values = resize(result.values, (result.count + 1) * sizeof(char *));
    result.values[result.count++] = copy_string(entry->d_name);
  }
  if (closedir(directory) != 0 || error) refuse("unknown");
  if (result.count) qsort(result.values, result.count, sizeof(char *), compare_names);
  return result;
}
static void free_names(names entries) {
  for (size_t i = 0; i < entries.count; i++) free(entries.values[i]);
  free(entries.values);
}
static void page(document *d, int64_t *offset, int64_t *limit) {
  *offset = number_field(d, "offset", 0); *limit = number_field(d, "limit", 1000);
  if (*offset < 0 || *limit < 1 || *offset > 9007199254740991LL - *limit - 1) refuse("invalidInput");
}
static int named_directory(document *d, root r, struct stat *s) {
  int fd = open_directory(r); *s = descriptor_stat(fd);
  match_identity(s, string_field(d, "named", 0), "conflict");
  return fd;
}
static void list_operation(document *d, root r, FILE *out) {
  int64_t offset, limit; page(d, &offset, &limit);
  struct stat s; int fd = named_directory(d, r, &s);
  names entries = directory_names(fd);
  fprintf(out, "{\"info\":"); metadata(out, &s, "."); fprintf(out, ",\"entries\":[");
  size_t start = (uint64_t)offset < entries.count ? (size_t)offset : entries.count;
  size_t end = entries.count - start > (uint64_t)limit ? start + (size_t)limit : entries.count;
  for (size_t i = start; i < end; i++) {
    struct stat entry;
    if (fstatat(fd, entries.values[i], &entry, AT_SYMLINK_NOFOLLOW) != 0) refuse("unknown");
    if (i != start) fputc(',', out);
    metadata(out, &entry, entries.values[i]);
  }
  fprintf(out, "],\"next\":%" PRId64, end < entries.count ? (int64_t)end : -1);
  result_defaults(out, HAS_ENTRIES | HAS_NEXT); fputc('}', out);
  free_names(entries);
}
static void mkdir_operation(document *d, root r, FILE *out) {
  if (!r.segments->count) refuse("conflict");
  const char *named = string_field(d, "named", 0);
  int parents = bool_field(d, "recursive");
  int fd = r.fd;
  size_t next = 0;
  if (!parents) {
    location loc = locate(r); fd = loc.parent; next = r.segments->count - 1;
  } else {
    for (; next < r.segments->count; next++) {
      struct stat entry;
      if (fstatat(fd, r.segments->items[next], &entry, AT_SYMLINK_NOFOLLOW) != 0) {
        if (errno == ENOENT) break;
        refuse(open_failure(errno));
      }
      if (!S_ISDIR(entry.st_mode)) refuse(next + 1 == r.segments->count || !S_ISLNK(entry.st_mode) ? "conflict" : "notAuthorized");
      fd = open_directory_at(fd, r.segments->items[next], r.dev, 0);
    }
    if (next == r.segments->count) refuse("conflict");
  }
  struct stat ancestor = descriptor_stat(fd); match_identity(&ancestor, named, "conflict");
  for (; next < r.segments->count; next++) {
    const char *name = r.segments->items[next];
    if (mkdirat(fd, name, 0777) != 0) refuse(change_failure(errno));
    changed = 1;
    fd = open_directory_at(fd, name, r.dev, 0);
  }
  struct stat s = descriptor_stat(fd);
  fprintf(out, "{\"info\":"); metadata(out, &s, r.segments->items[r.segments->count - 1]); result_defaults(out, 0); fputc('}', out);
}

typedef struct removal { location loc; int directory; struct removal **children; size_t count; } removal;
static removal *preflight_remove(location loc, dev_t dev) {
  struct stat s = entry_stat(loc);
  if (s.st_dev != dev) refuse("notAuthorized");
  removal *node = allocate(sizeof(*node)); node->loc = loc; node->directory = S_ISDIR(s.st_mode);
  if (!node->directory) return node;
  int fd = open_directory_at(loc.parent, loc.name, dev, 0);
  struct stat opened = descriptor_stat(fd);
  if (opened.st_dev != s.st_dev || opened.st_ino != s.st_ino) refuse("conflict");
  names entries = directory_names(fd);
  if (entries.lossy) refuse("unsupported");
  node->children = allocate(entries.count * sizeof(removal *));
  for (size_t i = 0; i < entries.count; i++) {
    location child = {fd, dev, entries.values[i], 0};
    node->children[node->count++] = preflight_remove(child, dev);
  }
  free(entries.values);
  return node;
}
static void delete_plan(removal *node) {
  for (size_t i = 0; i < node->count; i++) delete_plan(node->children[i]);
  if (unlinkat(node->loc.parent, node->loc.name, node->directory ? AT_REMOVEDIR : 0) != 0) refuse(change_failure(errno));
  changed = 1;
}
static void remove_operation(document *d, root r, FILE *out) {
  location loc = locate(r);
  if (loc.is_root) refuse("notAuthorized");
  struct stat s = entry_stat(loc);
  match_identity(&s, string_field(d, "named", 0), "conflict");
  match_version(&s, string_field(d, "version", 1));
  if (rooted && s.st_dev != descriptor_stat(loc.parent).st_dev) refuse("notAuthorized");
  if (S_ISDIR(s.st_mode) && bool_field(d, "recursive")) delete_plan(preflight_remove(loc, s.st_dev));
  else {
    if (unlinkat(loc.parent, loc.name, S_ISDIR(s.st_mode) ? AT_REMOVEDIR : 0) != 0) refuse(change_failure(errno));
    changed = 1;
  }
  fprintf(out, "{\"info\":"); metadata(out, &s, loc.name); result_defaults(out, 0); fputc('}', out);
}

typedef struct { location from, to; struct stat source, target; int exists; int replace; } endpoints;
static endpoints open_endpoints(document *d, root source) {
  endpoints e = {0}; e.from = locate(source);
  if (e.from.is_root) refuse("notAuthorized");
  e.source = entry_stat(e.from);
  match_identity(&e.source, string_field(d, "named", 0), "conflict");
  match_version(&e.source, string_field(d, "version", 1));
  root target = open_root(d, 1); e.to = locate(target);
  if (e.to.is_root) refuse("notAuthorized");
  e.replace = bool_field(d, "replace");
  e.exists = fstatat(e.to.parent, e.to.name, &e.target, AT_SYMLINK_NOFOLLOW) == 0;
  if (!e.exists && errno != ENOENT) refuse(open_failure(errno));
  if (e.exists) {
    if (!e.replace) refuse("conflict");
    match_identity(&e.target, string_field(d, "targetNamed", 0), "conflict");
  } else {
    struct stat parent = descriptor_stat(e.to.parent);
    match_identity(&parent, string_field(d, "targetNamed", 0), "conflict");
  }
  return e;
}
static void endpoint_result(FILE *out, endpoints e) {
  struct stat s = entry_stat(e.to);
  char source[96]; identity(&e.source, source, sizeof source);
  fprintf(out, "{\"info\":"); metadata(out, &s, e.to.name);
  fprintf(out, ",\"source\":"); quote(out, source); result_defaults(out, 0); fputc('}', out);
}
static void move_operation(document *d, root r, FILE *out) {
  endpoints e = open_endpoints(d, r);
  if (e.replace || S_ISDIR(e.source.st_mode)) {
    if (renameat(e.from.parent, e.from.name, e.to.parent, e.to.name) != 0) refuse(errno == ENOTDIR ? "conflict" : change_failure(errno));
    changed = 1;
  } else {
    if (linkat(e.from.parent, e.from.name, e.to.parent, e.to.name, 0) != 0) refuse(change_failure(errno));
    changed = 1;
    if (unlinkat(e.from.parent, e.from.name, 0) != 0) refuse("unknown");
  }
  endpoint_result(out, e);
}
static int pump(int input, int output) {
  unsigned char bytes[65536];
  for (;;) {
    ssize_t count = read(input, bytes, sizeof bytes);
    if (count < 0 && errno == EINTR) continue;
    if (count < 0) return errno;
    if (!count) return 0;
    size_t position = 0;
    while (position < (size_t)count) {
      ssize_t wrote = write(output, bytes + position, (size_t)count - position);
      if (wrote < 0 && errno == EINTR) continue;
      if (wrote <= 0) return wrote == 0 ? EIO : errno;
      position += (size_t)wrote;
    }
  }
}
static void discard_copy(location target, const char *name, int error) {
  if (unlinkat(target.parent, name, 0) != 0) refuse("unknown");
  changed = 0;
  refuse(change_failure(error));
}
static void copy_operation(document *d, root r, FILE *out) {
  endpoints e = open_endpoints(d, r);
  if (!S_ISREG(e.source.st_mode) || (e.exists && S_ISDIR(e.target.st_mode))) refuse("unsupported");
  struct stat s;
  int input = open_object(e.from, 0, 1, &s);
  if (!S_ISREG(s.st_mode) || s.st_dev != e.source.st_dev || s.st_ino != e.source.st_ino) refuse("conflict");
  match_version(&s, string_field(d, "version", 1));
  char temporary[96];
  const char *name = e.to.name;
  if (e.replace) {
    unsigned char random[16]; arc4random_buf(random, sizeof random);
    char hex[33];
    for (size_t i = 0; i < sizeof random; i++) snprintf(hex + i * 2, 3, "%02x", random[i]);
    snprintf(temporary, sizeof temporary, ".omne-copy-%s", hex); name = temporary;
  }
  int output = hold(openat(e.to.parent, name, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, s.st_mode & 0777));
  if (output < 0) refuse(change_failure(errno));
  changed = 1;
  int error = pump(input, output);
  if (!error && e.replace && fsync(output) != 0) error = errno;
  release(output);
  if (error) {
    if (e.replace) discard_copy(e.to, name, error);
    refuse("unknown");
  }
  if (e.replace && renameat(e.to.parent, name, e.to.parent, e.to.name) != 0) discard_copy(e.to, name, errno);
  endpoint_result(out, e);
}
`
