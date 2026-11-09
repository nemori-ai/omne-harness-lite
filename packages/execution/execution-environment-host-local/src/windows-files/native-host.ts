/**
 * The frame loop of the resident files helper. It reads one request frame per line, runs each
 * request on a thread-pool thread and writes one reply frame per request while it holds the output
 * lock. The operations open and close their own handles; the loop keeps nothing between requests.
 * At the end of its input it waits for the running requests and exits.
 */
export const nativeHost = String.raw`
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
public static class OmneFilesHost {
  static readonly object Output=new object(), Work=new object();
  static TextWriter Out;
  static int running;
  static JavaScriptSerializer Json() { return new JavaScriptSerializer { MaxJsonLength=int.MaxValue, RecursionLimit=16 }; }
  static void Emit(Dictionary<string,object> frame) {
    string line=Json().Serialize(frame);
    lock(Output) { Out.Write(line); Out.Write('\n'); Out.Flush(); }
  }
  public static void Main() {
    TextReader input=new StreamReader(Console.OpenStandardInput(),new UTF8Encoding(false,false),false,65536);
    Out=new StreamWriter(Console.OpenStandardOutput(),new UTF8Encoding(false),65536);
    Dictionary<string,object> ready=new Dictionary<string,object>(); ready["v"]=1; ready["ready"]=true;
    Emit(ready);
    string line;
    while((line=input.ReadLine())!=null) {
      Dictionary<string,object> request=Json().Deserialize<Dictionary<string,object>>(line);
      lock(Work) running++;
      ThreadPool.QueueUserWorkItem(Execute,request);
    }
    lock(Work) { while(running>0) Monitor.Wait(Work); }
  }
  static void Execute(object state) {
    Dictionary<string,object> request=(Dictionary<string,object>)state;
    Dictionary<string,object> reply=new Dictionary<string,object>(); reply["v"]=1; reply["id"]=request["id"];
    try { reply["ok"]=Operate(request); }
    catch(Exception error) {
      while(error.InnerException!=null) error=error.InnerException;
      reply["failure"]=error.Message;
    }
    try { Emit(reply); }
    catch(IOException) { Environment.Exit(3); }
    catch(Exception) { reply.Remove("ok"); reply["failure"]="unknown"; Emit(reply); }
    lock(Work) { running--; Monitor.PulseAll(Work); }
  }
  static string Text(Dictionary<string,object> request,string key) { object value; return request.TryGetValue(key,out value)?value as string:null; }
  static bool Flag(Dictionary<string,object> request,string key) { object value; return request.TryGetValue(key,out value) && value is bool && (bool)value; }
  static long Number(Dictionary<string,object> request,string key) { object value; return request.TryGetValue(key,out value) && value!=null?Convert.ToInt64(value):0; }
  static string[] Texts(Dictionary<string,object> request,string key) {
    object value; List<string> texts=new List<string>();
    if(request.TryGetValue(key,out value) && value is IEnumerable && !(value is string)) foreach(object item in (IEnumerable)value) texts.Add(item as string);
    return texts.ToArray();
  }
  static object Operate(Dictionary<string,object> r) {
    string operation=Text(r,"operation"), version=Text(r,"version");
    if(operation=="write")
      return OmneFiles.Write(Text(r,"root"),Text(r,"expectedRoot"),Texts(r,"segments"),Text(r,"named"),version,version!=null,Flag(r,"trailingSlash"),Flag(r,"create"),Text(r,"bytes"));
    if(operation=="mkdir" || operation=="remove" || operation=="move")
      return OmneFiles.Change(Text(r,"root"),Text(r,"expectedRoot"),Texts(r,"segments"),Text(r,"named"),operation,Flag(r,"recursive"),version,version!=null,Text(r,"targetRoot"),Text(r,"expectedTargetRoot"),Texts(r,"targetSegments"),Text(r,"targetNamed"),Flag(r,"replace"));
    return OmneFiles.Run(Text(r,"root"),Text(r,"expectedRoot"),Texts(r,"segments"),Text(r,"named"),operation,Number(r,"offset"),Number(r,"limit"),Text(r,"pattern"),Flag(r,"content"),Flag(r,"recursive"),Number(r,"entryBudget"),Number(r,"byteBudget"),Number(r,"fileBytes"),Text(r,"path"),Flag(r,"rooted"));
  }
}
`
