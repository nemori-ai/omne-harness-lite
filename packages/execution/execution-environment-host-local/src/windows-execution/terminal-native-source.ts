/**
 * The exit code of one terminal invocation: rules 2 to 6 of the SPEC's Windows terminal section,
 * evaluated in the shell host. Rule 1 is the reset before the invocation. The source is pure and
 * names its types in full, so tests compile it on its own.
 */
export const terminalExitRuleSource = String.raw`
public enum OmneAddedErrors { None, NativeOnly, Other }

public static class OmneTerminalExit {
  /**
   * exit is the code given to exit N; succeeded is $? at the end of the script; lastExitCode is
   * $LASTEXITCODE, null when the invocation did not set it; added are the error records it added.
   */
  public static int Code(int? exit,bool succeeded,int? lastExitCode,OmneAddedErrors added) {
    if(exit.HasValue)return exit.Value;
    if(succeeded)return 0;
    // Windows PowerShell 5.1 sets $? false when 2>&1 merges the standard error of a native program.
    if(added==OmneAddedErrors.NativeOnly&&lastExitCode==0)return 0;
    if(lastExitCode.HasValue&&lastExitCode.Value!=0)return lastExitCode.Value;
    return 1;
  }
  /**
   * The kinds of the records an invocation added to $Error, newest first. head is the newest record
   * before the invocation, null when there was none; maximum is $MaximumErrorCount. Records that
   * can have left the bounded list make the answer Other, never NativeOnly.
   */
  public static OmneAddedErrors Added(System.Collections.IList errors,object head,int maximum) {
    if(errors==null)return OmneAddedErrors.Other;
    int count=0;
    while(count<errors.Count&&(head==null||!object.ReferenceEquals(errors[count],head)))count++;
    if(head!=null?count==errors.Count:errors.Count>=maximum)return OmneAddedErrors.Other;
    if(count==0)return OmneAddedErrors.None;
    for(int i=0;i<count;i++) {
      System.Management.Automation.ErrorRecord record=errors[i] as System.Management.Automation.ErrorRecord;
      if(record==null||record.FullyQualifiedErrorId==null||!record.FullyQualifiedErrorId.StartsWith("NativeCommandError",System.StringComparison.Ordinal))return OmneAddedErrors.Other;
    }
    return OmneAddedErrors.NativeOnly;
  }
}
`

