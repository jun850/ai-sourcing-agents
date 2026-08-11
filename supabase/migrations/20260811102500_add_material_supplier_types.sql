-- The enum additions must commit before the catalog migration can use them.
ALTER TYPE public.factory_type ADD VALUE IF NOT EXISTS 'textile_trading_company';
ALTER TYPE public.factory_type ADD VALUE IF NOT EXISTS 'material_innovator';
