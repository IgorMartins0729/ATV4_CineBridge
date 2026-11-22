import { randomUUID } from 'node:crypto';
import { ConflitoError, ValidacaoError } from '../erros.js';
import type { Papel } from '../enums/Papel.js';
import type { TipoCaptacao } from '../enums/TipoCaptacao.js';
import { TipoProjeto } from '../enums/TipoProjeto.js';
import type { ServicoProjeto } from '../servicos/ServicoProjeto.js';
import { Localizacao } from '../value-objects/Localizacao.js';
import type { Produtor } from '../value-objects/Produtor.js';
import { RequisitoPapel } from '../value-objects/RequisitoPapel.js';
import type { VisitanteProjeto, Visitavel } from '../visitors/VisitanteProjeto.js';
import { Equipe } from './Equipe.js';
import type { MembroEquipe } from './MembroEquipe.js';
import type { Profissional } from './Profissional.js';

export interface ProjetoProps {
    id?: string;
    titulo: string;
    produtor: Produtor;
    genero: string;
    /** Duração estimada da obra, em minutos. */
    duracao: number;
    orcamento: number;
    /** Data de entrega. */
    prazo: Date;
    tipoCaptacao: TipoCaptacao;
    localizacao: Localizacao;
    /** Composite: hierarquia de serviços do projeto. Os papéis obrigatórios saem das folhas. */
    servicoPrincipal: ServicoProjeto;
    /** Nome da estratégia de recomendação escolhida na criação (opcional). */
    estrategia?: string | null;
    equipe?: Equipe | null;
    profissionaisRejeitados?: string[];
}

/** Atributos próprios de cada tipo de projeto, em formato serializável (persistência e API). */
export type EspecificosProjeto = Readonly<Record<string, string | number | readonly string[]>>;

/**
 * Prototype: `clonar` devolve uma cópia profunda do projeto (papéis, localização, equipe e rejeitados),
 * com ajustes opcionais. Cada subclasse sobrescreve `clonar` para copiar também os seus atributos.
 */
export class Projeto implements Visitavel {
    private readonly id: string;
    private readonly titulo: string;
    private readonly produtor: Produtor;
    private readonly genero: string;
    private readonly duracao: number;
    private orcamento: number;
    private prazo: Date;
    private readonly tipoCaptacao: TipoCaptacao;
    private readonly localizacao: Localizacao;
    private readonly servicoPrincipal: ServicoProjeto;
    /** Derivado de `servicoPrincipal` (a árvore é imutável, então é calculado uma vez). */
    private readonly papeisObrigatorios: RequisitoPapel[];
    private estrategia: string | null;
    private equipe: Equipe | null;
    private readonly profissionaisRejeitados: Set<string>;

    constructor(props: ProjetoProps) {
        if (props.titulo.trim().length === 0) {
            throw new ValidacaoError('Título do projeto é obrigatório');
        }
        if (!Number.isFinite(props.duracao) || props.duracao <= 0) {
            throw new ValidacaoError('Duração estimada deve ser maior que zero');
        }
        Projeto.validarOrcamento(props.orcamento);
        Projeto.validarPrazo(props.prazo);
        // Validação recursiva da estrutura (papéis válidos, custos e prazos não negativos, pacotes não vazios).
        const problemas = props.servicoPrincipal.validar();
        if (problemas.length > 0) {
            throw new ValidacaoError(`Serviços do projeto inválidos: ${problemas.join('; ')}`);
        }
        const papeisObrigatorios = Projeto.requisitosDe(props.servicoPrincipal);
        if (papeisObrigatorios.length === 0) {
            throw new ValidacaoError('O projeto precisa de ao menos um serviço com papel técnico');
        }

        this.id = props.id ?? randomUUID();
        this.titulo = props.titulo.trim();
        this.produtor = { ...props.produtor };
        this.genero = props.genero.trim().toLowerCase();
        this.duracao = props.duracao;
        this.orcamento = props.orcamento;
        this.prazo = new Date(props.prazo);
        this.tipoCaptacao = props.tipoCaptacao;
        this.localizacao = props.localizacao;
        this.servicoPrincipal = props.servicoPrincipal;
        this.papeisObrigatorios = papeisObrigatorios;
        this.estrategia = props.estrategia ?? null;
        this.equipe = props.equipe ?? null;
        this.profissionaisRejeitados = new Set(props.profissionaisRejeitados ?? []);
    }

    public getId(): string {
        return this.id;
    }

    public getTipo(): TipoProjeto {
        return TipoProjeto.GERAL;
    }

    public getEspecificos(): EspecificosProjeto {
        return {};
    }

    public clonar(ajustes: Partial<ProjetoProps> = {}): Projeto {
        return new Projeto(this.propsClonadas(ajustes));
    }

    /** Cópia profunda dos dados comuns a todos os tipos, já com os ajustes aplicados. */
    protected propsClonadas(ajustes: Partial<ProjetoProps>): ProjetoProps {
        return {
            id: this.id,
            titulo: this.titulo,
            produtor: { ...this.produtor },
            genero: this.genero,
            duracao: this.duracao,
            orcamento: this.orcamento,
            prazo: new Date(this.prazo),
            tipoCaptacao: this.tipoCaptacao,
            localizacao: new Localizacao(this.localizacao.getCidade(), this.localizacao.getUf()),
            // A árvore de serviços é imutável: o clone pode compartilhá-la sem quebrar a independência.
            servicoPrincipal: this.servicoPrincipal,
            estrategia: this.estrategia,
            equipe: this.equipe?.clonar() ?? null,
            profissionaisRejeitados: [...this.profissionaisRejeitados],
            ...ajustes
        };
    }

