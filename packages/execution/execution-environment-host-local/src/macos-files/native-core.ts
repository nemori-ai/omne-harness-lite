export const nativeCoreSource = String.raw`
typedef struct { int fd; dev_t dev; field *segments; } root;
typedef struct { int parent; dev_t dev; const char *name; int is_root; } location;
static int rooted;
static int64_t modified(const struct stat *s) {
  return (int64_t)s->st_mtimespec.tv_sec * 1000 + s->st_mtimespec.tv_nsec / 1000000;
}
static void identity(const struct stat *s, char *out, size_t size) {
  snprintf(out, size, "%ju:%ju", (uintmax_t)s->st_dev, (uintmax_t)s->st_ino);
}
static void version(const struct stat *s, char *out, size_t size) {
  snprintf(out, size, "%" PRId64 ":%jd", modified(s), (intmax_t)s->st_size);
}
static void match_identity(const struct stat *s, const char *named, const char *why) {
  char token[96]; identity(s, token, sizeof token);
  if (!named || strcmp(token, named) != 0) refuse(why);
}
static void match_version(const struct stat *s, const char *expected) {
  char current[96]; version(s, current, sizeof current);
  if (expected && strcmp(current, expected) != 0) refuse("conflict");
}
static struct stat descriptor_stat(int fd) {
  struct stat s;
  if (fstat(fd, &s) != 0) refuse("unknown");
  return s;
}
static struct stat entry_stat(location loc) {
  struct stat s;
  if (fstatat(loc.parent, loc.name, &s, AT_SYMLINK_NOFOLLOW) != 0) refuse(open_failure(errno));
  return s;
}
static void metadata(FILE *out, const struct stat *s, const char *name) {
  char token[96], stamp[96]; identity(s, token, sizeof token); version(s, stamp, sizeof stamp);
  fprintf(out, "{\"token\":"); quote(out, token);
  fprintf(out, ",\"version\":"); quote(out, stamp);
  fprintf(out, ",\"size\":%jd,\"modified\":%" PRId64 ",\"type\":", (intmax_t)s->st_size, modified(s));
  quote(out, S_ISLNK(s->st_mode) ? "symlink" : S_ISDIR(s->st_mode) ? "directory" : "file");
  fprintf(out, ",\"name\":"); quote(out, name); fputc('}', out);
}
static root open_root(document *d, int target) {
  const char *path = string_field(d, target ? "targetRoot" : "root", 0);
  const char *expected = string_field(d, target ? "expectedTargetRoot" : "expectedRoot", 0);
  field *segments = segments_field(d, target ? "targetSegments" : "segments");
  if (*path != '/') refuse("invalidInput");
  int fd = hold(open(path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC));
  if (fd < 0) refuse(rooted ? "notAuthorized" : open_failure(errno));
  struct stat s = descriptor_stat(fd);
  match_identity(&s, expected, "notAuthorized");
  return (root){fd, s.st_dev, segments};
}
static int open_directory_at(int parent, const char *name, dev_t dev, int final) {
  int fd = hold(openat(parent, name, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC));
  if (fd < 0) {
    int code = errno;
    if (code == ELOOP || code == ENOTDIR) {
      struct stat s;
      if (fstatat(parent, name, &s, AT_SYMLINK_NOFOLLOW) != 0) refuse(open_failure(errno));
      if (final) refuse("unsupported");
      refuse(S_ISLNK(s.st_mode) ? "notAuthorized" : "unresolved");
    }
    refuse(open_failure(code));
  }
  struct stat s = descriptor_stat(fd);
  if (s.st_dev != dev) refuse("notAuthorized");
  return fd;
}
static location locate(root r) {
  int fd = r.fd;
  for (size_t i = 0; i + 1 < r.segments->count; i++) fd = open_directory_at(fd, r.segments->items[i], r.dev, 0);
  return (location){fd, r.dev, r.segments->count ? r.segments->items[r.segments->count - 1] : ".", r.segments->count == 0};
}
static int open_directory(root r) {
  int fd = r.fd;
  for (size_t i = 0; i < r.segments->count; i++) fd = open_directory_at(fd, r.segments->items[i], r.dev, i + 1 == r.segments->count);
  return fd;
}
static int open_object(location loc, int writing, int content, struct stat *s) {
  int fd = hold(openat(loc.parent, loc.name, (writing ? O_RDWR : O_RDONLY) | O_NOFOLLOW | O_NONBLOCK | O_CLOEXEC));
  if (fd < 0) refuse(open_failure(errno));
  *s = descriptor_stat(fd);
  if (rooted && s->st_dev != loc.dev) refuse("notAuthorized");
  if (rooted && content && S_ISREG(s->st_mode) && s->st_nlink > 1) refuse("notAuthorized");
  if (!S_ISREG(s->st_mode) && !S_ISDIR(s->st_mode)) refuse("unsupported");
  return fd;
}
static void write_bytes(int fd, const unsigned char *bytes, size_t size) {
  size_t position = 0;
  while (position < size) {
    ssize_t count = write(fd, bytes + position, size - position > 65536 ? 65536 : size - position);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) refuse(change_failure(count == 0 ? EIO : errno));
    position += (size_t)count;
  }
}
static unsigned char *read_bytes(int fd, int64_t start, int64_t limit, size_t *size) {
  size_t capacity = 65536; *size = 0;
  unsigned char *bytes = allocate(capacity);
  for (;;) {
    size_t room = 65536;
    if (limit >= 0 && (uint64_t)limit - *size < room) room = (size_t)limit - *size;
    if (!room) break;
    if (start > INT64_MAX - (int64_t)*size) refuse("invalidInput");
    if (*size > SIZE_MAX - room) refuse("unknown");
    if (capacity < *size + room) { capacity = *size + room; bytes = resize(bytes, capacity); }
    ssize_t count = pread(fd, bytes + *size, room, start + (int64_t)*size);
    if (count < 0 && errno == EINTR) continue;
    if (count < 0) refuse("unknown");
    if (!count) break;
    *size += (size_t)count;
  }
  return bytes;
}
enum { HAS_BYTES = 1, HAS_ENTRIES = 2, HAS_HITS = 4, HAS_NEXT = 8, HAS_TRUNCATED = 16, HAS_EOF = 32 };
static void result_defaults(FILE *out, unsigned fields) {
  if (!(fields & HAS_BYTES)) fprintf(out, ",\"bytes\":\"\"");
  if (!(fields & HAS_ENTRIES)) fprintf(out, ",\"entries\":[]");
  if (!(fields & HAS_HITS)) fprintf(out, ",\"hits\":[]");
  if (!(fields & HAS_NEXT)) fprintf(out, ",\"next\":-1");
  if (!(fields & HAS_TRUNCATED)) fprintf(out, ",\"truncated\":false");
  if (!(fields & HAS_EOF)) fprintf(out, ",\"eof\":false");
}
static void basic_operation(document *d, root r, FILE *out, const char *operation) {
  location loc = locate(r);
  const char *named = string_field(d, "named", 0);
  const char *expected = string_field(d, "version", 1);
  int writing = strcmp(operation, "write") == 0;
  int reading = strcmp(operation, "read") == 0;
  int create = writing && bool_field(d, "create");
  int64_t start = number_field(d, "offset", 0), limit = number_field(d, "limit", -1);
  if (reading && (start < 0 || limit < -1)) refuse("invalidInput");
  size_t size = 0;
  unsigned char *bytes = writing ? decode(string_field(d, "bytes", 0), &size) : NULL;
  struct stat s;
  int fd;
  if (create) {
    if (expected || bool_field(d, "trailingSlash")) refuse("invalidInput");
    if (loc.is_root) refuse("notAuthorized");
    s = descriptor_stat(loc.parent); match_identity(&s, named, "conflict");
    fd = hold(openat(loc.parent, loc.name, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0600));
    if (fd < 0) refuse(change_failure(errno));
    changed = 1;
    s = descriptor_stat(loc.parent); match_identity(&s, named, "conflict");
  } else {
    fd = open_object(loc, writing, writing || reading, &s);
    match_identity(&s, named, "conflict");
    if ((writing || reading) && !S_ISREG(s.st_mode)) refuse("unsupported");
    if (writing) {
      match_version(&s, expected);
      if (ftruncate(fd, 0) != 0) refuse(open_failure(errno));
      changed = 1;
    }
  }
  if (writing) { write_bytes(fd, bytes, size); s = descriptor_stat(fd); }
  if (create) s = descriptor_stat(fd);
  if (reading) bytes = read_bytes(fd, start, limit, &size);
  fprintf(out, "{\"info\":"); metadata(out, &s, loc.name);
  if (reading) {
    fprintf(out, ",\"bytes\":"); encode(out, bytes, size);
    fprintf(out, ",\"next\":%" PRId64 ",\"eof\":%s", start + (int64_t)size, start + (int64_t)size >= s.st_size ? "true" : "false");
  }
  result_defaults(out, reading ? HAS_BYTES | HAS_NEXT | HAS_EOF : 0);
  fputc('}', out); free(bytes);
}
`
