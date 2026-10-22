import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc, query, where, orderBy, limit, serverTimestamp, runTransaction } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const $ = (s) => document.querySelector(s);
const money = (n) => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(n)||0);
const dateText = (v) => { try { return v?.toDate ? v.toDate().toLocaleString("pt-BR") : (v ? new Date(v).toLocaleString("pt-BR") : "—"); } catch { return "—"; } };
let app, auth, db, currentUser=null, profile=null, activeView="inicio";
const configReady = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("COLE_") && firebaseConfig.projectId && !firebaseConfig.projectId.startsWith("SEU_");
if(configReady){ app=initializeApp(firebaseConfig); auth=getAuth(app); db=getFirestore(app); }
else { $("#login-error").textContent="Configure firebase-config.js com os dados do seu projeto Firebase antes de entrar."; }

function notify(message,bad=false){const n=$("#notice");n.textContent=message;n.classList.remove("hidden","bad");if(bad)n.classList.add("bad");window.scrollTo({top:0,behavior:"smooth"});setTimeout(()=>n.classList.add("hidden"),6500);}
function unit(){return $("#unit-filter").value;}
function canAdmin(){return ["admin","gerente"].includes(profile?.role);}
function isAdmin(){return profile?.role==="admin";}
function guardUnit(u){if(!profile)return false;return isAdmin()||profile.unit===u;}
function setBusy(form,busy){const b=form.querySelector('[type="submit"]');if(b){b.disabled=busy;b.textContent=busy?"Salvando...":b.dataset.original||b.textContent;if(!b.dataset.original)b.dataset.original=b.textContent;}}
function safeText(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
async function loadProfile(user){
  const snap=await getDoc(doc(db,"users",user.uid));
  if(!snap.exists()) throw new Error("Sua conta autenticou, mas ainda não tem perfil cadastrado. Peça ao administrador para configurar seu usuário.");
  const p=snap.data();
  if(!["admin","gerente","vendedor"].includes(p.role)) throw new Error("Perfil de usuário inválido.");
  if(!p.unit) throw new Error("O perfil não possui unidade definida.");
  return p;
}
function showApp(){
 $("#login").classList.add("hidden");$("#app").classList.remove("hidden");
 $("#user-label").textContent=profile.name||currentUser.email;$("#role-pill").textContent=({admin:"ADMINISTRADOR",gerente:"GERENTE LOCAL",vendedor:"COMPRADOR/VENDEDOR"})[profile.role]||"USUÁRIO";
 document.body.classList.toggle("is-admin",isAdmin());document.querySelectorAll(".admin-only").forEach(el=>el.style.display="");
 if(!isAdmin()){ $("#unit-filter").value=profile.unit;$("#unit-filter").disabled=true;document.querySelectorAll(".admin-only").forEach(el=>el.classList.add("hidden")); }
 else { $("#unit-filter").disabled=false;document.querySelectorAll(".admin-only").forEach(el=>el.classList.remove("hidden")); }
 $("#today").textContent=new Date().toLocaleDateString("pt-BR",{dateStyle:"medium"});navigate("inicio");refreshDashboard();
}
function navigate(view){
 if(["relatorios","usuarios"].includes(view)&&!canAdmin()){notify("Seu perfil não tem permissão para esta área.",true);return;}
 activeView=view;document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));$("#view-"+view)?.classList.remove("hidden");
 document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
 const labels={inicio:"Painel geral",compras:"Compra de sucata",vendas:"Vendas",estoque:"Estoque",caixa:"Controle de caixa",transferencias:"Transferências",relatorios:"Relatórios",usuarios:"Usuários e permissões"};
 $("#page-title").textContent=labels[view]||view;$("#current-unit").textContent=unit().toUpperCase();
 if(view==="estoque")loadStock();if(view==="caixa")loadCash();if(view==="transferencias")loadTransfers();if(view==="relatorios")loadReports();if(view==="usuarios")loadUsers();
}
document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.view)));
document.querySelectorAll("[data-goto]").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.goto)));
$("#unit-filter").addEventListener("change",()=>{if(!isAdmin())$("#unit-filter").value=profile.unit;$("#current-unit").textContent=unit().toUpperCase();refreshDashboard();if(activeView==="estoque")loadStock();if(activeView==="caixa")loadCash();if(activeView==="transferencias")loadTransfers();});
$("#logout").addEventListener("click",()=>signOut(auth));
$("#login-form").addEventListener("submit",async e=>{e.preventDefault();if(!configReady)return;$("#login-error").textContent="";try{await signInWithEmailAndPassword(auth,$("#email").value.trim(),$("#password").value);}catch(err){$("#login-error").textContent=err.code==="auth/invalid-credential"?"E-mail ou senha inválidos.":err.message;}});
onAuthStateChangedSafe();
function onAuthStateChangedSafe(){if(!configReady)return;onAuthStateChanged(auth,async user=>{currentUser=user;if(!user){profile=null;$("#app").classList.add("hidden");$("#login").classList.remove("hidden");return;}try{profile=await loadProfile(user);showApp();}catch(err){$("#login-error").textContent=err.message;await signOut(auth);}});}
function baseRecord(){return {unit:unit(),createdBy:currentUser.uid,createdByEmail:currentUser.email,createdAt:serverTimestamp()};}
async function refreshDashboard(){
 if(!currentUser)return;try{
 const [stock,purchases,sales,transfers]=await Promise.all([
 getDocs(query(collection(db,"stock"),where("unit","==",unit()))),
 getDocs(query(collection(db,"purchases"),where("unit","==",unit()))),
 getDocs(query(collection(db,"sales"),where("unit","==",unit()))),
 getDocs(query(collection(db,"transfers"),where("destination","==",unit()),where("status","==","em_transito")))
 ]);
 $("#kpi-stock").textContent=stock.docs.reduce((s,d)=>s+(Number(d.data().quantity)||0),0).toLocaleString("pt-BR",{maximumFractionDigits:3});
 const today=new Date();today.setHours(0,0,0,0);
 $("#kpi-purchases").textContent=money(purchases.docs.reduce((s,d)=>{let x=d.data(),dt=x.createdAt?.toDate?.();return s+(dt&&dt>=today?Number(x.total)||0:0)},0));
 $("#kpi-sales").textContent=money(sales.docs.reduce((s,d)=>{let x=d.data(),dt=x.createdAt?.toDate?.();return s+(dt&&dt>=today?Number(x.total)||0:0)},0));
 $("#kpi-transfers").textContent=transfers.size;
 const recent=[...purchases.docs.map(d=>({...d.data(),kind:"Compra de sucata",id:d.id})),...sales.docs.map(d=>({...d.data(),kind:"Venda",id:d.id}))].sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)).slice(0,5);
 $("#recent-list").innerHTML=recent.length?recent.map(r=>`<div class="recent-row"><b>${safeText(r.kind)}</b><span>${safeText(r.material||r.product||"Movimentação")}</span><strong>${money(r.total)}</strong></div>`).join(""):'<div class="empty">Nenhuma movimentação registrada.</div>';
 }catch(err){console.error(err);notify("Não foi possível atualizar o painel. Verifique as regras e a conexão do Firebase.",true);}
}
function formObj(form){return Object.fromEntries(new FormData(form).entries());}
const purchaseForm=$("#purchase-form");
function calcPurchase(){const f=new FormData(purchaseForm),gross=Number(f.get("gross"))||0,tare=Number(f.get("tare"))||0,price=Number(f.get("priceKg"))||0;purchaseForm.elements.net.value=Math.max(0,gross-tare).toFixed(3);purchaseForm.elements.total.value=money(Math.max(0,gross-tare)*price);}
["gross","tare","priceKg"].forEach(n=>purchaseForm.elements[n].addEventListener("input",calcPurchase));
purchaseForm.addEventListener("submit",async e=>{e.preventDefault();if(!currentUser)return;const f=formObj(purchaseForm),gross=Number(f.gross),tare=Number(f.tare),net=gross-tare,priceKg=Number(f.priceKg),total=net*priceKg;if(net<=0){notify("O peso líquido precisa ser maior que zero.",true);return;}setBusy(purchaseForm,true);try{
 await runTransaction(db,async tx=>{const stockId=`${unit()}__sucata__${f.material.toLowerCase().replace(/\W+/g,"_")}`,sref=doc(db,"stock",stockId),ss=await tx.get(sref),old=ss.exists()?ss.data():{};tx.set(sref,{unit:unit(),category:"sucata",product:f.material,quantity:(Number(old.quantity)||0)+net,measure:"kg",updatedAt:serverTimestamp(),updatedBy:currentUser.uid},{merge:true});const pref=doc(collection(db,"purchases"));tx.set(pref,{...baseRecord(),seller:f.seller,cpf:f.cpf||"",material:f.material,gross,tare,net,priceKg,total,payment:f.payment,notes:f.notes||""});const cref=doc(collection(db,"cashMovements"));tx.set(cref,{...baseRecord(),direction:"saida",category:"Compra de sucata",amount:total,payment:f.payment,description:`Compra de ${net.toFixed(3)} kg de ${f.material}`,sourceId:pref.id});const aref=doc(collection(db,"auditLogs"));tx.set(aref,{...baseRecord(),action:"compra_sucata_criada",entityId:pref.id,summary:`Compra de ${f.material}: ${net} kg`});});
 purchaseForm.reset();purchaseForm.elements.tare.value="0";calcPurchase();notify("Compra de sucata registrada.");refreshDashboard();
 }catch(err){console.error(err);notify("Erro ao registrar compra: "+err.message,true);}finally{setBusy(purchaseForm,false);}});
