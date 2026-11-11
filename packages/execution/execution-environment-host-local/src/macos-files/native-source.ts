import { nativeProtocolSource } from './native-protocol.ts'
import { nativeCoreSource } from './native-core.ts'
import { nativeTreeSource } from './native-tree.ts'
import { nativeSearchSource } from './native-search.ts'
import { nativeTestSource } from './native-test.ts'
import { nativeBatchSource } from './native-batch.ts'

export const macosFilesSource =
  nativeProtocolSource +
  nativeTestSource +
  nativeCoreSource +
  nativeTreeSource +
  nativeSearchSource +
  nativeBatchSource +
  String.raw`
static char *response;
static size_t response_size;
static FILE *output;
int main(void) {
  if (setjmp(failed) == 0) {
    char *input = NULL; size_t capacity = 0;
    ssize_t size = getline(&input, &capacity, stdin);
    if (size < 0) refuse("invalidInput");
    if (memchr(input, 0, (size_t)size)) refuse("invalidInput");
    document d = parse_document(input);
    rooted = bool_field(&d, "rooted");
    const char *operation = string_field(&d, "operation", 0);
    if (strcmp(operation, "batch") == 0) {
      batch_operation(&d);
    } else {
      output = open_memstream(&response, &response_size);
      if (!output) refuse("unknown");
      root r = open_root(&d, 0);
      if (strcmp(operation, "observe") == 0) {
        location loc = locate(r);
        struct stat s = entry_stat(loc);
        if (rooted && s.st_dev != r.dev) refuse("notAuthorized");
        fprintf(output, "{\"info\":"); metadata(output, &s, loc.name);
        result_defaults(output, 0); fputc('}', output);
      }
      else if (strcmp(operation, "read") == 0 || strcmp(operation, "stat") == 0 || strcmp(operation, "write") == 0) basic_operation(&d, r, output, operation);
      else if (strcmp(operation, "list") == 0) list_operation(&d, r, output);
      else if (strcmp(operation, "search") == 0) search_operation(&d, r, output);
      else if (strcmp(operation, "mkdir") == 0) mkdir_operation(&d, r, output);
      else if (strcmp(operation, "remove") == 0) remove_operation(&d, r, output);
      else if (strcmp(operation, "move") == 0) move_operation(&d, r, output);
      else if (strcmp(operation, "copy") == 0) copy_operation(&d, r, output);
      else refuse("unsupported");
    }
  }
  if (output && fclose(output) != 0) failure = "unknown";
  while (handle_count) if (close(handles[--handle_count]) != 0) failure = "unknown";
  if (batch_active && !batch_finished && failure) batch_result("effectUnknown");
  if (!batch_finished && failure) printf("{\"failure\":\"%s\"}\n", failure);
  else if (!batch_finished && response) printf("%s\n", response);
  else if (!batch_finished) printf("{\"failure\":\"unknown\"}\n");
  free(response); free(handles);
  return ferror(stdout) ? 1 : 0;
}
`
