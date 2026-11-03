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
  public static void Main() { Console.SetIn(new StreamReader(Console.OpenStandardInput(),new UTF8Encoding(false,true),false,4096)); Console.SetOut(new StreamWriter(Console.OpenStandardOutput(),new UTF8Encoding(false),4096) {AutoFlush=true}); Run(); }
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

  static readonly object OutputLock=new object(), JobLock=new object();
  static readonly JavaScriptSerializer Json=new JavaScriptSerializer { MaxJsonLength=2097152, RecursionLimit=16 };
  static IntPtr job=IntPtr.Zero;
  static PI child;
  static int bound;
  static bool confirmed;
  static bool outputLost;
  static EventWaitHandle release;
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
      Check(CreateProcessW(r.executable,cmd,IntPtr.Zero,IntPtr.Zero,true,0x08080404,env,r.cwd,ref sx,out child));
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
        bool stopped=Stop();
        if(stopped) {
          try { using(EventWaitHandle oldRelease=EventWaitHandle.OpenExisting(r.name+"-release"))oldRelease.Set(); }
          catch(WaitHandleCannotBeOpenedException) { }
        }
        Emit(new { t="stopped", status=stopped?"confirmed":"unconfirmed" });
        return;
      }
      release=new EventWaitHandle(false,EventResetMode.ManualReset,r.name+"-release");
      OutputReader stdout,stderr;Prepare(r,out stdout,out stderr);Emit(new {t="ready"});
      string line=Line();
      if(line!="go") { Emit(new {t="stopped",status=Stop()?"confirmed":"unconfirmed"});return; }
      Check(ResumeThread(child.thread)!=0xFFFFFFFF);Emit(new {t="started"});
      Thread waiter=new Thread(delegate() {
        try {
          Check(WaitForSingleObject(child.process,0xFFFFFFFF)==0);uint code;Check(GetExitCodeProcess(child.process,out code));
          bool stopped=Stop();bool drained=stdout.thread.Join(bound) && stderr.thread.Join(bound) && stdout.complete && stderr.complete;
          Emit(new {t="exit",code=code,complete=stopped&&drained});
        } catch(Exception) { Emit(new {t="fault"}); }
      });waiter.IsBackground=true;waiter.Start();
      while((line=Line())!=null) {
        if(line=="stop")Emit(new {t="stopped",status=Stop()?"confirmed":"unconfirmed"});
        else if(line=="dispose")break;
      }
      // Keep the original Job handle reachable after the controller disappears.
      if(line==null)release.WaitOne();
      Stop();waiter.Join(bound);
    } catch(Exception e) { bool stopped=(job==IntPtr.Zero && child.process==IntPtr.Zero) || Stop();Emit(new {t="fault",stopped=stopped,error=e.GetType().Name,code=e is Win32Exception ? ((Win32Exception)e).NativeErrorCode : 0}); }
    finally {
      Stop();
      foreach(IntPtr h in new[]{child.thread,child.process,job})if(h!=IntPtr.Zero)CloseHandle(h);
      if(release!=null)release.Dispose();
    }
  }
}
`
