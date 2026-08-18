# Stripe hosted Checkout runbook

Atelix uses Stripe-hosted Checkout for orders created while the Intools Stripe toggle is enabled. Supabase Edge Functions create the session; the browser receives only the hosted URL.

## Stripe CLI and Projects setup

On macOS, verify the CLI first:

```sh
which stripe && stripe --version
```

If it is missing, install it with Homebrew:

```sh
brew install stripe/stripe-cli/stripe
stripe login
stripe plugin install projects
```

Stripe Projects is optional for this already-provisioned Supabase application. Before initialization, inspect it without writing project files:

```sh
stripe projects status --json
stripe projects init --preflight --json
```

Only run `stripe projects init --accept-tos --yes` after confirming that creating `.projects/` state and local environment files is wanted. It does not replace the production Supabase secret store.

## Production release

1. Rotate any exposed Stripe secret key in the Stripe Dashboard and inspect the retired key's request activity.
2. In Supabase, set `STRIPE_SECRET_API_KEY` to the new restricted live key, plus `STRIPE_WEBHOOK_SECRET`, `STRIPE_MODE=live`, and `SITE_URL=https://atelix.app`. Do not commit or shell-history any secret.
3. Create the live Stripe webhook endpoint for `https://bobwfxvxzjovpgmmqsew.supabase.co/functions/v1/stripe-webhook`, then set its signing secret in Supabase.
4. Deploy the database migration and payment Edge Functions. Keep the Intools toggle off until `stripe-readiness` reports the live account is ready.
5. Run a live, low-value payment and refund test. Stripe webhooks—not the return URL—are the authority that marks an order paid.

## Local testing

Use Stripe test-mode secrets only. The CLI can forward test events to a local function:

```sh
stripe listen --forward-to http://localhost:54321/functions/v1/stripe-webhook
stripe trigger checkout.session.completed
```

Never run `stripe trigger` or a CLI forwarding workflow with production credentials.
