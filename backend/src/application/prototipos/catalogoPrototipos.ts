import { Projeto, type ProjetoProps } from '../../domain/entities/Projeto.js';
import { ProjetoAnimacao } from '../../domain/entities/projetos/ProjetoAnimacao.js';
import { ProjetoDocumentario } from '../../domain/entities/projetos/ProjetoDocumentario.js';
import { ProjetoPublicitario } from '../../domain/entities/projetos/ProjetoPublicitario.js';
import { Papel } from '../../domain/enums/Papel.js';
import { TipoCaptacao } from '../../domain/enums/TipoCaptacao.js';
import { Localizacao } from '../../domain/value-objects/Localizacao.js';
import { PacoteServico } from '../../domain/servicos/PacoteServico.js';
import { ServicoAtomico } from '../../domain/servicos/ServicoAtomico.js';
import type { ServicoProjeto } from '../../domain/servicos/ServicoProjeto.js';
import { RegistroPrototipos } from './RegistroPrototipos.js';

/** Atalhos para montar as hierarquias de serviços dos modelos (Composite). */
function servico(nome: string, papel: Papel, peso: number, custo: number, prazo: number): ServicoAtomico {
    return new ServicoAtomico({ nome, papel, peso, custo, prazo });
}
function etapas(nome: string, ...subservicos: ServicoProjeto[]): PacoteServico {
    return new PacoteServico({ nome, subservicos });
}
function simultaneos(nome: string, ...subservicos: ServicoProjeto[]): PacoteServico {
    return new PacoteServico({ nome, subservicos, paralelo: true });
}

/**
 * Modelos pré-configurados de cada tipo (Prototype). Título, produtor, orçamento, prazo e local
 * são só marcadores: a fábrica sempre substitui esses dados ao clonar.
 * Custos (R$) e prazos (dias) dos serviços são estimativas de referência que o produtor pode trocar.
 */
function base(servicoPrincipal: ServicoProjeto, genero: string, duracao: number): Omit<ProjetoProps, 'tipoCaptacao'> {
    return {
        id: 'modelo',
        titulo: 'Modelo',
        produtor: { id: 'cinebridge', nome: 'CineBridge', email: 'modelos@cinebridge.local' },
        genero,
        duracao,
        orcamento: 1,
        prazo: new Date('2100-01-01T00:00:00Z'),
        localizacao: new Localizacao('São Paulo', 'SP'),
        servicoPrincipal
    };
}