    public getTitulo(): string {
        return this.titulo;
    }

    public getProdutor(): Produtor {
        return this.produtor;
    }

    public getGenero(): string {
        return this.genero;
    }

    public getDuracao(): number {
        return this.duracao;
    }

    public getOrcamento(): number {
        return this.orcamento;
    }

    public getPrazo(): Date {
        return new Date(this.prazo);
    }

    public getTipoCaptacao(): TipoCaptacao {
        return this.tipoCaptacao;
    }

    public getLocalizacao(): Localizacao {
        return this.localizacao;
    }

    public getServicoPrincipal(): ServicoProjeto {
        return this.servicoPrincipal;
    }

    /** Composite: só delega ao serviço principal, que soma a hierarquia inteira. */
    public calcularCustoTotal(): number {
        return this.servicoPrincipal.calcularCusto();
    }

    /** Papéis exigidos pelos serviços atômicos. O mesmo papel em vários serviços vira um requisito só, com os pesos somados. */
    public getPapeisObrigatorios(): readonly RequisitoPapel[] {
        return this.papeisObrigatorios;
    }

    public getPapeis(): Papel[] {
        return this.papeisObrigatorios.map((r) => r.getPapel());
    }

    public exigePapel(papel: Papel): boolean {
        return this.papeisObrigatorios.some((r) => r.getPapel() === papel);
    }

    public pesoDoPapel(papel: Papel): number {
        return this.papeisObrigatorios.find((r) => r.getPapel() === papel)?.getPeso() ?? 0;
    }

    public somaPesos(): number {
        return this.papeisObrigatorios.reduce((total, r) => total + r.getPeso(), 0);
    }

    /** Parte do orçamento proporcional ao peso do papel. */
    public verbaDoPapel(papel: Papel): number {
        return (this.orcamento * this.pesoDoPapel(papel)) / this.somaPesos();
    }

    public getEstrategia(): string | null {
        return this.estrategia;
    }

    public definirEstrategia(nome: string | null): void {
        this.estrategia = nome;
    }

    public getEquipe(): Equipe | null {
        return this.equipe;
    }

    public getProfissionaisRejeitados(): ReadonlySet<string> {
        return this.profissionaisRejeitados;
    }

    public estaFormada(): boolean {
        return this.equipe?.estaFormada() ?? false;
    }

    /** Adota uma sugestão de equipe como a equipe em formação do projeto. */
    public definirEquipe(equipe: Equipe): void {
        this.garantirAlteravel();
        for (const membro of equipe.getMembros()) {
            this.garantirPapelObrigatorio(membro.getPapel());
        }
        this.equipe = equipe;
    }

    /** O produtor aceita o profissional recomendado para o papel. */
    public aceitarRecomendacao(papel: Papel, profissional: Profissional): void {
        this.garantirAlteravel();
        this.garantirPapelObrigatorio(papel);
        if (!this.equipe) {
            this.equipe = new Equipe();
        }
        this.equipe.definirMembro(papel, profissional);
    }

    /** Troca quem ocupa o papel, mantendo os demais membros. Retorna o membro anterior. */
    public substituirMembro(papel: Papel, profissional: Profissional): MembroEquipe | null {
        this.garantirAlteravel();
        this.garantirPapelObrigatorio(papel);
        if (!this.equipe) {
            this.equipe = new Equipe();
        }
        return this.equipe.definirMembro(papel, profissional);
    }

    /** Retira o membro do papel e impede que ele seja recomendado de novo neste projeto. */
    public rejeitarMembro(papel: Papel): MembroEquipe | null {
        this.garantirAlteravel();
        const removido = this.equipe?.removerMembro(papel) ?? null;
        if (removido) {
            this.profissionaisRejeitados.add(removido.getProfissional().getId());
        }
        return removido;
    }

    /** Descarta a equipe em formação para que uma nova composição completa seja gerada. */
    public solicitarReavaliacao(): void {
        this.garantirAlteravel();
        this.equipe = null;
    }

    public alterarOrcamento(novoOrcamento: number): void {
        this.garantirAlteravel();
        Projeto.validarOrcamento(novoOrcamento);
        this.orcamento = novoOrcamento;
    }

    public alterarPrazo(novoPrazo: Date): void {
        this.garantirAlteravel();
        Projeto.validarPrazo(novoPrazo);
        this.prazo = new Date(novoPrazo);
    }

    public aceitar<R>(visitante: VisitanteProjeto<R>): R {
        return visitante.visitarProjeto(this);
    }

    private garantirAlteravel(): void {
        if (this.estaFormada()) {
            throw new ConflitoError('A equipe do projeto já foi formada');
        }
    }

    private garantirPapelObrigatorio(papel: Papel): void {
        if (!this.exigePapel(papel)) {
            throw new ValidacaoError(`O papel ${papel} não faz parte deste projeto`);
        }
    }

    private static requisitosDe(servico: ServicoProjeto): RequisitoPapel[] {
        const pesos = new Map<Papel, number>();
        for (const atomico of servico.listarAtomicos()) {
            pesos.set(atomico.papel, (pesos.get(atomico.papel) ?? 0) + atomico.peso);
        }
        return [...pesos].map(([papel, peso]) => new RequisitoPapel(papel, peso));
    }

    private static validarOrcamento(orcamento: number): void {
        if (!Number.isFinite(orcamento) || orcamento <= 0) {
            throw new ValidacaoError('Orçamento deve ser maior que zero');
        }
    }

    private static validarPrazo(prazo: Date): void {
        if (Number.isNaN(prazo.getTime())) {
            throw new ValidacaoError('Data de entrega inválida');
        }
    }
}
