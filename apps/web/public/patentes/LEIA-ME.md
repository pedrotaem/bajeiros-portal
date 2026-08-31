# Emblemas das patentes

Dez arquivos em pixel art usados como emblemas das patentes de maturidade
(proposta de 2026-08-30). O número no nome **é** a patente: `patente-8-*` é a
mais baixa, `patente-1-*` a mais alta.

| Arquivo                             | Patente | Veículo         |
| ----------------------------------- | ------- | --------------- |
| `patente-8-motorats.gif`            | 8       | Motorats        |
| `patente-7-peacemaker.gif`          | 7       | The Peacemaker  |
| `patente-6-gigahorse.gif`           | 6       | The Gigahorse   |
| `patente-5-elvis.gif`               | 5       | Elvis           |
| `patente-4-nux-car.gif`             | 4       | The Nux Car     |
| `patente-3-plymouth-rock.gif`       | 3       | Plymouth Rock   |
| `patente-2-buggy-9.gif`             | 2       | Buggy #9        |
| `patente-1-interceptor.gif`         | 1       | The Interceptor |
| `patente-1-interceptor-animado.gif` | 1       | idem, animado   |
| `patente-modulo-logo.gif`           | —       | logo do módulo  |

Grafia: a arte diz **PEACEMAKER** (nome canônico do veículo), não "Piecemaker".

`patente-modulo-logo.gif` é derivado do Interceptor animado: recorte quadrado
centrado no carro (`crop 420×420` sobre a moldura original com 40 px de folga no
topo), reduzido a 256×256 com vizinho-mais-próximo e mascarado em círculo com
transparência de índice. O carro fica inteiro dentro do círculo. A receita está
no histórico da sessão; refazer é um script de ~20 linhas com Pillow.

## Crédito — obrigatório, não decorativo

- Ilustração: **Evgeniy Yudin** (_Mazok Pixels_)
- Animação: **Misha Petrick**
- Obra: "MAD MAX Fury Road" — <https://www.behance.net/gallery/26428843/MAD-MAX-Fury-Road>
- Licença: **CC BY-NC 4.0** — <https://creativecommons.org/licenses/by-nc/4.0/deed.pt-br>

A licença permite copiar, redistribuir e adaptar **com atribuição** e **sem
finalidade comercial**. O crédito vai em três lugares: `/THIRD-PARTY-NOTICES.md`,
o rodapé da tela de patentes e a prancheta da escada no canvas de design.
**Não remover de nenhum deles.**

## O que ainda precisa de decisão

A cláusula **NC** vale enquanto o portal for gratuito. O marco **M3** do
`docs/plano-producao-v2.md` prevê assinaturas — antes de qualquer cobrança é
preciso pedir permissão direta aos dois autores **ou** trocar por arte original.
A escada de nomes livres de marca (Enxame · Aríete · Colosso · Marreta · Ligeiro
· Brasa · Gaiola 9 · Ponta de Lança) existe exatamente para esse caso.

## Onde isto mora no build

`apps/web/public/`, servido como imagem (`img-src 'self'`), pelo precedente de
`google.svg`: ativos de terceiro, coloridos e não recoloríveis. **Não são ícones
do design system** — ficam fora de `check-icons` e de `check-tokens`.
