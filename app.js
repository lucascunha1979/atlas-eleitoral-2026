(() => {
"use strict";

const $ = id => document.getElementById(id);
const fmt = new Intl.NumberFormat("pt-BR");
const nomesCargos = {
  "1":"Presidente","3":"Governador","5":"Senador",
  "6":"Deputado federal","7":"Deputado estadual"
};
const proporcional = cargo => ["6","7"].includes(cargo);
const num = x => Number(x ?? 0);
const texto = x => String(x ?? "");
const limpar = x => texto(x).replace(/[&<>"']/g,
  c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

const s = {
  cargo:"1", municipio:"", partido:"", indicador:"votos_nominais_brutos",
  modo:"areas", geo:null, municipal:[], partidos:[], cadastro:[],
  locais:null, nomes:new Map(), map:null, camada:null, pontos:null,
  limites:null, versaoRequisicao:0, execPartidos:new Map(), mapSeq:0
};

function aviso(msg,erro=false){
  $("estado").textContent=msg;
  $("estado").classList.toggle("error",erro);
}
async function buscar(url){
  const r=await fetch(url);
  if(!r.ok) throw new Error(`${url} — HTTP ${r.status}`);
  return r.json();
}
async function buscarTexto(url){
  const r=await fetch(url);
  if(!r.ok) throw new Error(`${url} — HTTP ${r.status}`);
  return r.text();
}
function csvSimples(str){
  // O cadastro contém os valores normalizados exportados pelo projeto.
  // Este parser suporta separador ";" e campos com aspas.
  const registros=[];
  let campo="", linha=[], aspas=false;
  str=str.replace(/^\uFEFF/,"");
  for(let i=0;i<str.length;i++){
    const c=str[i];
    if(c==='"'){
      if(aspas && str[i+1]==='"'){campo+='"';i++;}
      else aspas=!aspas;
    }else if(c===';' && !aspas){
      linha.push(campo);campo="";
    }else if((c==='\n'||c==='\r') && !aspas){
      if(c==='\r'&&str[i+1]==='\n')i++;
      linha.push(campo);campo="";
      if(linha.some(v=>v!==""))registros.push(linha);
      linha=[];
    }else campo+=c;
  }
  if(campo||linha.length){linha.push(campo);registros.push(linha);}
  const cab=registros.shift()||[];
  return registros.map(l=>Object.fromEntries(
    cab.map((k,i)=>[k,l[i]??""])
  ));
}
function nomeMunicipio(id){return s.nomes.get(id)||id||"Rio Grande do Sul";}
function recorte(){return s.municipio?nomeMunicipio(s.municipio):"Rio Grande do Sul";}
function registrosMunicipais(){
  return s.municipal.filter(r=>r.cd_cargo===s.cargo &&
    (!s.municipio||r.cd_municipio_ibge===s.municipio));
}
function registrosPartidos(){
  if(!proporcional(s.cargo))return [];
  return s.partidos.filter(r=>r.cd_cargo===s.cargo &&
    (!s.municipio||r.cd_municipio_ibge===s.municipio) &&
    (!s.partido||r.nr_partido===s.partido));
}
function votoPartidoMunicipio(){
  const mp=new Map();
  for(const r of s.partidos){
    if(r.cd_cargo!==s.cargo)continue;
    if(s.partido && r.nr_partido!==s.partido)continue;
    const ibge=r.cd_municipio_ibge;
    mp.set(ibge,(mp.get(ibge)||0)+num(r.votos_validos_partido));
  }
  return mp;
}
function atualizarPartidosDisponiveis(){
  const seletor=$("partido");
  const anterior=s.partido;
  const ativo=true;
  seletor.disabled=false;
  const conjuntos=new Map();
  if(!proporcional(s.cargo)){
    for(const p of (s.execPartidos.get(s.cargo)||[]))conjuntos.set(p,p);
  }else if(ativo){
    for(const r of s.partidos){
      if(r.cd_cargo!==s.cargo)continue;
      // O seletor mostra os partidos do cargo em todo RS.
      // A filtragem por município ocorre depois.
      if(!conjuntos.has(r.nr_partido)){
        conjuntos.set(r.nr_partido,r.sg_partido||r.nr_partido);
      }
    }
  }
  seletor.replaceChildren();
  const geral=document.createElement("option");
  geral.value="";
  geral.textContent="Todos os partidos";
  seletor.appendChild(geral);
  for(const [id,nome] of [...conjuntos].sort((a,b)=>
    a[1].localeCompare(b[1],"pt-BR"))){
    const op=document.createElement("option");
    op.value=id;op.textContent=nome;
    seletor.appendChild(op);
  }
  s.partido=conjuntos.has(anterior)?anterior:"";
  seletor.value=s.partido;
}
function kpis(){
  const linhas=registrosMunicipais();
  const somar=c=>linhas.reduce((a,r)=>a+num(r[c]),0);
  $("kpi-territorio").textContent=recorte();
  // Estes KPIs são totais municipais do cargo,
  // não totais do partido, evitando denominadores confusos.
  $("kpi-brutos").textContent=fmt.format(somar("votos_nominais_brutos"));
  $("kpi-validos").textContent=fmt.format(somar("votos_validos_confirmados"));
  $("kpi-locais").textContent=fmt.format(
    s.cadastro.filter(r=>!s.municipio||r.CD_MUN===s.municipio).length
  );
}
const coresJenks=["#e5f0f8","#a5d1e4","#62aecf","#2779b0","#104477"];
const classeSemDados="#e9e9e9";
function quebrasJenks(valores,k=5){
  const x=valores.filter(v=>Number.isFinite(v)&&v>0).sort((a,b)=>a-b);
  if(!x.length)return [];
  const n=x.length, K=Math.min(k,n), ps=[0],ps2=[0];
  for(const v of x){ps.push(ps.at(-1)+v);ps2.push(ps2.at(-1)+v*v);}
  const custo=(a,b)=>{const cnt=b-a, soma=ps[b]-ps[a];return ps2[b]-ps2[a]-soma*soma/cnt;};
  const dp=Array.from({length:K+1},()=>Array(n+1).fill(Infinity));
  const prev=Array.from({length:K+1},()=>Array(n+1).fill(0));
  dp[0][0]=0;
  for(let c=1;c<=K;c++)for(let j=c;j<=n;j++){
    for(let i=c-1;i<j;i++){
      const valor=dp[c-1][i]+custo(i,j);
      if(valor<dp[c][j]){dp[c][j]=valor;prev[c][j]=i;}
    }
  }
  const cortes=[];let j=n;
  for(let c=K;c>=1;c--){cortes.unshift(x[j-1]);j=prev[c][j];}
  return cortes;
}
function legendaJenks(cortes,percentual=false){
  const el=$("legenda-jenks");el.replaceChildren();
  const titulo=document.createElement("strong");titulo.textContent="Jenks · "+cortes.length+" classes";el.appendChild(titulo);
  let inferior=0;
  cortes.forEach((max,i)=>{
    const item=document.createElement("span");item.className="legend-item";
    const sw=document.createElement("span");sw.className="legend-swatch";sw.style.background=coresJenks[i];
    const lab=document.createElement("span");
    const format=v=>percentual?v.toLocaleString("pt-BR",{maximumFractionDigits:2})+"%":fmt.format(Math.round(v));
    lab.textContent=(i===0?"> 0":"> "+format(inferior))+" até "+format(max);
    item.append(sw,lab);el.appendChild(item);inferior=max;
  });
  const outro=document.createElement("span");outro.className="legend-item";
  const caixa=document.createElement("span");caixa.className="legend-swatch";caixa.style.background=classeSemDados;
  const t=document.createElement("span");t.textContent="Zero/sem dado";outro.append(caixa,t);el.appendChild(outro);
}
function corJenks(v,cortes){if(!Number.isFinite(v)||v<=0||!cortes.length)return classeSemDados;
  const ind=cortes.findIndex(c=>v<=c);return coresJenks[Math.max(0,ind<0?cortes.length-1:ind)];
}
function removerCamada(){
  if(s.camada){s.map.removeLayer(s.camada);s.camada=null;}
}
function areaMunicipal(){
  removerCamada();
  const valores=new Map();
  const cargoMun=s.municipal.filter(x=>x.cd_cargo===s.cargo);
  const totalRS=cargoMun.reduce((a,r)=>a+num(r.votos_validos_confirmados),0);
  if(s.partido&&!proporcional(s.cargo)){
    // Sem série municipal de votos partidários executivos validada no pacote.
    // Não apresentar totais gerais como se fossem do partido selecionado.
  }else if(proporcional(s.cargo)&&s.partido){
    const votos=votoPartidoMunicipio();
    for(const r of cargoMun){const p=votos.get(r.cd_municipio_ibge)||0;
      valores.set(r.cd_municipio_ibge,s.indicador==="pct_validos"
        ?(num(r.votos_validos_confirmados)?100*p/num(r.votos_validos_confirmados):0):p);}
  }else{
    const campo=s.indicador;
    for(const r of cargoMun){const valor=campo==="pct_validos"
       ?(totalRS?100*num(r.votos_validos_confirmados)/totalRS:0):num(r[campo]);
       valores.set(r.cd_municipio_ibge,valor);}
  }
  const cortes=quebrasJenks([...valores.values()]);
  legendaJenks(cortes,s.indicador==="pct_validos");
  s.camada=L.geoJSON(s.geo,{
    style:f=>{
      const id=texto(f.properties.cd_municipio_ibge);
      return {
        color:id===s.municipio?"#e29a2d":"#70849a",
        weight:id===s.municipio?3:0.65,
        fillColor:corJenks(valores.get(id)||0,cortes),
        fillOpacity:.87
      };
    },
    onEachFeature:(f,l)=>{
      const id=texto(f.properties.cd_municipio_ibge);
      const votos=valores.get(id)||0;
      l.bindTooltip(
        `${limpar(nomeMunicipio(id))}<br>${s.partido&&!proporcional(s.cargo)?"Dados municipais do partido não disponíveis":(s.indicador==="pct_validos"?votos.toLocaleString("pt-BR",{maximumFractionDigits:2})+"%":fmt.format(votos)+" votos")}`,
        {sticky:true}
      );
      l.on("click",()=>{
        s.municipio=id;
        $("municipio").value=id;
        atualizarTudo(true);
      });
    }
  }).addTo(s.map);
  $("mapa-escala").textContent=s.partido&&!proporcional(s.cargo)
    ? "Sem dados municipais por partido para este cargo neste pacote. Não foram inventadas distribuições."
    : s.indicador==="pct_validos" ? (s.partido?"Percentual dos votos válidos do partido sobre os votos válidos do cargo no município.":"Participação do município nos votos válidos do RS para este cargo (não é a votação de um candidato).")
    : s.partido?"Votos válidos do partido no município.":"Totais municipais do cargo selecionado.";
}
async function camadaDeLocais(){
  removerCamada();
  $("legenda-jenks").replaceChildren();
  if(!s.locais)s.locais=await buscar("dados/locais.geojson");
  const pontos=s.locais.features.filter(f=>
    f.geometry?.type==="Point" &&
    (!s.municipio||texto(f.properties.CD_MUN)===s.municipio)
  );
  if(s.modo==="calor"){
    if(typeof L.heatLayer!=="function")
      throw new Error("Biblioteca de mapa de calor indisponível.");
    s.camada=L.heatLayer(
      pontos.map(f=>[f.geometry.coordinates[1],f.geometry.coordinates[0],1]),
      {radius:19,blur:15,maxZoom:12}
    ).addTo(s.map);
  }else if(s.modo==="clusters"){
    if(typeof L.markerClusterGroup!=="function")
      throw new Error("Biblioteca de clusters indisponível.");
    const grupo=L.markerClusterGroup({
      chunkedLoading:true,showCoverageOnHover:false
    });
    for(const f of pontos){
      const [lon,lat]=f.geometry.coordinates;
      const p=f.properties;
      grupo.addLayer(L.marker([lat,lon]).bindPopup(
        `<strong>${limpar(p.NM_LOCAL_VOTACAO)}</strong><br>`+
        `Zona ${limpar(p.NR_ZONA)} · Local ${limpar(p.NR_LOCAL_VOTACAO)}`
      ));
    }
    s.camada=grupo.addTo(s.map);
  }else{
    s.camada=L.layerGroup().addTo(s.map);
    for(const f of pontos){
      const [lon,lat]=f.geometry.coordinates;
      const p=f.properties;
      L.circleMarker([lat,lon],{
        radius:4,color:"#93560d",weight:1,
        fillColor:"#f2ad49",fillOpacity:.85
      }).bindPopup(
        `<strong>${limpar(p.NM_LOCAL_VOTACAO)}</strong><br>`+
        `Zona ${limpar(p.NR_ZONA)} · Local ${limpar(p.NR_LOCAL_VOTACAO)}`
      ).addTo(s.camada);
    }
  }
  $("mapa-escala").textContent=`${fmt.format(pontos.length)} locais geográficos no recorte. `+
    (s.modo==="calor"
      ?"Calor = concentração de locais, não quantidade de votos. "
      :"")+
    "Os 135 locais em revisão não são exibidos como posições exatas. "+
    "O filtro partidário não redistribui votos entre estabelecimentos.";
}
async function atualizarMapa(){
  const token=++s.versaoMapa;
  try{
    if(s.modo==="areas"){areaMunicipal();return;}
    await camadaDeLocais();
    if(token!==s.versaoMapa){
      // A próxima atualização irá substituir a camada.
      return;
    }
  }catch(e){aviso("Mapa: "+e.message,true);}
}
function grafico(div,linhas,chaveRotulo,chaveValor){
  const el=$(div);
  if(!linhas.length){
    Plotly.purge(el);
    el.innerHTML="<p class='empty-chart'>Sem resultados neste recorte.</p>";
    return;
  }
  const arr=linhas.slice().sort((a,b)=>
    num(b[chaveValor])-num(a[chaveValor]))
    .slice(0,25).reverse();
  const altura=Math.max(430,arr.length*29+70);
  el.style.height=altura+"px";
  Plotly.react(el,[{
    type:"bar",orientation:"h",
    x:arr.map(x=>num(x[chaveValor])),
    y:arr.map(x=>texto(x[chaveRotulo]).slice(0,33)),
    marker:{color:"#2163a3"},
    text:arr.map(x=>fmt.format(num(x[chaveValor]))),
    textposition:"outside",cliponaxis:false,
    hovertemplate:"%{y}<br>%{x:,} votos<extra></extra>"
  }],{
    height:altura,margin:{l:195,r:70,t:10,b:30},
    paper_bgcolor:"#fff",plot_bgcolor:"#fff",
    xaxis:{gridcolor:"#e7edf4"},yaxis:{automargin:true},
    font:{family:"system-ui",size:11},showlegend:false
  },{responsive:true,displayModeBar:false});
}
function atualizarRankingPartidos(){
  const agrupado=new Map();
  for(const r of registrosPartidos()){
    const id=r.nr_partido;
    if(!agrupado.has(id))
      agrupado.set(id,{nome:r.sg_partido||id,votos:0});
    agrupado.get(id).votos+=num(r.votos_validos_partido);
  }
  grafico("grafico-partidos",[...agrupado.values()],"nome","votos");
  $("sub-partidos").textContent=
    `${nomesCargos[s.cargo]} · ${recorte()}`+
    (!proporcional(s.cargo)?" · Sem base partidária para este cargo":"");
}
function atualizarTabela(linhas){
  const tbody=$("tabela-candidatos");
  tbody.replaceChildren();
  const baseValidos=registrosMunicipais().reduce((a,r)=>a+num(r.votos_validos_confirmados),0);
  for(const r of linhas.slice(0,100)){
    const tr=document.createElement("tr");
    for(const c of [
      "nome_candidato_final","sg_partido",
      "votos_nominais_brutos","votos_validos_confirmados",
      "pct_do_cargo","destinacao_auditada"
    ]){
      const td=document.createElement("td");
      td.textContent=c==="pct_do_cargo" ? (baseValidos?(100*num(r.votos_validos_confirmados)/baseValidos).toLocaleString("pt-BR",{maximumFractionDigits:2})+"%":"—") : c.startsWith("votos_")
        ?fmt.format(num(r[c])):(r[c]??"Não informado");
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}
async function atualizarCandidaturas(){
  const token=++s.versaoRequisicao;
  const url=s.municipio
    ?`dados/candidaturas/municipios/${s.municipio}.json`
    :`dados/candidaturas/estado/cargo_${s.cargo}.json`;
  try{
    const todos=await buscar(url);
    if(token!==s.versaoRequisicao)return;
    let linhas=todos.filter(r=>r.cd_cargo===s.cargo);
    if(s.partido){
      const siglas=proporcional(s.cargo)?new Set(s.partidos.filter(r=>
        r.cd_cargo===s.cargo && r.nr_partido===s.partido
      ).map(r=>r.sg_partido)):new Set([s.partido]);
      linhas=linhas.filter(r=>siglas.has(r.sg_partido));
    }
    const rank=new Map();
    for(const r of linhas){
      const id=[r.sq_candidato,r.nr_candidato,r.nome_candidato_final].join("|");
      if(!rank.has(id))
        rank.set(id,{nome:r.nome_candidato_final||r.nr_candidato,votos:0});
      rank.get(id).votos+=num(r.votos_validos_confirmados);
    }
    grafico("grafico-candidatos",[...rank.values()],"nome","votos");
    const ordenadas=linhas.slice().sort((a,b)=>
      num(b.votos_validos_confirmados)-num(a.votos_validos_confirmados));
    atualizarTabela(ordenadas);
    $("sub-candidatos").textContent=
      `${nomesCargos[s.cargo]} · ${recorte()}`;
    $("titulo-tabela").textContent=
      `Até 100 registros · ${recorte()}`;
    $("nota-candidatos").textContent=
      "Ranking de votos válidos confirmados; os registros de destinação "+
      "auditada são preservados na tabela.";
  }catch(e){
    if(token!==s.versaoRequisicao)return;
    aviso("Candidaturas: "+e.message,true);
  }
}
function zoom(){
  if(!s.municipio){s.map.fitBounds(s.limites);return;}
  const f=s.geo.features.find(x=>
    texto(x.properties.cd_municipio_ibge)===s.municipio);
  if(f)s.map.fitBounds(L.geoJSON(f).getBounds().pad(.12),{maxZoom:11});
}
function atualizarTudo(aplicarZoom=false){
  kpis();
  atualizarRankingPartidos();
  atualizarCandidaturas();
  atualizarMapa();
  if(aplicarZoom)zoom();
  $("legenda-mapa").textContent=
    `${nomesCargos[s.cargo]} · ${recorte()}`;
}
async function iniciar(){
  if(location.protocol==="file:"){
    aviso("Abra usando servidor HTTP ou GitHub Pages.",true);
    return;
  }
  try{
    const [geo,mun,part,csv]=await Promise.all([
      buscar("dados/municipios.geojson"),
      buscar("dados/resultados_municipios_cargos.json"),
      buscar("dados/partidos_municipios.json"),
      buscarTexto("dados/cadastro_locais.csv")
    ]);
    s.geo=geo;s.municipal=mun;s.partidos=part;
    const execListas=await Promise.all(["1","3","5"].map(c=>buscar(`dados/candidaturas/estado/cargo_${c}.json`)));
    ["1","3","5"].forEach((cargo,i)=>s.execPartidos.set(cargo,[...new Set(execListas[i].map(r=>r.sg_partido).filter(Boolean))].sort()));
    s.cadastro=csvSimples(csv);
    if(geo.features.length!==497||s.cadastro.length!==7883)
      throw new Error("Universo territorial incompatível.");
    for(const r of s.cadastro){
      if(r.CD_MUN&&r.NM_MUNICIPIO&&!s.nomes.has(r.CD_MUN))
        s.nomes.set(r.CD_MUN,r.NM_MUNICIPIO);
    }
    const ids=geo.features.map(f=>
      texto(f.properties.cd_municipio_ibge));
    for(const id of ids.sort((a,b)=>
      nomeMunicipio(a).localeCompare(nomeMunicipio(b),"pt-BR"))){
      const o=document.createElement("option");
      o.value=id;o.textContent=nomeMunicipio(id)+" — "+id;
      $("municipio").appendChild(o);
    }
    s.map=L.map("mapa",{preferCanvas:true});
    L.tileLayer(
      "https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png",
      {subdomains:"abc",maxZoom:12,
       attribution:"© OpenStreetMap contributors"}
    ).addTo(s.map);
    s.limites=L.geoJSON(geo).getBounds();
    s.map.fitBounds(s.limites);
    s.versaoMapa=0;
    $("cargo").addEventListener("change",e=>{
      s.cargo=e.target.value;
      atualizarPartidosDisponiveis();
      atualizarTudo();
    });
    $("municipio").addEventListener("change",e=>{
      s.municipio=e.target.value;
      atualizarTudo(true);
    });
    $("indicador").addEventListener("change",e=>{
      s.indicador=e.target.value;
      atualizarTudo();
    });
    $("partido").addEventListener("change",e=>{
      s.partido=e.target.value;
      atualizarTudo();
    });
    $("modo-mapa").addEventListener("change",e=>{
      s.modo=e.target.value;
      atualizarTudo();
    });
    $("imprimir").addEventListener("click",()=>window.print());
    $("limpar").addEventListener("click",()=>{
      s.municipio="";
      $("municipio").value="";
      atualizarTudo(true);
    });
    atualizarPartidosDisponiveis();
    atualizarTudo();
    aviso("Atlas V2 carregado. Utilize os filtros e selecione uma visualização.");
  }catch(e){
    aviso("Falha ao iniciar o Atlas: "+e.message,true);
    console.error(e);
  }
}
iniciar();
})();