const saleForm=$("#sale-form");
function calcSale(){const f=new FormData(saleForm),total=Math.max(0,(Number(f.get("qty"))||0)*(Number(f.get("price"))||0)-(Number(f.get("discount"))||0));$("#sale-total").textContent=money(total);}
["qty","price","discount"].forEach(n=>saleForm.elements[n].addEventListener("input",calcSale));
saleForm.addEventListener("submit",async e=>{e.preventDefault();const f=formObj(saleForm),qty=Number(f.qty),price=Number(f.price),discount=Number(f.discount)||0,total=qty*price-discount;if(total<0||qty<=0){notify("Confira a quantidade, preço e desconto.",true);return;}setBusy(saleForm,true);try{
 await runTransaction(db,async tx=>{const stockId=`${unit()}__${f.category}__${f.product.toLowerCase().trim().replace(/\W+/g,"_")}`,sref=doc(db,"stock",stockId),ss=await tx.get(sref);if(!ss.exists()||Number(ss.data().quantity)<qty)throw new Error("Estoque insuficiente para esta venda.");const sd=ss.data();tx.update(sref,{quantity:Number(sd.quantity)-qty,updatedAt:serverTimestamp(),updatedBy:currentUser.uid});const ref=doc(collection(db,"sales"));tx.set(ref,{...baseRecord(),category:f.category,product:f.product,qty,measure:f.measure,price,discount,total,payment:f.payment,customer:f.customer||""});const cr=doc(collection(db,"cashMovements"));tx.set(cr,{...baseRecord(),direction:"entrada",category:f.category==="sucata"?"Venda de sucata":"Venda de produto",amount:total,payment:f.payment,description:`Venda de ${qty} ${f.measure} de ${f.product}`,sourceId:ref.id});const ar=doc(collection(db,"auditLogs"));tx.set(ar,{...baseRecord(),action:"venda_criada",entityId:ref.id,summary:`Venda de ${f.product}: ${qty}`});});
 saleForm.reset();calcSale();notify("Venda registrada com sucesso.");refreshDashboard();
 }catch(err){notify("Venda não concluída: "+err.message,true);}finally{setBusy(saleForm,false);}});
