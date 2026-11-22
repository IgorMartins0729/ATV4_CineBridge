import { FILAS, type IMensageria } from '../../application/ports/IMensageria.js';
import type { FiltroCandidatos, IProfissionalRepository } from '../../application/ports/IProfissionalRepository.js';
import type { Profissional } from '../../domain/entities/Profissional.js';
import { ValidacaoError } from '../../domain/erros.js';
import { profissionalDeJson, profissionalParaJson, type ProfissionalJson } from '../serializacao/json.js';

interface FiltroJson {
    papeis: FiltroCandidatos['papeis'];
    disponivelEm?: string;
    precoMaximo?: number;
    excluirIds?: string[];
}

/**
 * Adapter do lado do cinebridge-api: o mesmo IProfissionalRepository de antes, mas cada chamada vira
 * uma mensagem na fila "consulta-profissionais" e a resposta chega pela fila de retorno.
 */
export class ProfissionalRepositoryRemoto implements IProfissionalRepository {
    constructor(private readonly mensageria: IMensageria) {}

    public async listarTodos(): Promise<Profissional[]> {
        return (await this.pedir<ProfissionalJson[]>('listarTodos')).map(profissionalDeJson);
    }

    public async buscarPorId(id: string): Promise<Profissional | null> {
        const json = await this.pedir<ProfissionalJson | null>('buscarPorId', { id });
        return json ? profissionalDeJson(json) : null;
    }

    public async buscarCandidatos(filtro: FiltroCandidatos): Promise<Profissional[]> {
        const args: FiltroJson = {
            papeis: filtro.papeis,
            ...(filtro.disponivelEm ? { disponivelEm: filtro.disponivelEm.toISOString() } : {}),
            ...(filtro.precoMaximo !== undefined ? { precoMaximo: filtro.precoMaximo } : {}),
            ...(filtro.excluirIds ? { excluirIds: [...filtro.excluirIds] } : {})
        };
        return (await this.pedir<ProfissionalJson[]>('buscarCandidatos', args)).map(profissionalDeJson);
    }

    public async salvar(profissional: Profissional): Promise<void> {
        await this.pedir('salvar', profissionalParaJson(profissional));
    }

    public async contar(): Promise<number> {
        return this.pedir<number>('contar');
    }

    private pedir<R>(operacao: string, args?: unknown): Promise<R> {
        return this.mensageria.requisitar<R>(FILAS.consultaProfissionais, { operacao, args });
    }
}

/** Lado do cinebridge-profissionais: consome "consulta-profissionais", consulta o banco e responde. */
export async function atenderConsultasProfissionais(mensageria: IMensageria, repositorio: IProfissionalRepository): Promise<void> {
    await mensageria.responder(FILAS.consultaProfissionais, async ({ operacao, args }) => {
        switch (operacao) {
            case 'listarTodos':
                return (await repositorio.listarTodos()).map(profissionalParaJson);
            case 'buscarPorId': {
                const encontrado = await repositorio.buscarPorId((args as { id: string }).id);
                return encontrado ? profissionalParaJson(encontrado) : null;
            }
            case 'buscarCandidatos': {
                const { disponivelEm, ...resto } = args as FiltroJson;
                const filtro: FiltroCandidatos = { ...resto, ...(disponivelEm ? { disponivelEm: new Date(disponivelEm) } : {}) };
                return (await repositorio.buscarCandidatos(filtro)).map(profissionalParaJson);
            }
            case 'salvar':
                await repositorio.salvar(profissionalDeJson(args as ProfissionalJson));
                return null;
            case 'contar':
                return repositorio.contar();
            default:
                throw new ValidacaoError(`Operação desconhecida em ${FILAS.consultaProfissionais}: ${operacao}`);
        }
    });
}
