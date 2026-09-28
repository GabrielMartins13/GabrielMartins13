# Controle Financeiro

Aplicativo web simples para controlar receitas e despesas pessoais. Não precisa de servidor nem de instalação: os dados ficam salvos no próprio navegador (`localStorage`).

## Como usar

Acesse pelo GitHub Pages: https://gabrielmartins13.github.io/GabrielMartins13/

Ou abra o arquivo `index.html` direto no navegador.

## Páginas

- **Início**: painel com receitas, despesas, saldo do mês e acumulado, gráfico dos últimos 6 meses, mapa de gastos por dia do mês, despesas por categoria, orçamentos e últimas transações
- **Despesas**: cadastro (avulsa, parcelada ou fixa mensal), lista com busca, gastos por categoria e orçamentos mensais com alerta em 80% e acima do limite
- **Receitas**: cadastro (avulsa ou fixa mensal), lista com busca e receitas por origem
- **Personalizar**: nome no topo, cor principal, tema claro/escuro/automático, barra de navegação no topo ou embaixo, tamanho do texto, exportação CSV, backup e restauração

## Estrutura

- `index.html` — estrutura da página
- `style.css` — estilos
- `app.js` — lógica e armazenamento
