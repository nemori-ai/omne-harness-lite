/** Name changes use opened source objects and opened target directories. */
export const nativeTree = String.raw`
public static partial class OmneFiles {
  [DllImport("ntdll.dll")] static extern int NtSetInformationFile(IntPtr handle,out Status status,IntPtr data,uint length,int infoClass);
  static string Version(Info info) {
    long milliseconds=(long)((((ulong)info.modified.high<<32)|info.modified.low)/10000)-11644473600000L;
    return milliseconds.ToString()+":"+(((ulong)info.sizeHigh<<32)|info.sizeLow).ToString();
  }
  static void CheckNamed(IntPtr handle,string named,string version) {
    Info info=Information(handle);
    if(Token(handle)!=named || (version!=null && Version(info)!=version)) throw new IOException("conflict");
  }
  static IntPtr MakeDirectory(IntPtr parent,string name) {
    Unicode text=new Unicode(); text.length=checked((ushort)(name.Length*2)); text.maximum=text.length; text.buffer=Marshal.StringToHGlobalUni(name);
    IntPtr pointer=Marshal.AllocHGlobal(Marshal.SizeOf(text));
    try {
      Marshal.StructureToPtr(text,pointer,false);
      Attributes attributes=new Attributes(); attributes.length=(uint)Marshal.SizeOf(attributes); attributes.root=parent; attributes.name=pointer; attributes.flags=0x40;
      Status io; IntPtr handle;
      int result=NtCreateFile(out handle,0x100081,ref attributes,out io,IntPtr.Zero,0,3,2,0x200021,IntPtr.Zero,0);
      if(result<0) throw Error(RtlNtStatusToDosError(result));
      return handle;
    } finally { Marshal.FreeHGlobal(pointer); Marshal.FreeHGlobal(text.buffer); }
  }
  static IntPtr MakeDirectories(IntPtr start,string root,string[] segments,string named,bool parents,bool rooted,List<IntPtr> held,ref bool changed) {
    IntPtr current=start; uint volume=Information(start).volume; int first=segments.Length-1;
    if(parents) {
      first=0;
      for(;first<segments.Length;first++) {
        try { current=Step(current,root,segments,first,rooted,volume,held); }
        catch(IOException error) { if(error.Message!="unresolved") throw; break; }
      }
      if(first==segments.Length) throw new IOException("conflict");
    } else current=Parent(start,root,segments,rooted,held);
    CheckNamed(current,named,null);
    for(int i=first;i<segments.Length;i++) { current=MakeDirectory(current,segments[i]); held.Add(current); changed=true; }
    return current;
  }
  static void Delete(IntPtr handle) {
    IntPtr memory=Marshal.AllocHGlobal(1);
    try { Marshal.WriteByte(memory,1); Status io; int status=NtSetInformationFile(handle,out io,memory,1,13); if(status<0) throw Error(RtlNtStatusToDosError(status)); }
    finally { Marshal.FreeHGlobal(memory); }
  }
  static void CheckTree(IntPtr directory,uint volume) {
    foreach(string name in Names(directory,true)) {
      IntPtr child=OpenRelative(directory,name,0x81,false);
      try {
        Info info=Information(child);
        if((info.attributes&16)!=0 && (info.attributes&0x400)==0) {
          if(info.volume!=volume) throw new IOException("notAuthorized");
          CheckTree(child,volume);
        }
      } finally { if(!CloseHandle(child)) throw new IOException("unknown"); }
    }
  }
  static void DeleteTree(IntPtr directory,uint volume,ref bool changed) {
    foreach(string name in Names(directory,true)) {
      IntPtr child=OpenRelative(directory,name,0x10081,false);
      try {
        Info info=Information(child);
        if((info.attributes&16)!=0 && (info.attributes&0x400)==0) {
          if(info.volume!=volume) throw new IOException("notAuthorized");
          DeleteTree(child,volume,ref changed);
        }
        Delete(child); changed=true;
      } finally { if(!CloseHandle(child)) throw new IOException("unknown"); }
    }
  }
  static void Rename(IntPtr source,IntPtr parent,string name,bool replace) {
    byte[] text=Encoding.Unicode.GetBytes(name); int rootOffset=IntPtr.Size==8?8:4, lengthOffset=rootOffset+IntPtr.Size, nameOffset=lengthOffset+4;
    int size=Math.Max(nameOffset+text.Length,IntPtr.Size==8?24:16); IntPtr memory=Marshal.AllocHGlobal(size);
    try {
      for(int i=0;i<size;i++) Marshal.WriteByte(memory,i,0);
      Marshal.WriteByte(memory,replace?(byte)1:(byte)0); Marshal.WriteIntPtr(memory,rootOffset,parent); Marshal.WriteInt32(memory,lengthOffset,text.Length); Marshal.Copy(text,0,IntPtr.Add(memory,nameOffset),text.Length);
      Status io; int status=NtSetInformationFile(source,out io,memory,(uint)size,10);
      if(status<0) throw Error(RtlNtStatusToDosError(status));
    } finally { Marshal.FreeHGlobal(memory); }
  }
  public static object Change(string root,string expectedRoot,string[] segments,string named,string operation,bool recursive,string version,bool hasVersion,string targetRoot,string expectedTargetRoot,string[] targetSegments,string targetNamed,bool replace,bool rooted) {
    List<IntPtr> held=new List<IntPtr>(); bool changed=false;
    try {
      if(segments.Length==0) throw new IOException("notAuthorized");
      IntPtr rootHandle=Root(root,expectedRoot,rooted,held), current;
      if(operation=="mkdir") current=MakeDirectories(rootHandle,root,segments,named,recursive,rooted,held,ref changed);
      else {
        IntPtr parent=Parent(rootHandle,root,segments,rooted,held);
        current=OpenRelative(parent,segments[segments.Length-1],0x10081,false); held.Add(current);
        CheckNamed(current,named,hasVersion?version:null); Info info=Information(current);
        if(info.volume!=Information(rooted?rootHandle:parent).volume) throw new IOException("notAuthorized");
        if(operation=="remove") {
          if(recursive && (info.attributes&16)!=0 && (info.attributes&0x400)==0) { CheckTree(current,info.volume); DeleteTree(current,info.volume,ref changed); }
          Delete(current); changed=true;
        } else if(operation=="move") {
          if(targetSegments.Length==0) throw new IOException("notAuthorized");
          IntPtr destinationRoot=Root(targetRoot,expectedTargetRoot,rooted,held), destination=Parent(destinationRoot,targetRoot,targetSegments,rooted,held);
          string targetName=targetSegments[targetSegments.Length-1]; IntPtr target=IntPtr.Zero;
          try { target=OpenRelative(destination,targetName,0x80,false); }
          catch(IOException error) { if(error.Message!="unresolved") throw; }
          if(target==IntPtr.Zero) CheckNamed(destination,targetNamed,null);
          else {
            try { if(!replace) throw new IOException("conflict"); CheckNamed(target,targetNamed,null); }
            finally { if(!CloseHandle(target)) throw new IOException("unknown"); }
          }
          Rename(current,destination,targetName,replace); changed=true;
        } else throw new IOException("unsupported");
      }
      return new { info=Metadata(current,""), bytes="", entries=new object[0], next=-1 };
    } catch { if(changed) throw new IOException("unknown"); throw; }
    finally { bool closed=true; for(int i=held.Count-1;i>=0;i--) closed=CloseHandle(held[i]) && closed; if(!closed) throw new IOException("unknown"); }
  }
}
`
