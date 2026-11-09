/**
 * Writes and copies stage a new object beside the target, flush it and then publish it under the
 * target name: a create does not replace, a replacement checks the named target once more just
 * before the rename. Until the publication the target is as it was, so a failure is a refusal once
 * the staged object is removed again, and unknown while it may remain.
 */
export const nativeWrite = String.raw`
public static partial class OmneFiles {
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool WriteFile(IntPtr handle,IntPtr bytes,uint count,out uint written,IntPtr overlapped);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool FlushFileBuffers(IntPtr handle);
  // The size of one block of a streamed copy.
  const int CopyBlock=1<<20;
  static IntPtr CreateNew(IntPtr parent,string name) { return Create(parent,name,0xC0110080,2,0x200060); }
  static void WriteAll(IntPtr handle,byte[] bytes,int count) {
    GCHandle pinned=GCHandle.Alloc(bytes,GCHandleType.Pinned);
    try {
      int offset=0;
      while(offset<count) {
        uint written;
        if(!WriteFile(handle,IntPtr.Add(pinned.AddrOfPinnedObject(),offset),(uint)(count-offset),out written,IntPtr.Zero)) throw Error((uint)Marshal.GetLastWin32Error());
        if(written==0) throw new IOException("unknown");
        offset+=checked((int)written);
      }
    } finally { pinned.Free(); }
  }
  static void Flush(IntPtr handle) { if(!FlushFileBuffers(handle)) throw Error((uint)Marshal.GetLastWin32Error()); }
  // Removes a staged object that was not published; false when it may remain.
  static bool Discard(IntPtr staged) {
    try { Delete(staged); return true; }
    catch { return false; }
  }
  static void CheckTarget(IntPtr parent,string name,string named,string version,bool create) {
    IntPtr target=IntPtr.Zero;
    try {
      try { target=OpenRelative(parent,name,0x80,false); }
      catch(IOException error) { if(error.Message!="unresolved") throw; }
      if(create) {
        if(target!=IntPtr.Zero) throw new IOException("conflict");
        CheckNamed(parent,named,null);
      } else {
        if(target==IntPtr.Zero) throw new IOException("unresolved");
        CheckNamed(target,named,version);
        if((Information(target).attributes&0x410)!=0) throw new IOException("unsupported");
      }
    } finally { if(target!=IntPtr.Zero && !CloseHandle(target)) throw new IOException("unknown"); }
  }
  // Publishes staged under name below parent. A create does not replace an object that appeared since.
  static void Publish(IntPtr staged,IntPtr parent,string name,string named,string version,bool create) {
    if(!create) CheckTarget(parent,name,named,version,false);
    Rename(staged,parent,name,!create);
  }
  public static object Write(string root,string expectedRoot,string[] segments,string named,string version,bool hasVersion,bool trailingSlash,bool create,string encoded,bool rooted) {
    version=hasVersion?version:null;
    List<IntPtr> held=new List<IntPtr>(); IntPtr staged=IntPtr.Zero; bool published=false;
    try {
      if(segments.Length==0) throw new IOException("notAuthorized");
      IntPtr rootHandle=Root(root,expectedRoot,rooted,held), parent=Parent(rootHandle,root,segments,rooted,held);
      string name=segments[segments.Length-1];
      CheckTarget(parent,name,named,version,create);
      if(trailingSlash) throw new IOException("unresolved");
      byte[] bytes=Convert.FromBase64String(encoded);
      staged=CreateNew(parent,".omne-write-"+Guid.NewGuid().ToString("N")); held.Add(staged);
      WriteAll(staged,bytes,bytes.Length); Flush(staged);
      Publish(staged,parent,name,named,version,create); published=true;
      return new { info=Metadata(staged,""), bytes="", entries=new object[0], next=-1 };
    } catch {
      if(published || (staged!=IntPtr.Zero && !Discard(staged))) throw new IOException("unknown");
      throw;
    } finally { Release(held); }
  }
  // The target of a copy as it is: its metadata when it exists and may be replaced, null when absent.
  static object Existing(IntPtr parent,string name,string named,bool replace) {
    IntPtr target=IntPtr.Zero;
    try {
      try { target=OpenRelative(parent,name,0x80,false); }
      catch(IOException error) { if(error.Message!="unresolved") throw; }
      if(target==IntPtr.Zero) { CheckNamed(parent,named,null); return null; }
      CheckNamed(target,named,null);
      if(!replace) throw new IOException("conflict");
      if((Information(target).attributes&0x410)!=0) throw new IOException("unsupported");
      return Metadata(target,"");
    } finally { if(target!=IntPtr.Zero && !CloseHandle(target)) throw new IOException("unknown"); }
  }
  static void CheckTemporary(string temporary) {
    if(temporary==null || !temporary.StartsWith(".omne-copy-") || temporary.IndexOfAny(new char[] { (char)92, '/' })>=0) throw new IOException("invalidInput");
  }
  // The first request of a copy: streams the source block by block into the new object temporary
  // below the target's parent and flushes it. The reply names that object, the source and the target
  // as it was, or null when there was none. The target is not changed.
  public static object Copy(string root,string expectedRoot,string[] segments,string named,string version,bool hasVersion,bool directory,bool follow,string targetRoot,string expectedTargetRoot,string[] targetSegments,string targetNamed,bool replace,string temporary,bool rooted) {
    List<IntPtr> held=new List<IntPtr>(); IntPtr staged=IntPtr.Zero;
    try {
      CheckTemporary(temporary);
      IntPtr source=Final(root,expectedRoot,segments,rooted,directory,follow,0x80000080,false,held);
      Info info=Information(source);
      if(Token(source)!=named) throw new IOException("conflict");
      if((info.attributes&16)!=0) throw new IOException("unsupported");
      if(rooted && info.links>1) throw new IOException("notAuthorized");
      if(hasVersion && Version(info)!=version) throw new IOException("conflict");
      object from=Metadata(source,"");
      if(targetSegments.Length==0) throw new IOException("notAuthorized");
      IntPtr targetStart=Root(targetRoot,expectedTargetRoot,rooted,held), parent=Parent(targetStart,targetRoot,targetSegments,rooted,held);
      object existing=Existing(parent,targetSegments[targetSegments.Length-1],targetNamed,replace);
      staged=CreateNew(parent,temporary); held.Add(staged);
      byte[] block=new byte[CopyBlock];
      for(;;) {
        uint read;
        if(!ReadFile(source,block,(uint)block.Length,out read,IntPtr.Zero)) throw Error((uint)Marshal.GetLastWin32Error());
        if(read==0) break;
        WriteAll(staged,block,(int)read);
      }
      Flush(staged);
      return new { info=Metadata(staged,""), bytes="", entries=new object[0], next=-1, source=from, target=existing };
    } catch {
      if(staged!=IntPtr.Zero && !Discard(staged)) throw new IOException("unknown");
      throw;
    } finally { Release(held); }
  }
  // The second request of a copy: publishes the staged object temporary, named by its token, under the
  // target by the rules of a write. Until the staged object is found and checked, it may remain.
  public static object PublishCopy(string root,string expectedRoot,string[] segments,string temporary,string named,string targetNamed,string version,bool hasVersion,bool create,bool rooted) {
    List<IntPtr> held=new List<IntPtr>(); IntPtr staged=IntPtr.Zero; bool published=false;
    try {
      try {
        CheckTemporary(temporary);
        if(segments.Length==0) throw new IOException("notAuthorized");
        IntPtr start=Root(root,expectedRoot,rooted,held), parent=Parent(start,root,segments,rooted,held);
        IntPtr opened=OpenRelative(parent,temporary,0x10080,false); held.Add(opened);
        CheckNamed(opened,named,null); staged=opened;
        string name=segments[segments.Length-1];
        if(create) CheckTarget(parent,name,targetNamed,null,true);
        Publish(staged,parent,name,targetNamed,hasVersion?version:null,create); published=true;
        return new { info=Metadata(staged,""), bytes="", entries=new object[0], next=-1 };
      } catch {
        if(published || staged==IntPtr.Zero || !Discard(staged)) throw new IOException("unknown");
        throw;
      }
    } finally { Release(held); }
  }
}
`
