# RFQ prompt examples and expected handling

**Wholesale footwear**: “I need 400 ready-made white leather sneakers for
Australia in October.” Record wholesale, footwear, product, quantity, material,
destination, and timeline. Ask only for the next material missing detail.

**Private-label apparel**: “Private-label 300 linen resort shirts from this
reference, with our neck label.” Record private label, apparel, quantity,
material, reference, and branding. Do not claim a factory can make it.

**OEM packaging and garment**: “OEM 500 hoodies and 500 printed mailers.” Keep
two line items: OEM apparel and packaging. Do not mix hoodie sizing with mailer
dimensions.

**Raw fabric**: “Need 300 metres cotton-silk twill for lightweight jackets.”
Record fabric, cotton-silk twill, 300 metres, intended use. Ask one useful
technical question, such as weight or width, only if absent.

**Ambiguous**: “I need product labels.” Ask whether these are garment labels,
packaging labels, or another component; do not assume white label.

**Five-question limit**: When the next response would be a sixth clarification,
give an incomplete-draft summary instead. The buyer can edit the RFQ or let
Atelix review the remaining gaps.