export const terminalNativeSource = String.raw`
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.IO.Pipes;
using System.Management.Automation;
using System.Management.Automation.Host;
using System.Management.Automation.Runspaces;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

public sealed class OmneTerminalRequest {
  public string name,cwd,id,script,stdin,c,conpty,nonce;
  public Dictionary<string,string> env;
  public int columns,rows,maxChunkBytes,stopBoundMs,maxControlBytes;
}

public static class OmneTerminalEntry {
  public static void Main(string[] args) {
    if(args.Length==2 && args[0]=="shell") { OmneTerminalShell.Run(args[1]); return; }
    Console.SetIn(new StreamReader(Console.OpenStandardInput(),new UTF8Encoding(false,true),false,4096));
    Console.SetOut(new StreamWriter(Console.OpenStandardOutput(),new UTF8Encoding(false),4096){AutoFlush=true});
    OmneWindowsBridge.RunTerminal();
  }
}

public static partial class OmneWindowsBridge {
  [StructLayout(LayoutKind.Sequential)] struct COORD { public short x,y; }
  // The pseudoconsole comes from the conpty.dll the request names, not from kernel32: the system
  // ConPTY does not keep private OSC sequences in order with the text it renders.
  [UnmanagedFunctionPointer(CallingConvention.Winapi)] delegate int CreatePseudoConsoleFunction(COORD size,IntPtr input,IntPtr output,uint flags,out IntPtr pc);
  [UnmanagedFunctionPointer(CallingConvention.Winapi)] delegate void ClosePseudoConsoleFunction(IntPtr pc);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr LoadLibraryExW(string path,IntPtr file,uint flags);
  [DllImport("kernel32.dll",CharSet=CharSet.Ansi,SetLastError=true,BestFitMapping=false)] static extern IntPtr GetProcAddress(IntPtr module,string name);
  static CreatePseudoConsoleFunction CreatePseudoConsole;
  static ClosePseudoConsoleFunction ClosePseudoConsole;
  /** Loads conpty.dll by its absolute path; its OpenConsole.exe beside it is found by conpty.dll. */
  static void LoadConpty(string path) {
    if(String.IsNullOrEmpty(path)||!Path.IsPathRooted(path))throw new ArgumentException("conpty.dll path");
    // LOAD_WITH_ALTERED_SEARCH_PATH: the dependencies of conpty.dll resolve from its own directory.
    IntPtr module=LoadLibraryExW(path,IntPtr.Zero,0x00000008);Check(module!=IntPtr.Zero);
    IntPtr create=GetProcAddress(module,"CreatePseudoConsole");Check(create!=IntPtr.Zero);
    IntPtr close=GetProcAddress(module,"ClosePseudoConsole");Check(close!=IntPtr.Zero);
    CreatePseudoConsole=(CreatePseudoConsoleFunction)Marshal.GetDelegateForFunctionPointer(create,typeof(CreatePseudoConsoleFunction));
    ClosePseudoConsole=(ClosePseudoConsoleFunction)Marshal.GetDelegateForFunctionPointer(close,typeof(ClosePseudoConsoleFunction));
  }
  static IntPtr terminalConsole=IntPtr.Zero,terminalInput=IntPtr.Zero;
  static NamedPipeServerStream terminalControl;
  static StreamWriter terminalWriter;
  static Thread terminalInputThread;
  static OutputReader terminalReader;
  static readonly object ControlLock=new object();
  /** The provider's lines, and the two ends that finish the terminal: the provider's and the shell's. */
  static readonly BlockingCollection<object> terminalEvents=new BlockingCollection<object>();
  static readonly object ControllerEnded=new object(),ShellEnded=new object();

  static void PrepareTerminal(OmneTerminalRequest r) {
    IntPtr ir=IntPtr.Zero,orr=IntPtr.Zero,ow=IntPtr.Zero,list=IntPtr.Zero,jobs=IntPtr.Zero,env=IntPtr.Zero;
    try {
      LoadConpty(r.conpty);
      job=CreateJobObjectW(IntPtr.Zero,r.name);Check(job!=IntPtr.Zero);
      if(Marshal.GetLastWin32Error()==183){CloseHandle(job);job=IntPtr.Zero;throw new InvalidOperationException("Job name collision");}
      EXT_LIMIT limit=new EXT_LIMIT();limit.basic.flags=0x2000;
      Check(SetInformationJobObject(job,9,ref limit,(uint)Marshal.SizeOf(limit)));
      SA sa=new SA();sa.length=(uint)Marshal.SizeOf(sa);
      Check(CreatePipe(out ir,out terminalInput,ref sa,65536));Check(CreatePipe(out orr,out ow,ref sa,65536));
      COORD geometry=new COORD();geometry.x=(short)r.columns;geometry.y=(short)r.rows;
      int hr=CreatePseudoConsole(geometry,ir,ow,0,out terminalConsole);if(hr!=0)Marshal.ThrowExceptionForHR(hr);
      CloseHandle(ir);ir=IntPtr.Zero;CloseHandle(ow);ow=IntPtr.Zero;
      IntPtr size=IntPtr.Zero;InitializeProcThreadAttributeList(IntPtr.Zero,2,0,ref size);
      list=Marshal.AllocHGlobal(size);Check(InitializeProcThreadAttributeList(list,2,0,ref size));
      Check(UpdateProcThreadAttribute(list,0,new IntPtr(0x20016),terminalConsole,new IntPtr(IntPtr.Size),IntPtr.Zero,IntPtr.Zero));
      jobs=Marshal.AllocHGlobal(IntPtr.Size);Marshal.WriteIntPtr(jobs,job);
      Check(UpdateProcThreadAttribute(list,0,new IntPtr(0x2000D),jobs,new IntPtr(IntPtr.Size),IntPtr.Zero,IntPtr.Zero));
      StringBuilder environment=new StringBuilder();List<string> keys=new List<string>(r.env.Keys);keys.Sort(StringComparer.OrdinalIgnoreCase);
      foreach(string key in keys)environment.Append(key).Append('=').Append(r.env[key]).Append('\0');
      environment.Append('\0');if(keys.Count==0)environment.Append('\0');env=Marshal.StringToHGlobalUni(environment.ToString());
      string pipe="omne-terminal-"+Guid.NewGuid().ToString("N");
      PipeSecurity security=new PipeSecurity();security.SetAccessRuleProtection(true,false);
      security.AddAccessRule(new PipeAccessRule(WindowsIdentity.GetCurrent().User,PipeAccessRights.FullControl,AccessControlType.Allow));
      terminalControl=new NamedPipeServerStream(pipe,PipeDirection.InOut,1,PipeTransmissionMode.Byte,PipeOptions.Asynchronous,65536,65536,security);
      string executable=Assembly.GetExecutingAssembly().Location;
      SX sx=new SX();sx.si.cb=(uint)Marshal.SizeOf(sx);sx.list=list;
      Check(CreateProcessW(executable,new StringBuilder(Quote(executable)+" shell "+Quote(pipe)),IntPtr.Zero,IntPtr.Zero,false,0x00080404,env,r.cwd,ref sx,out child));
      terminalReader=Pump(orr,"terminal",r.maxChunkBytes);orr=IntPtr.Zero;
      Thread control=new Thread(delegate() {
        try {
          terminalControl.WaitForConnection();
          StreamReader reader=new StreamReader(terminalControl,new UTF8Encoding(false,true),false,4096,true);
          lock(ControlLock)terminalWriter=new StreamWriter(terminalControl,new UTF8Encoding(false),4096,true){AutoFlush=true};
          SendTerminal(Json.Serialize(new {c="init",cwd=r.cwd,maxControlBytes=r.maxControlBytes}));
          string frame;
          while((frame=OmneTerminalShell.ReadBounded(reader,r.maxControlBytes))!=null)Emit(Json.DeserializeObject(frame));
          Emit(new {t="controlLost"});
        }catch(Exception){Emit(new {t="controlLost"});}
        // Every frame of the shell is out. Once the shell has exited, the terminal has nothing left.
        if(WaitForSingleObject(child.process,0xFFFFFFFF)==0)terminalEvents.Add(ShellEnded);
      });control.IsBackground=true;control.Start();
    }finally {
      foreach(IntPtr h in new[]{ir,orr,ow})if(h!=IntPtr.Zero)CloseHandle(h);
      if(list!=IntPtr.Zero){DeleteProcThreadAttributeList(list);Marshal.FreeHGlobal(list);}
      if(jobs!=IntPtr.Zero)Marshal.FreeHGlobal(jobs);if(env!=IntPtr.Zero)Marshal.FreeHGlobal(env);
    }
  }
  static void SendTerminal(string line) {
    lock(ControlLock){if(terminalWriter==null)throw new IOException("shell control not connected");terminalWriter.WriteLine(line);}
  }
  static void TerminalInput(string text) {
    if(String.IsNullOrEmpty(text))return;
    byte[] data=Convert.FromBase64String(text);
    terminalInputThread=new Thread(delegate(){try {int at=0;while(at<data.Length){int length=Math.Min(4096,data.Length-at);byte[] part=new byte[length];Array.Copy(data,at,part,0,length);uint written;if(!WriteFile(terminalInput,part,(uint)length,out written,IntPtr.Zero)||written==0)return;at+=(int)written;}}catch(Exception){Emit(new {t="inputFault"});}});
    terminalInputThread.IsBackground=true;terminalInputThread.Start();
  }
  public static void RunTerminal() {
    try {
      OmneTerminalRequest r=Json.Deserialize<OmneTerminalRequest>(Line());bound=r.stopBoundMs;
      PrepareTerminal(r);Emit(new {t="ready"});
      string line=Line();
      if(line!="go"){Emit(new {t="stopped",status=Stop()?"confirmed":"unconfirmed"});return;}
      Check(ResumeThread(child.thread)!=0xFFFFFFFF);
      Thread controller=new Thread(delegate(){
        try {string next;while((next=Line())!=null)terminalEvents.Add(next);terminalEvents.Add(ControllerEnded);}
        catch(Exception e){terminalEvents.Add(e);}
      });controller.IsBackground=true;controller.Start();
      for(;;){
        object next=terminalEvents.Take();
        // The provider is gone and nobody can stop this terminal any more: it stops its own Job.
        if(next==ControllerEnded)break;
        if(next==ShellEnded){Emit(new {t="stopped",status=Stop()?"confirmed":"unconfirmed"});break;}
        if(next is Exception)throw (Exception)next;
        line=(string)next;
        if(line=="stop")Emit(new {t="stopped",status=Stop()?"confirmed":"unconfirmed"});
        else if(line=="dispose")break;
        else if(line=="graceful")SendTerminal("{\"c\":\"close\"}");
        else {
          OmneTerminalRequest request=Json.Deserialize<OmneTerminalRequest>(line);
          if(!OmneTerminalShell.Nonce(request.nonce))throw new InvalidDataException("segment nonce");
          if(terminalInputThread!=null&&terminalInputThread.IsAlive)throw new IOException("Previous terminal input remains pending");
          SendTerminal(line);TerminalInput(request.stdin);
        }
      }
    }catch(Exception e){bool stopped=(job==IntPtr.Zero&&child.process==IntPtr.Zero)||Stop();Emit(new {t="fault",stopped=stopped,error=e.GetType().Name});}
    finally {
      Stop();
      // ConPTY close may wait for output drainage. Its reader remains active here.
      if(terminalConsole!=IntPtr.Zero)ClosePseudoConsole(terminalConsole);
      if(terminalReader!=null&&(!terminalReader.thread.Join(bound)||!terminalReader.complete))Emit(new {t="outputLost"});
      if(terminalControl!=null)terminalControl.Dispose();
      foreach(IntPtr h in new[]{terminalInput,child.thread,child.process,job})if(h!=IntPtr.Zero)CloseHandle(h);
    }
  }
}

public static class OmneTerminalShell {
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateFileW(string name,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetStdHandle(int kind,IntPtr handle);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetHandleInformation(IntPtr handle,uint mask,uint flags);
  static void BindConsole() {
    IntPtr input=CreateFileW("CONIN$",0xC0000000,3,IntPtr.Zero,3,0,IntPtr.Zero);
    IntPtr output=CreateFileW("CONOUT$",0xC0000000,3,IntPtr.Zero,3,0,IntPtr.Zero);
    if(input==new IntPtr(-1)||output==new IntPtr(-1)||!SetHandleInformation(input,1,1)||!SetHandleInformation(output,1,1)||!SetStdHandle(-10,input)||!SetStdHandle(-11,output)||!SetStdHandle(-12,output))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    Console.OutputEncoding=new UTF8Encoding(false);Console.InputEncoding=new UTF8Encoding(false);
    Console.SetIn(new StreamReader(Console.OpenStandardInput(),new UTF8Encoding(false,true),false,4096));
    Console.SetOut(new StreamWriter(Console.OpenStandardOutput(),new UTF8Encoding(false),4096){AutoFlush=true});
    Console.SetError(new StreamWriter(Console.OpenStandardError(),new UTF8Encoding(false),4096){AutoFlush=true});
  }
  /** A segment nonce as the provider makes it: 128 random bits in lowercase hexadecimal. */
  public static bool Nonce(string value) {
    if(value==null||value.Length!=32)return false;
    foreach(char c in value)if(!((c>='0'&&c<='9')||(c>='a'&&c<='f')))return false;
    return true;
  }
  /** ESC ] 7770 ; omne-b|omne-e ; nonce BEL, the segment sentinel of src/terminal-sentinels.ts. */
  static void Sentinel(string mark,string nonce){Console.Out.Write("\u001b]7770;omne-"+mark+";"+nonce+"\u0007");Console.Out.Flush();}
  public static string ReadBounded(TextReader reader,int limit) {
    StringBuilder line=new StringBuilder();int c;
    while((c=reader.Read())!=-1&&c!=10){if(line.Length>=limit)throw new InvalidDataException("control frame limit");if(c!=13)line.Append((char)c);}
    return c==-1&&line.Length==0?null:line.ToString();
  }
  public static void Run(string pipe) {
    BindConsole();
    using(NamedPipeClientStream control=new NamedPipeClientStream(".",pipe,PipeDirection.InOut)) {
      control.Connect(10000);
      StreamReader reader=new StreamReader(control,new UTF8Encoding(false,true));
      StreamWriter writer=new StreamWriter(control,new UTF8Encoding(false)){AutoFlush=true};
      JavaScriptSerializer json=new JavaScriptSerializer{MaxJsonLength=2097152,RecursionLimit=16};
      OmneTerminalRequest init=json.Deserialize<OmneTerminalRequest>(ReadBounded(reader,2097152));
      OmneConsoleHost host=new OmneConsoleHost();
      using(Runspace runspace=RunspaceFactory.CreateRunspace(host)) {
        runspace.Open();runspace.SessionStateProxy.Path.SetLocation(init.cwd);
        writer.WriteLine(json.Serialize(new {t="opened",cwd=runspace.SessionStateProxy.Path.CurrentLocation.ProviderPath}));
        string line;
        while((line=ReadBounded(reader,init.maxControlBytes))!=null) {
          OmneTerminalRequest request=json.Deserialize<OmneTerminalRequest>(line);if(request.c=="close")return;
          // Every byte the console renders from here to the end sentinel belongs to this invocation.
          Sentinel("b",request.nonce);
          string savedCwd=runspace.SessionStateProxy.Path.CurrentLocation.ProviderPath;
          Dictionary<string,string> savedEnv=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
          bool restored=true;bool completed=false;long? elapsedMs=null;int? code=null;bool ended=false;
          try {
            if(request.cwd!=null)runspace.SessionStateProxy.Path.SetLocation(request.cwd);
            if(request.env!=null){
              foreach(KeyValuePair<string,string> item in request.env)if(!savedEnv.ContainsKey(item.Key))savedEnv[item.Key]=Environment.GetEnvironmentVariable(item.Key);
              foreach(KeyValuePair<string,string> item in request.env)Environment.SetEnvironmentVariable(item.Key,item.Value);
            }
            OmneInvocationStart start=OmneInvocationStart.Begin(runspace,host);
            using(PowerShell ps=PowerShell.Create()) {
              ps.Runspace=runspace;
              OmneInvocationClock clock=new OmneInvocationClock();ps.InvocationStateChanged+=clock.Observe;
              ps.AddScript(request.script+OmneInvocationStart.Trailer,false);
              ps.Commands.Commands[0].MergeMyResults(PipelineResultTypes.Error,PipelineResultTypes.Output);
              ps.AddCommand("Out-Default");
              PSDataCollection<PSObject> input=new PSDataCollection<PSObject>();input.Complete();
              IAsyncResult execution=ps.BeginInvoke<PSObject,PSObject>(input,new PSDataCollection<PSObject>());
              writer.WriteLine(json.Serialize(new {t="started",id=request.id}));
              try {ps.EndInvoke(execution);}catch(RuntimeException error){Console.Error.WriteLine(error.Message);}
              int? exit=host.TakeExit();ended=exit.HasValue;
              completed=ended||ps.InvocationStateInfo.State==PSInvocationState.Completed||ps.InvocationStateInfo.State==PSInvocationState.Failed;
              int finished=start.Finish(exit,ps.InvocationStateInfo.State==PSInvocationState.Completed);
              if(completed){elapsedMs=clock.ElapsedMilliseconds;code=finished;}
            }
          }catch(Exception error){Console.Error.WriteLine(error.Message);writer.WriteLine(json.Serialize(new {t="legFault",id=request.id}));}
          finally {
            try {if(request.cwd!=null)runspace.SessionStateProxy.Path.SetLocation(savedCwd);foreach(KeyValuePair<string,string> item in savedEnv)Environment.SetEnvironmentVariable(item.Key,item.Value);}
            catch(Exception error){restored=false;Console.Error.WriteLine(error.Message);}
          }
          string cwd;
          try {cwd=runspace.SessionStateProxy.Path.CurrentLocation.ProviderPath;if(String.IsNullOrEmpty(cwd)){cwd=savedCwd;restored=false;}}catch(Exception){cwd=savedCwd;restored=false;}
          Sentinel("e",request.nonce);
          writer.WriteLine(json.Serialize(new {t="finished",v=3,id=request.id,cwd=cwd,restored=restored,completed=completed,elapsedMs=elapsedMs,code=code,ended=ended}));
          // exit N ends the persistent shell after its invocation is answered.
          if(!restored||ended)return;
        }
      }
    }
  }
}

sealed class OmneInvocationStart {
  /** Copies $? at the end of the script; the name is private to the host. */
  public const string Trailer="\n$global:__omne_succeeded=$?";
  readonly Runspace runspace;readonly object head;readonly int maximum;
  OmneInvocationStart(Runspace runspace,object head,int maximum){this.runspace=runspace;this.head=head;this.maximum=maximum;}
  static object Value(object value){PSObject wrapped=value as PSObject;return wrapped==null?value:wrapped.BaseObject;}
  /** Rule 1: clears $LASTEXITCODE and a pending exit, and marks where this invocation's errors start. */
  public static OmneInvocationStart Begin(Runspace runspace,OmneConsoleHost host) {
    host.TakeExit();
    using(PowerShell reset=PowerShell.Create()){reset.Runspace=runspace;reset.AddScript("$global:LASTEXITCODE=$null",false).Invoke();}
    System.Collections.IList errors=Value(runspace.SessionStateProxy.GetVariable("Error")) as System.Collections.IList;
    object maximum=Value(runspace.SessionStateProxy.GetVariable("MaximumErrorCount"));
    return new OmneInvocationStart(runspace,errors!=null&&errors.Count>0?errors[0]:null,maximum is int?(int)maximum:256);
  }
  /** The invocation's code; ran tells whether the script ran to its end without a terminating error. */
  public int Finish(int? exit,bool ran) {
    object flag=Value(runspace.SessionStateProxy.GetVariable("__omne_succeeded"));
    runspace.SessionStateProxy.PSVariable.Remove("__omne_succeeded");
    object last=Value(runspace.SessionStateProxy.GetVariable("LASTEXITCODE"));
    int? lastExitCode=null;
    if(last!=null){int converted;lastExitCode=LanguagePrimitives.TryConvertTo<int>(last,out converted)?converted:1;}
    System.Collections.IList errors=Value(runspace.SessionStateProxy.GetVariable("Error")) as System.Collections.IList;
    return OmneTerminalExit.Code(exit,ran&&flag is bool&&(bool)flag,lastExitCode,OmneTerminalExit.Added(errors,head,maximum));
  }
}

sealed class OmneInvocationClock {
  readonly object sync=new object();long? started,ended;
  public void Observe(object sender,PSInvocationStateChangedEventArgs args) {
    lock(sync) {
      PSInvocationState state=args.InvocationStateInfo.State;
      if(state==PSInvocationState.Running&&!started.HasValue)started=Stopwatch.GetTimestamp();
      else if((state==PSInvocationState.Completed||state==PSInvocationState.Failed||state==PSInvocationState.Stopped)&&started.HasValue&&!ended.HasValue)ended=Stopwatch.GetTimestamp();
    }
  }
  public long? ElapsedMilliseconds {
    get {
      lock(sync) {
        if(!started.HasValue||!ended.HasValue||ended.Value<started.Value)return null;
        return (long)Math.Floor((ended.Value-started.Value)*1000.0/Stopwatch.Frequency);
      }
    }
  }
}

sealed class OmneConsoleHost : PSHost {
  readonly Guid id=Guid.NewGuid();readonly OmneConsoleUI ui=new OmneConsoleUI();
  public override Guid InstanceId{get{return id;}}
  public override string Name{get{return "OmneTerminal";}}
  public override Version Version{get{return new Version(1,0);}}
  public override PSHostUserInterface UI{get{return ui;}}
  public override CultureInfo CurrentCulture{get{return CultureInfo.CurrentCulture;}}
  public override CultureInfo CurrentUICulture{get{return CultureInfo.CurrentUICulture;}}
  readonly object exitLock=new object();int? exit;
  /** exit N in a script: the code becomes the invocation's, and the shell ends after the answer. */
  public override void SetShouldExit(int code){lock(exitLock)exit=code;}
  public int? TakeExit(){lock(exitLock){int? code=exit;exit=null;return code;}}
  public override void EnterNestedPrompt(){throw new NotSupportedException("Nested prompt");}
  public override void ExitNestedPrompt(){throw new NotSupportedException("Nested prompt");}
  public override void NotifyBeginApplication(){}
  public override void NotifyEndApplication(){}
}
sealed class OmneConsoleUI : PSHostUserInterface {
  readonly OmneConsoleRawUI raw=new OmneConsoleRawUI();
  public override PSHostRawUserInterface RawUI{get{return raw;}}
  public override string ReadLine(){return Console.ReadLine();}
  public override SecureString ReadLineAsSecureString(){throw new NotSupportedException("Secret prompt");}
  public override void Write(string value){Console.Write(value);}
  public override void Write(ConsoleColor foreground,ConsoleColor background,string value){
    ConsoleColor oldForeground=Console.ForegroundColor,oldBackground=Console.BackgroundColor;
    try{Console.ForegroundColor=foreground;Console.BackgroundColor=background;Console.Write(value);}
    finally{Console.ForegroundColor=oldForeground;Console.BackgroundColor=oldBackground;}
  }
  public override void WriteLine(string value){Console.WriteLine(value);}
  public override void WriteErrorLine(string value){Console.Error.WriteLine(value);}
  public override void WriteDebugLine(string value){Console.WriteLine(value);}
  public override void WriteProgress(long source,ProgressRecord record){Console.Write("\r"+record.Activity+": "+record.StatusDescription+(record.RecordType==ProgressRecordType.Completed?"\r\n":""));}
  public override void WriteVerboseLine(string value){Console.WriteLine(value);}
  public override void WriteWarningLine(string value){Console.WriteLine(value);}
  public override void WriteInformation(InformationRecord record){
    HostInformationMessage message=record.MessageData as HostInformationMessage;
    if(message==null){Console.WriteLine(record.MessageData);return;}
    Write(message.ForegroundColor??Console.ForegroundColor,message.BackgroundColor??Console.BackgroundColor,message.Message);
    if(message.NoNewLine!=true)Console.WriteLine();
  }
  public override Dictionary<string,PSObject> Prompt(string caption,string message,Collection<FieldDescription> descriptions){throw new NotSupportedException("Prompt");}
  public override int PromptForChoice(string caption,string message,Collection<ChoiceDescription> choices,int selected){throw new NotSupportedException("Prompt");}
  public override PSCredential PromptForCredential(string caption,string message,string user,string target){throw new NotSupportedException("Credential prompt");}
  public override PSCredential PromptForCredential(string caption,string message,string user,string target,PSCredentialTypes types,PSCredentialUIOptions options){throw new NotSupportedException("Credential prompt");}
}
sealed class OmneConsoleRawUI : PSHostRawUserInterface {
  public override ConsoleColor BackgroundColor{get{return Console.BackgroundColor;}set{Console.BackgroundColor=value;}}
  public override ConsoleColor ForegroundColor{get{return Console.ForegroundColor;}set{Console.ForegroundColor=value;}}
  public override Size BufferSize{get{return new Size(Console.BufferWidth,Console.BufferHeight);}set{Console.SetBufferSize(value.Width,value.Height);}}
  public override Coordinates CursorPosition{get{return new Coordinates(Console.CursorLeft,Console.CursorTop);}set{Console.SetCursorPosition(value.X,value.Y);}}
  public override int CursorSize{get{return Console.CursorSize;}set{Console.CursorSize=value;}}
  public override bool KeyAvailable{get{return Console.KeyAvailable;}}
  public override Size MaxPhysicalWindowSize{get{return new Size(Console.LargestWindowWidth,Console.LargestWindowHeight);}}
  public override Size MaxWindowSize{get{return MaxPhysicalWindowSize;}}
  public override Coordinates WindowPosition{get{return new Coordinates(Console.WindowLeft,Console.WindowTop);}set{Console.SetWindowPosition(value.X,value.Y);}}
  public override Size WindowSize{get{return new Size(Console.WindowWidth,Console.WindowHeight);}set{Console.SetWindowSize(value.Width,value.Height);}}
  public override string WindowTitle{get{return Console.Title;}set{Console.Title=value;}}
  public override void FlushInputBuffer(){while(Console.KeyAvailable)Console.ReadKey(true);}
  public override KeyInfo ReadKey(ReadKeyOptions options){ConsoleKeyInfo key=Console.ReadKey((options&ReadKeyOptions.NoEcho)!=0);return new KeyInfo((int)key.Key,key.KeyChar,0,true);}
  public override BufferCell[,] GetBufferContents(Rectangle rectangle){throw new NotSupportedException("Console buffer read");}
  public override void ScrollBufferContents(Rectangle source,Coordinates destination,Rectangle clip,BufferCell fill){throw new NotSupportedException("Console buffer scroll");}
  public override void SetBufferContents(Coordinates origin,BufferCell[,] contents){throw new NotSupportedException("Console buffer write");}
  public override void SetBufferContents(Rectangle rectangle,BufferCell fill){if(rectangle.Left==-1)Console.Clear();else throw new NotSupportedException("Console buffer fill");}
}
${terminalExitRuleSource}`
