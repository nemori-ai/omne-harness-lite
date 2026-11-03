export const terminalNativeSource = String.raw`
using System;
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
  public string name,cwd,id,script,stdin,c;
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
  [DllImport("kernel32.dll")] static extern int CreatePseudoConsole(COORD size,IntPtr input,IntPtr output,uint flags,out IntPtr pc);
  [DllImport("kernel32.dll")] static extern void ClosePseudoConsole(IntPtr pc);
  static IntPtr terminalConsole=IntPtr.Zero,terminalInput=IntPtr.Zero;
  static NamedPipeServerStream terminalControl;
  static StreamWriter terminalWriter;
  static Thread terminalInputThread;
  static OutputReader terminalReader;
  static readonly object ControlLock=new object();

  static void PrepareTerminal(OmneTerminalRequest r) {
    IntPtr ir=IntPtr.Zero,orr=IntPtr.Zero,ow=IntPtr.Zero,list=IntPtr.Zero,jobs=IntPtr.Zero,env=IntPtr.Zero;
    try {
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
      release=new EventWaitHandle(false,EventResetMode.ManualReset,r.name+"-release");
      PrepareTerminal(r);Emit(new {t="ready"});
      string line=Line();
      if(line!="go"){Emit(new {t="stopped",status=Stop()?"confirmed":"unconfirmed"});return;}
      Check(ResumeThread(child.thread)!=0xFFFFFFFF);
      while((line=Line())!=null){
        if(line=="stop")Emit(new {t="stopped",status=Stop()?"confirmed":"unconfirmed"});
        else if(line=="dispose")break;
        else if(line=="graceful")SendTerminal("{\"c\":\"close\"}");
        else {
          OmneTerminalRequest request=Json.Deserialize<OmneTerminalRequest>(line);
          if(terminalInputThread!=null&&terminalInputThread.IsAlive)throw new IOException("Previous terminal input remains pending");
          SendTerminal(line);TerminalInput(request.stdin);
        }
      }
      if(line==null)release.WaitOne();
    }catch(Exception e){bool stopped=(job==IntPtr.Zero&&child.process==IntPtr.Zero)||Stop();Emit(new {t="fault",stopped=stopped,error=e.GetType().Name});}
    finally {
      Stop();
      // ConPTY close may wait for output drainage. Its reader remains active here.
      if(terminalConsole!=IntPtr.Zero)ClosePseudoConsole(terminalConsole);
      if(terminalReader!=null&&(!terminalReader.thread.Join(bound)||!terminalReader.complete))Emit(new {t="outputLost"});
      if(terminalControl!=null)terminalControl.Dispose();
      foreach(IntPtr h in new[]{terminalInput,child.thread,child.process,job})if(h!=IntPtr.Zero)CloseHandle(h);
      if(release!=null)release.Dispose();
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
      using(Runspace runspace=RunspaceFactory.CreateRunspace(new OmneConsoleHost())) {
        runspace.Open();runspace.SessionStateProxy.Path.SetLocation(init.cwd);
        writer.WriteLine(json.Serialize(new {t="opened",cwd=runspace.SessionStateProxy.Path.CurrentLocation.ProviderPath}));
        string line;
        while((line=ReadBounded(reader,init.maxControlBytes))!=null) {
          OmneTerminalRequest request=json.Deserialize<OmneTerminalRequest>(line);if(request.c=="close")return;
          string savedCwd=runspace.SessionStateProxy.Path.CurrentLocation.ProviderPath;
          Dictionary<string,string> savedEnv=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
          bool restored=true;bool completed=false;long? elapsedMs=null;
          try {
            if(request.cwd!=null)runspace.SessionStateProxy.Path.SetLocation(request.cwd);
            if(request.env!=null){
              foreach(KeyValuePair<string,string> item in request.env)if(!savedEnv.ContainsKey(item.Key))savedEnv[item.Key]=Environment.GetEnvironmentVariable(item.Key);
              foreach(KeyValuePair<string,string> item in request.env)Environment.SetEnvironmentVariable(item.Key,item.Value);
            }
            using(PowerShell ps=PowerShell.Create()) {
              ps.Runspace=runspace;
              OmneInvocationClock clock=new OmneInvocationClock();ps.InvocationStateChanged+=clock.Observe;
              ps.AddScript(request.script,false);
              ps.Commands.Commands[0].MergeMyResults(PipelineResultTypes.Error,PipelineResultTypes.Output);
              ps.AddCommand("Out-Default");
              PSDataCollection<PSObject> input=new PSDataCollection<PSObject>();input.Complete();
              IAsyncResult execution=ps.BeginInvoke<PSObject,PSObject>(input,new PSDataCollection<PSObject>());
              writer.WriteLine(json.Serialize(new {t="started",id=request.id}));
              try {ps.EndInvoke(execution);}catch(RuntimeException error){Console.Error.WriteLine(error.Message);}
              completed=ps.InvocationStateInfo.State==PSInvocationState.Completed||ps.InvocationStateInfo.State==PSInvocationState.Failed;
              if(completed)elapsedMs=clock.ElapsedMilliseconds;
            }
          }catch(Exception error){Console.Error.WriteLine(error.Message);writer.WriteLine(json.Serialize(new {t="legFault",id=request.id}));}
          finally {
            try {if(request.cwd!=null)runspace.SessionStateProxy.Path.SetLocation(savedCwd);foreach(KeyValuePair<string,string> item in savedEnv)Environment.SetEnvironmentVariable(item.Key,item.Value);}
            catch(Exception error){restored=false;Console.Error.WriteLine(error.Message);}
          }
          string cwd;
          try {cwd=runspace.SessionStateProxy.Path.CurrentLocation.ProviderPath;if(String.IsNullOrEmpty(cwd)){cwd=savedCwd;restored=false;}}catch(Exception){cwd=savedCwd;restored=false;}
          writer.WriteLine(json.Serialize(new {t="finished",v=2,id=request.id,cwd=cwd,restored=restored,completed=completed,elapsedMs=elapsedMs}));
          if(!restored)return;
        }
      }
    }
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
  public override void SetShouldExit(int code){Environment.Exit(code);}
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
`
