import type { Projeto } from '../../../domain/entities/Projeto.js';
import { ProjetoAnimacao, type TecnicaAnimacao } from '../../../domain/entities/projetos/ProjetoAnimacao.js';
import { GeradorRelatorio } from '../../visitors/GeradorRelatorio.js';
import { ValidadorAnimacao } from './ValidadorAnimacao.js';

export interface ParametrosRender {
    quadrosPorSegundo: number;
    /** Tempo médio de render de um quadro, em minutos (0 = sem render digital). */
    minutosRenderPorQuadro: number;
}

/** Referências usadas na estimativa. São médias de mercado simplificadas, não uma medição. */
export const PARAMETROS_RENDER: Readonly<Record<TecnicaAnimacao, ParametrosRender>> = {
    '2D': { quadrosPorSegundo: 24, minutosRenderPorQuadro: 0.5 },
    '3D': { quadrosPorSegundo: 24, minutosRenderPorQuadro: 4 },
    STOP_MOTION: { quadrosPorSegundo: 12, minutosRenderPorQuadro: 0 }
};

/** Uma equipe com nível 10 em animação 3D reduz o tempo de render em até 50% (pipeline e otimização de cena). */
export const GANHO_MAXIMO_EQUIPE = 0.5;

export interface MetricasRender {
    quadros: number;
    horasBase: number;
    /** 0 a 1: nível médio da equipe em animação 3D / 10. */
    eficienciaEquipe: number;
    horasEstimadas: number;
}

export function estimarRender(projeto: ProjetoAnimacao, nivelMedioAnimacao3d: number | null): MetricasRender {
    const { quadrosPorSegundo, minutosRenderPorQuadro } = PARAMETROS_RENDER[projeto.getTecnica()];
    const quadros = Math.round(projeto.getDuracao() * 60 * quadrosPorSegundo);
    const horasBase = (quadros * minutosRenderPorQuadro) / 60;
    const eficienciaEquipe = Math.max(0, Math.min(1, (nivelMedioAnimacao3d ?? 0) / 10));
    return { quadros, horasBase, eficienciaEquipe, horasEstimadas: horasBase * (1 - GANHO_MAXIMO_EQUIPE * eficienciaEquipe) };
}

const horas = (valor: number): string => `${Math.round(valor).toLocaleString('pt-BR')} h`;

/** Relatório da animação: técnica, pipeline e métricas de eficiência de renderização. */
export class RelatorioAnimacao extends GeradorRelatorio {
    constructor() {
        super(new ValidadorAnimacao());
    }

    protected override secaoDoTipo(projeto: Projeto): string[] {
        if (!(projeto instanceof ProjetoAnimacao)) return [];
        const metricas = estimarRender(projeto, this.mediaDaEquipe(projeto, 'animacao3d'));
        const { quadrosPorSegundo } = PARAMETROS_RENDER[projeto.getTecnica()];
        const linhas = [
            `Técnica: ${projeto.getTecnica()} | Pipeline: ${projeto.getSoftwares().join(', ') || 'a definir'}`,
            `Quadros: ${metricas.quadros.toLocaleString('pt-BR')} (${quadrosPorSegundo} qps)`
        ];
        if (metricas.horasBase === 0) {
            return [...linhas, 'Render: sem render digital (quadros capturados em set)'];
        }
        return [
            ...linhas,
            `Eficiência de render da equipe: ${Math.round(metricas.eficienciaEquipe * 100)}% (nível médio em animação 3D)`,
            `Render estimado: ${horas(metricas.horasEstimadas)} (sem o ganho da equipe: ${horas(metricas.horasBase)})`
        ];
    }
}
