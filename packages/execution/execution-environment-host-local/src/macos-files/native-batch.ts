export const nativeBatchSource = String.raw`
typedef struct {
  location target;
  const char *named, *expected, *temporary;
  unsigned char *bytes;
  size_t size;
  mode_t mode;
  int staged, published;
} batch_item;
static int batch_active;
static int batch_finished;
static void flush_event(void) { if (fflush(stdout) != 0) refuse("unknown"); }
static const char *acknowledgement(void) {
  char line[32];
  if (!fgets(line, sizeof line, stdin)) return "effectUnknown";
  if (strcmp(line, "continue\n") == 0) return NULL;
  if (strcmp(line, "closed\n") == 0) return "closed";
  return "effectUnknown";
}
static const char *batch_event(const char *event, int64_t index) {
  fprintf(stdout, "{\"event\":\"%s\"", event);
  if (index >= 0) fprintf(stdout, ",\"index\":%" PRId64, index);
  fprintf(stdout, "}\n"); flush_event();
  return acknowledgement();
}
static int close_batch_handles(void) {
  int clean = 1;
  while (handle_count) if (close(handles[--handle_count]) != 0) clean = 0;
  return clean;
}
static void batch_result(const char *reason) {
  if (!close_batch_handles()) reason = "effectUnknown";
  if (!reason) fprintf(stdout, "{\"event\":\"result\",\"kind\":\"committed\"}\n");
  else fprintf(stdout, "{\"event\":\"result\",\"kind\":\"unknown\",\"reason\":\"%s\"}\n", reason);
  flush_event(); batch_finished = 1;
}
static batch_item prepare_item(document *d) {
  batch_item item = {0};
  item.temporary = string_field(d, "temp", 0);
  if (strncmp(item.temporary, ".omne-batch-", 12) != 0 || strchr(item.temporary, '/')) refuse("invalidInput");
  item.named = string_field(d, "named", 0);
  item.expected = string_field(d, "version", 1);
  item.bytes = decode(string_field(d, "bytes", 0), &item.size);
  item.target = locate(open_root(d, 0));
  if (item.target.is_root) refuse("notAuthorized");
  struct stat s;
  int exists = fstatat(item.target.parent, item.target.name, &s, AT_SYMLINK_NOFOLLOW) == 0;
  if (!exists && errno != ENOENT) refuse(open_failure(errno));
  if (!item.expected) {
    struct stat parent = descriptor_stat(item.target.parent);
    match_identity(&parent, item.named, "conflict");
    if (exists) refuse("conflict");
    item.mode = 0666;
  } else {
    if (!exists) refuse("unresolved");
    match_identity(&s, item.named, "conflict");
    if (!S_ISREG(s.st_mode)) refuse("unsupported");
    match_version(&s, item.expected);
    item.mode = s.st_mode & 0777;
  }
  return item;
}
static int discard_batch(batch_item *items, size_t count) {
  int clean = 1;
  for (size_t i = 0; i < count; i++) {
    if (!items[i].staged || items[i].published) continue;
    if (unlinkat(items[i].target.parent, items[i].temporary, 0) != 0 && errno != ENOENT) clean = 0;
    else items[i].staged = 0;
  }
  return clean;
}
static void stop_batch(batch_item *items, size_t count, const char *reason) {
  if (strcmp(reason, "effectUnknown") != 0 && !discard_batch(items, count)) reason = "effectUnknown";
  batch_result(reason);
}
static const char *stage_item(batch_item *item) {
  int fd = hold(openat(item->target.parent, item->temporary, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, item->mode));
  if (fd < 0) return change_failure(errno);
  changed = item->staged = 1;
  int error = 0;
  size_t position = 0;
  while (position < item->size) {
    ssize_t count = write(fd, item->bytes + position, item->size - position > 65536 ? 65536 : item->size - position);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) { error = count == 0 ? EIO : errno; break; }
    position += (size_t)count;
  }
  if (!error && fsync(fd) != 0) error = errno;
  for (size_t i = 0; i < handle_count; i++) {
    if (handles[i] != fd) continue;
    handles[i] = handles[--handle_count];
    if (close(fd) != 0) error = EIO;
    break;
  }
  return error ? change_failure(error) : NULL;
}
static void stage_failure(batch_item *items, size_t count, const char *why) {
  int clean = discard_batch(items, count);
  if (!close_batch_handles()) clean = 0;
  fprintf(stdout, "{\"event\":\"stageFailure\",\"failure\":\"%s\",\"cleaned\":%s}\n", why, clean ? "true" : "false");
  flush_event(); batch_finished = 1;
}
static const char *recheck_replacement(batch_item *item) {
  struct stat s;
  if (fstatat(item->target.parent, item->target.name, &s, AT_SYMLINK_NOFOLLOW) != 0) return errno == ENOENT ? "conflict" : "effectUnknown";
  char token[96], stamp[96]; identity(&s, token, sizeof token); version(&s, stamp, sizeof stamp);
  if (!S_ISREG(s.st_mode) || strcmp(token, item->named) != 0 || strcmp(stamp, item->expected) != 0) return "conflict";
  return NULL;
}
static const char *errno_name(int code) {
  switch (code) {
    case EACCES: return "EACCES";
    case EPERM: return "EPERM";
    case EIO: return "EIO";
    case EROFS: return "EROFS";
    case EBUSY: return "EBUSY";
    case ENOENT: return "ENOENT";
    case ENOSPC: return "ENOSPC";
    case EDQUOT: return "EDQUOT";
    case ENOTDIR: return "ENOTDIR";
    default: {
      static char name[32];
      snprintf(name, sizeof name, "ERRNO_%d", code);
      return name;
    }
  }
}
static const char *publish_item(batch_item *item, int *cleanup_error) {
  location loc = item->target;
  if (item->expected) {
    const char *reason = recheck_replacement(item);
    if (reason) return reason;
    if (renameat(loc.parent, item->temporary, loc.parent, loc.name) != 0) return "effectUnknown";
  } else {
    if (linkat(loc.parent, item->temporary, loc.parent, loc.name, 0) != 0) return errno == EEXIST ? "conflict" : "effectUnknown";
    if (unlinkat(loc.parent, item->temporary, 0) != 0 && errno != ENOENT) *cleanup_error = errno;
  }
  item->published = 1;
  return NULL;
}
static const char *published_event(batch_item *item, size_t index, int cleanup_error) {
  fprintf(stdout, "{\"event\":\"published\",\"index\":%zu", index);
  if (cleanup_error) {
    fprintf(stdout, ",\"cleanupError\":{\"temp\":"); quote(stdout, item->temporary);
    fprintf(stdout, ",\"code\":"); quote(stdout, errno_name(cleanup_error)); fputc('}', stdout);
  }
  fprintf(stdout, "}\n"); flush_event(); return acknowledgement();
}
static void batch_operation(document *d) {
  field *entries = lookup(d, "entries");
  if (!entries || entries->kind != J_OBJECT_ARRAY || !entries->count) refuse("invalidInput");
  batch_item *items = allocate(entries->count * sizeof(batch_item));
  for (size_t i = 0; i < entries->count; i++) items[i] = prepare_item(&entries->objects[i]);
  batch_active = 1;
  const char *reason = batch_event("checked", -1);
  if (reason) { stop_batch(items, entries->count, reason); return; }
  for (size_t i = 0; i < entries->count; i++) {
    reason = stage_item(&items[i]);
    if (reason) { stage_failure(items, entries->count, reason); return; }
  }
  reason = batch_event("staged", -1);
  if (reason) { stop_batch(items, entries->count, reason); return; }
  for (size_t i = 0; i < entries->count; i++) {
    reason = batch_event("beforePublish", (int64_t)i);
    if (reason) { stop_batch(items, entries->count, reason); return; }
    int cleanup_error = 0;
    reason = publish_item(&items[i], &cleanup_error);
    if (reason) { stop_batch(items, entries->count, reason); return; }
    reason = published_event(&items[i], i, cleanup_error);
    if (reason) { stop_batch(items, entries->count, reason); return; }
  }
  batch_result(NULL);
}
`
