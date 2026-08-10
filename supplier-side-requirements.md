# Supplier-Side Requirements — Admin Supplier Management

Status: **Shaped, not yet built.** This is a design + technical spec produced via `/impeccable shape`. Confirmed with the founder on 2026-08-06. Hand this to `/impeccable craft` or straight implementation.

## 1. Feature Summary

Admins currently manage users and orders from `pages/admin-orders.html`, but have no way to edit a supplier's storefront (factory profile or products) without logging in as that supplier. This feature adds that path: from the Users table, clicking a seller row opens a dedicated admin page for that supplier's factory profile and full product catalog, with the same edit capabilities the supplier has on their own dashboard (`pages/dashboard.html`) — photos, titles, specs, pricing, price-break tiers — plus two admin-only additions: verification approval and an audit trail of admin edits.

**Who it's for:** ARCANA admins doing supplier support/moderation — fixing a supplier's typo'd product title, swapping a bad photo, correcting MOQ/pricing on their behalf, or approving a factory's verification status.

**Why:** Suppliers will make mistakes or need help suppliers can't self-serve (e.g. locked out, non-technical, urgent fix); admin needs a first-class way to intervene without credential-sharing or direct DB access.

## 2. Primary User Action

Admin clicks a seller in the Users table → lands on `admin-supplier.html?id=<factory_id>` → edits a product's photo/title/details/price or the factory profile → change is live immediately.

## 3. Scope

- **Fidelity:** production-ready, not a prototype.
- **Breadth:** one new page (`admin-supplier.html`), a small edit to `admin-orders.html` (Users table row → link), two new migrations.
- **Interactivity:** full CRUD parity with the seller dashboard's SKU/factory forms.
- **Design system:** no new visual system — inherits DESIGN.md/PRODUCT.md as-is (product register, Restrained color strategy). This page is chrome around existing, already-shipped patterns.

## 4. Navigation & Access

- `admin-orders.html`'s Users table: seller rows (`role === 'seller'`) become clickable links to `admin-supplier.html?id=<factory_id>`. Buyer rows are not clickable (no factory to open).
- Requires `factory_id` on each seller row returned from `admin_list_users()` — see §7.
- `admin-supplier.html` gate logic mirrors `admin-orders.html`: not logged in → login prompt; logged in but `role !== 'admin'` → "Admin access only"; logged in as admin but `?id=` doesn't resolve to a factory → "Supplier not found" with a back-link to Users.

## 5. Page Layout (`admin-supplier.html`)

Single-column, `admin-orders.html`'s `.wrap`/`.panel` rhythm — **not** the seller dashboard's two-column layout. No storefront preview pane, no Demand Copilot, no AI Listing Drafter, no buyer messages/chat panel — those are seller-only surfaces irrelevant to an admin support task. Keep it focused.

```
← Back to Users

[Factory name]                                    [Verification badge]
Supplier since [date] · [region/loc]

┌─ Factory Profile ──────────────────────────────┐
│ Name, Region, Location, About (bio), Photo      │
│ Verification: [unverified/pending/verified ▾]   │  ← admin-only field
│ [Save Profile]                                  │
└──────────────────────────────────────────────────┘

┌─ Products (N) ──────────────────────  [+ Add SKU]┐
│ (identical row/table markup to dashboard.html's  │
│  #skuTable: photo, name, SKU/category/price,     │
│  status badge, Edit, Archive)                    │
│                                                    │
│ [SKU form — identical to dashboard.html's         │
│  #skuForm: sku, name, category, unit_type,        │
│  pricing_mode, price, moq, loc, comp, spec,       │
│  listing_status, photo, price-break tiers]        │
└────────────────────────────────────────────────────┘

┌─ Recent admin activity (collapsed by default) ───┐
│ "Jun (admin) changed verify_state → verified —    │
│  Aug 6, 2026"                                     │
│ "Jun (admin) edited SKU 'Linen Blend' — Aug 4"    │
└────────────────────────────────────────────────────┘
```

## 6. Key States

