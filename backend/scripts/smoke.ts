import { spawn } from 'node:child_process';
import { setTimeout as esperar } from 'node:timers/promises';

/**
 * Smoke test: sobe o servidor compilado (dist/server.js), chama a API real e derruba o servidor.
 * Não depende de shell: roda igual no Windows e no Ubuntu (usado no CI). Uso: npm run build && npm run smoke
 */

const PORTA = Number(process.env['PORT'] ?? 3456);
const BASE = `http://127.0.0.1:${PORTA}`;

const servidor = spawn(process.execPath, ['dist/server.js'], {
    env: { ...process.env, PORT: String(PORTA), HOST: '127.0.0.1', PROFISSIONAIS_MEMORIA: '2000', LOG_LEVEL: 'warn' },
    stdio: ['ignore', 'inherit', 'inherit']
});

function verificar(condicao: unknown, mensagem: string): void {
    if (!condicao) throw new Error(`Falhou: ${mensagem}`);
    console.log(`  ok - ${mensagem}`);
}

async function chamar(metodo: string, caminho: string, corpo?: unknown): Promise<{ status: number; json: any }> {
    const resposta = await fetch(`${BASE}${caminho}`, {
        method: metodo,
        ...(corpo ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) } : {})
    });
    return { status: resposta.status, json: await resposta.json() };
}

async function aguardarServidor(): Promise<void> {
    for (let tentativa = 0; tentativa < 60; tentativa++) {
        try {
            if ((await fetch(`${BASE}/health`)).ok) return;
        } catch {
            // ainda subindo
        }
        await esperar(500);
    }
    throw new Error('o servidor não respondeu em 30 s');
}

async function main(): Promise<void> {
    console.log(`Smoke test em ${process.platform} (Node ${process.version})`);
    await aguardarServidor();

    const saude = await chamar('GET', '/health');
    verificar(saude.status === 200 && saude.json.profissionaisCadastrados === 2000, 'GET /health');

    const modelos = await chamar('GET', '/modelos');
    verificar(modelos.status === 200 && modelos.json.length >= 4, `GET /modelos (${modelos.json.length} modelos)`);

    const prazo = new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10);
    const exemplos: Array<[string, Record<string, unknown>, string]> = [
        ['geral', {}, 'similaridade-cosseno'],
        ['documentario', { tema: 'Seca no Nordeste', entrevistados: ['Dona Maria'] }, 'recomendador-documentario'],
        ['animacao', { softwares: ['Blender'] }, 'recomendador-animacao'],
        ['publicidade-tv', { cliente: 'Café Bom' }, 'recomendador-publicitario']
    ];
    for (const [modelo, especificos, recomendador] of exemplos) {
        const criado = await chamar('POST', '/projetos/recomendacoes', {
            modelo,
            especificos,
            titulo: `Smoke ${modelo}`,
            produtor: { id: 'smoke', nome: 'Smoke Test', email: 'smoke@cinebridge.test' },
            orcamento: 600_000,
            prazo,
            localizacao: { cidade: 'São Paulo', uf: 'SP' }
        });
        verificar(
            criado.status === 201 && criado.json.recomendacao.estrategia === recomendador,
            `POST /projetos/recomendacoes modelo=${modelo} -> ${recomendador}`
        );
        const relatorio = await chamar('GET', `/projetos/${criado.json.projeto.id}/relatorio`);
        verificar(
            relatorio.status === 200 && relatorio.json.tipoProjeto === criado.json.projeto.tipoProjeto,
            `GET /projetos/:id/relatorio (${relatorio.json.tipoProjeto})`
        );
    }

    // ATV III: Composite (hierarquia de serviços), Decorator (pilha ativa) e Adapter (provedores em uso).
    const composto = await chamar('POST', '/projetos/recomendacoes', {
        titulo: 'Smoke composite',
        produtor: { id: 'smoke', nome: 'Smoke Test', email: 'smoke@cinebridge.test' },
        orcamento: 600_000,
        prazo,
        localizacao: { cidade: 'São Paulo', uf: 'SP' },
        servicoPrincipal: {
            nome: 'Curta',
            subservicos: [
                { nome: 'Direção', papel: 'DIRETOR', custo: 40_000, prazo: 20, peso: 3 },
                {
                    nome: 'Pós-produção',
                    paralelo: true,
                    subservicos: [
                        { nome: 'Edição', papel: 'EDITOR', custo: 10_000, prazo: 15 },
                        { nome: 'Mixagem', papel: 'SONOPLASTA', custo: 6_000, prazo: 10 }
                    ]
                }
            ]
        }
    });
    verificar(
        composto.status === 201 && composto.json.projeto.custoEstimado === 56_000 && composto.json.projeto.prazoServicosDias === 35,
        'POST /projetos/recomendacoes com servicoPrincipal (custo 56.000, 35 dias)'
    );
    const estrategias = await chamar('GET', '/estrategias');
    verificar(
        estrategias.status === 200 && estrategias.json.decoradores.length > 0 && estrategias.json.integracoes.pagamento,
        `GET /estrategias (decoradores: ${estrategias.json.decoradores.join(' > ')}; pagamento: ${estrategias.json.integracoes.pagamento})`
    );
}

main()
    .then(() => {
        console.log('Smoke test OK');
        process.exitCode = 0;
    })
    .catch((erro: unknown) => {
        console.error(erro instanceof Error ? erro.message : erro);
        process.exitCode = 1;
    })
    .finally(() => servidor.kill());
