/** Read a DOS or UNC name from the handle the native operation already owns. */
export const handlePathSource = String.raw`
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFinalPathNameByHandleW(IntPtr file,StringBuilder path,uint size,uint flags);
  static string PhysicalHandlePath(IntPtr handle) {
    StringBuilder result=new StringBuilder(512);
    uint length=GetFinalPathNameByHandleW(handle,result,(uint)result.Capacity,0);
    if(length>=(uint)result.Capacity && length<=32768) {
      result=new StringBuilder((int)length+1);
      length=GetFinalPathNameByHandleW(handle,result,(uint)result.Capacity,0);
    }
    if(length==0 || length>=(uint)result.Capacity)return null;
    string name=result.ToString();
    char slash=(char)92;string prefix=new string(slash,2)+"?"+slash;
    if(!name.StartsWith(prefix,StringComparison.Ordinal))return null;
    name=name.Substring(prefix.Length);
    if(name.StartsWith("UNC"+slash,StringComparison.OrdinalIgnoreCase))return new string(slash,2)+name.Substring(4);
    return name.Length>=3 && name[1]==':' && name[2]==slash ? name : null;
  }
`