| State | Behavior |
|---|---|
| Default | Factory profile populated, products table listing active/draft/archived SKUs |
| Empty catalog | Same empty-state copy as seller dashboard: "No SKUs yet — add your first product." |
| Bad/missing `?id=` | Gate message "Supplier not found" + back-link to Users table |
| Non-admin | Gate message "Admin access only" (same pattern as `admin-orders.html`) |
| Not logged in | Login prompt with `?next=admin-supplier.html?id=...` redirect |
| Saving product/profile | Inline save + toast, same as seller dashboard — no new loading pattern |
| Changing verification | Confirmation modal (reuse `admin-orders.html`'s `.modal-overlay`/`statusModal` component) before commit |
| Archiving a product | Same `confirm()`-replacement pattern already used in dashboard.html — **note:** dashboard.html currently uses native `confirm()` for archive; per project gotchas (native `confirm()` freezes browser automation/testing), prefer reusing the modal component here rather than propagating the native dialog |

## 7. Data & Backend Requirements

### 7.1 Reused as-is (no changes needed)
RLS on `factories`, `products`, `price_breaks` already grants full write access to `is_admin()` callers (see `supabase/migrations/0003_rls_policies.sql`). These `js/api.js` functions work unmodified for admin use:
- `uploadImage(file, folder)`
- `updateFactory(id, patch)`
- `getMyProducts(factoryId)` — already takes an explicit `factoryId`, not scoped to the caller
- `createProduct(payload)`, `updateProduct(id, patch)`, `archiveProduct(id)`
- `getPriceBreaks(productId)`, `setPriceBreaks(productId, breaks)`

### 7.2 New: `api.getFactoryById(id)`
Admin variant of `getMyFactory()` — same shape, but looks up by primary key instead of `owner_profile_id = session.user.id`:
```js
async getFactoryById(id){
  try{
    const { data, error } = await sb.from('factories').select('*').eq('id', id).maybeSingle();
    if(error) return null;
    return data || null;
  }catch(_){ return null; }
}
```
Public SELECT RLS already covers this (`factories_select_public`); no new policy needed.

### 7.3 New migration: extend `admin_list_users()` to return `factory_id`
`admin_list_users()` (defined in `supabase/migrations/0012_admin_users.sql`) currently has no factory link. Add a nullable `factory_id uuid` column, joined from `factories.owner_profile_id`:
```sql
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id uuid, email text, role public.user_role, full_name text, company_name text,
  country text, created_at timestamptz, order_count bigint, factory_id uuid
)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = ''
AS $$
  SELECT p.id, u.email::text, p.role, p.full_name, p.company_name, p.country, p.created_at,
         (SELECT count(*) FROM public.orders o WHERE o.buyer_profile_id = p.id) AS order_count,
         f.id AS factory_id
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.factories f ON f.owner_profile_id = p.id
  WHERE public.is_admin()
  ORDER BY p.created_at DESC;
$$;
```
Client change: `admin-orders.html`'s `renderUsers()` wraps seller rows in a link to `admin-supplier.html?id=${u.factory_id}` when `u.role==='seller' && u.factory_id`.

### 7.4 New migration: `admin_audit_log` table + write path
Trust-critical: admin is writing into another user's storefront, so the trail must be server-authored, not client-trusted.

```sql
CREATE TABLE public.admin_audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     uuid NOT NULL REFERENCES public.profiles(id),
  target_table text NOT NULL,          -- 'factories' | 'products'
  target_id    uuid NOT NULL,
  action       text NOT NULL,          -- 'update' | 'verify_state_change' | 'archive' | 'create'
  summary      text,                   -- human-readable one-liner, e.g. "verify_state: pending → verified"
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_audit_log_admin_read ON public.admin_audit_log
  FOR SELECT USING (public.is_admin());
-- No direct INSERT policy for authenticated role — rows are written only via
-- SECURITY DEFINER RPCs below, so the trail can't be forged client-side.
```

`admin_list_audit(p_target_id uuid)` read RPC — returns rows for the "Recent admin activity" strip, joined to the admin's name:
```sql
CREATE FUNCTION public.admin_list_audit(p_target_id uuid)
RETURNS TABLE (admin_name text, action text, summary text, created_at timestamptz)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = ''
AS $$
  SELECT COALESCE(p.full_name, p.company_name, 'Admin') AS admin_name,
         a.action, a.summary, a.created_at
  FROM public.admin_audit_log a
  JOIN public.profiles p ON p.id = a.admin_id
  WHERE a.target_id = p_target_id AND public.is_admin()
  ORDER BY a.created_at DESC LIMIT 20;
$$;
REVOKE ALL ON FUNCTION public.admin_list_audit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_audit(uuid) TO authenticated;
```

Product/profile edits made through the existing `updateFactory`/`updateProduct`/etc. calls are plain table writes (no RPC), so they won't auto-populate the audit log. Two options, pick one at implementation time:
1. **Lightweight (recommended for this batch):** only the verification-change RPC (§7.5) writes an audit row. Regular product/profile edits stay silent — lower build cost, covers the highest-stakes action first.
2. **Full coverage:** wrap every admin product/profile write in a dedicated RPC (`admin_update_factory`, `admin_update_product`) that also inserts an audit row. More consistent, more migration surface. Defer unless support/dispute cases actually need per-field edit history.

### 7.5 New: `admin_set_factory_verification(p_factory_id, p_verify_state)` RPC
Mirrors the shape of `admin_update_order_status` (`supabase/migrations/0010_admin_orders.sql` pattern): SECURITY DEFINER, admin-gated, writes the state change and an audit row in one transaction.
```sql
CREATE FUNCTION public.admin_set_factory_verification(p_factory_id uuid, p_verify_state public.verify_state)
RETURNS public.factories
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_old public.verify_state; v_row public.factories;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT verify_state INTO v_old FROM public.factories WHERE id = p_factory_id;
  UPDATE public.factories SET verify_state = p_verify_state WHERE id = p_factory_id RETURNING * INTO v_row;
  INSERT INTO public.admin_audit_log (admin_id, target_table, target_id, action, summary)
  VALUES (auth.uid(), 'factories', p_factory_id, 'verify_state_change',
          format('verify_state: %s → %s', v_old, p_verify_state));
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_factory_verification(uuid, public.verify_state) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_factory_verification(uuid, public.verify_state) TO authenticated;
```
`js/api.js` addition: `adminSetFactoryVerification(factoryId, verifyState)` wrapping this RPC, following the `adminUpdateOrderStatus` call pattern (rpc call → return `{ factory, error }`).

## 8. Interaction Model

1. Admin clicks a seller row in Users table → navigates to `admin-supplier.html?id=<factory_id>`.
2. Page loads factory via `getFactoryById(id)` and products via `getMyProducts(id)` (reused directly, just passing the target factory's id instead of the logged-in seller's own).
3. Factory Profile form: identical fields/markup to `dashboard.html`'s `#factoryForm`, plus one new `<select name="verify_state">` (unverified/pending/verified). Changing verification opens the confirm modal (reusing `admin-orders.html`'s `statusModal` markup/behavior) before calling `adminSetFactoryVerification`.
4. Products panel: identical `#skuTable`/`#skuForm` markup and JS logic to `dashboard.html`, with `factory.id` swapped for the URL's target id. Add/Edit/Archive behave exactly as they do for the supplier.
5. All non-verification writes go straight through existing RLS-gated table calls — no new RPC needed for those (per §7.1).
6. "Recent admin activity" strip: collapsed `<details>` by default, populated via `admin_list_audit(target_id)`, called for both the factory id and each product id shown, or scoped to just the factory row for the lightweight option in §7.4.

