import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleBrokerRfqAgent } from "../_shared/broker-rfq-agent.ts";

// Neutral Atelix compatibility wrapper for callers migrating to RFQ ids.
Deno.serve(handleBrokerRfqAgent);
