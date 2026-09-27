export class Api{
 token='';grant='';
 async call<T=any>(path:string,method='GET',data?:unknown):Promise<T>{const r=await fetch('/api'+path,{method,headers:{'content-type':'application/json',...(this.token?{authorization:'Bearer '+this.token}:{}),...(this.grant?{'x-note-unlock':this.grant}:{})},body:data===undefined?undefined:JSON.stringify(data)});const result=await r.json();if(!r.ok)throw Error(result.error??'Request failed');return result;}
}
export const api=new Api();
