# Sucatas Brasil — versão inicial Firebase

Aplicação web responsiva para as unidades **Sete Quedas** e **Jardim**. Esta é uma base inicial de implementação, não um sistema já publicado nem conectado ao projeto Firebase do usuário.

## O que já está no protótipo
- Login por Firebase Authentication (e-mail/senha).
- Perfil por usuário e unidade, com papéis `vendedor`, `gerente` e `admin`.
- Compra de sucata: peso bruto, tara, peso líquido, preço/kg, total, pagamento e fornecedor.
- Venda de itens cadastrados em estoque, com validação de saldo.
- Estoques separados por unidade e categoria (`sucata`, `reaproveitado`, `novo`).
- Registro de movimentos de caixa.
- Transferência entre unidades com estado `em_transito` e confirmação de recebimento.
- Ajuste de estoque para administrador, logs de auditoria e exportação CSV.
- Interface adaptada a desktop e celular.

## Importante antes de usar com dinheiro real
Este é um MVP inicial. Antes da operação real, faça revisão técnica das regras, testes de autorização, testes de transações concorrentes, cancelamentos auditáveis, fechamento diário por forma de pagamento, recebimento parcial e divergências de transferência, cadastro de produtos/preços, recibos impressos e relatórios financeiros completos. Não use em produção sem essa validação. As regras Firestore fornecidas são uma base e devem ser testadas no Firebase Emulator Suite. A criação de perfil é uma tarefa administrativa: criar a conta em Authentication e gravar `users/{UID}`.

## Configuração Firebase
1. Crie um projeto em https://console.firebase.google.com/.
2. Em **Authentication → Sign-in method**, habilite **E-mail/senha**.
3. Em **Authentication → Users**, crie a conta do administrador.
4. Em **Firestore Database**, crie o banco em modo produção.
5. Abra **Configurações do projeto → Seus apps → Aplicativo da Web** e registre um app.
6. Copie o objeto `firebaseConfig` para `firebase-config.js`, substituindo todos os campos `COLE_...` e `SEU_...`.
7. Publique `firestore.rules` em Firestore → Regras, após revisar e testar.
8. Crie manualmente o perfil do administrador em `users/{UID}` (o UID é exibido no Firebase Authentication). Documento exemplo:
```json
{
  "name": "Administrador",
  "email": "admin@empresa.com",
  "unit": "Sete Quedas",
  "role": "admin",
  "active": true
}
```
O administrador poderá selecionar as duas unidades. Para o usuário de Jardim, defina `unit` como `Jardim`; para Sete Quedas, `Sete Quedas`. Perfis aceitos: `admin`, `gerente`, `vendedor`.
9. Sirva os arquivos por um servidor web HTTPS. Não abra `index.html` diretamente via `file://`, pois módulos ES e Firebase podem falhar. Pode usar Firebase Hosting ou outro host estático HTTPS.

## Estrutura de coleções
- `users/{uid}` — nome, e-mail, unidade, papel e ativo.
- `purchases/{id}` — compras de sucata.
- `sales/{id}` — vendas.
- `stock/{id}` — saldo por unidade, categoria e produto.
- `cashMovements/{id}` — entradas e saídas.
- `transfers/{id}` — origem, destino, itens, estado e recebimento.
- `auditLogs/{id}` — eventos não editáveis via regras.
- `userInvites/{id}` — solicitações administrativas de criação de perfil.

## Teste rápido
1. Crie projeto, configure Authentication e Firestore.
2. Configure `firebase-config.js` e regras.
3. Crie perfil `users/{UID}` do administrador.
4. Entre e cadastre uma compra de sucata de teste.
5. Confira se o estoque e o caixa mudaram.
6. Cadastre um produto no estoque (pode fazer isso por uma ferramenta administrativa após validar as regras) antes de testar venda.
7. Crie dois perfis em unidades diferentes e teste uma transferência.
8. Teste que vendedor não consegue ler dados de outra unidade.

## Observações de segurança
- `apiKey` do Firebase para apps web não é uma senha administrativa, mas regras e Authentication são essenciais.
- Nunca coloque credenciais de conta de serviço ou chaves privadas no frontend.
- A interface não substitui as regras do banco: permissões devem ser validadas no servidor.
