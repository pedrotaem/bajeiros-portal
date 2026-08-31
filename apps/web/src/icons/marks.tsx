import { Svg, type SvgProps } from './Svg'

/**
 * MARCAS DE FERRAMENTA (DF-24) — categoria própria, **fora do inventário de ícones**.
 *
 * Por que não são ícones: o inventário de §8.5 é vocabulário genérico de interface
 * (seta, lixeira, chevron), tem teto de 24 formas, doador único (Lucide) e a regra de
 * §8.6 "desenho à mão não é caminho permitido". Estas duas formas não são vocabulário:
 * **identificam dois produtos nomeados do portal** — o Validador de Gaiola e o
 * Assistente do Regulamento —, do mesmo jeito que um logo identifica um produto.
 * Nenhum conjunto aberto tem "três pontos denominados com o ângulo marcado no vértice",
 * e o desenho foi PEDIDO pelo dono do produto. A exceção está escrita no
 * design-system §8.6; a decisão de manter o inventário intacto (24 formas, Lucide,
 * zero desenho à mão) continua valendo para tudo o mais.
 *
 * O que herdam do sistema, sem exceção: o primitivo `Svg` (viewBox 24, traço 1.6,
 * cap/join redondos), `currentColor` (nada de cor literal), e a proibição de carregar
 * status — marca nunca fica vermelha para dizer infração.
 *
 * Onde aparecem: sub-item do rail (com rótulo ao lado), card do hub de Ferramentas e
 * card da home pública. **Nunca sozinhas sem rótulo** — não são identificador único
 * de destino em lugar nenhum (é o que dispensa a vaga 1 de §8.5).
 */
type Props = Omit<SvgProps, 'children'>

/**
 * Validador de gaiola: três pontos denominados, os dois tubos que os ligam e o arco
 * do ângulo no vértice — o zoom num nó da gaiola, que é o que a ferramenta mede.
 */
export const MarkCage = (p: Props) => (
  <Svg {...p}>
    <path d="M4.5 17 12 6l7.5 8" />
    <circle cx="4.5" cy="17" r="1.4" />
    <circle cx="12" cy="6" r="1.4" />
    <circle cx="19.5" cy="14" r="1.4" />
    <path d="M9.5 9.6A4.4 4.4 0 0 0 15 9.2" />
  </Svg>
)

/**
 * Assistente do regulamento: a folha do regulamento com o brilho de IA sobreposto.
 * O balão de conversa saiu de propósito — a ferramenta não é um chat, é uma leitura
 * assistida do documento oficial.
 */
export const MarkAssistant = (p: Props) => (
  <Svg {...p}>
    <path d="M13.5 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5" />
    <path d="M7.5 8h4" />
    <path d="M17 9c.7 3.6 1.7 4.6 5 5.3-3.3.7-4.3 1.7-5 5.3-.7-3.6-1.7-4.6-5-5.3 3.3-.7 4.3-1.7 5-5.3Z" />
  </Svg>
)
