# Sucatas Brasil — Cloudflare Workers + D1

Este pacote substitui os arquivos da aplicação com uma versão integrada inicial para duas unidades (Sete Quedas e Jardim).

## Arquivos
- `wrangler.toml`: configura Worker, assets e binding D1.
- `src/worker.js`: API com setup/login, estoque, compras, vendas, caixa, transferências, usuários e resumo diário.
- `src/index.html`: interface web responsiva.
- `schema.sql`: estrutura de tabelas.

## Antes de publicar
1. Confira se `database_id` em `wrangler.toml` é o ID do seu banco D1. O valor neste pacote foi preenchido com o ID informado durante a configuração.
2. Confirme que o banco tem as tabelas do `schema.sql`; não é necessário executar o schema novamente se já existirem.
3. Na configuração do Worker, adicione `AUTH_SECRET` como **Secret** com um valor aleatório forte (pelo menos 32 bytes). Não coloque o segredo no GitHub.
4. Publique na raiz do repositório com `npx wrangler deploy` ou `npm run deploy`.
5. Teste `https://SEU-WORKER.workers.dev/api/health`. Deve retornar JSON com `ok: true`.
6. Na página inicial, use “Configuração inicial do administrador”. Senha com pelo menos 12 caracteres.

## Limitações e segurança
Este é um MVP funcional inicial, ainda não auditado para operação comercial. Antes de usar com dinheiro real, faça testes completos de concorrência, permissões, transações, recebimento de transferências e recuperação de falhas. A API usa token de sessão assinado, mas o armazenamento do token no navegador é apenas em memória. A API não implementa fechamento de caixa formal, recibos PDF, estornos ou recebimento parcial de transferências. Não coloque dados reais antes de concluir testes.
