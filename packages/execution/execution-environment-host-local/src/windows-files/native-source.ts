/** The native file operations of the resident files helper. Every operation opens and closes its own handles. */
export const nativeSource = String.raw`
using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static partial class OmneFiles {
  [StructLayout(LayoutKind.Sequential)] struct Unicode { public ushort length, maximum; public IntPtr buffer; }
  [StructLayout(LayoutKind.Sequential)] struct Attributes { public uint length; public IntPtr root, name; public uint flags; public IntPtr security, qos; }
  [StructLayout(LayoutKind.Sequential)] struct Status { public IntPtr status, information; }
  [StructLayout(LayoutKind.Sequential)] struct Time { public uint low, high; }
  [StructLayout(LayoutKind.Sequential)] struct Info { public uint attributes; public Time created, accessed, modified; public uint volume, sizeHigh, sizeLow, links, indexHigh, indexLow; }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateFileW(string path,uint access,uint share,IntPtr security,uint disposition,uint flags,IntPtr template);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetFileInformationByHandle(IntPtr handle,out Info info);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool ReadFile(IntPtr handle,byte[] data,uint length,out uint read,IntPtr overlapped);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetFilePointerEx(IntPtr handle,long distance,out long position,uint method);
  [DllImport("ntdll.dll")] static extern uint RtlNtStatusToDosError(int status);
  [DllImport("ntdll.dll")] static extern int NtCreateFile(out IntPtr handle,uint access,ref Attributes attributes,out Status status,IntPtr allocation,uint fileAttributes,uint share,uint disposition,uint options,IntPtr ea,uint eaLength);
  [DllImport("ntdll.dll")] static extern int NtQueryDirectoryFile(IntPtr handle,IntPtr evt,IntPtr apc,IntPtr context,out Status status,IntPtr data,uint length,int infoClass,[MarshalAs(UnmanagedType.U1)] bool single,IntPtr pattern,[MarshalAs(UnmanagedType.U1)] bool restart);
  static Exception Error(uint code) {
    string reason = code==2 || code==3 || code==267 ? "unresolved" : code==5 ? "notAuthorized" : code==32 ? "busy" : code==87 ? "invalidInput" : code==80 || code==183 || code==145 ? "conflict" : code==17 ? "unsupported" : "unknown";
    return new IOException(reason);
  }
  static Info Information(IntPtr handle) {
    Info info;
    if (!GetFileInformationByHandle(handle,out info)) throw Error((uint)Marshal.GetLastWin32Error());
    return info;
  }
  static string Token(Info info) { return info.volume.ToString()+":"+(((ulong)info.indexHigh<<32)|info.indexLow).ToString(); }
  static object Metadata(Info info,string name) {
    long milliseconds=(long)((((ulong)info.modified.high<<32)|info.modified.low)/10000)-11644473600000L;
    ulong size=((ulong)info.sizeHigh<<32)|info.sizeLow;
    return new { token=Token(info), version=milliseconds.ToString()+":"+size.ToString(), size=(double)size, modified=(double)milliseconds, type=(info.attributes&0x400)!=0?"symlink":(info.attributes&16)!=0?"directory":"file", name=name };
  }
  static IntPtr OpenRelative(IntPtr parent,string name,uint access,bool directory) {
    Unicode text=new Unicode(); text.length=checked((ushort)(name.Length*2)); text.maximum=text.length; text.buffer=Marshal.StringToHGlobalUni(name);
    IntPtr pointer=Marshal.AllocHGlobal(Marshal.SizeOf(text));
    try {
      Marshal.StructureToPtr(text,pointer,false);
      Attributes attributes=new Attributes(); attributes.length=(uint)Marshal.SizeOf(attributes); attributes.root=parent; attributes.name=pointer; attributes.flags=0x40;
      Status io; IntPtr handle;
      int result=NtCreateFile(out handle,access|0x100000,ref attributes,out io,IntPtr.Zero,0,3,1,0x200020u|(directory?1u:0u),IntPtr.Zero,0);
      if(result<0) throw Error(RtlNtStatusToDosError(result));
      return handle;
    } finally { Marshal.FreeHGlobal(pointer); Marshal.FreeHGlobal(text.buffer); }
  }
  static string[] Names(IntPtr directory,bool lossless=false) {
    List<string> names=new List<string>(); IntPtr data=Marshal.AllocHGlobal(65536);
    try {
      bool restart=true;
      for (;;) {
        Status io; int status=NtQueryDirectoryFile(directory,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,out io,data,65536,12,false,IntPtr.Zero,restart); restart=false;
        if(status==unchecked((int)0x80000006)) break;
        if(status<0) throw Error(RtlNtStatusToDosError(status));
        int offset=0;
        for (;;) {
          IntPtr entry=IntPtr.Add(data,offset); int next=Marshal.ReadInt32(entry), length=Marshal.ReadInt32(entry,8);
          if(length<0 || offset+12+length>io.information.ToInt64()) throw new IOException("unknown");
          string name=Marshal.PtrToStringUni(IntPtr.Add(entry,12),length/2);
          if(name!="." && name!="..") {
            bool valid=Encoding.UTF8.GetString(Encoding.UTF8.GetBytes(name))==name;
            if(!valid && lossless) throw new IOException("unsupported");
            if(valid) names.Add(name);
          }
          if(next==0) break; offset+=next;
        }
      }
      names.Sort(delegate(string left,string right) { byte[] a=Encoding.UTF8.GetBytes(left), b=Encoding.UTF8.GetBytes(right); for(int i=0;i<Math.Min(a.Length,b.Length);i++) if(a[i]!=b[i]) return a[i].CompareTo(b[i]); return a.Length.CompareTo(b.Length); });
      return names.ToArray();
    } finally { Marshal.FreeHGlobal(data); }
  }
  static string Read(IntPtr handle,long offset,long limit) {
    long position;
    if(!SetFilePointerEx(handle,offset,out position,0)) throw Error((uint)Marshal.GetLastWin32Error());
    using(MemoryStream bytes=new MemoryStream()) {
      byte[] buffer=new byte[65536];
      while(limit<0 || bytes.Length<limit) {
        uint count=(uint)(limit<0?buffer.Length:Math.Min(buffer.Length,limit-bytes.Length)); uint read;
        if(!ReadFile(handle,buffer,count,out read,IntPtr.Zero)) throw Error((uint)Marshal.GetLastWin32Error());
        if(read==0) break; bytes.Write(buffer,0,(int)read);
      }
      return Convert.ToBase64String(bytes.ToArray());
    }
  }
  public sealed class SearchHit { public string path, token; public long offsetBytes; }
  public sealed class SearchState {
    public byte[] pattern; public bool content,recursive,truncated,rooted; public long entryBudget,byteBudget,fileBytes,want,entries,bytes; public uint volume;
    public List<SearchHit> hits=new List<SearchHit>();
  }
  static int Find(byte[] bytes,byte[] pattern) {
    for(int i=0;i<=bytes.Length-pattern.Length;i++) { int j=0; while(j<pattern.Length && bytes[i+j]==pattern[j]) j++; if(j==pattern.Length) return i; }
    return -1;
  }
  static bool Visit(IntPtr directory,string prefix,SearchState state) {
    foreach(string name in Names(directory)) {
      if(++state.entries>state.entryBudget) { state.truncated=true; return false; }
      IntPtr child=OpenRelative(directory,name,state.content?0x80000080u:0x81u,false);
      try {
        Info info=Information(child); string path=prefix.TrimEnd('\\','/')+"/"+name;
        bool reparse=(info.attributes&0x400)!=0, isDirectory=(info.attributes&16)!=0;
        long found=-1;
        if(!state.content) found=Find(Encoding.UTF8.GetBytes(name),state.pattern);
        else if(!isDirectory && !reparse) {
          if(state.rooted && info.links>1) throw new IOException("notAuthorized");
          ulong size=((ulong)info.sizeHigh<<32)|info.sizeLow;
          if(size>(ulong)state.fileBytes) state.truncated=true;
          else if(size>(ulong)(state.byteBudget-state.bytes)) { state.truncated=true; return false; }
          else {
            byte[] bytes=Convert.FromBase64String(Read(child,0,Math.Min(state.fileBytes,state.byteBudget-state.bytes)));
            state.bytes+=bytes.Length; found=Find(bytes,state.pattern);
          }
        }
        if(found>=0) state.hits.Add(new SearchHit { path=path,token=Token(info),offsetBytes=state.content?found:-1 });
        if(state.hits.Count>=state.want) return false;
        if(state.recursive && isDirectory && !reparse && info.volume==state.volume && !Visit(child,path,state)) return false;
      } finally { if(!CloseHandle(child)) throw new IOException("unknown"); }
    }
    return true;
  }
  public static object Run(string root,string expectedRoot,string[] segments,string named,string operation,long offset,long limit,string pattern,bool content,bool recursive,long entryBudget,long byteBudget,long fileBytes,string requestedPath,bool rooted) {
    List<IntPtr> held=new List<IntPtr>();
    try {
      IntPtr current=CreateFileW(root,0x100081,3,IntPtr.Zero,3,0x02200000,IntPtr.Zero);
      if(current==new IntPtr(-1)) throw Error((uint)Marshal.GetLastWin32Error()); held.Add(current);
      Info rootInfo=Information(current);
      if((rootInfo.attributes&16)==0) throw new IOException(rooted?"unavailable":"unsupported");
      if((rootInfo.attributes&0x400)!=0) throw new IOException(rooted?"notAuthorized":"unsupported");
      if(Token(rootInfo)!=expectedRoot) throw new IOException("notAuthorized");
      for(int i=0;i<segments.Length;i++) {
        bool directory=i<segments.Length-1;
        uint access=directory || operation=="list" || operation=="search"?0x81u:operation=="read"?0x80000080u:0x80u;
        current=OpenRelative(current,segments[i],access,directory); held.Add(current);
        Info step=Information(current);
        if((step.attributes&0x400)!=0) throw new IOException(i<segments.Length-1?"notAuthorized":"unsupported");
        if(step.volume!=rootInfo.volume) throw new IOException("notAuthorized");
      }
      Info info=Information(current);
      if(Token(info)!=named) throw new IOException("conflict");
      if(operation=="search") {
        if((info.attributes&16)==0) throw new IOException("unsupported");
        SearchState state=new SearchState { pattern=Convert.FromBase64String(pattern),content=content,recursive=recursive,rooted=rooted,entryBudget=entryBudget,byteBudget=byteBudget,fileBytes=fileBytes,want=offset+limit+1,volume=info.volume };
        Visit(current,requestedPath,state);
        long end=Math.Min(state.hits.Count,offset+limit); List<SearchHit> hits=new List<SearchHit>();
        for(long i=offset;i<end;i++) hits.Add(state.hits[(int)i]);
        return new { info=Metadata(info,""), bytes="", entries=new object[0], next=state.hits.Count>offset+limit?offset+limit:-1, hits=hits.ToArray(), truncated=state.truncated };
      }
      List<object> entries=new List<object>(); string bytes=""; bool eof=false;
      if(operation=="read") {
        if((info.attributes&16)!=0) throw new IOException("unsupported");
        if(rooted && info.links>1) throw new IOException("notAuthorized");
        bytes=Read(current,offset,limit);
        Info after=Information(current);
        eof=(ulong)(offset+Convert.FromBase64String(bytes).LongLength)>=(((ulong)after.sizeHigh<<32)|after.sizeLow);
      }
      if(operation=="list") {
        if((info.attributes&16)==0) throw new IOException("unsupported");
        string[] names=Names(current);
        long end=Math.Min(names.Length,offset+limit);
        for(long i=offset;i<end;i++) {
          IntPtr child=OpenRelative(current,names[i],0x80,false);
          try { entries.Add(Metadata(Information(child),names[i])); }
          finally { if(!CloseHandle(child)) throw new IOException("unknown"); }
        }
        return new { info=Metadata(info,""), bytes=bytes, entries=entries.ToArray(), next=end<names.Length?end:-1 };
      }
      return new { info=Metadata(info,""), bytes=bytes, entries=entries.ToArray(), next=-1, eof=eof };
    } finally { bool closed=true; for(int i=held.Count-1;i>=0;i--) closed=CloseHandle(held[i]) && closed; if(!closed) throw new IOException("unknown"); }
  }
}
`
