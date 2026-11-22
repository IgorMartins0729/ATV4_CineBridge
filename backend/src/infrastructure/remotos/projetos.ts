import { criarEvento, TipoEvento } from '../../application/eventos/EventoRecomendacao.js';
import type { IConviteRepository } from '../../application/ports/IConviteRepository.js';
import { FILAS, type IMensageria } from '../../application/ports/IMensageria.js';
import type { IProjetoRepository } from '../../application/ports/IProjetoRepository.js';
import type { Convite } from '../../domain/entities/Convite.js';
import type { Projeto } from '../../domain/entities/Projeto.js';
import { ValidacaoError } from '../../domain/erros.js';
import {
    conviteDeJson,
    conviteParaJson,
    projetoDeJson,
    projetoParaJson,
    type ConviteJson,
    type ProjetoJson
} from '../serializacao/json.js';

const pedir = <R>(mensageria: IMensageria, operacao: string, args: unknown): Promise<R> =>
    mensageria.requisitar<R>(FILAS.comandosProjetos, { operacao, args });

/** Adapter do lado do cinebridge-api: projetos ficam no cinebridge-projetos, acessado pela fila "comandos-projetos". */
export class ProjetoRepositoryRemoto implements IProjetoRepository {
    constructor(private readonly mensageria: IMensageria) {}

    public async salvar(projeto: Projeto): Promise<void> {
        await pedir(this.mensageria, 'salvarProjeto', projetoParaJson(projeto));
    }

    public async buscarPorId(id: string): Promise<Projeto | null> {
        const json = await pedir<ProjetoJson | null>(this.mensageria, 'buscarProjeto', { id });
        return json ? projetoDeJson(json) : null;
    }
}

export class ConviteRepositoryRemoto implements IConviteRepository {
    constructor(private readonly mensageria: IMensageria) {}

    public async salvar(convite: Convite): Promise<void> {
        await pedir(this.mensageria, 'salvarConvite', conviteParaJson(convite));
    }

    public async buscarPorId(id: string): Promise<Convite | null> {
        const json = await pedir<ConviteJson | null>(this.mensageria, 'buscarConvite', { id });
        return json ? conviteDeJson(json) : null;
    }

    public async listarPorProjeto(projetoId: string): Promise<Convite[]> {
        return (await pedir<ConviteJson[]>(this.mensageria, 'listarConvites', { projetoId })).map(conviteDeJson);
    }
}

/** Qual evento o salvamento gera: criado (novo), finalizado (a equipe acabou de ser formada) ou atualizado. */
function tipoDoEvento(anterior: Projeto | null, atual: Projeto): TipoEvento.PROJETO_CRIADO | TipoEvento.PROJETO_ATUALIZADO | TipoEvento.PROJETO_FINALIZADO {
    if (!anterior) return TipoEvento.PROJETO_CRIADO;
    const formadaAgora = atual.getEquipe()?.estaFormada() === true && anterior.getEquipe()?.estaFormada() !== true;
    return formadaAgora ? TipoEvento.PROJETO_FINALIZADO : TipoEvento.PROJETO_ATUALIZADO;
}

/**
 * Lado do cinebridge-projetos: atende "comandos-projetos" e, a cada projeto gravado,
 * publica o evento de ciclo de vida em "eventos-projetos" (consumido pelo cinebridge-notificacoes).
 */
export async function atenderComandosProjetos(
    mensageria: IMensageria,
    projetos: IProjetoRepository,
    convites: IConviteRepository
): Promise<void> {
    await mensageria.responder(FILAS.comandosProjetos, async ({ operacao, args }) => {
        switch (operacao) {
            case 'salvarProjeto': {
                const projeto = projetoDeJson(args as ProjetoJson);
                const anterior = await projetos.buscarPorId(projeto.getId());
                await projetos.salvar(projeto);
                const dados = {
                    projetoId: projeto.getId(),
                    titulo: projeto.getTitulo(),
                    produtor: { ...projeto.getProdutor() },
                    tipoProjeto: projeto.getTipo()
                };
                await mensageria.publicar(FILAS.eventosProjetos, criarEvento(tipoDoEvento(anterior, projeto), dados, 'cinebridge-projetos'));
                return null;
            }
            case 'buscarProjeto': {
                const projeto = await projetos.buscarPorId((args as { id: string }).id);
                return projeto ? projetoParaJson(projeto) : null;
            }
            case 'salvarConvite':
                await convites.salvar(conviteDeJson(args as ConviteJson));
                return null;
            case 'buscarConvite': {
                const convite = await convites.buscarPorId((args as { id: string }).id);
                return convite ? conviteParaJson(convite) : null;
            }
            case 'listarConvites':
                return (await convites.listarPorProjeto((args as { projetoId: string }).projetoId)).map(conviteParaJson);
            default:
                throw new ValidacaoError(`Operação desconhecida em ${FILAS.comandosProjetos}: ${operacao}`);
        }
    });
}
