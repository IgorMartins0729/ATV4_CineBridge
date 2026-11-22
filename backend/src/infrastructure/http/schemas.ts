import { Papel } from '../../domain/enums/Papel.js';
import { TipoCaptacao } from '../../domain/enums/TipoCaptacao.js';
import { TipoProjeto } from '../../domain/enums/TipoProjeto.js';

/** JSON Schemas usados pelo Fastify para validar a entrada antes de chegar aos controllers. */

const data = { type: 'string', anyOf: [{ format: 'date' }, { format: 'date-time' }] } as const;
const papel = { type: 'string', enum: Object.values(Papel) } as const;

export const schemaNovoProjeto = {
    body: {
        type: 'object',
        additionalProperties: false,
        // Só o essencial é obrigatório: o resto vem do protótipo (modelo) do tipo de projeto.
        required: ['titulo', 'produtor', 'orcamento', 'prazo', 'localizacao'],
        properties: {
            tipoProjeto: { type: 'string', enum: Object.values(TipoProjeto) },
            modelo: { type: 'string', minLength: 1 },
            especificos: { type: 'object' },
            titulo: { type: 'string', minLength: 1, maxLength: 200 },
            produtor: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'nome', 'email'],
                properties: {
                    id: { type: 'string', minLength: 1 },
                    nome: { type: 'string', minLength: 1 },
                    email: { type: 'string', format: 'email' }
                }
            },
            genero: { type: 'string', minLength: 1 },
            duracao: { type: 'number', exclusiveMinimum: 0 },
            orcamento: { type: 'number', exclusiveMinimum: 0 },
            prazo: data,
            tipoCaptacao: { type: 'string', enum: Object.values(TipoCaptacao) },
            localizacao: {
                type: 'object',
                additionalProperties: false,
                required: ['cidade', 'uf'],
                properties: {
                    cidade: { type: 'string', minLength: 1 },
                    uf: { type: 'string', pattern: '^[A-Za-z]{2}$' }
                }
            },
            // Composite: a estrutura recursiva é validada no domínio (servicoDeJson + validar()).
            servicoPrincipal: { type: 'object' },
            papeisObrigatorios: {
                type: 'array',
                minItems: 1,
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['papel', 'peso'],
                    properties: { papel, peso: { type: 'number', exclusiveMinimum: 0 } }
                }
            },
            estrategia: { type: 'string', minLength: 1 }
        }
    }
} as const;

export interface CorpoNovoProjeto {
    tipoProjeto?: TipoProjeto;
    modelo?: string;
    especificos?: Record<string, unknown>;
    titulo: string;
    produtor: { id: string; nome: string; email: string };
    genero?: string;
    duracao?: number;
    orcamento: number;
    prazo: string;
    tipoCaptacao?: TipoCaptacao;
    localizacao: { cidade: string; uf: string };
    servicoPrincipal?: unknown;
    papeisObrigatorios?: Array<{ papel: Papel; peso: number }>;
    estrategia?: string;
}

const paramsProjeto = {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', minLength: 1 } }
} as const;

const paramsMembro = {
    type: 'object',
    required: ['id', 'papel'],
    properties: { id: { type: 'string', minLength: 1 }, papel }
} as const;

export const schemaProjetoPorId = { params: paramsProjeto } as const;

export const schemaNovaRecomendacao = {
    params: paramsProjeto,
    body: {
        type: ['object', 'null'],
        additionalProperties: false,
        properties: { estrategia: { type: 'string', minLength: 1 } }
    }
} as const;

export const schemaMembro = { params: paramsMembro } as const;

export const schemaSubstituicao = {
    params: paramsMembro,
    body: {
        type: ['object', 'null'],
        additionalProperties: false,
        properties: { profissionalId: { type: 'string', minLength: 1 } }
    }
} as const;

export const schemaRestricoes = {
    params: paramsProjeto,
    body: {
        type: 'object',
        additionalProperties: false,
        minProperties: 1,
        properties: {
            orcamento: { type: 'number', exclusiveMinimum: 0 },
            prazo: data,
            forcarReavaliacao: { type: 'boolean' }
        }
    }
} as const;

export const schemaConvitePorId = {
    params: { type: 'object', required: ['id'], properties: { id: { type: 'string', minLength: 1 } } }
} as const;

export const schemaRespostaConvite = {
    params: schemaConvitePorId.params,
    body: {
        type: 'object',
        additionalProperties: false,
        required: ['aceito'],
        properties: { aceito: { type: 'boolean' } }
    }
} as const;

export const schemaPreferenciaDecoradores = {
    params: { type: 'object', required: ['id'], properties: { id: { type: 'string', minLength: 1 } } },
    body: {
        type: 'object',
        additionalProperties: false,
        required: ['decoradores'],
        properties: { decoradores: { type: 'array', maxItems: 10, items: { type: 'string' } } }
    }
} as const;

export const schemaModelos = {
    querystring: {
        type: 'object',
        additionalProperties: false,
        properties: { tipoProjeto: { type: 'string', enum: Object.values(TipoProjeto) } }
    }
} as const;