async function loadStock(){try{const snap=await getDocs(query(collection(db,"stock"),where("unit","==",unit()),where("category","==",$("#stock-category").value)));$("#stock-body").innerHTML=snap.empty?'<tr><td colspan="4" class="empty">Nenhum item cadastrado nesta categoria.</td></tr>':snap.docs.map(d=>{const x=d.data();return `<tr><td>${safeText(x.product)}</td><td>${Number(x.quantity||0).toLocaleString("pt-BR",{maximumFractionDigits:3})}</td><td>${safeText(x.measure||"—")}</td><td>${dateText(x.updatedAt)}</td></tr>`}).join("");}catch(e){notify("Falha ao carregar estoque: "+e.message,true);}}
$("#refresh-stock").addEventListener("click",loadStock);$("#stock-category").addEventListener("change",loadStock);
$("#stock-adjust-form").addEventListener("submit",async e=>{e.preventDefault();if(!isAdmin()){notify("Somente o administrador geral pode ajustar estoque.",true);return;}const f=formObj(e.currentTarget),delta=Number(f.delta),id=`${unit()}__${f.category}__${f.product.toLowerCase().trim().replace(/\W+/g,"_")}`;try{await runTransaction(db,async tx=>{const ref=doc(db,"stock",id),snap=await tx.get(ref),old=snap.exists()?snap.data():{};if((Number(old.quantity)||0)+delta<0)throw new Error("O ajuste não pode deixar saldo negativo.");tx.set(ref,{unit:unit(),category:f.category,product:f.product,quantity:(Number(old.quantity)||0)+delta,measure:f.measure,updatedAt:serverTimestamp(),updatedBy:currentUser.uid},{merge:true});const ar=doc(collection(db,"auditLogs"));tx.set(ar,{...baseRecord(),action:"ajuste_estoque",entityId:id,summary:f.reason,delta});});e.currentTarget.reset();notify("Ajuste registrado na auditoria.");loadStock();}catch(err){notify(err.message,true);}});
$("#cash-form").addEventListener("submit",async e=>{e.preventDefault();const f=formObj(e.currentTarget);try{await addDoc(collection(db,"cashMovements"),{...baseRecord(),direction:f.direction,category:f.category,amount:Number(f.amount),payment:f.payment,description:f.description});e.currentTarget.reset();notify("Movimentação de caixa registrada.");loadCash();refreshDashboard();}catch(err){notify("Erro no caixa: "+err.message,true);}});
async function loadCash(){try{const snap=await getDocs(query(collection(db,"cashMovements"),where("unit","==",unit()),orderBy("createdAt","desc"),limit(100)));$("#cash-body").innerHTML=snap.empty?'<tr><td colspan="6" class="empty">Sem movimentações de caixa.</td></tr>':snap.docs.map(d=>{const x=d.data();return `<tr><td>${dateText(x.createdAt)}</td><td>${safeText(x.direction)}</td><td>${safeText(x.category)}</td><td>${safeText(x.payment)}</td><td>${money(x.amount)}</td><td>${safeText(x.createdByEmail)}</td></tr>`}).join("");}catch(e){notify("Falha ao carregar caixa: "+e.message,true);}}
$("#refresh-cash").addEventListener("click",loadCash);
$("#transfer-form").addEventListener("submit",async e=>{e.preventDefault();const f=formObj(e.currentTarget);if(f.origin===f.destination){notify("A origem e o destino devem ser diferentes.",true);return;}if(!isAdmin()&&profile.unit!==f.origin){notify("Você só pode iniciar transferência da sua unidade.",true);return;}try{
 const stockId=`${f.origin}__${f.category}__${f.product.toLowerCase().trim().replace(/\W+/g,"_")}`;
 await runTransaction(db,async tx=>{const sref=doc(db,"stock",stockId),ss=await tx.get(sref);if(!ss.exists()||Number(ss.data().quantity)<Number(f.qty))throw new Error("Saldo insuficiente na unidade de origem.");tx.update(sref,{quantity:Number(ss.data().quantity)-Number(f.qty),updatedAt:serverTimestamp(),updatedBy:currentUser.uid});const tref=doc(collection(db,"transfers"));tx.set(tref,{...baseRecord(),origin:f.origin,destination:f.destination,category:f.category,product:f.product,qty:Number(f.qty),measure:f.measure,notes:f.notes||"",status:"em_transito",receivedQty:null,dispatchedAt:serverTimestamp()});const ar=doc(collection(db,"auditLogs"));tx.set(ar,{...baseRecord(),action:"transferencia_enviada",entityId:tref.id,summary:`${f.product} ${f.qty} ${f.measure}: ${f.origin} -> ${f.destination}`});});
 e.currentTarget.reset();notify("Transferência criada e quantidade retirada do estoque de origem.");loadTransfers();refreshDashboard();
 }catch(err){notify("Não foi possível transferir: "+err.message,true);}});
