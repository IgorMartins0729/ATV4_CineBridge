export type Proficiencia = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';

/** Perfil no formato da API de pessoas do LinkedIn (campos em inglês, cargo em `positions`). */
export interface PerfilLinkedIn {
    id: string;
    localizedFirstName: string;
    localizedLastName: string;
    emailAddress: string;
    headline: string;
    positions: Array<{ title: string; company: string }>;
    skills: Array<{ name: string; proficiency: Proficiencia }>;
    projectRate: { min: number; max: number; currency: 'BRL' };
    openToWork: { from: string; until: string };
    location: { city: string; region: string };
    recommendations: number[];
}

export class ErroLinkedIn extends Error {
    constructor(
        public readonly status: number,
        mensagem: string
    ) {
        super(mensagem);
    }
}

const DISPONIVEL = { from: '2026-01-01', until: '2028-12-31' };

export const PERFIS_LINKEDIN_EXEMPLO: readonly PerfilLinkedIn[] = [
    {
        id: 'ACoAA1',
        localizedFirstName: 'Helena',
        localizedLastName: 'Duarte',
        emailAddress: 'helena.duarte@example.com',
        headline: 'Film Director | Documentaries',
        positions: [{ title: 'Film Director', company: 'Duarte Filmes' }],
        skills: [
            { name: 'Directing', proficiency: 'EXPERT' },
            { name: 'Screenwriting', proficiency: 'ADVANCED' },
            { name: 'Documentary', proficiency: 'EXPERT' }
        ],
        projectRate: { min: 18_000, max: 24_000, currency: 'BRL' },
        openToWork: DISPONIVEL,
        location: { city: 'Recife', region: 'PE' },
        recommendations: [5, 5, 4]
    },
    {
        id: 'ACoAA2',
        localizedFirstName: 'Caio',
        localizedLastName: 'Nunes',
        emailAddress: 'caio.nunes@example.com',
        headline: 'Director of Photography',
        positions: [{ title: 'Director of Photography', company: 'Freelancer' }],
        skills: [
            { name: 'Cinematography', proficiency: 'EXPERT' },
            { name: 'Lighting', proficiency: 'ADVANCED' }
        ],
        projectRate: { min: 12_000, max: 16_000, currency: 'BRL' },
        openToWork: DISPONIVEL,
        location: { city: 'São Paulo', region: 'SP' },
        recommendations: [4, 5]
    },
    {
        id: 'ACoAA3',
        localizedFirstName: 'Marina',
        localizedLastName: 'Teles',
        emailAddress: 'marina.teles@example.com',
        headline: 'Video Editor & Colorist',
        positions: [{ title: 'Video Editor', company: 'Pós Studio' }],
        skills: [
            { name: 'Video Editing', proficiency: 'EXPERT' },
            { name: 'Color Grading', proficiency: 'ADVANCED' }
        ],
        projectRate: { min: 7_000, max: 9_000, currency: 'BRL' },
        openToWork: DISPONIVEL,
        location: { city: 'Recife', region: 'PE' },
        recommendations: [5]
    },
    {
        id: 'ACoAA4',
        localizedFirstName: 'Rafael',
        localizedLastName: 'Lima',
        emailAddress: 'rafael.lima@example.com',
        headline: 'Sound Designer',
        positions: [{ title: 'Sound Designer', company: 'Estúdio Eco' }],
        skills: [
            { name: 'Sound Design', proficiency: 'EXPERT' },
            { name: 'Audio Mixing', proficiency: 'ADVANCED' }
        ],
        projectRate: { min: 5_000, max: 7_000, currency: 'BRL' },
        openToWork: DISPONIVEL,
        location: { city: 'Olinda', region: 'PE' },
        recommendations: [4]
    }
];

/**
 * Simula a API do LinkedIn. As assinaturas são as da `ApiProfissionalExterna` do diagrama:
 * filtros livres, perfis em formato próprio e avaliação por nota.
 */
export class ApiLinkedInSimulada {
    private readonly perfis = new Map<string, PerfilLinkedIn>();

    constructor(perfis: readonly PerfilLinkedIn[] = PERFIS_LINKEDIN_EXEMPLO) {
        for (const perfil of perfis) this.perfis.set(perfil.id, structuredClone(perfil));
    }

    /** `titles`: devolve quem tem algum cargo contendo um desses termos (sem diferenciar maiúsculas). */
    public async buscarProfissionais(filtros: { titles?: string[] }): Promise<PerfilLinkedIn[]> {
        const termos = (filtros.titles ?? []).map((t) => t.toLowerCase());
        return [...this.perfis.values()]
            .filter((p) => termos.length === 0 || p.positions.some((pos) => termos.some((t) => pos.title.toLowerCase().includes(t))))
            .map((p) => structuredClone(p));
    }

    public async obterPerfil(id: string): Promise<PerfilLinkedIn> {
        const perfil = this.perfis.get(id);
        if (!perfil) throw new ErroLinkedIn(404, `Member ${id} not found`);
        return structuredClone(perfil);
    }

    /** Recomendação de 1 a 5 estrelas. */
    public async avaliarProfissional(id: string, nota: number): Promise<void> {
        const perfil = this.perfis.get(id);
        if (!perfil) throw new ErroLinkedIn(404, `Member ${id} not found`);
        if (!Number.isInteger(nota) || nota < 1 || nota > 5) throw new ErroLinkedIn(400, 'rating must be 1..5');
        perfil.recommendations.push(nota);
    }
}
