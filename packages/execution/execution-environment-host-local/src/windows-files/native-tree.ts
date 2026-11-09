/**
 * Name changes use opened source objects and opened target directories. Delete and rename use POSIX
 * semantics and ignore the read-only attribute: a name goes or is replaced at once, and the handles
 * other processes hold stay usable.
 */
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
  static IntPtr MakeDirectory(IntPtr parent,string name) { return Create(parent,name,0x81,2,0x200021); }
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
  // FileDispositionInformationEx: DELETE, POSIX_SEMANTICS and IGNORE_READONLY_ATTRIBUTE.
  static void Delete(IntPtr handle) {
    IntPtr memory=Marshal.AllocHGlobal(4);
    try { Marshal.WriteInt32(memory,0x13); Status io; int status=NtSetInformationFile(handle,out io,memory,4,64); if(status<0) throw Error(RtlNtStatusToDosError(status)); }
    finally { Marshal.FreeHGlobal(memory); }
  }
  // The preflight of a recursive delete: every entry can be opened for deletion, nothing is on another
  // volume and every name is lossless. Nothing is deleted when it fails.
  static void CheckTree(IntPtr directory,uint volume) {
    foreach(string name in Names(directory,true)) {
      IntPtr child=OpenRelative(directory,name,0x10081,false);
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
  // FileRenameInformationEx: POSIX_SEMANTICS and IGNORE_READONLY_ATTRIBUTE, with REPLACE_IF_EXISTS to
  // replace. The name is passed as its UTF-16 code units, unpaired surrogates included.
  static void Rename(IntPtr source,IntPtr parent,string name,bool replace) {
    int rootOffset=IntPtr.Size==8?8:4, lengthOffset=rootOffset+IntPtr.Size, nameOffset=lengthOffset+4, length=checked(name.Length*2);
    int size=Math.Max(nameOffset+length,IntPtr.Size==8?24:16); IntPtr memory=Marshal.AllocHGlobal(size);
    try {
      for(int i=0;i<size;i++) Marshal.WriteByte(memory,i,0);
      Marshal.WriteInt32(memory,0,0x42|(replace?1:0)); Marshal.WriteIntPtr(memory,rootOffset,parent); Marshal.WriteInt32(memory,lengthOffset,length);
      Marshal.Copy(name.ToCharArray(),0,IntPtr.Add(memory,nameOffset),name.Length);
      Status io; int status=NtSetInformationFile(source,out io,memory,(uint)size,65);
      if(status<0) throw Error(RtlNtStatusToDosError(status));
    } finally { Marshal.FreeHGlobal(memory); }
  }
  // NTFS refuses to rename a directory whose subtree holds an open file, with access denied. The
  // denial means that only when the helper may add a directory to the destination.
  static bool MayAddDirectory(IntPtr destination) {
    try { IntPtr handle=Create(destination,"",0x4,1,0x200021); CloseHandle(handle); return true; }
    catch(IOException) { return false; }
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
          string targetName=targetSegments[targetSegments.Length-1]; IntPtr target=IntPtr.Zero; bool replacing=false;
          try { target=OpenRelative(destination,targetName,0x80,false); }
          catch(IOException error) { if(error.Message!="unresolved") throw; }
          if(target==IntPtr.Zero) CheckNamed(destination,targetNamed,null);
          else {
            try { if(!replace) throw new IOException("conflict"); CheckNamed(target,targetNamed,null); replacing=true; }
            finally { if(!CloseHandle(target)) throw new IOException("unknown"); }
          }
          try { Rename(current,destination,targetName,replace); }
          catch(IOException error) {
            bool directory=(info.attributes&16)!=0 && (info.attributes&0x400)==0;
            if(error.Message=="notAuthorized" && directory && !replacing && MayAddDirectory(destination)) throw new IOException("busy");
            throw;
          }
          changed=true;
        } else throw new IOException("unsupported");
      }
      return new { info=Metadata(current,""), bytes="", entries=new object[0], next=-1 };
    } catch { if(changed) throw new IOException("unknown"); throw; }
    finally { Release(held); }
  }
}
`
