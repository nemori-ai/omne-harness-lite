export const nativeTestSource = String.raw`
#ifdef OMNE_FILES_TESTING
static char *test_path(int fd, const char *name) {
  char directory[96];
  snprintf(directory, sizeof directory, "/proc/self/fd/%d/", fd);
  char *path = allocate(strlen(directory) + strlen(name) + 1);
  strcpy(path, directory); strcat(path, name);
  return path;
}
static int test_gate(const char *fn, const char *first, const char *second) {
  struct stat events, replies;
  if (fstat(3, &events) != 0 || fstat(4, &replies) != 0) return 0;
  if ((!S_ISFIFO(events.st_mode) && !S_ISSOCK(events.st_mode)) || (!S_ISFIFO(replies.st_mode) && !S_ISSOCK(replies.st_mode))) return 0;
  char *event = NULL; size_t size = 0;
  FILE *stream = open_memstream(&event, &size);
  if (!stream) { errno = EIO; return -1; }
  fprintf(stream, "{\"fn\":"); quote(stream, fn); fprintf(stream, ",\"paths\":["); quote(stream, first);
  if (second) { fputc(',', stream); quote(stream, second); }
  fprintf(stream, "]}\n");
  if (fclose(stream) != 0) { free(event); errno = EIO; return -1; }
  size_t sent = 0;
  while (sent < size) {
    ssize_t count = write(3, event + sent, size - sent);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) { free(event); errno = EIO; return -1; }
    sent += (size_t)count;
  }
  free(event);
  char ack[32]; size_t length = 0;
  while (length + 1 < sizeof ack) {
    ssize_t count = read(4, ack + length, 1);
    if (count < 0 && errno == EINTR) continue;
    if (count != 1) { errno = EIO; return -1; }
    if (ack[length++] == '\n') break;
  }
  if (!length || ack[length - 1] != '\n') { errno = EIO; return -1; }
  ack[length - 1] = 0;
  char *end; long code = strtol(ack, &end, 10);
  if (*end || code < 0 || code > INT_MAX) { errno = EIO; return -1; }
  if (!code) return 0;
  errno = (int)code; return -1;
}
static int test_at(const char *fn, int fd, const char *name) {
  char *path = test_path(fd, name);
  int result = test_gate(fn, path, NULL); int code = errno;
  free(path); errno = code; return result;
}
static int test_two(const char *fn, int from, const char *source, int to, const char *target) {
  char *first = test_path(from, source), *second = test_path(to, target);
  int result = test_gate(fn, first, second); int code = errno;
  free(first); free(second); errno = code; return result;
}
static int tested_open(const char *path, int flags) {
  if (test_gate("open", path, NULL) != 0) return -1;
  return open(path, flags);
}
static int tested_openat(int parent, const char *name, int flags, mode_t mode) {
  if (test_at("open", parent, name) != 0) return -1;
  return openat(parent, name, flags, mode);
}
static int tested_mkdirat(int parent, const char *name, mode_t mode) {
  if (test_at("mkdir", parent, name) != 0) return -1;
  return mkdirat(parent, name, mode);
}
static int tested_unlinkat(int parent, const char *name, int flags) {
  if (test_at(flags & AT_REMOVEDIR ? "rmdir" : "unlink", parent, name) != 0) return -1;
  return unlinkat(parent, name, flags);
}
static int tested_renameat(int from, const char *source, int to, const char *target) {
  if (test_two("rename", from, source, to, target) != 0) return -1;
  return renameat(from, source, to, target);
}
static int tested_linkat(int from, const char *source, int to, const char *target, int flags) {
  if (test_two("link", from, source, to, target) != 0) return -1;
  return linkat(from, source, to, target, flags);
}
static ssize_t tested_write(int fd, const void *bytes, size_t size) {
  char path[PATH_MAX];
  if (fcntl(fd, F_GETPATH, path) != 0) snprintf(path, sizeof path, "/proc/self/fd/%d", fd);
  if (test_gate("write", path, NULL) != 0) return -1;
  return write(fd, bytes, size);
}
#define open(path, flags) tested_open(path, flags)
#define openat(parent, name, flags, ...) tested_openat(parent, name, flags, (mode_t)(0 __VA_OPT__(+ __VA_ARGS__)))
#define mkdirat(parent, name, mode) tested_mkdirat(parent, name, mode)
#define unlinkat(parent, name, flags) tested_unlinkat(parent, name, flags)
#define renameat(from, source, to, target) tested_renameat(from, source, to, target)
#define linkat(from, source, to, target, flags) tested_linkat(from, source, to, target, flags)
#define write(fd, bytes, size) tested_write(fd, bytes, size)
#endif
`
