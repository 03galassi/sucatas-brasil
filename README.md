# Sucatas Brasil — pacote de reformulação v2

Este pacote reorganiza a interface em duas experiências: painel administrativo para computador e fluxo mobile-first para vendedores. Inclui estoque geral consolidado, compras no varejo, vendas no atacado e cargas interestaduais que podem reunir material de Sete Quedas e Jardim, com frete registrado na carga.

## Antes de instalar
- O pacote foi preparado a partir do código e do esquema que foram compartilhados nesta conversa. Não foi implantado no seu Cloudflare e não foi testado contra seu D1 de produção.
- Faça backup/exportação do banco D1 antes de qualquer alteração.
- Não execute novamente `schema.sql` no banco existente.
- A tela de cargas usa três tabelas novas. Execute `migration_v2.sql` uma única vez no D1 existente `sucatas-brasil-db` antes de publicar a nova versão do Worker/UI.
- Mantenha o Secret `AUTH_SECRET` configurado no Worker e preserve o binding D1 `DB`.

## Arquivos
- `src/index.html`: interface responsiva, painel admin, fluxo vendedor e telas de operação.
- `src/worker.js`: API, autenticação PBKDF2 compatível com o limite atual do Workers, estoque consolidado, dashboard e cargas.
- `migration_v2.sql`: adiciona tabelas de cargas e despesas de frete, sem apagar tabelas atuais.
- `wrangler.toml`: configuração do Worker e binding existente.

## Ordem segura de implantação
1. Faça backup/exportação do D1.
2. Abra D1 > `sucatas-brasil-db` > Console e execute o conteúdo de `migration_v2.sql` uma única vez.
3. No GitHub, substitua `src/worker.js` pelo arquivo deste pacote e faça Commit.
4. Substitua `src/index.html` pelo arquivo deste pacote e faça Commit.
5. Confira `wrangler.toml`; mantenha `database_id` atual e o binding `DB`.
6. Aguarde deploy `Ready`.
7. Teste `/api/health`, login, estoque geral, compra de teste, venda de teste e formação/cancelamento de uma carga com pequenas quantidades de teste.

## Limites conhecidos / cuidado
- A criação de carga reserva/deduz os materiais do estoque disponível na origem; cancelamento devolve as quantidades. Confirme fisicamente o material e não marque cancelamento depois da entrega.
- Frete é registrado na carga em `shipment_expenses`, não é lançado automaticamente no caixa individual de uma unidade, pois a carga pode misturar origens. A conciliação financeira do frete e contas a receber precisam de uma regra contábil definida antes de uso em produção.
- A versão atual ainda não implementa cadastro completo de compradores, contas a receber, documentos fiscais, impressão de romaneio, pesagem conectada a balança, custo médio por lote, lucro líquido contábil, recuperação de senha ou auditoria de segurança independente.
- Em compras e vendas, use inicialmente pagamento à vista enquanto a gestão de contas a prazo não for implementada.
- Faça primeiro testes com pequenas quantidades e registros claramente identificados como teste.