export const PROTOTIPOS = {
    geral: (): Projeto =>
        new Projeto({
            ...base(
                etapas(
                    'Longa de ficção',
                    simultaneos(
                        'Filmagem',
                        servico('Direção', Papel.DIRETOR, 3, 40_000, 30),
                        servico('Direção de fotografia', Papel.DIRETOR_FOTOGRAFIA, 2, 30_000, 30),
                        servico('Roteiro de filmagem', Papel.ROTEIRISTA, 2, 20_000, 20)
                    ),
                    simultaneos(
                        'Pós-produção',
                        servico('Edição', Papel.EDITOR, 1, 15_000, 25),
                        servico('Mixagem de áudio', Papel.SONOPLASTA, 1, 10_000, 15)
                    )
                ),
                'drama',
                90
            ),
            tipoCaptacao: TipoCaptacao.FICCAO
        }),
    documentario: (): ProjetoDocumentario =>
        new ProjetoDocumentario({
            ...base(
                etapas(
                    'Documentário',
                    simultaneos(
                        'Pesquisa e captação',
                        servico('Direção', Papel.DIRETOR, 3, 35_000, 30),
                        servico('Pesquisa e roteiro', Papel.ROTEIRISTA, 3, 18_000, 25),
                        servico('Fotografia', Papel.DIRETOR_FOTOGRAFIA, 2, 20_000, 20),
                        servico('Som direto', Papel.SONOPLASTA, 2, 10_000, 20)
                    ),
                    servico('Montagem', Papel.EDITOR, 2, 15_000, 30)
                ),
                'documentario',
                70
            ),
            tema: 'A definir',
            entrevistados: []
        }),
    animacao: (): ProjetoAnimacao =>
        new ProjetoAnimacao({
            ...base(
                etapas(
                    'Animação 3D',
                    simultaneos(
                        'Pré-produção',
                        servico('Direção', Papel.DIRETOR, 3, 45_000, 20),
                        servico('Roteiro e storyboard', Papel.ROTEIRISTA, 2, 20_000, 20)
                    ),
                    servico('Modelagem, animação e render', Papel.EFEITOS_VISUAIS, 3, 60_000, 45),
                    simultaneos(
                        'Pós-produção',
                        servico('Edição', Papel.EDITOR, 1, 12_000, 15),
                        servico('Trilha e efeitos sonoros', Papel.SONOPLASTA, 1, 10_000, 15)
                    )
                ),
                'animacao',
                80
            ),
            tecnica: '3D',
            softwares: ['Blender']
        }),
    publicitario: (): ProjetoPublicitario =>
        new ProjetoPublicitario({
            ...base(
                etapas(
                    'Peça publicitária',
                    simultaneos(
                        'Filmagem',
                        servico('Direção', Papel.DIRETOR, 3, 15_000, 3),
                        servico('Fotografia', Papel.DIRETOR_FOTOGRAFIA, 2, 10_000, 3)
                    ),
                    simultaneos(
                        'Finalização',
                        servico('Edição', Papel.EDITOR, 2, 6_000, 5),
                        servico('Sonorização', Papel.SONOPLASTA, 1, 3_000, 3)
                    )
                ),
                'publicidade',
                1
            ),
            cliente: 'A definir',
            veiculacao: ['internet']
        }),
    // Variações: começam como clone de um modelo e só ajustam o que muda.
    'documentario-curta': (): ProjetoDocumentario =>
        PROTOTIPOS.documentario().clonar({
            duracao: 20,
            servicoPrincipal: etapas(
                'Documentário curta',
                simultaneos(
                    'Captação',
                    servico('Direção', Papel.DIRETOR, 3, 12_000, 10),
                    servico('Pesquisa e roteiro', Papel.ROTEIRISTA, 2, 6_000, 10)
                ),
                servico('Montagem', Papel.EDITOR, 1, 5_000, 10)
            )
        }),
    'animacao-stop-motion': (): ProjetoAnimacao =>
        PROTOTIPOS.animacao().clonar({
            duracao: 12,
            tecnica: 'STOP_MOTION',
            softwares: ['Dragonframe'],
            servicoPrincipal: etapas(
                'Stop-motion',
                simultaneos(
                    'Set e captura quadro a quadro',
                    servico('Direção', Papel.DIRETOR, 3, 25_000, 40),
                    servico('Bonecos e efeitos', Papel.EFEITOS_VISUAIS, 2, 20_000, 40),
                    servico('Fotografia e iluminação de set', Papel.DIRETOR_FOTOGRAFIA, 2, 15_000, 40)
                ),
                servico('Edição', Papel.EDITOR, 1, 8_000, 10)
            )
        }),
    'publicidade-tv': (): ProjetoPublicitario =>
        PROTOTIPOS.publicitario().clonar({
            duracao: 0.5,
            veiculacao: ['TV'],
            servicoPrincipal: etapas(
                'Comercial de TV',
                simultaneos(
                    'Filmagem',
                    servico('Direção', Papel.DIRETOR, 3, 30_000, 3),
                    servico('Fotografia', Papel.DIRETOR_FOTOGRAFIA, 3, 25_000, 3)
                ),
                simultaneos(
                    'Pós-produção',
                    servico('Edição', Papel.EDITOR, 2, 10_000, 5),
                    servico('Efeitos visuais', Papel.EFEITOS_VISUAIS, 1, 15_000, 7),
                    servico('Mixagem', Papel.SONOPLASTA, 1, 5_000, 3)
                )
            )
        })
} as const;

export type NomeModelo = keyof typeof PROTOTIPOS;

const DESCRICOES: Readonly<Record<NomeModelo, string>> = {
    geral: 'Ficção/longa-metragem: direção, fotografia, roteiro, edição e som',
    documentario: 'Documentário de longa duração, com pesquisa, entrevistas e som direto',
    animacao: 'Animação 3D (Blender) com direção, efeitos visuais e roteiro',
    publicitario: 'Peça publicitária de 1 minuto para internet',
    'documentario-curta': 'Documentário curta (20 min) com equipe enxuta: direção, roteiro/pesquisa e edição',
    'animacao-stop-motion': 'Curta em stop-motion (Dragonframe) com fotografia e iluminação de set',
    'publicidade-tv': 'Comercial de 30 segundos para TV, com acabamento visual completo'
};

export function criarRegistroPrototipos(): RegistroPrototipos {
    const registro = new RegistroPrototipos();
    for (const [nome, criar] of Object.entries(PROTOTIPOS)) {
        registro.registrar(nome, criar(), DESCRICOES[nome as NomeModelo]);
    }
    return registro;
}
