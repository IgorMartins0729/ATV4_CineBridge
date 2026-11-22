import type { Profissional } from '../../../domain/entities/Profissional.js';
import type { Projeto } from '../../../domain/entities/Projeto.js';
import type { Papel } from '../../../domain/enums/Papel.js';
import type { ILogger } from '../../ports/ILogger.js';
import type { RecomendacaoStrategy } from '../RecomendacaoStrategy.js';
import { RecomendadorDecorator } from './RecomendadorDecorator.js';

export interface RegistroChamada {
    estrategia: string;
    projetoId: string;
    candidatos: number;
    recomendados: number;
    duracaoMs: number;
    sucesso: boolean;
    erro?: string;
    em: Date;
}

export interface OpcoesAuditoria {
    /** Quantos registros manter em memória (os mais antigos saem). O log estruturado guarda todos. */
    capacidade?: number;
    /** Relógio em milissegundos de alta resolução, injetável nos testes. */
    cronometro?: () => number;
}

/** Decorator: registra cada chamada ao recomendador, com o tempo de resposta e o resultado. */
export class AuditoriaDecorator extends RecomendadorDecorator {
    private readonly logger: ILogger;
    private readonly capacidade: number;
    private readonly cronometro: () => number;
    private readonly registros: RegistroChamada[] = [];

    constructor(interno: RecomendacaoStrategy, logger: ILogger, opcoes: OpcoesAuditoria = {}) {
        super(interno);
        this.logger = logger;
        this.capacidade = opcoes.capacidade ?? 1_000;
        this.cronometro = opcoes.cronometro ?? (() => performance.now());
    }

    public recomendar(projeto: Projeto, profissionais: readonly Profissional[]): Map<Papel, Profissional[]> {
        const inicio = this.cronometro();
        const base = { estrategia: this.nome, projetoId: projeto.getId(), candidatos: profissionais.length };
        try {
            const resultado = this.interno.recomendar(projeto, profissionais);
            const recomendados = [...resultado.values()].reduce((total, lista) => total + lista.length, 0);
            this.registrar({ ...base, recomendados, duracaoMs: this.cronometro() - inicio, sucesso: true, em: new Date() });
            return resultado;
        } catch (erro) {
            const mensagem = erro instanceof Error ? erro.message : String(erro);
            this.registrar({
                ...base,
                recomendados: 0,
                duracaoMs: this.cronometro() - inicio,
                sucesso: false,
                erro: mensagem,
                em: new Date()
            });
            throw erro;
        }
    }

    public getRegistros(): readonly RegistroChamada[] {
        return this.registros;
    }

    private registrar(registro: RegistroChamada): void {
        this.registros.push(registro);
        if (this.registros.length > this.capacidade) this.registros.shift();
        const { em: _em, ...contexto } = registro;
        if (registro.sucesso) this.logger.info('Chamada ao recomendador', contexto);
        else this.logger.warn('Chamada ao recomendador falhou', contexto);
    }
}
