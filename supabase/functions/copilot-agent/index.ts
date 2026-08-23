import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleBrokerRfqAgent } from "../_shared/broker-rfq-agent.ts";

// Compatibility endpoint: the Phase 5 contract is typed RFQ input only.
Deno.serve(handleBrokerRfqAgent);