## 9. Content Requirements

- Reuses all existing copy/labels from `dashboard.html`'s SKU and factory forms verbatim — no new strings there.
- New copy needed:
  - Page title: "Manage Supplier"
  - Verification select labels: "Unverified", "Pending review", "Verified"
  - Confirm-modal copy, verification-specific and asymmetric by direction (the verified transition is buyer-facing and higher-stakes than the others):
    - → Verified: "Approve [Factory Name] for verification? This makes their factory badge and listings visible as verified to buyers immediately."
    - → Pending / → Unverified: "Change verification status to [X]? This is a support/moderation action and won't notify the supplier automatically."
  - Empty audit strip: "No admin activity yet for this supplier."
  - Not-found gate: "Supplier not found — this factory may have been removed." + "Back to Users" link.

## 10. Anti-Goals / Out of Scope

- This is **not** an impersonation/login-as feature — admin edits factory/product rows directly; admin never sees or touches the supplier's cart, orders-received, or chat inbox from this page.
- No new visual system, no new color, no new component vocabulary — every control here already exists in `dashboard.html` or `admin-orders.html`.
- Does not change buyer-facing pages — `supplier.html` (public factory profile) and `product.html` read the same tables, so edits here surface there automatically with no separate propagation step.
- Bulk actions (multi-select archive, bulk price updates) are out of scope for this batch.

## 11. Implementation Checklist

- [ ] Migration: extend `admin_list_users()` to return `factory_id` (§7.3)
- [ ] Migration: `admin_audit_log` table + RLS (§7.4)
- [ ] Migration: `admin_set_factory_verification()` RPC (§7.5)
- [ ] Migration: `admin_list_audit()` RPC (§7.4)
- [ ] `js/api.js`: add `getFactoryById`, `adminSetFactoryVerification`, `adminListAudit`
- [ ] `pages/admin-orders.html`: make seller rows link to `admin-supplier.html?id=`
- [ ] New `pages/admin-supplier.html`: gate logic + factory profile form + products panel (ported from `dashboard.html`) + verification control + audit strip
- [ ] Replace any native `confirm()` carried over from the ported archive flow with the modal component (project convention — native `confirm()` blocks automated testing, see `marketplace-session-gotchas`)
- [ ] Manual test: admin edits a product's photo/title/price for a supplier who is not the logged-in user, confirm change reflects on `product.html` and `supplier.html`
- [ ] Manual test: verify-state change updates the supplier's own dashboard banner (`dashboard.html`'s "Verification pending" banner) on next load

## 12. Open Questions

None blocking. One deferred decision flagged for whoever implements: audit-log coverage breadth (lightweight vs. full, §7.4) — recommend starting lightweight (verification changes only) and expanding only if support/dispute cases show a real need for per-field edit history.
