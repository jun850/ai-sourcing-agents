# Product-phrase capture rule

## The rule

The RFQ `product` field holds the buyer's **complete product noun phrase** — the
head noun **plus every qualifier the buyer wrote in front of it**. Capturing only
the head noun changes the item being sourced and is a defect.

- "short pants" → `product = short pants` (not `pants`)
- "short-sleeve blouse" → `product = short-sleeve blouse` (not `blouse`)
- "oversized denim jacket" → `product = oversized denim jacket` (not `jacket`)

If the buyer names only a qualifier and no head noun ("100 pcs short in black"),
capture the qualifier verbatim (`short`). Do not drop it and do not invent a head
noun.

## Qualifiers that are part of the product

Length & cut: short, long, extra-long, cropped, longline, three-quarter,
knee-length, ankle-length, midi, mini, maxi, high-waisted, low-rise, wide-leg,
straight-leg, tapered, bootcut, flared, pleated, cargo, paperbag.

Sleeve & neckline: sleeveless, short-sleeve, long-sleeve, half-sleeve,
cap-sleeve, v-neck, crew-neck, scoop-neck, boat-neck, turtleneck, mock-neck,
cowl-neck, halter, off-shoulder, one-shoulder, strapless, racerback.

Fit & silhouette: oversized, boxy, relaxed, slim-fit, skinny, regular-fit,
muscle, bodycon, a-line, pencil, wrap, belted, double-breasted, single-breasted.

Construction & finish: hooded, zip-up, quarter-zip, button-down, quilted,
padded, puffer, fleece-lined, ribbed, cable-knit, waffle-knit, garment-dyed,
acid-washed, stone-washed, distressed, raw-hem, selvedge, graphic, printed,
embroidered, heavyweight, midweight, lightweight.

Scope words that read as part of a name: men's, women's, kids', unisex,
maternity, petite, tall, plus-size. When the buyer writes them as a bare
audience note ("100 shorts for men") they are a size/scope note, not part of
`product`.

Material words when the buyer made them part of the name: cotton, denim, linen,
wool, cashmere, silk, corduroy, fleece, leather, suede, knit, twill, chino,
jersey, flannel, chambray. The same value is still recorded in `material`.

## Head nouns (non-exhaustive)

Tops: t-shirt, tee, polo shirt, henley, shirt, blouse, tunic, tank top, crop
top, camisole, sweatshirt, hoodie, sweater, jumper, cardigan, overshirt.

Bottoms: trousers, pants, slacks, chinos, jeans, joggers, sweatpants, leggings,
shorts, culottes, skirt, skort, kilt.

One-piece: dress, gown, jumpsuit, playsuit, romper, overalls, dungarees,
boilersuit, bodysuit.

Outerwear: jacket, blazer, coat, overcoat, parka, anorak, windbreaker,
raincoat, trench coat, gilet, puffer, poncho, cape, vest, waistcoat.

Other: suit, tuxedo, uniform, scrubs, coveralls, apron, robe, kimono, kaftan,
kurta, activewear, sportswear, tracksuit, loungewear, pyjamas, sleepwear,
underwear, boxer briefs, bra, lingerie, shapewear, swimwear, swimsuit, bikini,
rash guard, socks, tights, gloves, scarf, shawl, hat, cap, beanie, belt,
necktie, bow tie. Footwear: sneakers, trainers, shoes, boots, sandals, loafers,
espadrilles, mules, clogs, slippers.

## Where this is enforced

| Layer | File | Function |
| --- | --- | --- |
| Client first-prompt hydration | `src/rfq-intake.ts` | `extractProductPhrase` |
| Client draft fields | `src/dashboard.tsx` | `fieldsFromInitialPrompt` |
| Edge agent deterministic path | `supabase/functions/_shared/rfq-intake.ts` | `extractProductPhrase` |
| Edge agent deterministic path | `supabase/functions/_shared/broker-rfq-agent.ts` | `deterministicPatch` |
| Edge agent model path | `supabase/functions/_shared/broker-rfq-agent.ts` | `reconcileWithAgent` system prompt |

The two `extractProductPhrase` copies (client and edge) must stay in sync.

## Non-goals

- Do not guess a head noun the buyer did not write.
- Do not merge two line items into one product phrase ("hoodies and mailers"
  stays two items).
- Do not move colour, quantity, weight, or certification into `product`; they
  have their own fields even when the buyer used them inside the phrase.
