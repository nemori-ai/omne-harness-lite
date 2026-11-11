/** @module-tag slow */
// Slow: it compiles the C# rule with the .NET Framework compiler and runs it in a process.
import { execFile } from 'node:child_process'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import { terminalExitRuleSource } from '../../src/windows-execution/terminal-native-source.ts'

// Each case is one line for the harness. `code <exit|-> <succeeded 0|1> <lastExitCode|-> <kinds>`;
// `added <head> <maximum> <records…>` with the records newest first, `#` for an object that is not an
// ErrorRecord, and the head as an index into the records, `none`, or `gone` (left the list).
const harness = String.raw`
using System;
using System.Collections;
using System.Management.Automation;
public static class OmneExitRuleHarness {
  static object Record(string id){return id=="#"?new object():new ErrorRecord(new Exception(id),id,ErrorCategory.NotSpecified,null);}
  public static void Main() {
    string line;
    while((line=Console.ReadLine())!=null) {
      string[] f=line.Split(' ');
      if(f[0]=="code") {
        Console.WriteLine(OmneTerminalExit.Code(f[1]=="-"?(int?)null:int.Parse(f[1]),f[2]=="1",f[3]=="-"?(int?)null:int.Parse(f[3]),(OmneAddedErrors)Enum.Parse(typeof(OmneAddedErrors),f[4])));
        continue;
      }
      ArrayList errors=new ArrayList();for(int i=3;i<f.Length;i++)errors.Add(Record(f[i]));
      object head=f[1]=="none"?null:f[1]=="gone"?new object():errors[int.Parse(f[1])];
      Console.WriteLine(OmneTerminalExit.Added(errors,head,int.Parse(f[2])));
    }
  }
}
`

// The rows of the F3 table, then the edges of each rule.
const codes: ReadonlyArray<readonly [string, string, string]> = [
  ['native success, standard error merged', 'code - 0 0 NativeOnly', '0'],
  ['native failure 3', 'code - 0 3 None', '3'],
  ['native failure 5, standard error merged', 'code - 0 5 NativeOnly', '5'],
  ['cmdlet failure', 'code - 0 - Other', '1'],
  ['native success, then cmdlet failure', 'code - 0 0 Other', '1'],
  ['native failure, then cmdlet success', 'code - 1 3 None', '0'],
  ['native failure, then cmdlet failure', 'code - 0 3 Other', '3'],
  ['Write-Error', 'code - 0 - Other', '1'],
  ['throw', 'code - 0 - Other', '1'],
  ['exit 7', 'code 7 0 - None', '7'],
  ['success', 'code - 1 - None', '0'],
  ['exit wins over a succeeded script', 'code 0 1 3 Other', '0'],
  ['exit wins over a native failure', 'code 2 0 5 Other', '2'],
  ['a negative exit code', 'code -1 0 - None', '-1'],
  ['$? wins over a native failure', 'code - 1 3 Other', '0'],
  ['native-only errors without a native exit code', 'code - 0 - NativeOnly', '1'],
  ['native-only errors with a native failure', 'code - 0 9 NativeOnly', '9'],
  ['no added error and a zero native code', 'code - 0 0 None', '1'],
  ['no added error and no native code', 'code - 0 - None', '1'],
  ['a native failure after a terminating error', 'code - 0 4 Other', '4'],
  ['a negative native code', 'code - 0 -1073741819 None', '-1073741819'],
]

const kinds: ReadonlyArray<readonly [string, string, string]> = [
  ['an empty list', 'added none 256', 'None'],
  ['native standard error', 'added none 256 NativeCommandError', 'NativeOnly'],
  [
    'native standard error over several lines',
    'added none 256 NativeCommandErrorMessage NativeCommandError',
    'NativeOnly',
  ],
  [
    'a cmdlet error among native ones',
    'added none 256 NativeCommandError PathNotFound,Microsoft.PowerShell.Commands.GetItemCommand',
    'Other',
  ],
  ['an object that is not an error record', 'added none 256 #', 'Other'],
  ['only records from earlier invocations', 'added 0 256 PathNotFound', 'None'],
  [
    'a native record over an earlier cmdlet record',
    'added 1 256 NativeCommandError PathNotFound',
    'NativeOnly',
  ],
  [
    'a cmdlet record over an earlier native record',
    'added 1 256 PathNotFound NativeCommandError',
    'Other',
  ],
  ['an earlier head that left the list', 'added gone 256 NativeCommandError', 'Other'],
  [
    'a full list without an earlier head',
    'added none 2 NativeCommandError NativeCommandError',
    'Other',
  ],
  [
    'a full list that still holds the head',
    'added 1 3 NativeCommandError PathNotFound PathNotFound',
    'NativeOnly',
  ],
]

it('gives every row of the F3 table and the edges of each rule their exit code', async context => {
  if (process.platform !== 'win32') return context.skip()
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'omne-terminal-exit-rule-')))
  const cases = [...codes, ...kinds]
  try {
    const system = process.env['SystemRoot'] ?? 'C:\\Windows'
    const framework = join(system, 'Microsoft.NET', 'Framework64', 'v4.0.30319')
    const executable = join(directory, 'rule.exe')
    await writeFile(join(directory, 'rule.cs'), terminalExitRuleSource)
    await writeFile(join(directory, 'harness.cs'), harness)
    await promisify(execFile)(
      join(framework, 'csc.exe'),
      [
        '/nologo',
        '/target:exe',
        `/out:${executable}`,
        `/reference:${join(system, 'Microsoft.NET', 'assembly', 'GAC_MSIL', 'System.Management.Automation', 'v4.0_3.0.0.0__31bf3856ad364e35', 'System.Management.Automation.dll')}`,
        join(directory, 'rule.cs'),
        join(directory, 'harness.cs'),
      ],
      { windowsHide: true },
    )
    const run = execFile(executable, [], { windowsHide: true })
    const output = new Promise<string>((resolve, reject) => {
      let text = ''
      run.stdout?.on('data', (chunk: string) => (text += chunk))
      run.once('error', reject)
      run.once('close', code => (code === 0 ? resolve(text) : reject(new Error(`harness ${code}`))))
    })
    run.stdin?.end(cases.map(([, line]) => `${line}\n`).join(''))
    const answers = (await output).trim().split(/\r?\n/u)
    expect(cases.map(([name], index) => [name, answers[index]])).toEqual(
      cases.map(([name, , expected]) => [name, expected]),
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 60_000)
