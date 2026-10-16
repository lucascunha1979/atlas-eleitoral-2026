#!/usr/bin/env python3
"""Produz índice municipal por candidatura/partido a partir dos JSONs auditados, sem alterar fontes."""
from pathlib import Path
from collections import defaultdict
import json
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/"dados"
CARGOS=["1","3","5","6","7"]
MUNIC=BASE/"candidaturas"/"municipios"
assert len(list(MUNIC.glob("*.json")))==497, "Esperados 497 municípios"
out=BASE/"indice_eleitoral_municipal.json"
result=[]
soma=defaultdict(int)
for arquivo in sorted(MUNIC.glob("*.json")):
    ibge=arquivo.stem
    assert len(ibge)==7 and ibge.isdigit()
    registros=json.loads(arquivo.read_text(encoding="utf-8"))
    indices=defaultdict(lambda:[0,0])
    for r in registros:
        cargo=str(r["cd_cargo"])
        if cargo not in CARGOS: continue
        votos=int(r["votos_validos_confirmados"] or 0)
        brutos=int(r["votos_nominais_brutos"] or 0)
        soma[(ibge,cargo)]+=votos
        sq=str(r.get("sq_candidato") or "")
        partido=str(r.get("sg_partido") or "").strip()
        nr=str(r.get("nr_candidato") or "")
        nome=str(r.get("nome_candidato_final") or "")
        if sq:
            key=("candidato",cargo,sq,nr,nome,partido)
            indices[key][0]+=votos
            indices[key][1]+=brutos
        if partido:
            key=("partido",cargo,"","", "",partido)
            indices[key][0]+=votos
            indices[key][1]+=brutos
    for (tipo,cargo,sq,nr,nome,partido),(votos,brutos) in indices.items():
        result.append({"ibge":ibge,"cargo":cargo,"tipo":tipo,"sq":sq,
                       "numero":nr,"nome":nome,"partido":partido,
                       "validos":votos,"brutos":brutos})
ref=json.loads((BASE/"resultados_municipios_cargos.json").read_text(encoding="utf-8"))
for r in ref:
    key=(str(r["cd_municipio_ibge"]),str(r["cd_cargo"]))
    assert soma[key]==int(r["votos_validos_confirmados"]),f"Diferença municipal: {key}"
out.write_text(json.dumps(result,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
print("OK",len(result),"linhas, 497 municípios, totais conservados.",out.stat().st_size,"bytes")
