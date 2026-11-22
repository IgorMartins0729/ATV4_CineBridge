import type { VisitanteProjeto } from '../../domain/visitors/VisitanteProjeto.js';

/**
 * Validador de um tipo de projeto (Visitor).
 * visitarProjeto: o projeto cumpre as regras do tipo? visitarProfissional: o profissional é apto para o tipo?
 */
export interface ValidadorProjeto extends VisitanteProjeto<boolean> {
    getProblemas(): readonly string[];
}
