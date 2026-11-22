/** Candidato no formato do portal Indeed: habilidades sem nível, pretensão em centavos, cidade em texto. */
export interface CandidatoIndeed {
    jobseekerKey: string;
    fullName: string;
    email: string;
    desiredTitle: string;
    skillTags: string[];
    salaryExpectation: { amountCents: number; period: 'PROJECT' };
    /** "Cidade, UF" */
    location: string;
    availableFrom: string;
    availableTo: string;
    reviews: Array<{ stars: 1 | 2 | 3 | 4 | 5; text: string; date: string }>;
}

export const CANDIDATOS_INDEED_EXEMPLO: readonly CandidatoIndeed[] = [
    {
        jobseekerKey: 'js-901',
        fullName: 'Paulo Viana',
        email: 'paulo.viana@example.com',
        desiredTitle: 'Screenwriter',
        skillTags: ['screenwriting', 'research', 'documentary'],
        salaryExpectation: { amountCents: 900_000, period: 'PROJECT' },
        location: 'Salvador, BA',
        availableFrom: '2026-01-01',
        availableTo: '2028-12-31',
        reviews: [{ stars: 5, text: 'Ótimo roteiro', date: '2026-03-10' }]
    },
    {
        jobseekerKey: 'js-902',
        fullName: 'Lia Moraes',
        email: 'lia.moraes@example.com',
        desiredTitle: 'VFX Artist',
        skillTags: ['visual effects', '3d animation', 'color grading'],
        salaryExpectation: { amountCents: 1_400_000, period: 'PROJECT' },
        location: 'Recife, PE',
        availableFrom: '2026-01-01',
        availableTo: '2028-12-31',
        reviews: []
    },
    {
        jobseekerKey: 'js-903',
        fullName: 'Otávio Reis',
        email: 'otavio.reis@example.com',
        desiredTitle: 'Video Editor',
        skillTags: ['video editing', 'audio mixing'],
        salaryExpectation: { amountCents: 650_000, period: 'PROJECT' },
        location: 'Recife, PE',
        availableFrom: '2026-01-01',
        availableTo: '2028-12-31',
        reviews: [{ stars: 4, text: 'Entregou no prazo', date: '2026-05-02' }]
    }
];

/** Simula a API de busca de candidatos do Indeed (consulta textual com "OR" e avaliações por estrelas). */
export class ApiIndeedSimulada {
    private readonly candidatos = new Map<string, CandidatoIndeed>();

    constructor(candidatos: readonly CandidatoIndeed[] = CANDIDATOS_INDEED_EXEMPLO) {
        for (const c of candidatos) this.candidatos.set(c.jobseekerKey, structuredClone(c));
    }

    /** `q`: termos separados por " OR ", procurados no cargo desejado. */
    public async search(params: { q: string }): Promise<{ results: CandidatoIndeed[]; totalResults: number }> {
        const termos = params.q
            .split(' OR ')
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean);
        const results = [...this.candidatos.values()]
            .filter((c) => termos.some((t) => c.desiredTitle.toLowerCase().includes(t)))
            .map((c) => structuredClone(c));
        return { results, totalResults: results.length };
    }

    public async getJobseeker(key: string): Promise<CandidatoIndeed | null> {
        const candidato = this.candidatos.get(key);
        return candidato ? structuredClone(candidato) : null;
    }

    public async postReview(key: string, review: { stars: 1 | 2 | 3 | 4 | 5; text: string }): Promise<{ ok: boolean }> {
        const candidato = this.candidatos.get(key);
        if (!candidato) return { ok: false };
        candidato.reviews.push({ ...review, date: new Date().toISOString().slice(0, 10) });
        return { ok: true };
    }
}
