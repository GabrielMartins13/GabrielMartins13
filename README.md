# Controle Financeiro

Aplicativo web simples para controlar receitas e despesas pessoais. Não precisa de servidor nem de instalação: os dados ficam salvos no próprio navegador (`localStorage`).

## Como usar

Acesse pelo GitHub Pages: https://gabrielmartins13.github.io/GabrielMartins13/

Ou abra o arquivo `index.html` direto no navegador.

## Funcionalidades

- Cadastro, edição e exclusão de receitas e despesas, com categoria e data
- Compras parceladas: o valor total é dividido em parcelas mensais
- Lançamentos fixos (salário, aluguel…) lançados automaticamente todo mês
- Gráfico de receitas × despesas dos últimos 6 meses
- Navegação por mês, com resumo de receitas, despesas, saldo do mês e saldo acumulado
- Gráfico de despesas por categoria
- Orçamento mensal por categoria, com alerta ao atingir 80% e ao ultrapassar o limite
- Busca e filtro de transações
- Exportação para CSV (abre no Excel) e backup/restauração em JSON
- Tema claro e escuro automático, layout adaptado para celular

## Estrutura

- `index.html` — estrutura da página
- `style.css` — estilos
- `app.js` — lógica e armazenamento