async function loadTransfers(){try{let snap;if(isAdmin())snap=await getDocs(query(collection(db,"transfers"),orderBy("dispatchedAt","desc"),limit(100)));else{const a=await getDocs(query(collection(db,"transfers"),where("origin","==",profile.unit),orderBy("dispatchedAt","desc"),limit(100)));const b=await getDocs(query(collection(db,"transfers"),where("destination","==",profile.unit),orderBy("dispatchedAt","desc"),limit(100)));const map=new Map();[...a.docs,...b.docs].forEach(d=>map.set(d.id,d));snap={docs:[...map.entries()].map(([id,d])=>({id,data:()=>d.data()}))};}
 const rows=snap.docs.filter(d=>isAdmin()||d.data().origin===profile.unit||d.data().destination===profile.unit);
 $("#transfer-body").innerHTML=rows.length?rows.map(d=>{const x=d.data(),canReceive=x.destination===profile.unit&&x.status==="em_transito";return `<tr><td>${dateText(x.dispatchedAt)}</td><td>${safeText(x.product)}</td><td>${x.qty} ${safeText(x.measure)}</td><td>${safeText(x.origin)} → ${safeText(x.destination)}</td><td><span class="status">${safeText(x.status)}</span></td><td>${canReceive?`<button data-receive="${d.id}">Confirmar recebimento</button>`:"—"}</td></tr>`}).join(""):'<tr><td colspan="6" class="empty">Nenhuma transferência.</td></tr>';
 document.querySelectorAll("[data-receive]").forEach(b=>b.addEventListener("click",()=>receiveTransfer(b.dataset.receive)));
 }catch(e){notify("Falha ao carregar transferências: "+e.message,true);}}
