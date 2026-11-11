/** Windows SDK declarations carried by the installed PowerShell/.NET Framework runtime. */
export const nativeSource = String.raw`
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

public sealed class OmneRequest {
  public string mode, name, executable, cwd, stdin;
  public string[] args;
  public Dictionary<string,string> env;
  public int maxChunkBytes, stopBoundMs;
}

public static partial class OmneWindowsBridge {
  public static void Main(string[] argv) {
    // Anchor: started first in the command's Job with the Job's handle inherited; it holds that
    // handle until the Job is terminated, so the Job and its name outlive the bridge.
    if(argv.Length==1 && argv[0]=="anchor") { Thread.Sleep(Timeout.Infinite); return; }
    Console.SetIn(new StreamReader(Console.OpenStandardInput(),new UTF8Encoding(false,true),false,4096)); Console.SetOut(new StreamWriter(Console.OpenStandardOutput(),new UTF8Encoding(false),4096) {AutoFlush=true}); Run();
  }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct SI {
    public uint cb; public string reserved,desktop,title;
    public uint x,y,xsize,ysize,xchars,ychars,fill,flags;
    public ushort show,cbReserved; public IntPtr reserved2,input,output,error;
  }
  [StructLayout(LayoutKind.Sequential)] struct SX { public SI si; public IntPtr list; }
  [StructLayout(LayoutKind.Sequential)] struct PI { public IntPtr process,thread; public uint pid,tid; }
  [StructLayout(LayoutKind.Sequential)] struct SA { public uint length; public IntPtr descriptor; public int inherit; }
  [StructLayout(LayoutKind.Sequential)] struct BASIC_LIMIT {
    public long processTime,jobTime; public uint flags; public UIntPtr min,max;
    public uint count; public UIntPtr affinity; public uint priority,scheduling;
  }
  [StructLayout(LayoutKind.Sequential)] struct IO { public ulong a,b,c,d,e,f; }
  [StructLayout(LayoutKind.Sequential)] struct EXT_LIMIT { public BASIC_LIMIT basic; public IO io; public UIntPtr processMemory,jobMemory,peakProcess,peakJob; }
  [StructLayout(LayoutKind.Sequential)] struct ACCOUNT { public long a,b,c,d; public uint faults,total,active,terminated; }
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObjectW(IntPtr sa,string name);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr OpenJobObjectW(uint access,bool inherit,string name);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr h,int cls,ref EXT_LIMIT info,uint len);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr h,int cls,out ACCOUNT info,uint len,IntPtr ret);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr h,int cls,IntPtr info,uint len,IntPtr ret);
  [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool QueryFullProcessImageNameW(IntPtr process,uint flags,StringBuilder name,ref uint size);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool ProcessIdToSessionId(uint pid,out uint session);
  [DllImport("ntdll.dll")] static extern int NtQuerySystemInformation(int cls,byte[] info,int length,out int returned);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcessW(string app,StringBuilder cmd,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr env,string cwd,ref SX si,out PI pi);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateJobObject(IntPtr job,uint code);
  [DllImport("kernel32.dll",SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint ms);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr handle,out uint code);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool CreatePipe(out IntPtr read,out IntPtr write,ref SA sa,uint size);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetHandleInformation(IntPtr h,uint mask,uint flags);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool ReadFile(IntPtr h,byte[] data,uint count,out uint read,IntPtr ov);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool WriteFile(IntPtr h,byte[] data,uint count,out uint written,IntPtr ov);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,uint flags,ref IntPtr size);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attr,IntPtr value,IntPtr size,IntPtr previous,IntPtr returned);
  [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool FreeConsole();
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool AttachConsole(uint pid);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GenerateConsoleCtrlEvent(uint ev,uint group);

  static readonly object OutputLock=new object(), JobLock=new object();
  static readonly JavaScriptSerializer Json=new JavaScriptSerializer { MaxJsonLength=2097152, RecursionLimit=16 };
  static IntPtr job=IntPtr.Zero;
  static PI child, anchor;
  static int bound;
  static long lastOutput;
  static bool confirmed;
  static bool outputLost;
  static void Check(bool ok) { if(!ok) throw new Win32Exception(Marshal.GetLastWin32Error()); }
  static void Emit(object frame) {
    lock(OutputLock) {
      if(outputLost)return;
      try { Console.WriteLine(Json.Serialize(frame)); Console.Out.Flush(); }
      catch(IOException) { outputLost=true; }
    }
  }
  static string Line() {
    StringBuilder s=new StringBuilder(); int c;
    try {
      while((c=Console.In.Read())!=-1 && c!=10) { if(s.Length>=2097152) throw new InvalidDataException("control frame limit"); if(c!=13)s.Append((char)c); }
    } catch(IOException) { return null; }
    return c==-1 && s.Length==0 ? null : s.ToString();
  }
  static string Quote(string value) {
    StringBuilder s=new StringBuilder("\""); int slash=0;
    foreach(char c in value) {
      if(c=='\\') { slash++; continue; }
      s.Append('\\',c=='"' ? slash*2+1 : slash); s.Append(c); slash=0;
    }
    s.Append('\\',slash*2); return s.Append('"').ToString();
  }
  static bool Stop() {
    lock(JobLock) {
      if(confirmed) return true;
      if(job==IntPtr.Zero || !TerminateJobObject(job,137)) return false;
      Stopwatch watch=Stopwatch.StartNew();
      do {
        ACCOUNT a;
        if(!QueryInformationJobObject(job,1,out a,(uint)Marshal.SizeOf(typeof(ACCOUNT)),IntPtr.Zero)) return false;
        if(a.active==0 && (child.process==IntPtr.Zero || WaitForSingleObject(child.process,0)==0)) return confirmed=true;
        Thread.Sleep(5);
      } while(watch.ElapsedMilliseconds<bound);
      return false;
    }
  }
  /**
   * CTRL_BREAK_EVENT to the main process's group on its hidden console, while the main process
   * runs. The bridge attaches to that console only to send it and is not in the group, so the event
   * does not reach it. False when the main process exited or has no console (a GUI program).
   */
  /** CTRL_BREAK_EVENT to the main process's group; true also when the main process already exited. */
  static bool Break() {
    if(child.process==IntPtr.Zero) return false;
    if(WaitForSingleObject(child.process,0)==0) return true;
    FreeConsole();
    if(!AttachConsole(child.pid)) return false;
    try { return GenerateConsoleCtrlEvent(1,child.pid); }
    finally { FreeConsole(); }
  }
  /**
   * The Job's processes other than the anchor and the console hosts (conhost.exe) that Windows
   * starts in the Job for its console members; -1 when they cannot be read. A console host ends
   * with the last process it serves, so it is never what a command leaves behind.
   */
  static int Members() {
    lock(JobLock) {
      List<uint> pids=job==IntPtr.Zero ? null : JobProcesses(job);
      if(pids==null) return -1;
      pids.Remove(anchor.pid);
      return pids.Count;
    }
  }
  /** The live processes of a Job other than its console hosts; null when they cannot be read. */
  static List<uint> JobProcesses(IntPtr handle) {
    const int capacity=4096;int size=8+capacity*IntPtr.Size;IntPtr list=Marshal.AllocHGlobal(size);
    try {
      if(!QueryInformationJobObject(handle,3,list,(uint)size,IntPtr.Zero)) return null;
      int count=Marshal.ReadInt32(list,4);List<uint> pids=new List<uint>();
      for(int i=0;i<count;i++) {
        uint pid=(uint)Marshal.ReadIntPtr(list,8+i*IntPtr.Size).ToInt64();
        IntPtr process=OpenProcess(0x00101000,false,pid);
        if(process==IntPtr.Zero) { if(Marshal.GetLastWin32Error()!=87) pids.Add(pid);continue; }
        try {
          StringBuilder name=new StringBuilder(1024);uint length=(uint)name.Capacity;
          bool host=QueryFullProcessImageNameW(process,0,name,ref length) &&
            string.Equals(Path.GetFileName(name.ToString()),"conhost.exe",StringComparison.OrdinalIgnoreCase);
          if(!host && WaitForSingleObject(process,0)==258) pids.Add(pid);
        } finally { CloseHandle(process); }
      }
      return pids;
    } finally { Marshal.FreeHGlobal(list); }
  }
  /** The members of a named Job, read from outside it; gone when the name no longer exists. */
  static object ReadNamedMembers(string name) {
    IntPtr named=OpenJobObjectW(0x0004,false,name);
    if(named==IntPtr.Zero) return Marshal.GetLastWin32Error()==2 ? (object)new { t="members",gone=true } : new { t="fault" };
    try {
      List<uint> pids=JobProcesses(named);
      return pids==null ? (object)new { t="fault" } : new { t="members",pids=pids.ToArray() };
    } finally { CloseHandle(named); }
  }
  /**
   * The boot time and this process's login session. SystemTimeOfDayInformation gives the boot time
   * at offset 0 and, at offset 32, the sum of every change of the system time since the boot, which
   * the kernel also adds to the boot time. Their difference changes only with a new boot.
   */
  static object Identity() {
    byte[] info=new byte[48];int returned;
    if(NtQuerySystemInformation(3,info,info.Length,out returned)!=0 || returned<40) return new { t="fault" };
    uint session;Check(ProcessIdToSessionId((uint)Process.GetCurrentProcess().Id,out session));
    long boot=BitConverter.ToInt64(info,0)-BitConverter.ToInt64(info,32);
    return new { t="identity",boot=boot.ToString(),session=session };
  }
  /** Starts the anchor in the Job. Only the Job handle is inherited, and only by the anchor. */
  static void StartAnchor() {
    IntPtr list=IntPtr.Zero,handles=IntPtr.Zero,jobs=IntPtr.Zero;
    try {
      Check(SetHandleInformation(job,1,1));
      IntPtr size=IntPtr.Zero;InitializeProcThreadAttributeList(IntPtr.Zero,2,0,ref size);
      list=Marshal.AllocHGlobal(size);Check(InitializeProcThreadAttributeList(list,2,0,ref size));
      handles=Marshal.AllocHGlobal(IntPtr.Size);Marshal.WriteIntPtr(handles,job);
      Check(UpdateProcThreadAttribute(list,0,new IntPtr(0x20002),handles,new IntPtr(IntPtr.Size),IntPtr.Zero,IntPtr.Zero));
      jobs=Marshal.AllocHGlobal(IntPtr.Size);Marshal.WriteIntPtr(jobs,job);
      Check(UpdateProcThreadAttribute(list,0,new IntPtr(0x2000D),jobs,new IntPtr(IntPtr.Size),IntPtr.Zero,IntPtr.Zero));
      string self=Process.GetCurrentProcess().MainModule.FileName;
      SX sx=new SX();sx.si.cb=(uint)Marshal.SizeOf(sx);sx.list=list;
      // DETACHED_PROCESS: the anchor has no console, so no console host joins the Job for it.
      Check(CreateProcessW(self,new StringBuilder(Quote(self)+" anchor"),IntPtr.Zero,IntPtr.Zero,true,0x00080008,IntPtr.Zero,null,ref sx,out anchor));
      CloseHandle(anchor.thread);anchor.thread=IntPtr.Zero;
    } finally {
      SetHandleInformation(job,1,0);
      if(list!=IntPtr.Zero){DeleteProcThreadAttributeList(list);Marshal.FreeHGlobal(list);}
      if(handles!=IntPtr.Zero)Marshal.FreeHGlobal(handles);
      if(jobs!=IntPtr.Zero)Marshal.FreeHGlobal(jobs);
    }
  }
  /** After the main process exits, output that stays quiet this long after the exit or the last bytes is complete, as on Linux. */
  static void AwaitQuiet(OutputReader stdout,OutputReader stderr) {
    while(stdout.thread.IsAlive || stderr.thread.IsAlive) {
      long idle=(Stopwatch.GetTimestamp()-Interlocked.Read(ref lastOutput))*1000/Stopwatch.Frequency;
      if(idle>=100) return;
      Thread.Sleep(10);
    }
  }
  /** The job-round-trip prerequisite: an anchored probe Job is opened by name, read, stopped and confirmed. */
  static bool Probe(string name) {
    job=CreateJobObjectW(IntPtr.Zero,name);Check(job!=IntPtr.Zero);
    EXT_LIMIT limit=new EXT_LIMIT();limit.basic.flags=0x2000;
    Check(SetInformationJobObject(job,9,ref limit,(uint)Marshal.SizeOf(limit)));
    StartAnchor();
    IntPtr named=OpenJobObjectW(0x000C,false,name);
    if(named==IntPtr.Zero) { Stop(); return false; }
    try {
      if(Members()!=0) { Stop(); return false; }
      return Stop();
    } finally { CloseHandle(named); }
  }
  sealed class OutputReader { public Thread thread; public bool complete; }
  static OutputReader Pump(IntPtr pipe,string stream,int chunk) {
    OutputReader reader=new OutputReader();
    Thread t=new Thread(delegate() {
      try {
        byte[] data=new byte[chunk]; uint count;
        for(;;) {
          if(!ReadFile(pipe,data,(uint)data.Length,out count,IntPtr.Zero)) {
            reader.complete=Marshal.GetLastWin32Error()==109;if(stream=="terminal"&&!reader.complete)Emit(new {t="outputLost"});break;
          }
          if(count==0) { reader.complete=true;break; }
          Interlocked.Exchange(ref lastOutput,Stopwatch.GetTimestamp());
          Emit(new { t="data",s=stream,b=Convert.ToBase64String(data,0,(int)count) });
        }
      } catch(IOException) { } finally { CloseHandle(pipe); }
    });reader.thread=t;t.IsBackground=true;t.Start();return reader;
  }
  static void Prepare(OmneRequest r,out OutputReader stdout,out OutputReader stderr) {
    IntPtr ir=IntPtr.Zero,iw=IntPtr.Zero,orr=IntPtr.Zero,ow=IntPtr.Zero,er=IntPtr.Zero,ew=IntPtr.Zero;
    IntPtr env=IntPtr.Zero,list=IntPtr.Zero,handles=IntPtr.Zero,jobs=IntPtr.Zero;
    try {
      job=CreateJobObjectW(IntPtr.Zero,r.name); Check(job!=IntPtr.Zero);
      if(Marshal.GetLastWin32Error()==183) {CloseHandle(job);job=IntPtr.Zero;throw new InvalidOperationException("Job name collision");}
      EXT_LIMIT limit=new EXT_LIMIT();limit.basic.flags=0x2000;
      Check(SetInformationJobObject(job,9,ref limit,(uint)Marshal.SizeOf(limit)));
      StartAnchor();
      SA sa=new SA();sa.length=(uint)Marshal.SizeOf(sa);sa.inherit=1;
      Check(CreatePipe(out ir,out iw,ref sa,65536));Check(SetHandleInformation(iw,1,0));
      Check(CreatePipe(out orr,out ow,ref sa,65536));Check(SetHandleInformation(orr,1,0));
      Check(CreatePipe(out er,out ew,ref sa,65536));Check(SetHandleInformation(er,1,0));
      IntPtr size=IntPtr.Zero;InitializeProcThreadAttributeList(IntPtr.Zero,2,0,ref size);
      list=Marshal.AllocHGlobal(size);Check(InitializeProcThreadAttributeList(list,2,0,ref size));
      handles=Marshal.AllocHGlobal(IntPtr.Size*3);Marshal.Copy(new[]{ir,ow,ew},0,handles,3);
      Check(UpdateProcThreadAttribute(list,0,new IntPtr(0x20002),handles,new IntPtr(IntPtr.Size*3),IntPtr.Zero,IntPtr.Zero));
      jobs=Marshal.AllocHGlobal(IntPtr.Size);Marshal.WriteIntPtr(jobs,job);
      Check(UpdateProcThreadAttribute(list,0,new IntPtr(0x2000D),jobs,new IntPtr(IntPtr.Size),IntPtr.Zero,IntPtr.Zero));
      StringBuilder environment=new StringBuilder();
      List<string> keys=new List<string>(r.env.Keys);keys.Sort(StringComparer.OrdinalIgnoreCase);
      foreach(string key in keys) environment.Append(key).Append('=').Append(r.env[key]).Append('\0');
      environment.Append('\0');if(keys.Count==0)environment.Append('\0');env=Marshal.StringToHGlobalUni(environment.ToString());
      StringBuilder cmd=new StringBuilder(Quote(r.executable));foreach(string arg in r.args)cmd.Append(' ').Append(Quote(arg));
      SX sx=new SX();sx.si.cb=(uint)Marshal.SizeOf(sx);sx.si.flags=0x100;sx.si.input=ir;sx.si.output=ow;sx.si.error=ew;sx.list=list;
      // CREATE_NO_WINDOW gives a console program its own hidden console, and
      // CREATE_NEW_PROCESS_GROUP keeps that console's events away from the bridge's.
      Check(CreateProcessW(r.executable,cmd,IntPtr.Zero,IntPtr.Zero,true,0x08080604,env,r.cwd,ref sx,out child));
      CloseHandle(ir);ir=IntPtr.Zero;CloseHandle(ow);ow=IntPtr.Zero;CloseHandle(ew);ew=IntPtr.Zero;
      stdout=Pump(orr,"stdout",r.maxChunkBytes);orr=IntPtr.Zero;stderr=Pump(er,"stderr",r.maxChunkBytes);er=IntPtr.Zero;
      IntPtr writer=iw;iw=IntPtr.Zero;
      Thread input=new Thread(delegate() {
        try {
          byte[] data=r.stdin==null ? new byte[0] : Convert.FromBase64String(r.stdin);int offset=0;
          while(offset<data.Length) { int length=Math.Min(65536,data.Length-offset);byte[] piece=new byte[length];Array.Copy(data,offset,piece,0,length);uint written;if(!WriteFile(writer,piece,(uint)length,out written,IntPtr.Zero))break;offset+=(int)written; }
        } finally { CloseHandle(writer); }
      }); input.IsBackground=true;input.Start();
    } finally {
      foreach(IntPtr h in new[]{ir,iw,orr,ow,er,ew})if(h!=IntPtr.Zero)CloseHandle(h);
      if(env!=IntPtr.Zero)Marshal.FreeHGlobal(env);
      if(list!=IntPtr.Zero){DeleteProcThreadAttributeList(list);Marshal.FreeHGlobal(list);}
      if(handles!=IntPtr.Zero)Marshal.FreeHGlobal(handles);
      if(jobs!=IntPtr.Zero)Marshal.FreeHGlobal(jobs);
    }
  }
  public static void Run() {
    try {
      OmneRequest r=Json.Deserialize<OmneRequest>(Line());bound=r.stopBoundMs;
      if(r.mode=="recover") {
        job=OpenJobObjectW(0x000C,false,r.name);
        // A missing name is reported as such: only the caller knows whether it proves the stop.
        if(job==IntPtr.Zero && Marshal.GetLastWin32Error()==2) { Emit(new { t="stopped",status="unconfirmed",absent=true });return; }
        Emit(new { t="stopped", status=Stop()?"confirmed":"unconfirmed" });
        return;
      }
      if(r.mode=="members") { Emit(ReadNamedMembers(r.name));return; }
      if(r.mode=="identity") { Emit(Identity());return; }
      if(r.mode=="probe") { bool ok;try { ok=Probe(r.name); } catch(Exception) { Stop();ok=false; } Emit(new { t="probe",ok=ok });return; }
      OutputReader stdout,stderr;Prepare(r,out stdout,out stderr);Emit(new {t="ready",anchor=anchor.pid});
      string line=Line();
      if(line!="go") { Emit(new {t="stopped",status=Stop()?"confirmed":"unconfirmed"});return; }
      Check(ResumeThread(child.thread)!=0xFFFFFFFF);Emit(new {t="started"});
      // The waiter reports the exit and the Job's other members. It never stops the Job: the
      // provider decides the disposition.
      Thread waiter=new Thread(delegate() {
        try {
          Check(WaitForSingleObject(child.process,0xFFFFFFFF)==0);uint code;Check(GetExitCodeProcess(child.process,out code));
          Interlocked.Exchange(ref lastOutput,Stopwatch.GetTimestamp());AwaitQuiet(stdout,stderr);int members=Members();
          bool lost=(!stdout.thread.IsAlive && !stdout.complete) || (!stderr.thread.IsAlive && !stderr.complete);
          Emit(new {t="exit",code=code,members=members<0 ? null : (object)members,outputLost=lost});
        } catch(Exception) { Emit(new {t="fault"}); }
      });waiter.IsBackground=true;waiter.Start();
      while((line=Line())!=null) {
        if(line=="stop")Emit(new {t="stopped",status=Stop()?"confirmed":"unconfirmed"});
        else if(line=="break")Emit(new {t="break",sent=Break()});
        else if(line=="dispose")break;
      }
      // Without a controller the command keeps running in its anchored Job. The bridge drains its
      // pipes until the last writer is gone, so the command never blocks on a full pipe.
      stdout.thread.Join();stderr.thread.Join();
    } catch(Exception e) { bool stopped=(job==IntPtr.Zero && child.process==IntPtr.Zero) || Stop();Emit(new {t="fault",stopped=stopped,error=e.GetType().Name,code=e is Win32Exception ? ((Win32Exception)e).NativeErrorCode : 0}); }
    finally {
      foreach(IntPtr h in new[]{child.thread,child.process,anchor.process,job})if(h!=IntPtr.Zero)CloseHandle(h);
    }
  }
}
`
