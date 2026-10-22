// Proxy do FYNA para a API da Pluggy (Cloudflare Worker).
//
// O navegador não pode chamar a API da Pluggy direto, então o FYNA passa por aqui.
// O proxy não guarda nada: cada pessoa manda as próprias credenciais do Meu Pluggy,
// que vão direto para a Pluggy. Só aceita chamadas vindas do endereço do FYNA e
// só repassa as rotas de leitura que o app usa.

const ALLOWED_ORIGINS = ['https://gabrielmartins13.github.io'];

const ALLOWED_ROUTES = [
  ['POST', /^\/auth$/],
  ['GET', /^\/items\/[\w-]+$/],
  ['GET', /^\/accounts$/],
  ['GET', /^\/transactions$/],
];

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const allowed = ALLOWED_ORIGINS.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-KEY',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!allowed) return new Response('Origem não permitida', { status: 403, headers: cors });

    const url = new URL(request.url);
    const route = ALLOWED_ROUTES.some(([method, path]) => method === request.method && path.test(url.pathname));
    if (!route) return new Response('Rota não permitida', { status: 404, headers: cors });

    const headers = { 'Content-Type': 'application/json' };
    const apiKey = request.headers.get('X-API-KEY');
    if (apiKey) headers['X-API-KEY'] = apiKey;

    const upstream = await fetch(`https://api.pluggy.ai${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      body: request.method === 'POST' ? await request.text() : undefined,
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...cors, 'Content-Type': upstream.headers.get('Content-Type') || 'application/json' },
    });
  },
};
