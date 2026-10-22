# Sucatas Brasil — Cloudflare + GitHub

Pacote inicial de desenvolvimento para as unidades Sete Quedas e Jardim.

## Arquitetura
- Cloudflare Workers: API e lógica do sistema
- Cloudflare D1: banco de dados SQL
- GitHub: código-fonte
- `src/index.html`: interface inicial
- `src/worker.js`: API inicial
- `schema.sql`: tabelas

## Configuração
1. Crie um banco D1 chamado `sucatas-brasil-db`.
2. Copie o ID do banco para `wrangler.toml`, substituindo `PREENCHA_COM_O_ID_DO_SEU_D1`.
3. Execute `schema.sql` no console D1 ou com `npx wrangler d1 execute sucatas-brasil-db --remote --file=./schema.sql`.
4. Configure `AUTH_SECRET` como Secret nas configurações do Worker. Não publique esse valor no GitHub.
5. Publique o Worker com `npm install` e `npm run deploy`, ou configure a publicação pelo painel Cloudflare.
6. Abra a aplicação e use “Configuração inicial” para criar o primeiro administrador.

## Importante
Este pacote é um MVP inicial, não um ERP validado para operação comercial. Antes de usar dinheiro real, teste segurança, permissões, concorrência, estoque, transferências, caixa e backups. Ainda faltam fechamento diário completo, recibos, estornos auditáveis, recuperação de senha e tratamento completo de divergências de transferências.
