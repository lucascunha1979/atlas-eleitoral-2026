# Integração territorial 2026 — desenvolvimento

A branch `integracao-votos-territoriais-2026` não altera a versão pública.

## Arquivos GZIP necessários

Extrair do pacote `atlas_rs2026_bloco06_integracao_github.zip` os sete arquivos de `dados/votos_compactos/` e publicá-los na mesma pasta desta branch:

- candidaturas_cargo_1.json.gz
- candidaturas_cargo_3.json.gz
- candidaturas_cargo_5.json.gz
- candidaturas_cargo_6.json.gz
- candidaturas_cargo_7.json.gz
- partidos_cargo_6.json.gz
- partidos_cargo_7.json.gz

O manifesto do bloco deve ficar em `dados/votos_compactos/manifest.json`.

O frontend carrega os GZIP por cargo com pako e agrega os dados de locais para bairro e distrito. Os totais municipais permanecem nas bases existentes. Nenhum voto é redistribuído.

## Situação de desenvolvimento

- app.js adaptado para dados territoriais
- index.html com pako
- GZIP ainda não copiados nesta branch
- Sem teste de execução no navegador ou validação final de filtros
- Diferenças entre votos municipais e territorializados precisam continuar documentadas

Não mesclar na branch `main` antes da publicação dos arquivos, auditoria de cobertura por cargo e verificação visual dos filtros.
