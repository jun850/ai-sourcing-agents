-- Keep catalog taxonomy and the buyer-facing "Best for" field deterministic.
-- These values mirror the controlled supplier/admin editor options.

update public.products
set applications = null
where applications is not null and btrim(applications) = '';

update public.products
set applications = 'Multiple apparel types'
where applications is not null
  and applications not in (
    'Blouson','T-shirt','Shirt','Blouse','Jacket','Coat','Pants','Shorts','Skirt',
    'Dress','Suit','Knitwear','Activewear','Underwear','Socks','Bag','Footwear',
    'Multiple apparel types'
  );

alter table public.products drop constraint if exists products_applications_allowed;
alter table public.products add constraint products_applications_allowed check (
  applications is null or applications in (
    'Blouson','T-shirt','Shirt','Blouse','Jacket','Coat','Pants','Shorts','Skirt',
    'Dress','Suit','Knitwear','Activewear','Underwear','Socks','Bag','Footwear',
    'Multiple apparel types'
  )
);

update public.products set category = 'accessories', subcategory = 'hardware'
where sku in ('BUT-112','BUT-115');
update public.products set category = 'accessories', subcategory = 'labels'
where sku in ('BUT-116','TRI-118','TRI-119','TRI-120','TRI-121','TRI-122');
update public.products set category = 'trims', subcategory = 'buttons'
where sku in ('BUT-113','BUT-114','BUT-155');
update public.products set category = 'trims', subcategory = 'zippers'
where sku in ('TRI-117','TRI-123','ZIP-124','ZIP-125','ZIP-156','ZIP-157');
update public.products set category = 'trims', subcategory = 'simple-trims'
where sku in ('TRI-131','TRI-132');
