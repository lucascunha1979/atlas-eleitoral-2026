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
  limites:null, versaoRequisicao:0
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
  const ativo=proporcional(s.cargo);
  seletor.disabled=!ativo;
  const conjuntos=new Map();
  if(ativo){
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
  geral.textContent=ativo?"Todos os partidos":"Não disponível neste cargo";
  seletor.appendChild(geral);
  for(const [id,nome] of [...conjuntos].sort((a,b)=>
    a[1].localeCompare(b[1],"pt-BR"))){
    const op=document.createElement("option");
    op.value=id;op.textContent=nome;
    seletor.appendChild(op);
  }
  s.partido=ativo&&conjuntos.has(anterior)?anterior:"";
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
function cor(v,max){
  if(!Number.isFinite(v)||v<=0)return "#e6edf4";
  const intensidade=Math.sqrt(v/Math.max(max,1));
  return `hsl(208 65% ${90-intensidade*57}%)`;
}
function removerCamada(){
  if(s.camada){s.map.removeLayer(s.camada);s.camada=null;}
}
function areaMunicipal(){
  removerCamada();
  const valores=new Map();
  if(proporcional(s.cargo)&&s.partido){
    for(const [id,n] of votoPartidoMunicipio())valores.set(id,n);
  }else{
    const campo=s.indicador;
    for(const r of s.municipal.filter(x=>x.cd_cargo===s.cargo))
      valores.set(r.cd_municipio_ibge,num(r[campo]));
  }
  const max=Math.max(1,...valores.values());
  s.camada=L.geoJSON(s.geo,{
    style:f=>{
      const id=texto(f.properties.cd_municipio_ibge);
      return {
        color:id===s.municipio?"#e29a2d":"#70849a",
        weight:id===s.municipio?3:0.65,
        fillColor:cor(valores.get(id)||0,max),
        fillOpacity:.87
      };
    },
    onEachFeature:(f,l)=>{
      const id=texto(f.properties.cd_municipio_ibge);
      const votos=valores.get(id)||0;
      l.bindTooltip(
        `${limpar(nomeMunicipio(id))}<br>${fmt.format(votos)} votos`,
        {sticky:true}
      );
      l.on("click",()=>{
        s.municipio=id;
        $("municipio").value=id;
        atualizarTudo(true);
      });
    }
  }).addTo(s.map);
  $("mapa-escala").textContent=s.partido&&proporcional(s.cargo)
    ? "Áreas por votos válidos do partido selecionado, neste cargo."
    : "Áreas por totais municipais do cargo e indicador selecionados.";
}
async function camadaDeLocais(){
  removerCamada();
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
  for(const r of linhas.slice(0,100)){
    const tr=document.createElement("tr");
    for(const c of [
      "nome_candidato_final","sg_partido",
      "votos_nominais_brutos","votos_validos_confirmados",
      "destinacao_auditada"
    ]){
      const td=document.createElement("td");
      td.textContent=c.startsWith("votos_")
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
    if(s.partido&&proporcional(s.cargo)){
      const siglas=new Set(s.partidos.filter(r=>
        r.cd_cargo===s.cargo && r.nr_partido===s.partido
      ).map(r=>r.sg_partido));
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