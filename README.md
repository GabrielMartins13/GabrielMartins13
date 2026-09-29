# FYNA

Aplicativo web de controle financeiro pessoal: receitas, despesas, orçamentos e gráficos de evolução. Não precisa de servidor nem de instalação: os dados ficam salvos no próprio navegador (`localStorage`).

## Como usar

Acesse pelo GitHub Pages: https://gabrielmartins13.github.io/GabrielMartins13/

Ou abra o arquivo `index.html` direto no navegador.

No iPhone, abra o link no Safari e use Compartilhar → Adicionar à Tela de Início: o app ganha o ícone com a logo e abre em tela cheia.

Para levar os dados entre aparelhos ou versões, use Personalizar → Copiar dados e, no outro lugar, Colar dados.

## Páginas

- **Início**: painel com receitas, despesas e saldos comparados ao mês anterior, gráfico de receitas × despesas (6 ou 12 meses), evolução do saldo acumulado, ritmo de gastos do mês contra o mês anterior, tendência por categoria, gastos por dia, orçamentos e últimas transações
- **Despesas**: cadastro (avulsa, parcelada ou fixa mensal), lista com busca, gastos por categoria e orçamentos mensais com alerta em 80% e acima do limite
- **Receitas**: cadastro (avulsa ou fixa mensal), lista com busca e receitas por origem
- **Personalizar**: nome no topo, cor principal, tema claro/escuro/automático, barra de navegação no topo ou embaixo, tamanho do texto, exportação CSV, backup e restauração

## Estrutura

- `index.html` — estrutura da página
- `style.css` — estilos
- `app.js` — lógica e armazenamento
- `img/` — logo do app (topo, ícone da aba e da tela inicial do celular)
- `manifest.webmanifest` — nome e ícones para instalar o app no celular
