"""
Enrich arcana_products.csv: fill missing composition/specification/moq
using the marketplace-copilot OpenRouter preset (reads OPENROUTER_API_KEY
from env, never prints the key).
"""

import csv, json, os, re, time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
if not API_KEY:
    print("OPENROUTER_API_KEY not set in environment")
    raise SystemExit(1)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
PRESET = "@preset/marketplace-copilot"

CSV_PATH = Path(__file__).parent / "output" / "arcana_products.csv"
OUT_PATH = Path(__file__).parent / "output" / "arcana_products_enriched.csv"

FIELDS = [
    "company_name","business_type","region","country",
    "years_in_business","factory_area","employees","certifications","website",
    "product_name","composition","specification","category",
    "moq","unit_price","lead_time","product_url",
]

def ask_openrouter(product_name: str, supplier_type: str, country: str, category: str) -> dict:
    prompt = f"""You are a textile sourcing expert. Given this product info, return ONLY valid JSON with these fields.
No markdown, no explanation, just the JSON object.

Product name: {product_name}
Supplier type: {supplier_type}
Country: {country}
Category: {category}

Return JSON with:
- "composition": material content (e.g. "100% Cotton", "60% Polyester 40% Cotton", "Zinc Alloy")
- "specification": key spec (e.g. "250 GSM", "150cm width", "15mm 4-hole", "YKK #5 closed-end")
- "moq": minimum order (e.g. "500 m", "200 pcs", "1 roll")
- "lead_time": production lead time (e.g. "14-21 days", "7-10 days")

    Be realistic for the product type and country of origin. Japanese suppliers tend to have lower MOQ and higher quality.
"""
    try:
        request = Request(
            OPENROUTER_URL,
            data=json.dumps({
                "model": PRESET,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 220,
            }).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://atelix.app",
                "X-Title": "Atelix research enrichment",
            },
            method="POST",
        )
        with urlopen(request, timeout=45) as response:
            payload = json.load(response)
        text = str(payload.get("choices", [{}])[0].get("message", {}).get("content", "")).strip()
        # strip markdown code fences if present
        text = re.sub(r'^```(?:json)?\s*', '', text)
        text = re.sub(r'\s*```$', '', text)
        return json.loads(text)
    except (HTTPError, URLError, ValueError, KeyError, IndexError) as error:
        print(f"  [OpenRouter err] {error}")
        return {}


with open(CSV_PATH) as f:
    rows = list(csv.DictReader(f))

print(f"Loaded {len(rows)} rows")
enriched = 0

for i, r in enumerate(rows):
    name = r.get("product_name", "").strip()
    if not name:
        continue  # skip company-level fallback rows

    needs_enrich = (
        not r.get("composition", "").strip()
        or not r.get("specification", "").strip()
        or not r.get("moq", "").strip()
    )
    if not needs_enrich:
        continue

    print(f"  [{i+1}/{len(rows)}] Enriching: {name[:50]}")
    data = ask_openrouter(name, r.get("business_type",""), r.get("country",""), r.get("category",""))

    if data:
        if not r["composition"].strip() and data.get("composition"):
            r["composition"] = data["composition"]
        if not r["specification"].strip() and data.get("specification"):
            r["specification"] = data["specification"]
        if not r["moq"].strip() and data.get("moq"):
            r["moq"] = data["moq"]
        if r["lead_time"] == "30 days" and data.get("lead_time"):
            r["lead_time"] = data["lead_time"]
        enriched += 1

    time.sleep(0.3)  # rate limit

with open(OUT_PATH, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=FIELDS, extrasaction="ignore")
    w.writeheader()
    w.writerows(rows)

print(f"\nEnriched {enriched} rows → {OUT_PATH}")
