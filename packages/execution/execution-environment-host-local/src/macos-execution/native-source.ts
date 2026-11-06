/**
 * The session reader of the macOS backend, compiled on the host with the Command Line Tools.
 * It uses public interfaces only: `proc_listpids`, `getsid`, `getpgid`, `kill` and the
 * `PROC_PIDT_SHORTBSDINFO` and `PROC_PIDTBSDINFO` flavors of `proc_pidinfo` from <libproc.h>.
 *
 *   members <except> <sid>...            one line `pid pgid sid` per live process of the sessions
 *   identity <pid>                       `sid start_sec start_usec`, or `gone`
 *   stop <bound_ms> <except> <sid>...    kills every live member and its process group until two
 *                                        readings in a row are empty: `confirmed`; at the bound:
 *                                        `unconfirmed <count>`
 *
 * `except` is a pid left out of the reading and never signalled; 0 leaves none out. The reader
 * itself is never a member: a gate that asks runs it inside its own session. A zombie is not live. Exit status 1 means the reading failed; the caller treats it as unknown, never as empty.
 */
export const sessionReaderSource = String.raw`
#include <errno.h>
#include <libproc.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/proc_info.h>
#include <time.h>
#include <unistd.h>

#define ZOMBIE 5

typedef struct { pid_t pid, pgid, sid; } member;

static int parse_pid(const char *text, pid_t *out) {
  char *end = 0;
  errno = 0;
  long value = strtol(text, &end, 10);
  if (errno != 0 || end == text || *end != 0 || value < 0 || value > 0x7fffffff) return -1;
  *out = (pid_t)value;
  return 0;
}

static int zombie(pid_t pid) {
  struct proc_bsdshortinfo info;
  int size = proc_pidinfo(pid, PROC_PIDT_SHORTBSDINFO, 0, &info, sizeof info);
  return size == (int)sizeof info && info.pbsi_status == ZOMBIE;
}

/* Fills the live members of the sessions; answers their count, or -1 when the list fails. */
static int read_members(const pid_t *sids, int nsids, pid_t except, member **out) {
  int bytes = proc_listpids(PROC_ALL_PIDS, 0, NULL, 0);
  if (bytes <= 0) return -1;
  int capacity = bytes / (int)sizeof(pid_t) + 256;
  pid_t *pids = calloc((size_t)capacity, sizeof(pid_t));
  member *found = calloc((size_t)capacity, sizeof(member));
  if (pids == NULL || found == NULL) { free(pids); free(found); return -1; }
  bytes = proc_listpids(PROC_ALL_PIDS, 0, pids, capacity * (int)sizeof(pid_t));
  if (bytes <= 0) { free(pids); free(found); return -1; }
  int count = 0;
  pid_t self = getpid();
  for (int i = 0; i < bytes / (int)sizeof(pid_t); i++) {
    pid_t pid = pids[i];
    if (pid <= 1 || pid == except || pid == self) continue;
    pid_t sid = getsid(pid);
    if (sid < 0) continue;
    for (int j = 0; j < nsids; j++) {
      if (sid != sids[j]) continue;
      if (zombie(pid)) break;
      pid_t pgid = getpgid(pid);
      if (pgid < 0) break;
      found[count].pid = pid; found[count].pgid = pgid; found[count].sid = sid;
      count++;
      break;
    }
  }
  free(pids);
  *out = found;
  return count;
}

static long now_ms(void) {
  struct timespec t;
  clock_gettime(CLOCK_MONOTONIC, &t);
  return t.tv_sec * 1000L + t.tv_nsec / 1000000L;
}

static int parse_sids(int argc, char **argv, int first, pid_t **out) {
  int n = argc - first;
  if (n < 1) return -1;
  pid_t *sids = calloc((size_t)n, sizeof(pid_t));
  if (sids == NULL) return -1;
  for (int i = 0; i < n; i++)
    if (parse_pid(argv[first + i], &sids[i]) != 0 || sids[i] <= 1) { free(sids); return -1; }
  *out = sids;
  return n;
}

static int members_command(int argc, char **argv) {
  pid_t except, *sids;
  if (argc < 4 || parse_pid(argv[2], &except) != 0) return 2;
  int nsids = parse_sids(argc, argv, 3, &sids);
  if (nsids < 0) return 2;
  member *found;
  int count = read_members(sids, nsids, except, &found);
  if (count < 0) return 1;
  for (int i = 0; i < count; i++) printf("%d %d %d\n", found[i].pid, found[i].pgid, found[i].sid);
  free(found);
  return 0;
}

static int identity_command(int argc, char **argv) {
  pid_t pid;
  if (argc != 3 || parse_pid(argv[2], &pid) != 0 || pid <= 1) return 2;
  pid_t sid = getsid(pid);
  if (sid < 0) {
    if (errno == ESRCH) { printf("gone\n"); return 0; }
    return 1;
  }
  struct proc_bsdinfo info;
  int size = proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &info, sizeof info);
  if (size != (int)sizeof info) {
    if (kill(pid, 0) != 0 && errno == ESRCH) { printf("gone\n"); return 0; }
    return 1;
  }
  if (info.pbi_status == ZOMBIE) { printf("gone\n"); return 0; }
  printf("%d %llu %llu\n", sid, (unsigned long long)info.pbi_start_tvsec,
         (unsigned long long)info.pbi_start_tvusec);
  return 0;
}

static int stop_command(int argc, char **argv) {
  pid_t bound, except, *sids;
  if (argc < 5 || parse_pid(argv[2], &bound) != 0 || parse_pid(argv[3], &except) != 0) return 2;
  int nsids = parse_sids(argc, argv, 4, &sids);
  if (nsids < 0) return 2;
  long deadline = now_ms() + bound;
  int empty = 0, left = -1;
  for (;;) {
    member *found;
    int count = read_members(sids, nsids, except, &found);
    if (count < 0) return 1;
    left = count;
    if (count == 0) {
      free(found);
      if (++empty >= 2) { printf("confirmed\n"); return 0; }
    } else {
      empty = 0;
      for (int i = 0; i < count; i++) {
        if (found[i].pgid > 1 && found[i].pgid != except) killpg(found[i].pgid, SIGKILL);
        kill(found[i].pid, SIGKILL);
      }
      free(found);
    }
    if (now_ms() >= deadline) break;
    usleep(2000);
  }
  printf("unconfirmed %d\n", left);
  return 0;
}

int main(int argc, char **argv) {
  if (argc < 2) return 2;
  if (strcmp(argv[1], "members") == 0) return members_command(argc, argv);
  if (strcmp(argv[1], "identity") == 0) return identity_command(argc, argv);
  if (strcmp(argv[1], "stop") == 0) return stop_command(argc, argv);
  return 2;
}
`
