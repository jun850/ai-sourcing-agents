# Atelix RFQ intake taxonomy

## Authority
Buyer text is a request, not verified supplier or commercial truth. Never infer a supplier, MOQ, price, capacity, availability, certification, order, or payment state.

## Routes, categories, and procurement modes

Every line item has a category and, where the buyer states one, a procurement
mode. A mode is not a product category: a private-label footwear request is
still footwear. Preserve both when supplied.

Categories: apparel, footwear, bags and accessories, jewelry, beauty and
personal care, home textiles, fibre and yarn, fabric, leather, interlining,
trims and labels, packaging, and other.

Modes: wholesale, blank, private label, white label, OEM, ODM, and CMT.
If the buyer does not state a mode, leave it unspecified instead of guessing.

### Finished goods
- Wholesale: item, quantity, delivery destination, timeline. Branding is optional.
- Blank: item, quantity, color and size range where relevant, timeline. Branding is optional.
- Private label: buyer-branded product direction; record item/reference,
  quantity, branding, material or construction direction, sizes/colors, and timeline.
- White label: an existing product adapted with buyer branding; record item,
  branding, quantity, and any stated size/color or packaging requirements.
- OEM: buyer product direction or specification made by a manufacturer; record
  reference/tech pack status, item, quantity, construction, and branding.
- ODM: manufacturer-led design adapted for the buyer; record product direction,
  customisation, quantity, and branding.

### Production services and materials
- CMT: item, tech-pack/pattern status, supplied versus procured materials, sample/bulk stage, quantity, timeline.
- Fabric: fibre/material, knit/woven construction, weight, width, finish, color/print, quantity/unit, intended use.
- Leather: material type, thickness, finish, color, dimensions, quantity/unit, intended use.
- Buttons, trims, labels: component, material, dimensions, finish/color, function, quantity/unit, reference.
- Fibre and yarn: composition, yarn type/count, finish, quantity/unit, intended use.
- Interlining: material, construction, weight, width, fusible or sew-in, quantity/unit.
- Packaging: component, material, dimensions, print/finish, quantity/unit, branding.

## Material rule
`Organic cotton` is one buyer-stated material concept. It does not establish a certification, and it must not cause plain `cotton` to be written as organic. Preserve buyer wording exactly.

## Clarification rule
Save explicit facts first. Ask one highest-value missing question only. Optional fields remain blank or not applicable.
