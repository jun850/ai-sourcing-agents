# RFQ prompt examples and expected capture

This file is the reference set for how a buyer prompt must be turned into a
structured RFQ. Each row shows the raw prompt and the fields the agent (model or
deterministic path) must capture. The agent interprets intent; it never invents
supplier, price, MOQ, capacity, availability, payment, or certification facts.

The RFQ fields are: `product`, `quantity`, `material`, `certifications`,
`colors`, `sizes`, `budget`, `timeline`.

## The product-phrase rule (read first)

`product` is the buyer's **whole product noun phrase**, not just its head noun.
Every descriptor the buyer writes before the head noun is part of the product:
cut, length, sleeve, fit, neckline, silhouette, and any material word they made
part of the name.

| Buyer wrote | ✅ capture `product` as | ❌ wrong (head noun only) |
| --- | --- | --- |
| short pants | `short pants` | `pants` |
| short-sleeve blouse | `short-sleeve blouse` | `blouse` |
| long-sleeve henley | `long-sleeve henley` | `henley` |
| sleeveless midi dress | `sleeveless midi dress` | `dress` |
| oversized denim jacket | `oversized denim jacket` | `jacket` |
| high-waisted wide-leg trousers | `high-waisted wide-leg trousers` | `trousers` |
| cropped hoodie | `cropped hoodie` | `hoodie` |
| double-breasted wool coat | `double-breasted wool coat` | `coat` |
| v-neck knit sweater | `v-neck knit sweater` | `sweater` |
| cotton chino pants | `cotton chino pants` | `pants` |

If the buyer names only a bare modifier with no head noun ("100 pcs short in
black"), capture that word verbatim as the product (`short`) — do not discard
it, and do not upgrade it to a guessed head noun.

## Worked examples

### Finished apparel — wholesale / blank

| Prompt | product | quantity | material | colors | sizes | timeline | notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| "100 pcs black cotton short pants for men" | `short pants` (`cotton short pants` acceptable) | `100 pcs` | `cotton` | `black` | — | — | keep "short"; "for men" is a size/scope note, not the product |
| "I need 100 pcs short in black color with cotton/wool blend material" | `short` | `100 pcs` | `cotton/wool blend` | `black` | — | — | bare modifier is the product |
| "300 short-sleeve blouses in white, sizes S–XL, delivered in 6 weeks" | `short-sleeve blouse` | `300 pcs` | — | `white` | `S–XL` | `6 weeks` | |
| "i need 100 pcs black hoodie with cotton blend 500 gsm heavy weight" | `hoodie` | `100 pcs` | `cotton blend, 500 gsm` | `black` | — | — | weight belongs in material |
| "500 heavyweight cotton t-shirts, garment-dyed, olive and sand" | `heavyweight cotton t-shirt` (or `t-shirt`) | `500 pcs` | `cotton` | `olive and sand` | — | — | |
| "100 pcs okayama denim cotton pants 300 gsm" | `denim cotton pants` | `100 pcs` | `denim, cotton, 300 gsm` | — | — | — | place name ("okayama") is context, not product |
| "100 pcs cotton chino pants beige" | `cotton chino pants` | `100 pcs` | `cotton` | `beige` | — | — | |
| "200 oversized denim jackets, stone-washed, unisex" | `oversized denim jacket` | `200 pcs` | `denim` | — | `unisex` | — | |
| "400 ready-made white leather sneakers for Australia in October" | `leather sneakers` (or `sneakers`) | `400 pcs` | `leather` | `white` | — | `October` | wholesale finished goods; destination = Australia |

### Private label / white label / OEM / ODM / CMT

| Prompt | product | quantity | procurement | notes |
| --- | --- | --- | --- | --- |
| "Private-label 300 linen resort shirts from this reference, with our neck label" | `linen resort shirt` | `300 pcs` | private_label | record reference + branding (neck label); do not claim a factory can make it |
| "OEM 500 hoodies and 500 printed mailers" | line 1 `hoodie`, line 2 `printed mailer` | `500 pcs` each | oem (apparel) + packaging | keep two line items; don't mix hoodie sizing with mailer dimensions |
| "CMT 1,000 pleated midi skirts, we supply the fabric" | `pleated midi skirt` | `1,000 pcs` | cmt | materials_supply = buyer-supplied fabric; ask sample vs bulk stage |
| "ODM activewear set, leggings + sports bra, our colours" | line 1 `leggings`, line 2 `sports bra` | — | odm | two items; capture requested customisation |

### Raw materials — fabric / yarn / leather / trims / packaging

| Prompt | product | quantity | material | notes |
| --- | --- | --- | --- | --- |
| "I want 300 meters of cotton silk blend made in japan with beige color" | `cotton silk blend fabric` | `300 meters` | `cotton silk blend` | fabric route; ask weight or width if absent |
| "Need 300 metres cotton-silk twill for lightweight jackets" | `cotton-silk twill fabric` | `300 meters` | `cotton-silk twill` | intended use = lightweight jackets |
| "5,000 kg combed cotton yarn, Ne 30, for knitting" | `combed cotton yarn` | `5,000 kg` | `combed cotton, Ne 30` | fibre_yarn; intended use = knitting |
| "2,000 woven size labels, 40×15 mm, our logo" | `woven size label` | `2,000 pcs` | `woven` | trims_labels; dimensions 40×15 mm; branding = buyer logo |
| "10,000 kraft polybags, 250×350 mm, recycled" | `kraft polybag` | `10,000 pcs` | `recycled kraft` | packaging; dimensions 250×350 mm |

### Ambiguous — clarify, do not assume

| Prompt | action |
| --- | --- |
| "I need product labels" | ask: garment labels, care labels, or packaging labels? do not assume white label |
| "Looking for summer stock" | ask what item(s), quantity, and timeline |
| "Can you make bags?" | ask bag type (tote, backpack, pouch), material, dimensions, quantity |
| "300 units, cotton, navy, by November" | product missing — ask what the item is; keep the other four fields |

## Interpretation rules the agent applies

1. Capture the full product phrase (see the rule above). Never silently drop a
   descriptor the buyer wrote.
2. `for men` / `for women` / `for kids` / `unisex` is a size-and-scope note; it
   is not part of `product` unless the buyer wrote it as the name
   ("men's briefs").
3. Quantity: number + unit exactly as written, normalising only shorthand
   (`prcs`→`pcs`, `peices`→`pieces`, `metres`→`meters`).
4. Colour and material stay in their own fields even when the buyer also used
   them inside the product name.
5. GSM / oz weights go in `material`.
6. One prompt can hold several line items ("hoodies and mailers"); keep each
   item's details scoped to that item.
7. Never populate supplier, price, MOQ, lead time, capacity, availability,
   payment, or certification claims from a guess — only from the buyer's words
   or cited reference evidence.
8. Five-question limit: when the next reply would be a sixth clarification,
   return an incomplete-draft summary instead so the buyer can edit the RFQ or
   let Atelix review the gaps.