async function receiveTransfer(id){try{const ref=doc(db,"transfers",id);await runTransaction(db,async tx=>{const snap=await tx.get(ref);if(!snap.exists())throw new Error("Transferência não encontrada.");const x=snap.data();if(x.status!=="em_transito")throw new Error("Esta transferência já foi processada.");if(!isAdmin()&&profile.unit!==x.destination)throw new Error("Somente a unidade de destino pode receber.");const stockId=`${x.destination}__${x.category}__${x.product.toLowerCase().trim().replace(/\W+/g,"_")}`,sref=doc(db,"stock",stockId),ss=await tx.get(sref),old=ss.exists()?ss.data():{};tx.set(sref,{unit:x.destination,category:x.category,product:x.product,quantity:(Number(old.quantity)||0)+Number(x.qty),measure:x.measure,updatedAt:serverTimestamp(),updatedBy:currentUser.uid},{merge:true});tx.update(ref,{status:"recebida",receivedQty:x.qty,receivedBy:currentUser.uid,receivedAt:serverTimestamp()});const ar=doc(collection(db,"auditLogs"));tx.set(ar,{...baseRecord(),action:"transferencia_recebida",entityId:id,summary:`Recebido ${x.product}: ${x.qty} ${x.measure}`});});notify("Recebimento confirmado.");loadTransfers();refreshDashboard();}catch(e){notify("Erro no recebimento: "+e.message,true);}}
$("#refresh-transfers").addEventListener("click",loadTransfers);
async function loadUsers(){if(!isAdmin())return;try{const snap=await getDocs(collection(db,"users"));$("#users-body").innerHTML=snap.empty?'<tr><td colspan="5" class="empty">Nenhum perfil cadastrado.</td></tr>':snap.docs.map(d=>{const x=d.data();return `<tr><td>${safeText(x.name)}</td><td>${safeText(x.email)}</td><td>${safeText(x.unit)}</td><td>${safeText(x.role)}</td><td>${x.active===false?"Inativo":"Ativo"}</td></tr>`}).join("");}catch(e){notify("Falha ao carregar usuários: "+e.message,true);}}
$("#user-form").addEventListener("submit",async e=>{e.preventDefault();if(!isAdmin()){notify("Somente administrador geral.",true);return;}const f=formObj(e.currentTarget),email=f.email.trim().toLowerCase();try{await addDoc(collection(db,"userInvites"),{...baseRecord(),email,name:f.name,unit:f.unit,role:f.role,createdAt:serverTimestamp(),status:"aguardando_criacao_da_conta"});notify("Perfil solicitado registrado. Crie a conta em Authentication e depois grave o perfil em users/{UID} conforme o README.");e.currentTarget.reset();}catch(err){notify("Não foi possível registrar o perfil: "+err.message,true);}});
async function loadReports(){if(!isAdmin())return;try{const [p,s,c]=await Promise.all([getDocs(query(collection(db,"purchases"),where("unit","==",unit()))),getDocs(query(collection(db,"sales"),where("unit","==",unit()))),getDocs(query(collection(db,"cashMovements"),where("unit","==",unit())))]);$("#report-purchases").textContent=money(p.docs.reduce((n,d)=>n+(Number(d.data().total)||0),0));$("#report-sales").textContent=money(s.docs.reduce((n,d)=>n+(Number(d.data().total)||0),0));$("#report-cash").textContent=c.size;}catch(e){notify("Falha nos relatórios: "+e.message,true);}}
$("#export-csv").addEventListener("click",async()=>{try{const snap=await getDocs(query(collection(db,"cashMovements"),where("unit","==",unit()),orderBy("createdAt","desc")));const csv=[["Data","Unidade","Tipo","Categoria","Valor","Forma","Descrição","Responsável"],...snap.docs.map(d=>{const x=d.data();return [dateText(x.createdAt),x.unit,x.direction,x.category,x.amount,x.payment,x.description,x.createdByEmail]})].map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(";")).join("\r\n");const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8;"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`sucatas-brasil-caixa-${unit().toLowerCase().replaceAll(" ","-")}.csv`;a.click();URL.revokeObjectURL(url);}catch(e){notify("Falha na exportação: "+e.message,true);}});
