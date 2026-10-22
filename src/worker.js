const enc = new TextEncoder();
const json = (data, status=200) => new Response(JSON.stringify(data), {status, headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const uid = () => crypto.randomUUID();
const b64 = a => btoa(String.fromCharCode(...new Uint8Array(a))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
async function hash(password, salt) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({name:"PBKDF2",salt:enc.encode(salt),iterations:100000,hash:"SHA-256"}, key, 256);
  return salt + "." + b64(bits);
}
async function sign(payload, secret) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
  const body = b64(enc.encode(JSON.stringify(payload)));
  return body + "." + b64(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
}
async function readBody(req){ try{return await req.json()}catch{return {}} }
async function auth(req, env) {
  const token = (req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token || !env.AUTH_SECRET) return null;
  const [body, sig] = token.split(".");
  if(!body || !sig) return null;
  const key = await crypto.subtle.importKey("raw", enc.encode(env.AUTH_SECRET), {name:"HMAC",hash:"SHA-256"}, false, ["verify"]);
  const raw = Uint8Array.from(atob(sig.replace(/-/g,"+").replace(/_/g,"/")+"===".slice((sig.length+3)%4)), c=>c.charCodeAt(0));
  if(!await crypto.subtle.verify("HMAC", key, raw, enc.encode(body))) return null;
  let p; try {p=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(body.replace(/-/g,"+").replace(/_/g,"/")+"===".slice((body.length+3)%4)),c=>c.charCodeAt(0))))}catch{return null}
  if(p.exp<Date.now()) return null;
  return await env.DB.prepare("SELECT id,name,email,role,unit FROM users WHERE id=? AND active=1").bind(p.sub).first();
}
function validUnit(unit){return ["Sete Quedas","Jardim"].includes(unit)}
async function audit(env,user,action,entity_id,summary,unit=user.unit){
 await env.DB.prepare("INSERT INTO audit_logs(user_id,unit,action,entity_id,summary) VALUES(?,?,?,?,?)").bind(user.id,unit,action,entity_id||null,summary||null).run();
}
export default { async fetch(req, env) {
  const u = new URL(req.url);
  if(!u.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:{"access-control-allow-origin":"*","access-control-allow-headers":"content-type,authorization","access-control-allow-methods":"GET,POST,PUT,OPTIONS"}});
  if(!env.DB) return json({error:"Banco D1 não configurado."},503);
  if(!env.AUTH_SECRET) return json({error:"AUTH_SECRET não configurado."},503);
  try {
    if(u.pathname==="/api/health") return json({ok:true,service:"Sucatas Brasil API"});
    if(u.pathname==="/api/setup" && req.method==="POST") {
      const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();
      if(count.n) return json({error:"Configuração inicial já realizada."},409);
      const x=await readBody(req);
      if(!x.name||!x.email||!x.password||String(x.password).length<12||!validUnit(x.unit)) return json({error:"Informe nome, e-mail, senha com ao menos 12 caracteres e unidade."},400);
      const salt=b64(crypto.getRandomValues(new Uint8Array(16))), password_hash=await hash(x.password,salt), id=uid();
      await env.DB.prepare("INSERT INTO users(id,name,email,password_hash,role,unit) VALUES(?,?,?,?,?,?)").bind(id,x.name,String(x.email).toLowerCase(),password_hash,"admin",x.unit).run();
      return json({ok:true,message:"Administrador criado. Faça login."},201);
    }
    if(u.pathname==="/api/login" && req.method==="POST") {
      const x=await readBody(req), user=await env.DB.prepare("SELECT * FROM users WHERE email=? COLLATE NOCASE AND active=1").bind(String(x.email||"").toLowerCase()).first();
      if(!user) return json({error:"E-mail ou senha inválidos."},401);
      const [salt]=user.password_hash.split("."), candidate=await hash(String(x.password||""),salt);
      if(candidate!==user.password_hash) return json({error:"E-mail ou senha inválidos."},401);
      return json({token:await sign({sub:user.id,exp:Date.now()+28800000},env.AUTH_SECRET),user:{id:user.id,name:user.name,role:user.role,unit:user.unit}});
    }
    const user=await auth(req,env);
    if(!user) return json({error:"Autenticação necessária."},401);
    const unitParam=u.searchParams.get("unit");
    const unit=user.role==="admin" && validUnit(unitParam) ? unitParam : user.unit;
    if(user.role!=="admin" && unitParam && unitParam!==user.unit) return json({error:"Sem permissão para outra unidade."},403);
    if(u.pathname==="/api/me") return json({user});
    if(u.pathname==="/api/stock" && req.method==="GET") {
      const rows=await env.DB.prepare("SELECT * FROM stock WHERE unit=? ORDER BY category,product").bind(unit).all();
      return json({items:rows.results||[]});
    }
    if(u.pathname==="/api/stock" && req.method==="POST") {
      const x=await readBody(req);
      if(!x.product||!["sucata","reaproveitado","novo"].includes(x.category)||!Number.isFinite(Number(x.quantity))||Number(x.quantity)<0) return json({error:"Produto, categoria e quantidade válida são obrigatórios."},400);
      await env.DB.prepare("INSERT INTO stock(unit,category,product,measure,quantity) VALUES(?,?,?,?,?) ON CONFLICT(unit,category,product,measure) DO UPDATE SET quantity=excluded.quantity,updated_at=CURRENT_TIMESTAMP").bind(unit,x.category,x.product,x.measure||"kg",Number(x.quantity)).run();
      await audit(env,user,"stock_set",null,`${x.product}: ${x.quantity} ${x.measure||"kg"}`,unit);
      return json({ok:true});
    }
    if(u.pathname==="/api/purchases" && req.method==="POST") {
      const x=await readBody(req), gross=Number(x.gross),tare=Number(x.tare),price=Number(x.price_kg),net=gross-tare,total=net*price;
      if(!x.seller||!x.material||!validUnit(unit)||!Number.isFinite(gross)||!Number.isFinite(tare)||!Number.isFinite(price)||gross<=0||tare<0||tare>=gross||price<0) return json({error:"Confira vendedor, material, peso bruto, tara e preço/kg."},400);
      const pid=uid();
      await env.DB.batch([
        env.DB.prepare("INSERT INTO purchases(id,unit,seller,material,gross,tare,net,price_kg,total,payment,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(pid,unit,x.seller,x.material,gross,tare,net,price,total,x.payment||"dinheiro",x.notes||null,user.id),
        env.DB.prepare("INSERT INTO stock(unit,category,product,measure,quantity) VALUES(?,?,?,?,?) ON CONFLICT(unit,category,product,measure) DO UPDATE SET quantity=quantity+excluded.quantity,updated_at=CURRENT_TIMESTAMP").bind(unit,"sucata",x.material,"kg",net),
        env.DB.prepare("INSERT INTO cash_movements(id,unit,direction,category,amount,payment,description,source_id,created_by) VALUES(?,?,?,?,?,?,?,?,?)").bind(uid(),unit,"saida","compra_sucata",total,x.payment||"dinheiro",`Compra de ${x.material} de ${x.seller}`,pid,user.id),
        env.DB.prepare("INSERT INTO audit_logs(user_id,unit,action,entity_id,summary) VALUES(?,?,?,?,?)").bind(user.id,unit,"purchase",pid,`${net} kg de ${x.material}; total ${total}`)
      ]);
      return json({ok:true,id:pid,net,total},201);
    }
    if(u.pathname==="/api/sales" && req.method==="POST") {
      const x=await readBody(req), qty=Number(x.qty), price=Number(x.price), total=qty*price;
      if(!x.product||!["sucata","reaproveitado","novo"].includes(x.category)||!Number.isFinite(qty)||qty<=0||!Number.isFinite(price)||price<0) return json({error:"Confira produto, categoria, quantidade e preço."},400);
      const measure=x.measure||"kg", current=await env.DB.prepare("SELECT quantity FROM stock WHERE unit=? AND category=? AND product=? AND measure=?").bind(unit,x.category,x.product,measure).first();
      if(!current||current.quantity<qty) return json({error:"Estoque insuficiente."},409);
      const sid=uid();
      await env.DB.batch([
        env.DB.prepare("INSERT INTO sales(id,unit,category,product,qty,measure,price,total,payment,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(sid,unit,x.category,x.product,qty,measure,price,total,x.payment||"dinheiro",user.id),
        env.DB.prepare("UPDATE stock SET quantity=quantity-?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND category=? AND product=? AND measure=? AND quantity>=?").bind(qty,unit,x.category,x.product,measure,qty),
        env.DB.prepare("INSERT INTO cash_movements(id,unit,direction,category,amount,payment,description,source_id,created_by) VALUES(?,?,?,?,?,?,?,?,?)").bind(uid(),unit,"entrada","venda",total,x.payment||"dinheiro",`Venda de ${x.product}`,sid,user.id),
        env.DB.prepare("INSERT INTO audit_logs(user_id,unit,action,entity_id,summary) VALUES(?,?,?,?,?)").bind(user.id,unit,"sale",sid,`${qty} ${measure} de ${x.product}; total ${total}`)
      ]);
      return json({ok:true,id:sid,total},201);
    }
    if(u.pathname==="/api/cash" && req.method==="GET") {
      const rows=await env.DB.prepare("SELECT * FROM cash_movements WHERE unit=? ORDER BY created_at DESC LIMIT 200").bind(unit).all();
      return json({items:rows.results||[]});
    }
    if(u.pathname==="/api/cash" && req.method==="POST") {
      const x=await readBody(req),amount=Number(x.amount);
      if(!["entrada","saida"].includes(x.direction)||!x.category||!x.description||!Number.isFinite(amount)||amount<0) return json({error:"Informe tipo, categoria, descrição e valor válido."},400);
      const cid=uid();
      await env.DB.prepare("INSERT INTO cash_movements(id,unit,direction,category,amount,payment,description,created_by) VALUES(?,?,?,?,?,?,?,?)").bind(cid,unit,x.direction,x.category,amount,x.payment||"dinheiro",x.description,user.id).run();
      await audit(env,user,"cash_movement",cid,`${x.direction} ${amount}`,unit);
      return json({ok:true,id:cid},201);
    }
    if(u.pathname==="/api/transfers" && req.method==="GET") {
      const rows=await env.DB.prepare("SELECT * FROM transfers WHERE origin=? OR destination=? ORDER BY created_at DESC LIMIT 200").bind(unit,unit).all();
      return json({items:rows.results||[]});
    }
    if(u.pathname==="/api/transfers" && req.method==="POST") {
      const x=await readBody(req),destination=x.destination,qty=Number(x.qty),measure=x.measure||"kg";
      if(!validUnit(unit)||!validUnit(destination)||destination===unit||!x.product||!["sucata","reaproveitado","novo"].includes(x.category)||!Number.isFinite(qty)||qty<=0) return json({error:"Confira destino, produto, categoria e quantidade."},400);
      const current=await env.DB.prepare("SELECT quantity FROM stock WHERE unit=? AND category=? AND product=? AND measure=?").bind(unit,x.category,x.product,measure).first();
      if(!current||current.quantity<qty) return json({error:"Estoque insuficiente para transferir."},409);
      const tid=uid();
      await env.DB.batch([
        env.DB.prepare("UPDATE stock SET quantity=quantity-?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND category=? AND product=? AND measure=? AND quantity>=?").bind(qty,unit,x.category,x.product,measure,qty),
        env.DB.prepare("INSERT INTO transfers(id,origin,destination,category,product,qty,measure,notes,status,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(tid,unit,destination,x.category,x.product,qty,measure,x.notes||null,"em_transito",user.id),
        env.DB.prepare("INSERT INTO audit_logs(user_id,unit,action,entity_id,summary) VALUES(?,?,?,?,?)").bind(user.id,unit,"transfer_sent",tid,`${qty} ${measure} de ${x.product} para ${destination}`)
      ]);
      return json({ok:true,id:tid,status:"em_transito"},201);
    }
   const match = u.pathname.match(/^\/api\/transfers\/([^/]+)\/receive$/);
    if(match&&req.method==="POST") {
      const t=await env.DB.prepare("SELECT * FROM transfers WHERE id=?").bind(match[1]).first();
      if(!t)return json({error:"Transferência não encontrada."},404);
      if(t.destination!==unit)return json({error:"Somente a unidade destinatária pode receber."},403);
      if(t.status!=="em_transito")return json({error:"Transferência já recebida."},409);
      await env.DB.batch([
        env.DB.prepare("INSERT INTO stock(unit,category,product,measure,quantity) VALUES(?,?,?,?,?) ON CONFLICT(unit,category,product,measure) DO UPDATE SET quantity=quantity+excluded.quantity,updated_at=CURRENT_TIMESTAMP").bind(unit,t.category,t.product,t.measure,t.qty),
        env.DB.prepare("UPDATE transfers SET status='recebida',received_by=?,received_at=CURRENT_TIMESTAMP WHERE id=? AND status='em_transito'").bind(user.id,t.id),
        env.DB.prepare("INSERT INTO audit_logs(user_id,unit,action,entity_id,summary) VALUES(?,?,?,?,?)").bind(user.id,unit,"transfer_received",t.id,`${t.qty} ${t.measure} de ${t.product}`)
      ]);
      return json({ok:true});
    }
    if(u.pathname==="/api/users" && req.method==="GET") {
      if(user.role!=="admin")return json({error:"Apenas administrador."},403);
      const rows=await env.DB.prepare("SELECT id,name,email,role,unit,active,created_at FROM users ORDER BY name").all();
      return json({items:rows.results||[]});
    }
    if(u.pathname==="/api/users" && req.method==="POST") {
      if(user.role!=="admin")return json({error:"Apenas administrador."},403);
      const x=await readBody(req);
      if(!x.name||!x.email||!x.password||String(x.password).length<12||!["admin","gerente","vendedor"].includes(x.role)||!validUnit(x.unit))return json({error:"Dados inválidos; senha deve ter ao menos 12 caracteres."},400);
      const salt=b64(crypto.getRandomValues(new Uint8Array(16))), ph=await hash(x.password,salt);
      await env.DB.prepare("INSERT INTO users(id,name,email,password_hash,role,unit) VALUES(?,?,?,?,?,?)").bind(uid(),x.name,String(x.email).toLowerCase(),ph,x.role,x.unit).run();
      return json({ok:true},201);
    }
    // Cargas interestaduais: requer as tabelas criadas por migration_v2.sql.
    if(u.pathname==="/api/shipments" && req.method==="GET") {
      let rows;
      if(user.role==="admin" && !unitParam) {
        rows=await env.DB.prepare("SELECT s.*, (SELECT COUNT(*) FROM shipment_items i WHERE i.shipment_id=s.id) AS item_count FROM shipments s ORDER BY s.created_at DESC LIMIT 200").all();
      } else {
        rows=await env.DB.prepare("SELECT DISTINCT s.*, (SELECT COUNT(*) FROM shipment_items i WHERE i.shipment_id=s.id) AS item_count FROM shipments s JOIN shipment_items si ON si.shipment_id=s.id WHERE si.origin_unit=? ORDER BY s.created_at DESC LIMIT 200").bind(unit).all();
      }
      return json({items:rows.results||[]});
    }
    if(u.pathname==="/api/shipments" && req.method==="POST") {
      if(user.role!=="admin" && user.role!=="gerente") return json({error:"Apenas administrador ou gerente pode registrar cargas."},403);
      const x=await readBody(req);
      const items=Array.isArray(x.items)?x.items:[];
      const freight=Number(x.freight_cost||0);
      if(!x.customer_name || !x.destination_state || !items.length || !Number.isFinite(freight) || freight<0) return json({error:"Informe comprador, estado de destino, materiais e frete válido."},400);
      const normalized=[];
      for(const it of items) {
        const origin=it.origin_unit, category=it.category, product=String(it.product||"").trim(), qty=Number(it.qty), measure=it.measure||"kg", price=Number(it.price_unit||0);
        if(!validUnit(origin)||!["sucata","reaproveitado","novo"].includes(category)||!product||!Number.isFinite(qty)||qty<=0||!Number.isFinite(price)||price<0) return json({error:"Confira unidade de origem, categoria, material, quantidade e preço de cada item."},400);
        normalized.push({id:uid(),origin,category,product,qty,measure,price,total:qty*price});
      }
      // Verifica o estoque agregado, inclusive quando o mesmo produto aparece em mais de uma linha.
      const demand=new Map();
      for(const it of normalized) {
        const key=[it.origin,it.category,it.product,it.measure].join("\u0000");
        demand.set(key,(demand.get(key)||0)+it.qty);
      }
      for(const [key,qtyNeeded] of demand) {
        const [origin,category,product,measure]=key.split("\u0000");
        const available=await env.DB.prepare("SELECT quantity FROM stock WHERE unit=? AND category=? AND product=? AND measure=?").bind(origin,category,product,measure).first();
        if(!available || Number(available.quantity)<qtyNeeded) return json({error:`Estoque insuficiente para ${product} em ${origin}.`},409);
      }
      const shipmentId=uid(), total=normalized.reduce((sum,it)=>sum+it.total,0);
      const stmts=[env.DB.prepare("INSERT INTO shipments(id,customer_name,customer_document,destination_state,destination_city,destination_address,vehicle,driver,freight_cost,sale_total,status,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(shipmentId,x.customer_name,x.customer_document||null,x.destination_state,x.destination_city||null,x.destination_address||null,x.vehicle||null,x.driver||null,freight,total,"preparando",x.notes||null,user.id)];
      for(const it of normalized) {
        stmts.push(env.DB.prepare("UPDATE stock SET quantity=quantity-?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND category=? AND product=? AND measure=? AND quantity>=?").bind(it.qty,it.origin,it.category,it.product,it.measure,it.qty));
        stmts.push(env.DB.prepare("INSERT INTO shipment_items(id,shipment_id,origin_unit,category,product,qty,measure,price_unit) VALUES(?,?,?,?,?,?,?,?)").bind(it.id,shipmentId,it.origin,it.category,it.product,it.qty,it.measure,it.price));
        // Registra a venda no histórico existente, sem lançar recebimento no caixa automaticamente.
        stmts.push(env.DB.prepare("INSERT INTO sales(id,unit,category,product,qty,measure,price,total,payment,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(uid(),it.origin,it.category,it.product,it.qty,it.measure,it.price,it.total,"a_receber",user.id));
      }
      if(freight>0) {
        const expenseId=uid();
        stmts.push(env.DB.prepare("INSERT INTO shipment_expenses(id,shipment_id,category,amount,notes,created_by) VALUES(?,?,?,?,?,?)").bind(expenseId,shipmentId,"frete",freight,x.freight_notes||"Frete da carga",user.id));
        // O frete fica registrado na carga; não é atribuído ao caixa de uma única unidade para evitar distorção.
      }
      stmts.push(env.DB.prepare("INSERT INTO audit_logs(user_id,unit,action,entity_id,summary) VALUES(?,?,?,?,?)").bind(user.id,user.unit,"shipment_created",shipmentId,`Carga para ${x.customer_name}; total ${total}; frete ${freight}`));
      await env.DB.batch(stmts);
      return json({ok:true,id:shipmentId,sale_total:total,freight_cost:freight,status:"preparando"},201);
    }
    const shipmentStatusMatch=u.pathname.match(/^\/api\/shipments\/([^/]+)\/status$/);
    if(shipmentStatusMatch && req.method==="PUT") {
      if(user.role!=="admin" && user.role!=="gerente") return json({error:"Apenas administrador ou gerente pode alterar o status da carga."},403);
      const x=await readBody(req), status=x.status;
      if(!["preparando","em_transito","entregue"].includes(status)) return json({error:"Status inválido. Cancelamento exige estorno controlado de estoque e vendas e ainda não está habilitado."},400);
      const shipment=await env.DB.prepare("SELECT * FROM shipments WHERE id=?").bind(shipmentStatusMatch[1]).first();
      if(!shipment) return json({error:"Carga não encontrada."},404);
      if(shipment.status==="cancelada" || shipment.status==="entregue") return json({error:"Não é possível alterar uma carga cancelada ou entregue."},409);
      await env.DB.batch([
        env.DB.prepare("UPDATE shipments SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status,shipment.id),
        env.DB.prepare("INSERT INTO audit_logs(user_id,unit,action,entity_id,summary) VALUES(?,?,?,?,?)").bind(user.id,user.unit,"shipment_status",shipment.id,`Status alterado para ${status}`)
      ]);
      return json({ok:true,id:shipment.id,status});
    }
    const shipmentDetailMatch=u.pathname.match(/^\/api\/shipments\/([^/]+)$/);
    if(shipmentDetailMatch && req.method==="GET") {
      const shipment=await env.DB.prepare("SELECT * FROM shipments WHERE id=?").bind(shipmentDetailMatch[1]).first();
      if(!shipment) return json({error:"Carga não encontrada."},404);
      if(user.role!=="admin") {
        const allowed=await env.DB.prepare("SELECT 1 AS ok FROM shipment_items WHERE shipment_id=? AND origin_unit=? LIMIT 1").bind(shipment.id,user.unit).first();
        if(!allowed) return json({error:"Sem permissão para consultar esta carga."},403);
      }
      const items=await env.DB.prepare("SELECT * FROM shipment_items WHERE shipment_id=? ORDER BY origin_unit,product").bind(shipment.id).all();
      const expenses=await env.DB.prepare("SELECT * FROM shipment_expenses WHERE shipment_id=? ORDER BY created_at").bind(shipment.id).all();
      return json({shipment,items:items.results||[],expenses:expenses.results||[]});
    }

    if(u.pathname==="/api/reports/cash-summary" && req.method==="GET") {
      const row=await env.DB.prepare("SELECT SUM(CASE WHEN direction='entrada' THEN amount ELSE 0 END) AS entradas,SUM(CASE WHEN direction='saida' THEN amount ELSE 0 END) AS saidas FROM cash_movements WHERE unit=? AND date(created_at)=date('now')").bind(unit).first();
      return json({unit,date:new Date().toISOString().slice(0,10),entradas:row.entradas||0,saidas:row.saidas||0,saldo:(row.entradas||0)-(row.saidas||0)});
    }
    return json({error:"Rota não encontrada."},404);
  } catch(e) {
    return json({error:"Erro interno da API.",detail:String(e?.message||e)},500);
  }
}};
