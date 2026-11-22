import { setTimeout as esperar } from 'node:timers/promises';

/**
 * Etapa 7 do enunciado, automatizada: com o `docker compose up -d --build --wait` no ar, confere o fluxo
 * completo pelos containers de verdade (RabbitMQ + 4 PostgreSQL). Usado no CI; roda igual no Windows e no Linux.
 * Uso: npm run e2e   (variáveis opcionais: API_URL, PROJETOS_URL, NOTIFICACOES_URL, MQ_URL)
 */

const API = process.env['API_URL'] ?? 'http://localhost:3000';
const PROJETOS = process.env['PROJETOS_URL'] ?? 'http://localhost:3002';
const NOTIFICACOES = process.env['NOTIFICACOES_URL'] ?? 'http://localhost:3003';
const MQ = process.env['MQ_URL'] ?? 'http://localhost:15672';
const SAUDE = [API, 'http://localhost:3001', PROJETOS, NOTIFICACOES];

const PRODUTOR = { id: `e2e-${Date.now().toString(36)}`, nome: 'Paula Lima', email: 'paula@produtora.test' };

function verificar(condicao: unknown, mensagem: string): void {
    if (!condicao) throw new Error(`Falhou: ${mensagem}`);
    console.log(`  ok - ${mensagem}`);
}

async function chamar(metodo: string, url: string, corpo?: unknown, cabecalhos: Record<string, string> = {}) {
    const resposta = await fetch(url, {
        method: metodo,
        headers: { ...(corpo ? { 'Content-Type': 'application/json' } : {}), ...cabecalhos },
        ...(corpo ? { body: JSON.stringify(corpo) } : {})
    });
    return { status: resposta.status, json: (await resposta.json()) as any };
}

/** As notificações são assíncronas (fila): tenta por até 15 s. */
async function aguardarNotificacao(titulo: string): Promise<boolean> {
    for (let i = 0; i < 30; i++) {
        const { json } = await chamar('GET', `${NOTIFICACOES}/notificacoes/${PRODUTOR.id}`);
        if (json.some((m: { titulo: string }) => m.titulo === titulo)) return true;
        await esperar(500);
    }
    return false;
}

async function main(): Promise<void> {
    console.log(`E2E dos containers em ${process.platform} (Node ${process.version})`);

    for (const base of SAUDE) {
        const saude = await chamar('GET', `${base}/health`);
        verificar(saude.status === 200 && saude.json.dependencias.banco === 'ok' && saude.json.dependencias.mensageria === 'ok',
            `${base}/health (banco e RabbitMQ ok)`);
    }

    const prazo = new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10);
    const criado = await chamar('POST', `${API}/projetos/recomendacoes`, {
        titulo: 'Curta E2E',
        produtor: PRODUTOR,
        orcamento: 600_000,
        prazo,
        localizacao: { cidade: 'São Paulo', uf: 'SP' },
        papeisObrigatorios: [
            { papel: 'DIRETOR', peso: 3 },
            { papel: 'EDITOR', peso: 1 }
        ]
    });
    verificar(criado.status === 201 && criado.json.equipeRecomendada.membros.length === 2,
        'POST /projetos/recomendacoes: recomendação processada com profissionais consultados via RabbitMQ');
    const projetoId: string = criado.json.projeto.id;

    const registrado = await chamar('GET', `${PROJETOS}/projetos/${projetoId}`);
    verificar(registrado.status === 200 && registrado.json.titulo === 'Curta E2E', 'projeto registrado no cinebridge-projetos (projetos-db)');
    verificar(await aguardarNotificacao('Projeto registrado'), 'cinebridge-notificacoes recebeu PROJETO_CRIADO de eventos-projetos');

    for (const papel of ['DIRETOR', 'EDITOR']) {
        const convite = await chamar('POST', `${API}/projetos/${projetoId}/membros/${papel}/aceitar`);
        const resposta = await chamar('POST', `${API}/convites/${convite.json.id}/resposta`, { aceito: true });
        verificar(resposta.json.status === 'ACEITO', `convite de ${papel} aceito`);
    }
    const final = await chamar('GET', `${API}/projetos/${projetoId}`);
    verificar(final.json.equipe.status === 'FORMADA', 'equipe formada');
    verificar(await aguardarNotificacao('Projeto finalizado'), 'cinebridge-notificacoes recebeu PROJETO_FINALIZADO');
    verificar(await aguardarNotificacao('Convite aceito'), 'aceite de convite notificado ao produtor');

    const mensagens = await chamar('GET', `${API}/mensagens/${PRODUTOR.id}`);
    verificar(mensagens.status === 200 && mensagens.json.length >= 3, 'GET /mensagens na API lê a caixa do serviço de notificações');

    const auth = { Authorization: `Basic ${Buffer.from('guest:guest').toString('base64')}` };
    const filas = await chamar('GET', `${MQ}/api/queues`, undefined, auth);
    const nomes = new Set(filas.json.map((f: { name: string }) => f.name));
    const esperadas = ['consulta-profissionais', 'comandos-projetos', 'eventos-projetos', 'envio-notificacoes', 'consulta-notificacoes'];
    verificar(esperadas.every((f) => nomes.has(f)), `filas no painel do RabbitMQ: ${esperadas.join(', ')}`);
    const duraveis = filas.json.filter((f: { name: string }) => esperadas.includes(f.name)).every((f: { durable: boolean }) => f.durable);
    verificar(duraveis, 'filas de trabalho duráveis');

    console.log('E2E OK');
}

main().catch((erro: unknown) => {
    console.error(erro);
    process.exit(1);
});
