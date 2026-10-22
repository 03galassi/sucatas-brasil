const enc=new TextEncoder();
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8"}});
const id=()=>crypto.randomUUID();
const b64=a=>btoa(String.fromCharCode(...new Uint8Array(a))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
async function hash(p,s){const k=await crypto.subtle.importKey("raw",enc.encode(p),"PBKDF2",false,["deriveBits"]);const b=await crypto.subtle.deriveBits({name:"PBKDF2",salt:enc.encode(s),iterations:210000,hash:"SHA-256"},k,256);return s+"."+b64(b)}
async function sign(p,s){const k=await crypto.subtle.importKey("raw",enc.encode(s),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const body=b64(enc.encode(JSON.stringify(p)));return body+"."+b64(await crypto.subtle.sign("HMAC",k,enc.encode(body)))}
async function body(r){try{return await r.json()}catch{return {}}}
export default {async fetch(req,env){
 const u=new URL(req.url); if(!u.pathname.startsWith("/api/"))return env.ASSETS.fetch(req);
 if(!env.DB)return response({error:"Configure o banco Cloudflare D1."},503);
 if(!env.AUTH_SECRET)return response({error:"Configure AUTH_SECRET como Secret nas configurações do Worker."},503);
 if(u.pathname==="/api/health")return response({ok:true,service:"Sucatas Brasil API"});
 if(u.pathname==="/api/setup"&&req.method==="POST"){
  const c=await env.DB.prepare("SELECT COUNT(*) n FROM users").first();if(c.n>0)return response({error:"Configuração inicial já realizada."},409);
  const x=await body(req);if(!x.name||!x.email||!x.password||x.password.length<12||!["Sete Quedas","Jardim"].includes(x.unit))return response({error:"Preencha nome, e-mail, unidade e senha de pelo menos 12 caracteres."},400);
  const salt=b64(crypto.getRandomValues(new Uint8Array(16))),ph=await hash(x.password,salt);
  await env.DB.prepare("INSERT INTO users(id,name,email,password_hash,role,unit) VALUES(?,?,?,?,?,?)").bind(id(),x.name,x.email.toLowerCase(),ph,"admin",x.unit).run();return response({ok:true});
 }
 if(u.pathname==="/api/login"&&req.method==="POST"){
  const x=await body(req),user=await env.DB.prepare("SELECT * FROM users WHERE email=? COLLATE NOCASE AND active=1").bind(String(x.email||"").toLowerCase()).first();
  if(!user)return response({error:"E-mail ou senha inválidos."},401);
  const [salt]=user.password_hash.split("."),candidate=await hash(String(x.password||""),salt);if(candidate!==user.password_hash)return response({error:"E-mail ou senha inválidos."},401);
  const token=await sign({sub:user.id,exp:Date.now()+28800000},env.AUTH_SECRET);return response({token,user:{id:user.id,name:user.name,role:user.role,unit:user.unit}});
 }
 return response({error:"API inicial: esta rota ainda precisa ser implementada."},501);
}};