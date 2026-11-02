/** Staging and publication retain the opened parent and source handles. */
export const nativeWrite = String.raw`
public static partial class OmneFiles {
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool WriteFile(IntPtr handle,byte[] bytes,uint count,out uint written,IntPtr overlapped);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool FlushFileBuffers(IntPtr handle);
  static IntPtr CreateNew(IntPtr parent,string name) {
    Unicode text=new Unicode(); text.length=checked((ushort)(name.Length*2)); text.maximum=text.length; text.buffer=Marshal.StringToHGlobalUni(name);
    IntPtr pointer=Marshal.AllocHGlobal(Marshal.SizeOf(text));
    try {
      Marshal.StructureToPtr(text,pointer,false);
      Attributes attributes=new Attributes(); attributes.length=(uint)Marshal.SizeOf(attributes); attributes.root=parent; attributes.name=pointer; attributes.flags=0x40;
      Status io; IntPtr handle;
      int result=NtCreateFile(out handle,0xC0110080,ref attributes,out io,IntPtr.Zero,0,3,2,0x200060,IntPtr.Zero,0);
      if(result<0) throw Error(RtlNtStatusToDosError(result));
      return handle;
    } finally { Marshal.FreeHGlobal(pointer); Marshal.FreeHGlobal(text.buffer); }
  }
  static void WriteBytes(IntPtr handle,byte[] bytes) {
    int offset=0;
    while(offset<bytes.Length) {
      int count=Math.Min(65536,bytes.Length-offset); byte[] chunk=new byte[count]; Array.Copy(bytes,offset,chunk,0,count); uint written;
      if(!WriteFile(handle,chunk,(uint)count,out written,IntPtr.Zero) || written==0) throw new IOException("unknown");
      offset+=checked((int)written);
    }
    if(!FlushFileBuffers(handle)) throw new IOException("unknown");
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
  public static object Write(string root,string expectedRoot,string[] segments,string named,string version,bool create,string encoded) {
    List<IntPtr> held=new List<IntPtr>(); IntPtr staged=IntPtr.Zero; bool published=false,created=false;
    try {
      if(segments.Length==0) throw new IOException("notAuthorized");
      IntPtr rootHandle=Root(root,expectedRoot,held), parent=Parent(rootHandle,segments,held);
      string name=segments[segments.Length-1];
      CheckTarget(parent,name,named,version,create);
      staged=CreateNew(parent,create?name:".omne-write-"+Guid.NewGuid().ToString("N")); created=create;
      WriteBytes(staged,Convert.FromBase64String(encoded));
      if(!create) {
        CheckTarget(parent,name,named,version,false);
        Rename(staged,parent,name,true);
      }
      published=true;
      return new { info=Metadata(Information(staged),""), bytes="", entries=new object[0], next=-1 };
    } catch { if(created || published) throw new IOException("unknown"); throw; }
    finally {
      bool closed=true;
      if(staged!=IntPtr.Zero) {
        if(!published && !created) { try { Delete(staged); } catch { closed=false; } }
        closed=CloseHandle(staged) && closed;
      }
      for(int i=held.Count-1;i>=0;i--) closed=CloseHandle(held[i]) && closed;
      if(!closed) throw new IOException("unknown");
    }
  }
}
`
