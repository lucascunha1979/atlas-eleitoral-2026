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
  abrangencia:"municipios", participacaoCache:{}, geosTerritoriais:{}, mapaTerritorialSeq:0,
  cargo:"1", municipio:"", partido:"", indicador:"votos_nominais_brutos",
  modo:"areas", geo:null, municipal:[], partidos:[], cadastro:[],
  locais:null, nomes:new Map(), map:null, camada:null, pontos:null,
  limites:null, versaoRequisicao:0, execPartidos:new Map(), mapSeq:0, indice:[], candidato:"", tipoVotacao:"total"
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

const indicadoresParticipacao=new Set(["brancos","nulos","brancos_nulos","aptos","comparecimento","abstencoes","pct_comparecimento","pct_abstencao","pct_brancos_nulos_comparecimento"]);
const rotulosParticipacao={brancos:"Votos brancos",nulos:"Votos nulos",brancos_nulos:"Brancos + nulos",aptos:"Eleitorado apto",comparecimento:"Comparecimento",abstencoes:"Abstenções",pct_comparecimento:"Comparecimento (%)",pct_abstencao:"Abstenção (%)",pct_brancos_nulos_comparecimento:"Brancos e nulos / comparecimento (%)"};
const nomeAbrangencia={municipios:"Municípios",distritos:"Distritos",bairros:"Bairros",locais:"Locais de votação"};
const chaveLocal=(m,z,l)=>[texto(m).replace(/^0+(?=\d)/,""),texto(z).replace(/^0+(?=\d)/,""),texto(l).replace(/^0+(?=\d)/,"")].join("|");
async function dadosParticipacao(tipo){
  if(!s.participacaoCache[tipo])s.participacaoCache[tipo]=await buscar("dados/participacao/"+tipo+".json");
  return s.participacaoCache[tipo];
}
async function geoTerritorial(tipo){
  if(tipo==="municipios")return s.geo;
  if(!s.geosTerritoriais[tipo]){
    const arq=tipo==="distritos"?"dados/distritos_simplificados_20m.geojson":tipo==="bairros"?"dados/bairros.geojson":"dados/locais.geojson";
    s.geosTerritoriais[tipo]=await buscar(arq);
  }
  return s.geosTerritoriais[tipo];
}
function identificarTerritorio(r,tipo){
  if(tipo==="municipios")return texto(r.cd_municipio_ibge);
  if(tipo==="distritos")return texto(r.id_distrito);
  if(tipo==="bairros")return texto(r.id_bairro);
  return chaveLocal(r.cd_municipio,r.nr_zona,r.nr_local_votacao);
}
function territorioGeo(f,tipo){
  const p=f.properties;
  if(tipo==="municipios")return texto(p.cd_municipio_ibge);
  if(tipo==="distritos")return texto(p.id_distrito);
  if(tipo==="bairros")return texto(p.id_bairro);
  return chaveLocal(p.CD_MUNICIPIO,p.NR_ZONA,p.NR_LOCAL_VOTACAO);
}
function nomeTerritorio(r,tipo){
  if(tipo==="municipios")return nomeMunicipio(r.cd_municipio_ibge);
  if(tipo==="distritos")return texto(r.nm_distrito||r.id_distrito);
  if(tipo==="bairros")return texto(r.nm_bairro_geografico||r.id_bairro);
  return "Zona "+texto(r.nr_zona)+" · Local "+texto(r.nr_local_votacao);
}
function valorParticipacao(r){
  const campo=s.indicador;
  if(!r)return null;
  if(!Object.prototype.hasOwnProperty.call(r,campo)||r[campo]===null)return null;
  const n=Number(r[campo]);return Number.isFinite(n)?n:null;
}
function normalizarCorParticipacao(v,cortes){
  if(v===null||!Number.isFinite(v))return classeSemDados;
  if(v===0)return "#f6f7f9";
  return corJenks(v,cortes);
}
function montarRankingTerritorial(dados,tipo,representados){
  const t=$("ranking-territorial");t.replaceChildren();
  const rec=dados.filter(r=>!s.municipio||texto(r.cd_municipio_ibge)===s.municipio);
  const linhas=rec.map(r=>({...r,_nome:nomeTerritorio(r,tipo),_v:valorParticipacao(r),_representado:representados.has(identificarTerritorio(r,tipo))}));
  linhas.sort((a,b)=>(b._v??-Infinity)-(a._v??-Infinity)||a._nome.localeCompare(b._nome,"pt-BR"));
  $("titulo-ranking-territorial").textContent=nomeAbrangencia[tipo]+" · "+rotulosParticipacao[s.indicador]+" · "+recorte()+" · "+linhas.length+" registros · mapa com "+representados.size+" geometrias/pontos";
  for(const [i,r] of linhas.entries()){
    const tr=document.createElement("tr");
    const cols=[String(i+1),r._nome+(r._representado?"":" · sem localização no mapa"),nomeMunicipio(r.cd_municipio_ibge),r._v===null?"Sem dado":s.indicador.startsWith("pct_")?r._v.toLocaleString("pt-BR",{maximumFractionDigits:2})+"%":fmt.format(r._v),...["aptos","comparecimento","brancos","nulos"].map(k=>r[k]===null?"—":fmt.format(num(r[k])))];
    for(const value of cols){const td=document.createElement("td");td.textContent=value;tr.appendChild(td);}
    t.appendChild(tr);
  }
}
async function mapaParticipacao(){
  const token=++s.mapaTerritorialSeq;
  const tipo=s.abrangencia;
  const [registros,geo]=await Promise.all([dadosParticipacao(tipo),geoTerritorial(tipo)]);
  if(token!==s.mapaTerritorialSeq||!indicadoresParticipacao.has(s.indicador)||s.abrangencia!==tipo)return;
  const filtrados=registros.filter(r=>texto(r.cd_cargo)===s.cargo);
  const porId=new Map(filtrados.map(r=>[identificarTerritorio(r,tipo),r]));
  const features=geo.features.filter(f=>!s.municipio||texto(f.properties.cd_municipio_ibge??f.properties.CD_MUN)===s.municipio);
  const ids=new Set(features.map(f=>territorioGeo(f,tipo)));
  const valores=features.map(f=>valorParticipacao(porId.get(territorioGeo(f,tipo)))).filter(v=>v!==null&&v>0);
  const cortes=quebrasJenks(valores);
  legendaJenks(cortes,s.indicador.startsWith("pct_"));
  $("legenda-mapa").textContent=rotulosParticipacao[s.indicador]+" · "+nomeAbrangencia[tipo];
  removerCamada();
  if(tipo==="locais"){
    const layer=L.layerGroup().addTo(s.map);s.camada=layer;
    if(s.modo==="calor"&&typeof L.heatLayer==="function"){
      s.map.removeLayer(layer);
      const max=Math.max(0,...valores);
      const pts=features.map(f=>{const v=valorParticipacao(porId.get(territorioGeo(f,tipo)));const c=f.geometry?.coordinates;return v!==null&&v>0&&c?[c[1],c[0],Math.max(.1,Math.sqrt(v/max))]:null}).filter(Boolean);
      s.camada=L.heatLayer(pts,{radius:22,blur:16,maxZoom:12}).addTo(s.map);
    }else{
      for(const f of features){if(f.geometry?.type!=="Point")continue;const p=f.properties,v=valorParticipacao(porId.get(territorioGeo(f,tipo))),c=f.geometry.coordinates;L.circleMarker([c[1],c[0]],{radius:4,color:"#556e83",weight:.5,fillColor:normalizarCorParticipacao(v,cortes),fillOpacity:.85}).bindTooltip(limpar(p.NM_LOCAL_VOTACAO||"Local")+" · "+(v===null?"Sem dado":fmt.format(v))).addTo(layer);}
    }
  }else{
    s.camada=L.geoJSON({type:"FeatureCollection",features},{
      style:f=>{const v=valorParticipacao(porId.get(territorioGeo(f,tipo)));return {color:"#5c7186",weight:.65,fillColor:normalizarCorParticipacao(v,cortes),fillOpacity:.86};},
      onEachFeature:(f,layer)=>{const r=porId.get(territorioGeo(f,tipo)),v=valorParticipacao(r),nm=r?nomeTerritorio(r,tipo):texto(f.properties.nm_distrito||f.properties.nm_bairro||f.properties.nm_municipio||"Área sem atribuição");layer.bindTooltip(limpar(nm)+" · "+(v===null?"Sem atribuição eleitoral":s.indicador.startsWith("pct_")?v.toLocaleString("pt-BR",{maximumFractionDigits:2})+"%":fmt.format(v)),{sticky:true});}
    }).addTo(s.map);
  }
  montarRankingTerritorial(filtrados,tipo,ids);
  $("mapa-escala").textContent=nomeAbrangencia[tipo]+" · "+features.length+" feições no mapa. Sem atribuição = dado ausente, não zero. Para bairro e distrito, considere a cobertura territorial da fonte.";
  $("aviso-cobertura").textContent="Indicadores de participação territorializados por seção e cargo. Valores de candidaturas e partidos por distrito/bairro/local ainda exigem integração de bases específicas.";
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
    (!s.partido||r.sg_partido===s.partido));
}
function votosPorTipo(r){
  if(s.tipoVotacao==="nominais")return num(r.nominais_validos);
  if(s.tipoVotacao==="legenda")return num(r.votos_legenda);
  return num(r.votos_validos_partido);
}
function atualizarTipoVotacao(){
  const disponivel=proporcional(s.cargo)&&!s.candidato;
  $("campo-tipo-votacao").hidden=!disponivel;
  $("tipo-votacao").disabled=!disponivel;
  $("tipo-votacao").value=s.tipoVotacao;
}
function votoPartidoMunicipio(){
  const mp=new Map();
  for(const r of s.partidos){
    if(r.cd_cargo!==s.cargo)continue;
    if(s.partido && r.nr_partido!==s.partido)continue;
    const ibge=r.cd_municipio_ibge;
    mp.set(ibge,(mp.get(ibge)||0)+votosPorTipo(r));
  }
  return mp;
}
function atualizarPartidosDisponiveis(){
  const seletor=$("partido"), anterior=s.partido;
  const p=new Map();
  if(s.indice.length){
    for(const r of s.indice)if(r.cargo===s.cargo && r.tipo==="partido" && r.partido)p.set(r.partido,r.partido);
  }else if(proporcional(s.cargo)){
    for(const r of s.partidos)if(r.cd_cargo===s.cargo && r.sg_partido)p.set(r.sg_partido,r.sg_partido);
  }else{
    for(const sig of s.execPartidos.get(s.cargo)||[])p.set(sig,sig);
  }
  seletor.replaceChildren(new Option("Todos os partidos",""));
  for(const sig of [...p.keys()].sort((a,b)=>a.localeCompare(b,"pt-BR")))seletor.appendChild(new Option(sig,sig));
  s.partido=p.has(anterior)?anterior:"";seletor.value=s.partido;
}
function atualizarCandidatosDisponiveis(){
  const seletor=$("candidato"), anterior=s.candidato, op=new Map();
  if(s.indice.length){
    for(const r of s.indice)if(r.cargo===s.cargo && r.tipo==="candidato"
      && (!s.partido||r.partido===s.partido) && (!s.municipio||r.ibge===s.municipio)){
      const key=r.sq||r.numero+"|"+r.nome;
      op.set(key,(r.nome||r.numero)+" · "+(r.partido||"Sem partido"));
    }
  }
  seletor.replaceChildren(new Option("Todas as candidaturas",""));
  for(const [key,nome] of [...op].sort((a,b)=>a[1].localeCompare(b[1],"pt-BR")))seletor.appendChild(new Option(nome,key));
  s.candidato=op.has(anterior)?anterior:"";seletor.value=s.candidato;
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
async function buscarCandidaturasMunicipais(cargo,partido,candidato){
  const codigos=s.municipio?[s.municipio]:s.geo.features.map(f=>texto(f.properties.cd_municipio_ibge));
  const registros=[];
  let cursor=0;
  const trabalhadores=Array.from({length:8},async()=>{
    while(cursor<codigos.length){
      const id=codigos[cursor++];
      const lista=await buscar(`dados/candidaturas/municipios/${id}.json`);
      for(const r of lista){
        if(r.cd_cargo!==cargo)continue;
        if(partido&&r.sg_partido!==partido)continue;
        if(candidato&&(r.sq_candidato||r.nr_candidato+"|"+r.nome_candidato_final)!==candidato)continue;
        registros.push(r);
      }
    }
  });
  await Promise.all(trabalhadores);
  return registros;
}
function removerCamada(){
  if(s.camada){s.map.removeLayer(s.camada);s.camada=null;}
}
function areaMunicipal(){
  removerCamada();
  const valores=new Map();
  const cargoMun=s.municipal.filter(x=>x.cd_cargo===s.cargo);
  const totalRS=cargoMun.reduce((a,r)=>a+num(r.votos_validos_confirmados),0);
  const denominadores=new Map();
  for(const r of s.partidos)if(r.cd_cargo===s.cargo){
    const ibge=r.cd_municipio_ibge;
    denominadores.set(ibge,Math.max(denominadores.get(ibge)||0,num(r.denominador_validos_confirmados)));
  }
  const temFiltro=Boolean(s.partido||s.candidato);
  let sub=new Map();
  if(temFiltro&&s.indice.length&&!(proporcional(s.cargo)&&s.partido&&!s.candidato)){
    for(const r of s.indice){
      if(r.cargo!==s.cargo)continue;
      if(s.candidato){
        if(r.tipo!=="candidato"||(r.sq||r.numero+"|"+r.nome)!==s.candidato)continue;
      }else if(r.tipo!=="partido")continue;
      if(s.partido&&r.partido!==s.partido)continue;
      sub.set(r.ibge,(sub.get(r.ibge)||0)+num(s.indicador==="votos_nominais_brutos"?r.brutos:r.validos));
    }
  }
  // Para os cargos proporcionais, manter resultados partidários
  // disponíveis mesmo antes de a agregação gerada ser publicada.
  if(temFiltro&&proporcional(s.cargo)&&s.partido&&!s.candidato){
    for(const r of s.partidos)if(r.cd_cargo===s.cargo&&r.sg_partido===s.partido)
      sub.set(r.cd_municipio_ibge,(sub.get(r.cd_municipio_ibge)||0)+votosPorTipo(r));
  }
  const semIndice=temFiltro&&!s.indice.length&&(!proporcional(s.cargo)||s.candidato);
  for(const r of cargoMun){
    const id=r.cd_municipio_ibge, den=denominadores.get(id)||num(r.votos_validos_confirmados);
    const filtro=temFiltro?(sub.get(id)||0):num(
      s.indicador==="votos_nominais_brutos"?r.votos_nominais_brutos:r.votos_validos_confirmados);
    let v;
    if(semIndice)v=null;
    else if(s.indicador==="pct_concorrencia")v=den?100*filtro/den:0;
    else if(s.indicador==="pct_validos")v=temFiltro?(den?100*filtro/den:0)
      :(totalRS?100*den/totalRS:0);
    else v=filtro;
    valores.set(id,v);
  }
  const modoLegenda=proporcional(s.cargo)&&s.partido&&!s.candidato?(
    s.tipoVotacao==="nominais"?"Votos nominais válidos · ":
    s.tipoVotacao==="legenda"?"Votos de legenda · ":"Nominais + legenda · "):"";
  const tema=semIndice?"AGUARDANDO ÍNDICE ELEITORAL · ":s.candidato?"Candidatura selecionada · ":s.partido?modoLegenda:"";
  $("legenda-mapa").textContent=tema+nomesCargos[s.cargo];
  const cortes=quebrasJenks([...valores.values()]);
  legendaJenks(cortes,s.indicador.startsWith("pct_"));
  s.camada=L.geoJSON(s.geo,{
    style:f=>{
      const id=texto(f.properties.cd_municipio_ibge);
      return {
        color:id===s.municipio?"#e29a2d":"#70849a",
        weight:id===s.municipio?3:0.65,
        fillColor:corJenks(valores.get(id),cortes),
        fillOpacity:.87
      };
    },
    onEachFeature:(f,l)=>{
      const id=texto(f.properties.cd_municipio_ibge);
      const votos=valores.get(id);
      l.bindTooltip(limpar(nomeMunicipio(id))+"<br>"+(votos===null?"Dados ainda não disponíveis":s.indicador.startsWith("pct_")?votos.toLocaleString("pt-BR",{maximumFractionDigits:2})+"%":fmt.format(votos)+" votos"),{sticky:true});
      l.on("click",()=>{
        s.municipio=id;
        $("municipio").value=id;
        atualizarTudo(true);
      });
    }
  }).addTo(s.map);
  $("mapa-escala").textContent=semIndice?"Índice municipal por candidato/partido ainda em geração no GitHub.":temFiltro?"Mapa pelo filtro selecionado, com cinco classes Jenks e voto nominal ou válido conforme o indicador.":"Mapa municipal por cargo; para distribuir votos por partido ou candidatura, selecione um filtro.";

}
async function camadaDeLocais(){
  removerCamada();
  $("legenda-jenks").replaceChildren();
  if(s.modo!=="calor"&&!s.locais)s.locais=await buscar("dados/locais.geojson");
  const pontos=(s.locais?.features||[]).filter(f=>
    f.geometry?.type==="Point" &&
    (!s.municipio||texto(f.properties.CD_MUN)===s.municipio)
  );
  if(s.modo==="calor"){
    if(typeof L.heatLayer!=="function")
      throw new Error("Biblioteca de mapa de calor indisponível.");
    // Interpolação visual municipal: centróides dos municípios, NÃO pontos com voto local.
    const porMunicipio=new Map();
    if(proporcional(s.cargo)&&s.partido&&!s.candidato){
      for(const r of s.partidos){
        if(r.cd_cargo!==s.cargo||r.sg_partido!==s.partido)continue;
        porMunicipio.set(r.cd_municipio_ibge,(porMunicipio.get(r.cd_municipio_ibge)||0)+votosPorTipo(r));
      }
    }else if(!s.partido&&!s.candidato){
      for(const r of s.municipal){
        if(r.cd_cargo!==s.cargo)continue;
        porMunicipio.set(r.cd_municipio_ibge,num(r.votos_validos_confirmados));
      }
    }else if(s.indice.length){
      for(const r of s.indice){
        if(r.cargo!==s.cargo)continue;
        if(s.candidato){if(r.tipo!=="candidato"||(r.sq||r.numero+"|"+r.nome)!==s.candidato)continue;}
        else if(r.tipo!=="partido")continue;
        if(s.partido&&r.partido!==s.partido)continue;
        porMunicipio.set(r.ibge,(porMunicipio.get(r.ibge)||0)+num(r.validos));
      }
    }else{
      // Buscar as candidaturas municipais sob demanda para o filtro selecionado.
      const candidaturas=await buscarCandidaturasMunicipais(s.cargo,s.partido,s.candidato);
      for(const r of candidaturas){
        const id=texto(r.cd_municipio_ibge);
        porMunicipio.set(id,(porMunicipio.get(id)||0)+num(r.votos_validos_confirmados));
      }
    }
    const dens=[];
    const dadosMun=new Map(s.municipal.filter(r=>r.cd_cargo===s.cargo).map(r=>[r.cd_municipio_ibge,r]));
    for(const f of s.geo.features){
      const id=texto(f.properties.cd_municipio_ibge);
      if(s.municipio&&id!==s.municipio)continue;
      const bruto=porMunicipio.get(id)||0;
      const mun=dadosMun.get(id);
      const denPart=proporcional(s.cargo)?s.partidos.filter(r=>r.cd_cargo===s.cargo&&r.cd_municipio_ibge===id).reduce((acc,r)=>Math.max(acc,num(r.denominador_validos_confirmados)),0):0;
      const den=denPart>0?denPart:num(mun?.denominador_validos_confirmados)||num(mun?.votos_validos_confirmados);
      const valor=s.indicador.startsWith("pct_")?(den?100*bruto/den:0):bruto;
      if(!Number.isFinite(valor)||valor<=0)continue;
      const center=L.geoJSON(f).getBounds().getCenter();
      dens.push([center.lat,center.lng,valor]);
    }
    const max=Math.max(0,...dens.map(r=>r[2]));
    if(!dens.length){$("mapa-escala").textContent="Não há votos positivos com denominador disponível neste filtro. Confira dados e filtros.";aviso("Sem valores positivos representáveis para o calor deste filtro.",true);return;}
    // Percentuais baixos não devem desaparecer devido à escala linear entre 0 e 1.
    // Raiz quadrada apenas para intensidade visual; dados continuam intactos.
    s.camada=L.heatLayer(dens.map(r=>[r[0],r[1],max?Math.max(.26,Math.sqrt(r[2]/max)):0]),
      {radius:43,blur:26,maxZoom:12,max:1,minOpacity:.43}).addTo(s.map);
    $("legenda-mapa").textContent="Calor municipal · "+nomesCargos[s.cargo];
    $("mapa-escala").textContent="Interpolação visual de valores MUNICIPAIS; cada ponto é o centro do município, não um local de votação. "+(s.indicador.startsWith("pct_")?"Intensidade proporcional ao percentual.":"Intensidade proporcional ao total de votos.")+" Para calor por estabelecimento, é necessária a base de votos por local publicada.";
    return;
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
    "Os 135 locais em revisão não são exibidos como posições exatas. "+
    "O filtro partidário não redistribui votos entre estabelecimentos.";
}

/* INTEGRAÇÃO 2026 — dados compactos por local de votação; não redistribuir votos. */
const cacheEleitoralCompacto=new Map();
async function lerCompacto(tipo,cargo){
  const nome=tipo==="candidaturas"?"candidaturas":"partidos";
  const url="dados/votos_compactos/"+nome+"_cargo_"+cargo+".json.gz";
  if(!cacheEleitoralCompacto.has(url)){
    const tarefa=(async()=>{
      const resposta=await fetch(url);
      if(!resposta.ok)throw new Error("Arquivo eleitoral não publicado: "+url+" (HTTP "+resposta.status+")");
      if(typeof pako==="undefined")throw new Error("Biblioteca GZIP pako não carregada.");
      const bytes=new Uint8Array(await resposta.arrayBuffer());
      const objeto=JSON.parse(pako.ungzip(bytes,{to:"string"}));
      if(!Array.isArray(objeto.columns)||!Array.isArray(objeto.rows))
        throw new Error("Estrutura GZIP incompatível: "+url);
      const campos=objeto.columns;
      return objeto.rows.map(linha=>Object.fromEntries(campos.map((c,i)=>[c,linha[i]])));
    })();
    cacheEleitoralCompacto.set(url,tarefa);
    tarefa.catch(()=>cacheEleitoralCompacto.delete(url));
  }
  return cacheEleitoralCompacto.get(url);
}
async function mapaVotosTerritoriais(token){
  const tipo=s.abrangencia,cargo=s.cargo;
  const usarPartidos=proporcional(cargo)&&!s.candidato;
  const [linhas,geometria,baseCandidaturas]=await Promise.all([
    lerCompacto(usarPartidos?"partidos":"candidaturas",cargo),
    geoTerritorial(tipo),
    usarPartidos&&tipo!=="locais"?lerCompacto("candidaturas",cargo):Promise.resolve(null)
  ]);
  // A base de partidos não contém id_bairro/id_distrito.
  // Recuperar a associação uma única vez pelo local eleitoral auditado.
  const territorioPorLocal=new Map();
  if(baseCandidaturas){
    for(const c of baseCandidaturas){
      const local=chaveLocal(c.cd_municipio,c.nr_zona,c.nr_local_votacao);
      const id=identificarTerritorio(c,tipo);
      if(id)territorioPorLocal.set(local,id);
    }
  }
  const idTerritorio=r=>usarPartidos&&tipo!=="locais"
    ?territorioPorLocal.get(chaveLocal(r.cd_municipio,r.nr_zona,r.nr_local_votacao))
    :identificarTerritorio(r,tipo);
  if(token!==s.versaoMapa||tipo!==s.abrangencia||cargo!==s.cargo)return;
  const agregados=new Map();
  const denominadores=new Map();
  const presenca=new Set();
  let soma=0;
  for(const r of linhas){
    if(s.municipio&&texto(r.cd_municipio_ibge)!==s.municipio)continue;
    const territorio=idTerritorio(r);
    if(!territorio)continue;
    // O denominador é próprio do local/cargo, não somado por candidatura ou partido.
    const den=num(r.denominador_validos_confirmados);
    denominadores.set(territorio,Math.max(denominadores.get(territorio)||0,den));
    let aceitar=!s.partido||texto(r.sg_partido)===s.partido;
    if(s.candidato){
      const chave=texto(r.sq_candidato||r.nr_candidato+"|"+r.nome_candidato_final);
      aceitar=aceitar&&chave===s.candidato;
    }
    if(!aceitar)continue;
    let votos;
    if(usarPartidos){
      votos=s.tipoVotacao==="legenda"?num(r.votos_legenda):
        s.tipoVotacao==="nominais"?num(r.nominais_validos):
        num(r.votos_validos_partido);
    }else{
      votos=s.indicador==="votos_nominais_brutos"?
        num(r.votos_nominais_brutos):num(r.votos_validos_confirmados);
    }
    presenca.add(territorio);
    agregados.set(territorio,(agregados.get(territorio)||0)+votos);
    soma+=votos;
  }
  // Denominadores territoriais precisam somar uma vez por LOCAL, nunca por linha.
  // Para cargos proporcionais, cada partido repete o denominador do mesmo local.
  const chavesLocais=new Map();
  for(const r of linhas){
    if(s.municipio&&texto(r.cd_municipio_ibge)!==s.municipio)continue;
    const id=idTerritorio(r);
    if(!id)continue;
    const local=chaveLocal(r.cd_municipio,r.nr_zona,r.nr_local_votacao);
    const chave=id+"§"+local;
    chavesLocais.set(chave,Math.max(chavesLocais.get(chave)||0,num(r.denominador_validos_confirmados)));
  }
  const denTerritorio=new Map();
  for(const [chave,den] of chavesLocais){
    const id=chave.split("§")[0];
    denTerritorio.set(id,(denTerritorio.get(id)||0)+den);
  }
  const partes=geometria.features.filter(f=>!s.municipio||texto(f.properties.cd_municipio_ibge??f.properties.CD_MUN)===s.municipio);
  const valor=(id)=>{
    if(!presenca.has(id))return null;
    const v=agregados.get(id)||0;
    if(s.indicador==="pct_validos"||s.indicador==="pct_concorrencia")
      return denTerritorio.get(id)?100*v/denTerritorio.get(id):null;
    return v;
  };
  const valores=partes.map(f=>valor(territorioGeo(f,tipo))).filter(v=>v!==null&&v>0);
  const cortes=quebrasJenks(valores);
  legendaJenks(cortes,s.indicador.startsWith("pct_"));
  const rotulo=(s.candidato?"Candidatura":s.partido?"Partido "+s.partido:"Votação")+" · "+nomesCargos[cargo]+" · "+nomeAbrangencia[tipo];
  $("legenda-mapa").textContent=rotulo;
  removerCamada();
  if(tipo==="locais"){
    const camada=L.layerGroup().addTo(s.map);s.camada=camada;
    if(s.modo==="calor"&&typeof L.heatLayer==="function"){
      s.map.removeLayer(camada);
      const max=Math.max(0,...valores);
      const pontos=partes.map(f=>{
        const v=valor(territorioGeo(f,tipo)),p=f.geometry?.coordinates;
        return v!==null&&v>0&&p?[p[1],p[0],Math.max(.1,Math.sqrt(v/(max||1)))]:null;
      }).filter(Boolean);
      s.camada=L.heatLayer(pontos,{radius:22,blur:16,maxZoom:12}).addTo(s.map);
    }else{
      for(const f of partes){
        if(f.geometry?.type!=="Point")continue;
        const id=territorioGeo(f,tipo),v=valor(id),c=f.geometry.coordinates;
        const nome=texto(f.properties.NM_LOCAL_VOTACAO||id);
        const textoV=v===null?"Sem registro territorial":s.indicador.startsWith("pct_")?v.toLocaleString("pt-BR",{maximumFractionDigits:2})+"%":fmt.format(v)+" votos";
        L.circleMarker([c[1],c[0]],{radius:4,color:"#52677b",weight:.5,fillColor:normalizarCorParticipacao(v,cortes),fillOpacity:.86})
          .bindTooltip(limpar(nome)+" · "+textoV).addTo(camada);
      }
    }
  }else{
    s.camada=L.geoJSON({type:"FeatureCollection",features:partes},{
      style:f=>({color:"#61758b",weight:.7,fillColor:normalizarCorParticipacao(valor(territorioGeo(f,tipo)),cortes),fillOpacity:.84}),
      onEachFeature:(f,layer)=>{
        const id=territorioGeo(f,tipo),v=valor(id);
        const nome=texto(f.properties.nm_distrito||f.properties.nm_bairro||f.properties.nm_municipio||id);
        const t=v===null?"Sem registro territorial":s.indicador.startsWith("pct_")?v.toLocaleString("pt-BR",{maximumFractionDigits:2})+"%":fmt.format(v)+" votos";
        layer.bindTooltip(limpar(nome)+" · "+t,{sticky:true});
      }
    }).addTo(s.map);
  }
  const top=partes.map(f=>({
    id:territorioGeo(f,tipo),
    nome:texto(f.properties.nm_distrito||f.properties.nm_bairro||f.properties.NM_LOCAL_VOTACAO||f.properties.nm_municipio||"Território"),
    mun:texto(f.properties.cd_municipio_ibge??f.properties.CD_MUN),
    valor:valor(territorioGeo(f,tipo))
  })).filter(x=>x.valor!==null).sort((a,b)=>b.valor-a.valor).slice(0,250);
  const t=$("ranking-territorial");t.replaceChildren();
  $("titulo-ranking-territorial").textContent=rotulo+" · "+top.length+" territórios com registro (até 250 no ranking)";
  for(let i=0;i<top.length;i++){
    const x=top[i],tr=document.createElement("tr");
    const celulas=[String(i+1),x.nome,nomeMunicipio(x.mun),s.indicador.startsWith("pct_")?x.valor.toLocaleString("pt-BR",{maximumFractionDigits:2})+"%":fmt.format(x.valor),"—","—","—","—"];
    for(const v of celulas){const td=document.createElement("td");td.textContent=v;tr.appendChild(td);}t.appendChild(tr);
  }
  $("mapa-escala").textContent=nomeAbrangencia[tipo]+" · "+partes.length+" feições · dados por local de votação; total municipal pode incluir votos fora da territorialização.";
  $("aviso-cobertura").textContent="Votação territorializada por local, agregada por bairro ou distrito. Município preserva os totais oficiais. Nenhum voto foi redistribuído.";
}

async function atualizarMapa(){
  const token=++s.versaoMapa;
  try{
    if(indicadoresParticipacao.has(s.indicador)){await mapaParticipacao();return;}
    if(s.abrangencia!=="municipios"){await mapaVotosTerritoriais(token);return;}
    if(s.modo==="areas"){areaMunicipal();return;}
    await camadaDeLocais();
    if(token!==s.versaoMapa){
      // A próxima atualização irá substituir a camada.
      return;
    }
  }catch(e){aviso("Mapa: "+e.message,true);}
}
function grafico(div,linhas,chaveRotulo,chaveValor,percentual=false){
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
    text:arr.map(x=>percentual?num(x[chaveValor]).toLocaleString("pt-BR",{maximumFractionDigits:2})+"%":fmt.format(num(x[chaveValor]))),
    textposition:"outside",cliponaxis:false,
    hovertemplate:percentual?"%{y}<br>%{x:.2f}%<extra></extra>":"%{y}<br>%{x:,} votos<extra></extra>"
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
    const id=r.sg_partido||r.nr_partido;
    if(!agrupado.has(id))
      agrupado.set(id,{nome:r.sg_partido||id,votos:0});
    agrupado.get(id).votos+=votosPorTipo(r);
  }
  const totalCargo=s.partidos.filter(r=>r.cd_cargo===s.cargo&&(!s.municipio||r.cd_municipio_ibge===s.municipio));
  const denominadorPorMunicipio=new Map();
  for(const r of totalCargo)denominadorPorMunicipio.set(r.cd_municipio_ibge,Math.max(denominadorPorMunicipio.get(r.cd_municipio_ibge)||0,num(r.denominador_validos_confirmados)));
  const den=[...denominadorPorMunicipio.values()].reduce((x,y)=>x+y,0);
  const lista=[...agrupado.values()].map(r=>({...r,pct:den?100*r.votos/den:0}));
  const isPct=s.indicador.startsWith("pct_");
  grafico("grafico-partidos",lista,"nome",isPct?"pct":"votos",isPct);
  $("sub-partidos").textContent=
    `${nomesCargos[s.cargo]} · ${recorte()}`+
    (!proporcional(s.cargo)?" · Sem base partidária para este cargo":
     " · "+(s.tipoVotacao==="nominais"?"Votos nominais válidos":s.tipoVotacao==="legenda"?"Votos de legenda":"Nominais válidos + legenda"));
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
    if(s.partido)linhas=linhas.filter(r=>r.sg_partido===s.partido);
    if(s.candidato)linhas=linhas.filter(r=>(r.sq_candidato||r.nr_candidato+"|"+r.nome_candidato_final)===s.candidato);
    const rank=new Map();
    for(const r of linhas){
      const id=[r.sq_candidato,r.nr_candidato,r.nome_candidato_final].join("|");
      if(!rank.has(id))
        rank.set(id,{nome:r.nome_candidato_final||r.nr_candidato,votos:0});
      rank.get(id).votos+=num(r.votos_validos_confirmados);
    }
    const denMunicipios=registrosMunicipais().reduce((x,r)=>x+num(r.denominador_validos_confirmados||r.votos_validos_confirmados),0);
    const ranking=[...rank.values()].map(r=>({...r,pct:denMunicipios?100*r.votos/denMunicipios:0}));
    const isPct=s.indicador.startsWith("pct_");
    grafico("grafico-candidatos",ranking,"nome",isPct?"pct":"votos",isPct);
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


async function gerarRelatorioImprimivel(){
  const cargo=s.cargo, partido=s.partido, candidato=s.candidato, mun=s.municipio;
  const isPct=s.indicador.startsWith("pct_");
  const denom=new Map(),valor=new Map();
  const corpo=s.municipal.filter(r=>r.cd_cargo===cargo&&(!mun||r.cd_municipio_ibge===mun));
  for(const r of s.partidos)if(r.cd_cargo===cargo){
    const id=texto(r.cd_municipio_ibge);
    denom.set(id,Math.max(denom.get(id)||0,num(r.denominador_validos_confirmados)));
    if(proporcional(cargo)&&!candidato&&(!partido||r.sg_partido===partido))
      valor.set(id,(valor.get(id)||0)+votosPorTipo(r));
  }
  if(!proporcional(cargo)||candidato){
    if(partido||candidato){
      const lista=await buscarCandidaturasMunicipais(cargo,partido,candidato);
      for(const r of lista){const id=texto(r.cd_municipio_ibge);valor.set(id,(valor.get(id)||0)+num(r.votos_validos_confirmados));}
    }else for(const r of corpo)valor.set(texto(r.cd_municipio_ibge),num(r.votos_validos_confirmados));
  }
  const rows=corpo.map(r=>{
    const id=texto(r.cd_municipio_ibge), votos=valor.get(id)||0;
    const base=denom.get(id)||num(r.denominador_validos_confirmados)||num(r.votos_validos_confirmados);
    return {nome:nomeMunicipio(id),votos,pct:base?100*votos/base:null};
  }).sort((a,b)=>isPct?(b.pct??-1)-(a.pct??-1):b.votos-a.votos);
  const escapeHTML=limpar;
  const textoTabela=rows.map((r,i)=>'<tr><td>'+(i+1)+'</td><td>'+escapeHTML(r.nome)+'</td><td>'+fmt.format(r.votos)+'</td><td>'+(r.pct===null?'Sem denominador':r.pct.toLocaleString("pt-BR",{maximumFractionDigits:3})+'%')+'</td></tr>').join('');
  const html='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Atlas RS 2026 — Relatório</title><style>body{font:12px Arial;padding:20px;color:#132d50}h1{font-size:19px}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid #ddd;padding:5px}thead{display:table-header-group}tr{break-inside:avoid}th{background:#dae8f4}@page{size:A4 landscape;margin:15mm}small{color:#555}</style></head><body><h1>Atlas Eleitoral RS 2026 — Ranking municipal</h1><p>'+escapeHTML(nomesCargos[cargo])+' | '+escapeHTML(recorte())+' | Partido: '+escapeHTML(partido||'Todos')+' | '+(isPct?'Ordenado por percentual':'Ordenado por votos')+'</p><p><small>Modalidade: '+escapeHTML(s.tipoVotacao)+'; dados eleitorais municipais. Os demais territórios aguardam integração.</small></p><table><thead><tr><th>Pos.</th><th>Município</th><th>Votos</th><th>% válidos</th></tr></thead><tbody>'+textoTabela+'</tbody></table><p><small>Para PDF, use Imprimir → Salvar como PDF.</small></p></body></html>';
  const win=window.open("","_blank");
  if(!win)throw new Error("Permita janelas pop-up para exportar o relatório.");
  win.document.open();win.document.write(html);win.document.close();win.focus();
  win.setTimeout(()=>win.print(),350);
}
async function gerarRelatorioPDF(){
  const pdfDisponivel=Boolean(window.jspdf?.jsPDF&&window.jspdf?.jsPDF.prototype.autoTable);
  if(!pdfDisponivel){
    return gerarRelatorioImprimivel();
  }
  const doc=new window.jspdf.jsPDF({orientation:"landscape",unit:"mm",format:"a4"});
  const isPct=s.indicador.startsWith("pct_");
  const criterio=isPct?"Percentual dos válidos do cargo":"Votos absolutos";
  const titulo=nomesCargos[s.cargo]+" · "+recorte();
  const subtitulo=(s.partido?"Partido: "+s.partido+" · ":"")+(s.candidato?"Candidatura: "+s.candidato+" · ":"")+criterio;
  const cabecalho=()=>{
    doc.setFontSize(15);doc.text("Atlas Eleitoral RS 2026 — Relatório do filtro",14,16);
    doc.setFontSize(10);doc.text(titulo,14,23);doc.text(subtitulo.slice(0,125),14,29);
  };
  cabecalho();
  const rows=[];
  const partidos=s.partidos.filter(r=>r.cd_cargo===s.cargo&&(!s.partido||r.sg_partido===s.partido)&&(!s.municipio||r.cd_municipio_ibge===s.municipio));
  const porMunicipio=new Map();
  const denominadores=new Map();
  if(proporcional(s.cargo)&&!s.candidato){
    for(const r of partidos){
      const id=texto(r.cd_municipio_ibge);
      porMunicipio.set(id,(porMunicipio.get(id)||0)+votosPorTipo(r));
    }
    for(const r of s.partidos)if(r.cd_cargo===s.cargo){
      const id=texto(r.cd_municipio_ibge);
      denominadores.set(id,Math.max(denominadores.get(id)||0,num(r.denominador_validos_confirmados)));
    }
  }else if(s.partido||s.candidato){
    const lista=await buscarCandidaturasMunicipais(s.cargo,s.partido,s.candidato);
    for(const r of lista)porMunicipio.set(texto(r.cd_municipio_ibge),(porMunicipio.get(texto(r.cd_municipio_ibge))||0)+num(r.votos_validos_confirmados));
  }else{
    for(const r of s.municipal)if(r.cd_cargo===s.cargo)porMunicipio.set(texto(r.cd_municipio_ibge),num(r.votos_validos_confirmados));
  }
  for(const r of s.municipal)if(r.cd_cargo===s.cargo){
    const id=texto(r.cd_municipio_ibge);if(s.municipio&&id!==s.municipio)continue;
    const votos=porMunicipio.get(id)||0;
    const den=denominadores.get(id)||num(r.denominador_validos_confirmados)||num(r.votos_validos_confirmados);
    const pct=den?100*votos/den:null;
    rows.push({nome:nomeMunicipio(id),votos,pct});
  }
  rows.sort((a,b)=>isPct?(b.pct??-1)-(a.pct??-1)||b.votos-a.votos:b.votos-a.votos);
  doc.setFontSize(9);
  doc.text("Abrangência: municípios | "+rows.length+" unidades | Ranking integral",14,36);
  doc.autoTable({
    startY:40,head:[["Posição","Município","Votos válidos do filtro","Percentual dos válidos"]],
    body:rows.map((r,i)=>[String(i+1),r.nome,fmt.format(r.votos),r.pct===null?"Não disponível":r.pct.toLocaleString("pt-BR",{maximumFractionDigits:3})+"%"]),
    styles:{fontSize:8},headStyles:{fillColor:[25,64,106]},margin:{top:22,left:14,right:14},
    didDrawPage:()=>{const n=doc.internal.getNumberOfPages();doc.setFontSize(8);doc.text("Fonte: bases eleitorais auditadas · Sem atribuição artificial de votos · Página "+n,14,200);}
  });
  doc.save("atlas_rs2026_"+s.cargo+"_"+(s.municipio||"RS")+"_ranking_municipal.pdf");
}
function zoom(){
  if(!s.municipio){s.map.fitBounds(s.limites);return;}
  const f=s.geo.features.find(x=>
    texto(x.properties.cd_municipio_ibge)===s.municipio);
  if(f)s.map.fitBounds(L.geoJSON(f).getBounds().pad(.12),{maxZoom:11});
}
function atualizarTudo(aplicarZoom=false){
  atualizarTipoVotacao();
  kpis();
  atualizarRankingPartidos();
  atualizarCandidaturas();
  atualizarMapa();
  if(aplicarZoom)zoom();
  if(s.modo!=="areas")$("legenda-mapa").textContent=
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
    try{s.indice=await buscar("dados/indice_eleitoral_municipal.json");}catch(e){console.warn("Índice em geração:",e.message);}
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
    $("abrangencia").addEventListener("change",e=>{
      s.abrangencia=e.target.value;
      atualizarTudo();
    });
    $("cargo").addEventListener("change",e=>{
      s.cargo=e.target.value;
      atualizarPartidosDisponiveis();atualizarCandidatosDisponiveis();
      atualizarTudo();
    });
    $("municipio").addEventListener("change",e=>{
      s.municipio=e.target.value;atualizarCandidatosDisponiveis();
      atualizarTudo(true);
    });
    $("indicador").addEventListener("change",e=>{
      s.indicador=e.target.value;
      atualizarTudo();
    });
    $("partido").addEventListener("change",e=>{
      s.partido=e.target.value;atualizarCandidatosDisponiveis();
      atualizarTudo();
    });
    $("candidato").addEventListener("change",e=>{s.candidato=e.target.value;atualizarTudo();});
    $("tipo-votacao").addEventListener("change",e=>{s.tipoVotacao=e.target.value;atualizarTudo();});
    $("modo-mapa").addEventListener("change",e=>{
      s.modo=e.target.value;
      atualizarTudo();
    });
    $("imprimir").addEventListener("click",async()=>{try{aviso("Gerando relatório PDF municipal...");await gerarRelatorioPDF();aviso("Relatório municipal gerado. Distritos e bairros dependem da integração territorial.");}catch(e){aviso("PDF: "+e.message,true);}});
    $("limpar").addEventListener("click",()=>{
      s.municipio="";
      $("municipio").value="";
      atualizarTudo(true);
    });
    atualizarPartidosDisponiveis();atualizarCandidatosDisponiveis();
    atualizarTudo();
    aviso("Atlas V2 carregado. Utilize os filtros e selecione uma visualização.");
  }catch(e){
    aviso("Falha ao iniciar o Atlas: "+e.message,true);
    console.error(e);
  }
}
iniciar();
})();