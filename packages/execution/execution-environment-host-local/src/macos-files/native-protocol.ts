export const nativeProtocolSource = String.raw`
#include <sys/stat.h>
#include <sys/types.h>
#include <fcntl.h>
#include <unistd.h>
#include <dirent.h>
#include <errno.h>
#include <stdint.h>
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h>
#include <setjmp.h>

static jmp_buf failed;
static const char *failure;
static int changed;
static int *handles;
static size_t handle_count;
static void refuse(const char *why) {
  failure = changed ? "unknown" : why;
  longjmp(failed, 1);
}
static void *allocate(size_t bytes) {
  void *p = calloc(bytes ? bytes : 1, 1);
  if (!p) refuse("unknown");
  return p;
}
static void *resize(void *p, size_t bytes) {
  void *next = realloc(p, bytes ? bytes : 1);
  if (!next) refuse("unknown");
  return next;
}
static char *copy_string(const char *s) {
  char *p = allocate(strlen(s) + 1);
  strcpy(p, s);
  return p;
}
static int hold(int fd) {
  if (fd < 0) return fd;
  handles = resize(handles, (handle_count + 1) * sizeof(int));
  handles[handle_count++] = fd;
  return fd;
}
static void release(int fd) {
  for (size_t i = 0; i < handle_count; i++) {
    if (handles[i] != fd) continue;
    handles[i] = handles[--handle_count];
    if (close(fd) != 0) refuse("unknown");
    return;
  }
}
static const char *open_failure(int code) {
  switch (code) {
    case ENOENT: case ENOTDIR: return "unresolved";
    case ELOOP: case EMLINK: case EISDIR: return "unsupported";
    case EINVAL: return "invalidInput";
    case EACCES: case EPERM: return "notAuthorized";
    default: return "unknown";
  }
}
static const char *change_failure(int code) {
  switch (code) {
    case EEXIST: case ENOTEMPTY: return "conflict";
    case EXDEV: case EOPNOTSUPP: return "unsupported";
    case ENOSPC: case EDQUOT: return "capacity";
    case EROFS: return "notAuthorized";
    case EBUSY: return "busy";
    default: return open_failure(code);
  }
}
static int valid_utf8(const unsigned char *s) {
  while (*s) {
    uint32_t c = *s++;
    if (c < 0x80) continue;
    int count;
    uint32_t min;
    if (c >= 0xc2 && c <= 0xdf) { count = 1; min = 0x80; c &= 31; }
    else if (c >= 0xe0 && c <= 0xef) { count = 2; min = 0x800; c &= 15; }
    else if (c >= 0xf0 && c <= 0xf4) { count = 3; min = 0x10000; c &= 7; }
    else return 0;
    while (count--) {
      if ((*s & 0xc0) != 0x80) return 0;
      c = c * 64 + (*s++ & 63);
    }
    if (c < min || c > 0x10ffff || (c >= 0xd800 && c <= 0xdfff)) return 0;
  }
  return 1;
}

typedef enum { J_STRING, J_NUMBER, J_TRUE, J_FALSE, J_NULL, J_ARRAY, J_OBJECT_ARRAY } json_kind;
typedef struct document document;
typedef struct { char *key; json_kind kind; char *text; int64_t number; char **items; document *objects; size_t count; } field;
struct document { field *fields; size_t count; };
static const char *cursor;
static void space(void) { while (*cursor == ' ' || *cursor == '\n' || *cursor == '\r' || *cursor == '\t') cursor++; }
static unsigned hex_digit(void) {
  char c = *cursor++;
  if (c >= '0' && c <= '9') return (unsigned)(c - '0');
  if (c >= 'a' && c <= 'f') return (unsigned)(c - 'a' + 10);
  if (c >= 'A' && c <= 'F') return (unsigned)(c - 'A' + 10);
  refuse("invalidInput"); return 0;
}
static uint32_t hex_quad(void) {
  uint32_t n = 0;
  for (int i = 0; i < 4; i++) { if (!*cursor) refuse("invalidInput"); n = n * 16 + hex_digit(); }
  return n;
}
static void unicode_escape(char *out, size_t *length) {
  uint32_t c = hex_quad();
  if (c >= 0xd800 && c <= 0xdbff) {
    if (cursor[0] != '\\' || cursor[1] != 'u') refuse("invalidInput");
    cursor += 2;
    uint32_t low = hex_quad();
    if (low < 0xdc00 || low > 0xdfff) refuse("invalidInput");
    c = 0x10000 + ((c - 0xd800) << 10) + low - 0xdc00;
  } else if (c >= 0xdc00 && c <= 0xdfff) refuse("invalidInput");
  if (c == 0) refuse("invalidInput");
  if (c < 0x80) out[(*length)++] = (char)c;
  else if (c < 0x800) { out[(*length)++] = (char)(0xc0 | c >> 6); out[(*length)++] = (char)(0x80 | (c & 63)); }
  else if (c < 0x10000) { out[(*length)++] = (char)(0xe0 | c >> 12); out[(*length)++] = (char)(0x80 | ((c >> 6) & 63)); out[(*length)++] = (char)(0x80 | (c & 63)); }
  else { out[(*length)++] = (char)(0xf0 | c >> 18); out[(*length)++] = (char)(0x80 | ((c >> 12) & 63)); out[(*length)++] = (char)(0x80 | ((c >> 6) & 63)); out[(*length)++] = (char)(0x80 | (c & 63)); }
}
static char *parse_string(void) {
  if (*cursor++ != '"') refuse("invalidInput");
  char *out = allocate(strlen(cursor) + 1);
  size_t length = 0;
  while (*cursor && *cursor != '"') {
    unsigned char c = (unsigned char)*cursor++;
    if (c < 32) refuse("invalidInput");
    if (c != '\\') { out[length++] = (char)c; continue; }
    char escaped = *cursor++;
    switch (escaped) {
      case '"': case '\\': case '/': out[length++] = escaped; break;
      case 'b': out[length++] = '\b'; break;
      case 'f': out[length++] = '\f'; break;
      case 'n': out[length++] = '\n'; break;
      case 'r': out[length++] = '\r'; break;
      case 't': out[length++] = '\t'; break;
      case 'u': unicode_escape(out, &length); break;
      default: refuse("invalidInput");
    }
  }
  if (*cursor++ != '"' || !valid_utf8((unsigned char *)out)) refuse("invalidInput");
  return out;
}
static document parse_object(void);
static void parse_value(field *f) {
  space();
  if (*cursor == '"') { f->kind = J_STRING; f->text = parse_string(); return; }
  if (*cursor == '[') {
    cursor++; space(); f->kind = J_ARRAY;
    if (*cursor == ']') { cursor++; return; }
    if (*cursor == '{') {
      f->kind = J_OBJECT_ARRAY;
      for (;;) {
        f->objects = resize(f->objects, (f->count + 1) * sizeof(document));
        f->objects[f->count++] = parse_object(); space();
        if (*cursor == ']') { cursor++; return; }
        if (*cursor++ != ',') refuse("invalidInput");
        space();
      }
    }
    for (;;) {
      f->items = resize(f->items, (f->count + 1) * sizeof(char *));
      f->items[f->count++] = parse_string(); space();
      if (*cursor == ']') { cursor++; return; }
      if (*cursor++ != ',') refuse("invalidInput");
      space();
    }
  }
  if (strncmp(cursor, "true", 4) == 0) { f->kind = J_TRUE; cursor += 4; return; }
  if (strncmp(cursor, "false", 5) == 0) { f->kind = J_FALSE; cursor += 5; return; }
  if (strncmp(cursor, "null", 4) == 0) { f->kind = J_NULL; cursor += 4; return; }
  char *end;
  errno = 0;
  int64_t n = strtoll(cursor, &end, 10);
  if (errno || cursor == end || n < -9007199254740991LL || n > 9007199254740991LL) refuse("invalidInput");
  if (*cursor == '+' || (*cursor == '0' && end > cursor + 1)) refuse("invalidInput");
  f->kind = J_NUMBER; f->number = n; cursor = end;
}
static document parse_object(void) {
  document d = {0}; space();
  if (*cursor++ != '{') refuse("invalidInput");
  space();
  if (*cursor == '}') { cursor++; return d; }
  for (;;) {
    d.fields = resize(d.fields, (d.count + 1) * sizeof(field));
    field *f = &d.fields[d.count]; memset(f, 0, sizeof(*f));
    f->key = parse_string(); space();
    for (size_t i = 0; i < d.count; i++) if (strcmp(d.fields[i].key, f->key) == 0) refuse("invalidInput");
    if (*cursor++ != ':') refuse("invalidInput");
    parse_value(f); d.count++; space();
    if (*cursor == '}') { cursor++; break; }
    if (*cursor++ != ',') refuse("invalidInput");
    space();
  }
  return d;
}
static document parse_document(const char *text) {
  cursor = text;
  document d = parse_object();
  space(); if (*cursor) refuse("invalidInput");
  return d;
}
static field *lookup(document *d, const char *name) {
  for (size_t i = 0; i < d->count; i++) if (strcmp(d->fields[i].key, name) == 0) return &d->fields[i];
  return NULL;
}
static char *string_field(document *d, const char *name, int optional) {
  field *f = lookup(d, name);
  if (optional && (!f || f->kind == J_NULL)) return NULL;
  if (!f || f->kind != J_STRING) refuse("invalidInput");
  return f->text;
}
static int64_t number_field(document *d, const char *name, int64_t fallback) {
  field *f = lookup(d, name);
  if (!f) return fallback;
  if (f->kind != J_NUMBER) refuse("invalidInput");
  return f->number;
}
static int bool_field(document *d, const char *name) {
  field *f = lookup(d, name);
  if (!f) return 0;
  if (f->kind != J_TRUE && f->kind != J_FALSE) refuse("invalidInput");
  return f->kind == J_TRUE;
}
static field *segments_field(document *d, const char *name) {
  field *f = lookup(d, name);
  if (!f || f->kind != J_ARRAY) refuse("invalidInput");
  for (size_t i = 0; i < f->count; i++) {
    char *s = f->items[i];
    if (!*s || strchr(s, '/') || strcmp(s, ".") == 0 || strcmp(s, "..") == 0) refuse("invalidInput");
  }
  return f;
}
static void quote(FILE *out, const char *s) {
  fputc('"', out);
  for (const unsigned char *p = (const unsigned char *)s; *p; p++) {
    if (*p == '"' || *p == '\\') fprintf(out, "\\%c", *p);
    else if (*p < 32) fprintf(out, "\\u%04x", *p);
    else fputc(*p, out);
  }
  fputc('"', out);
}
static const char alphabet[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
static int base64_digit(char c) {
  const char *p = strchr(alphabet, c);
  return c && p ? (int)(p - alphabet) : -1;
}
static unsigned char *decode(const char *s, size_t *size) {
  size_t length = strlen(s);
  if (length % 4) refuse("invalidInput");
  unsigned char *out = allocate(length / 4 * 3 + 1); *size = 0;
  for (size_t i = 0; i < length; i += 4) {
    int a = base64_digit(s[i]), b = base64_digit(s[i + 1]);
    int c = s[i + 2] == '=' ? 0 : base64_digit(s[i + 2]);
    int e = s[i + 3] == '=' ? 0 : base64_digit(s[i + 3]);
    if (a < 0 || b < 0 || c < 0 || e < 0) refuse("invalidInput");
    if ((s[i + 2] == '=' || s[i + 3] == '=') && i + 4 != length) refuse("invalidInput");
    if (s[i + 2] == '=' && (s[i + 3] != '=' || (b & 15))) refuse("invalidInput");
    if (s[i + 3] == '=' && s[i + 2] != '=' && (c & 3)) refuse("invalidInput");
    out[(*size)++] = (unsigned char)(a * 4 + b / 16);
    if (s[i + 2] != '=') out[(*size)++] = (unsigned char)(b * 16 + c / 4);
    if (s[i + 3] != '=') out[(*size)++] = (unsigned char)(c * 64 + e);
  }
  return out;
}
static void encode(FILE *out, const unsigned char *bytes, size_t size) {
  fputc('"', out);
  for (size_t i = 0; i < size; i += 3) {
    uint32_t v = (uint32_t)bytes[i] << 16;
    if (i + 1 < size) v |= (uint32_t)bytes[i + 1] << 8;
    if (i + 2 < size) v |= bytes[i + 2];
    fputc(alphabet[v >> 18], out); fputc(alphabet[(v >> 12) & 63], out);
    fputc(i + 1 < size ? alphabet[(v >> 6) & 63] : '=', out);
    fputc(i + 2 < size ? alphabet[v & 63] : '=', out);
  }
  fputc('"', out);
}
`
