# Avisos de terceiros

Este arquivo lista o material de terceiros **copiado para dentro** deste repositório, com a licença
correspondente na íntegra. Dependências instaladas via `npm` não entram aqui: elas ficam em
`node_modules` com as próprias licenças e não são redistribuídas por este repositório.

Manter estes avisos é **obrigação das licenças permissivas**, não concessão. O repositório é público
e ainda não tem `LICENSE` próprio — isso não conflita com as obrigações abaixo, que valem para o
material de terceiros independentemente do licenciamento do resto.

---

## Lucide

**Versão:** 1.34.0 · **commit:** `1a60fd28ed7111bbf6acedc0896f3d83cd73945a` ·
**Origem:** https://github.com/lucide-icons/lucide

As **23 formas** de `apps/web/src/icons/glyphs.tsx` são cópia literal da geometria do Lucide nessa
tag. (Eram 21 quando o inventário fechou; o DF-12 somou `house`, `wrench` e `trophy` e o DF-24 tirou
`message-square`.) As duas **marcas de ferramenta** de `apps/web/src/icons/marks.tsx` NÃO estão aqui:
são obra própria do projeto, sem doador e sem licença de terceiro — ver design-system §8.6.1. O pacote **não** é instalado como dependência: um _bump_ menor pode redesenhar um glifo, e a
forma dos cinco ícones de status é contrato do design system (CT-3). Copiar congela a geometria sob
revisão de PR.

O único atributo alterado em relação ao doador é `stroke-width`, de 2 para 1.6, e ele mora no
primitivo `apps/web/src/icons/Svg.tsx`, não nos glifos.

### Glifos herdados do Feather (MIT)

Onze das 23 formas descendem do Feather Icons e carregam **as duas** licenças (ISC do Lucide + MIT do
Feather):

`IconCheck` (`check`) · `IconTriangleAlert` (`triangle-alert`, listado no `LICENSE` pelo nome antigo
`alert-triangle`) · `IconInfoCircle` (`info`) · `IconArrow` (`arrow-right`) · `IconChevronRight`
(`chevron-right`) · `IconChevronsRight` (`chevrons-right`) · `IconX` (`x`) · `IconPlus` (`plus`) ·
`IconTrash` (`trash`) · `IconDownload` (`download`) · `IconUpload` (`upload`).

As outras doze (`ban`, `user`, `cloud-upload`, `rotate-ccw`, `users`, `files`,
`sliders-horizontal`, `circle-user`, `shield`, `house`, `wrench`, `trophy`) são ISC pura.

### Licença ISC — Lucide

```
ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT).
All other copyright (c) for Lucide are held by Lucide Contributors 2022.

Permission to use, copy, modify, and/or distribute this software for any purpose with or without
fee is hereby granted, provided that the above copyright notice and this permission notice appear
in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS
SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE
AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT,
NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE
OF THIS SOFTWARE.
```

### Licença MIT — Feather (porções herdadas)

```
MIT License

Copyright (c) 2013-2022 Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

**Nenhum crédito na tela.** A obrigação é o aviso no repositório; poluir a interface com atribuição
de ícone não é exigido por nenhuma das duas licenças.

**Doador único.** Não entra Tabler, nem Apache 2.0, nem CC BY. `npm run check-icons` falha se o
registro apontar para outra origem.

---

## Emblemas das patentes — "MAD MAX Fury Road" (pixel art)

Os nove GIFs em `apps/web/public/patentes/` são obra de terceiro, usados como emblemas das
patentes de maturidade (proposta de 2026-08-30).

| Papel      | Autor                              |
| ---------- | ---------------------------------- |
| Ilustração | **Evgeniy Yudin** — _Mazok Pixels_ |
| Animação   | **Misha Petrick**                  |

Obra: **"MAD MAX Fury Road"** — <https://www.behance.net/gallery/26428843/MAD-MAX-Fury-Road>

Licença: **Creative Commons Atribuição-NãoComercial 4.0 Internacional (CC BY-NC 4.0)** —
<https://creativecommons.org/licenses/by-nc/4.0/deed.pt-br>

Permite copiar, redistribuir e adaptar **com atribuição** e **sem finalidade comercial**.

**Este crédito aparece na tela**, ao contrário dos ícones do Lucide: a licença exige atribuição
"de forma razoável", e o rodapé da tela de patentes é onde ela é razoável. Não remover.

Onde ele vive no código: `ART_CREDIT`, em `apps/web/src/components/RankBand.tsx`. A mesma
constante é escrita no rodapé do **cartaz PNG** exportado (DF-18 RF-7.3) — a atribuição
acompanha a imagem quando ela sai do portal, que é justamente quando ela mais importa.

**Restrição a monitorar — a cláusula NC.** Vale enquanto o portal for gratuito. O marco M3 do
`docs/plano-producao-v2.md` prevê assinaturas: antes de qualquer cobrança é preciso obter
permissão direta dos dois autores **ou** substituir por arte original. A escada de nomes livres de
marca (Enxame · Aríete · Colosso · Marreta · Ligeiro · Brasa · Gaiola 9 · Ponta de Lança) existe
para esse caso.

**Marca.** Os veículos são do filme homônimo; a marca é de terceiro e o portal não a reivindica.
Nenhum uso da identidade "SAE" está envolvido (restrição de `specs/spec.md` §1).

Fora do design system: são ativos coloridos e não recoloríveis, servidos como imagem
(`img-src 'self'`), não passam por `check-icons` nem por `check-tokens`.

---

## Natural Earth — fronteiras estaduais do Brasil

**Conjunto:** `ne_50m_admin_1_states_provinces` (admin-1, 1:50 milhões) ·
**Origem:** https://github.com/nvkelso/natural-earth-vector ·
**Site:** https://www.naturalearthdata.com

`apps/web/src/data/brasil-uf.ts` é derivado desse conjunto: as 27 feições brasileiras
(`adm0_a3 = BRA`), projetadas em equiretangular e simplificadas por Douglas-Peucker. O
`scripts/build-mapa-uf.mjs` refaz o arquivo e registra o processo inteiro.

Natural Earth é de **domínio público**. A licença não exige atribuição — este bloco existe pela
mesma razão que os outros: registrar de onde veio o material copiado para dentro do repositório.
Os autores pedem crédito por cortesia, e o portal o dá na própria tela, no rodapé do mapa.

> Termos de uso, na íntegra (https://www.naturalearthdata.com/about/terms-of-use/):
>
> All versions of Natural Earth raster + vector map data found on this website are in the public
> domain. You may use the maps in any manner, including modifying the content and design,
> electronic dissemination, and offset printing. The primary authors, Tom Patterson and Nathaniel
> Vaughn Kelso, and all other contributors renounce all financial claim to the maps and invites
> you to use them for personal, educational, and commercial purposes.
>
> No permission is needed to use Natural Earth. Crediting the authors is unnecessary.
