import { Competencia } from '../../../domain/entities/Competencia.js';
import { Papel } from '../../../domain/enums/Papel.js';

/** Cargo (em inglês, como nas plataformas) -> papel. A ordem importa: "director of photography" antes de "director". */
const PAPEL_POR_CARGO: ReadonlyArray<[RegExp, Papel]> = [
    [/director of photography|cinematographer|\bdop\b/i, Papel.DIRETOR_FOTOGRAFIA],
    [/director/i, Papel.DIRETOR],
    [/editor/i, Papel.EDITOR],
    [/sound|audio/i, Papel.SONOPLASTA],
    [/writer/i, Papel.ROTEIRISTA],
    [/vfx|visual effects|animator|3d/i, Papel.EFEITOS_VISUAIS]
];

/** Termo usado para buscar cada papel nas plataformas externas. */
export const TERMO_BUSCA_POR_PAPEL: Readonly<Record<Papel, string>> = {
    [Papel.DIRETOR]: 'director',
    [Papel.DIRETOR_FOTOGRAFIA]: 'photography',
    [Papel.EDITOR]: 'editor',
    [Papel.SONOPLASTA]: 'sound',
    [Papel.ROTEIRISTA]: 'writer',
    [Papel.EFEITOS_VISUAIS]: 'vfx'
};

/** Habilidade da plataforma -> competência do catálogo do CineBridge (perfisCompetencia). */
const COMPETENCIA_POR_HABILIDADE: Readonly<Record<string, string>> = {
    directing: 'direcao',
    cinematography: 'fotografia',
    lighting: 'iluminacao',
    'video editing': 'montagem',
    'color grading': 'colorizacao',
    'audio mixing': 'mixagem',
    'sound design': 'audio',
    screenwriting: 'roteiro',
    research: 'pesquisa',
    'visual effects': 'efeitos',
    '3d animation': 'animacao3d',
    documentary: 'documentario',
    fiction: 'ficcao',
    animation: 'animacao'
};

export function papeisDosCargos(cargos: readonly string[]): Papel[] {
    const papeis = cargos.flatMap((cargo) => {
        const achado = PAPEL_POR_CARGO.find(([padrao]) => padrao.test(cargo));
        return achado ? [achado[1]] : [];
    });
    return [...new Set(papeis)];
}

/** Habilidades que o CineBridge não conhece são ignoradas (não entram no vetor de competências). */
export function competencias(habilidades: ReadonlyArray<{ nome: string; nivel: number }>): Competencia[] {
    return habilidades.flatMap(({ nome, nivel }) => {
        const competencia = COMPETENCIA_POR_HABILIDADE[nome.trim().toLowerCase()];
        return competencia ? [new Competencia(competencia, nivel)] : [];
    });
}

/** Separa o id da fonte ("linkedin:ACoAA1" -> "ACoAA1"); null se o id for de outra fonte. */
export function idExterno(prefixo: string, id: string): string | null {
    return id.startsWith(`${prefixo}:`) ? id.slice(prefixo.length + 1) : null;
}

/** Nota do CineBridge (0 a 5, com decimais) -> estrelas inteiras de 1 a 5 das plataformas. */
export function estrelas(nota: number): 1 | 2 | 3 | 4 | 5 {
    return Math.min(5, Math.max(1, Math.round(nota))) as 1 | 2 | 3 | 4 | 5;
}
