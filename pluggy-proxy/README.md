# Proxy da Pluggy (Cloudflare Worker)

O FYNA roda no navegador e a API da Pluggy não aceita chamadas diretas de lá. Este Worker
só repassa as chamadas de leitura que o app usa (`/auth`, `/items/{id}`, `/accounts`,
`/transactions`) e só aceita pedidos vindos de `https://gabrielmartins13.github.io`.
Ele não guarda nada: cada pessoa usa as próprias credenciais do Meu Pluggy.

## Publicar

1. Crie uma conta grátis em https://dash.cloudflare.com
2. **Workers e Pages → Criar → Worker** ("Start with Hello World"), dê o nome `fyna-pluggy` e clique em **Implantar**.
3. Clique em **Editar código**, apague o conteúdo, cole o de `worker.js` e clique em **Implantar**.
4. Copie o endereço do Worker (algo como `https://fyna-pluggy.SEU-USUARIO.workers.dev`) para `pluggy-config.js`.
