# FYNA

Aplicativo web de controle financeiro pessoal: receitas, despesas, orçamentos e gráficos de evolução. Cada pessoa entra com a própria conta (e-mail e senha) e os dados ficam salvos na nuvem pelo Firebase, sincronizados entre os aparelhos. Sem o Firebase configurado, o app funciona sem login e guarda os dados só no navegador.

## Como usar

Acesse pelo GitHub Pages: https://gabrielmartins13.github.io/GabrielMartins13/

Ou abra o arquivo `index.html` direto no navegador.

No iPhone, abra o link no Safari e use Compartilhar → Adicionar à Tela de Início: o app ganha o ícone com a logo e abre em tela cheia.

Para levar os dados entre aparelhos ou versões, use Personalizar → Copiar dados e, no outro lugar, Colar dados.

## Login na nuvem (Firebase)

1. Crie um projeto em https://console.firebase.google.com (o Google Analytics pode ficar desativado).
2. **Authentication → Método de login**: ative **E-mail/senha**.
3. **Authentication → Configurações → Domínios autorizados**: adicione `gabrielmartins13.github.io`.
4. **Firestore Database → Criar banco de dados** (modo de produção, região `southamerica-east1`). Na aba **Regras**, cole o conteúdo de `firestore.rules` e publique.
5. **Configurações do projeto → Seus apps → Web (`</>`)**: registre o app e copie o `firebaseConfig` para `firebase-config.js`.

Os dados de cada conta ficam no documento `users/{id da conta}`, e as regras só deixam o próprio dono ler e gravar. Ao entrar pela primeira vez num aparelho que já tinha dados de antes do login, o app oferece levá-los para a conta.

Em **Personalizar → Conta**, a opção **Entrar com Face ID ou digital** trava o app naquele aparelho: ao abrir, ou depois de mais de 2 minutos em segundo plano, ele pede a biometria do aparelho (WebAuthn). A senha continua valendo como alternativa e é necessária no primeiro acesso de cada aparelho.

## Páginas

- **Início**: próximas faturas dos cartões, receitas, despesas e saldos comparados ao mês anterior, gráfico de receitas × despesas (6 ou 12 meses), evolução do saldo acumulado, ritmo de gastos do mês contra o mês anterior, tendência por categoria, gastos por dia, gastos por cartão e forma de pagamento, orçamentos e últimas transações
- **Despesas**: cadastro (avulsa, parcelada ou fixa mensal) com forma de pagamento (crédito, débito, Pix ou dinheiro) e cartão, lista com busca e filtro por cartão, gastos por categoria e orçamentos mensais com alerta em 80% e acima do limite
- **Receitas**: cadastro (avulsa ou fixa mensal), lista com busca e receitas por origem
- **Cartões**: cadastro dos cartões (nome, cor, limite, dia do vencimento e do fechamento), gasto do mês no crédito e no débito, uso do limite, faturas (valor, vencimento, status e marcar como paga), contas fixas e lançamentos por cartão. Compras no crédito entram na fatura pelo fechamento: a partir do dia do fechamento, vão para a fatura seguinte; sem fechamento informado, considera 7 dias antes do vencimento
- **Personalizar**: conta (e-mail, status da sincronização e sair), nome no topo, cor principal, tema claro/escuro/automático, barra de navegação no topo ou embaixo, tamanho do texto, exportação CSV, backup e restauração

## Estrutura

- `index.html` — estrutura da página
- `style.css` — estilos
- `app.js` — lógica e armazenamento
- `img/` — logo do app (topo, ícone da aba e da tela inicial do celular)
- `manifest.webmanifest` — nome e ícones para instalar o app no celular
- `firebase-config.js` — configuração do projeto Firebase (vazia = app sem login)
- `firestore.rules` — regras de segurança do banco: cada conta só acessa os próprios dados
