"use strict";
(()=>{
const query=new URLSearchParams(location.search),challenge=query.get("challenge"),state=query.get("state");
const $=id=>document.getElementById(id),status=$("status");
const validToken=(s,min,max)=>typeof s==="string"&&s.length>=min&&s.length<=max&&/^[A-Za-z0-9_-]+$/.test(s);
const show=id=>{$(id).hidden=false},hide=id=>{$(id).hidden=true};
if(!validToken(challenge,43,43)||!validToken(state,24,128)){
 status.textContent="授权参数不完整。请关闭此页面，从 App 重新发起网页登录。";
 $("loginButton").disabled=true; return;
}
$("togglePassword").addEventListener("click",()=>{
 const input=$("password"),visible=input.type==="text";
 input.type=visible?"password":"text";
 $("togglePassword").textContent=visible?"显示":"隐藏";
 $("togglePassword").setAttribute("aria-label",visible?"显示密码":"隐藏密码");
});
async function requestJSON(path,options={}){
 const response=await fetch(path,{credentials:"same-origin",cache:"no-store",...options});
 let data={};try{data=await response.json()}catch{}
 if(!response.ok)throw Error(data.error||`连接失败 (${response.status})`);
 return data;
}
async function loadMe(){
 try{
  const account=await requestJSON("/api/me");
  $("who").textContent=account.username||"已登录";
  hide("login");show("allow");$("step1").classList.remove("active");$("step2").classList.add("active");
  return true;
 }catch{return false}
}
$("loginForm").addEventListener("submit",async event=>{
 event.preventDefault(); const button=$("loginButton");button.disabled=true;status.textContent="正在验证账户…";
 try{
  await requestJSON("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({username:$("username").value.trim(),password:$("password").value,remember:true})});
  $("password").value="";
  status.textContent="登录成功，请确认设备授权。";
  if(!await loadMe())throw Error("登录成功，但读取会话失败，请检查浏览器 Cookie 设置");
 }catch(error){status.textContent=error.message||"网络暂不可用，请重试"}
 finally{button.disabled=false}
});
$("authorize").addEventListener("click",async event=>{
 event.currentTarget.disabled=true;status.textContent="正在创建一次性授权凭证…";
 try{
  const data=await requestJSON("/api/native/authorize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({challenge,state})});
  const dest=new URL(data.callback);
  if(dest.protocol!=="pkatlas:"||dest.hostname!=="auth"||dest.pathname!=="/callback"||dest.searchParams.get("state")!==state)throw Error("服务器授权回调不符合预期");
  $("step2").classList.remove("active");$("step3").classList.add("active");
  $("finish").href=data.callback;show("finish");
  status.textContent="授权已完成。正在返回药时 App…";
  location.replace(data.callback);
 }catch(error){status.textContent=error.message||"设备授权失败，请重试";event.currentTarget.disabled=false}
});
loadMe();
})();