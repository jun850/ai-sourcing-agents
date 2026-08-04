"""
ARCANA Textile Supplier Scraper
Reads china/verified_targets.csv + japan/verified_targets.csv,
visits each company website, extracts product-level rows.

Output fields (one row per product):
  company_name, business_type, region, country, years_in_business,
  factory_area, employees, certifications, website,
  product_name, composition, specification, category,
  moq, unit_price, lead_time, product_url

Lead time defaults to "30 days" when not found on page.
"""

import asyncio
import csv
import json
import os
import random
import re
import sys
from pathlib import Path
from typing import Dict, Any, List, Optional

from bs4 import BeautifulSoup
from playwright.async_api import async_playwright, Page, Browser

# ── paths ────────────────────────────────────────────────────────────────────
BASE = Path(__file__).parent
CHINA_CSV = BASE / "china" / "verified_targets.csv"
JAPAN_CSV = BASE / "japan" / "verified_targets.csv"
OUT_DIR   = BASE / "output"
OUT_CSV   = OUT_DIR / "arcana_products.csv"
OUT_JSONL = OUT_DIR / "arcana_products.jsonl"
RUN_LOG   = OUT_DIR / "run_log.txt"

OUT_DIR.mkdir(exist_ok=True)

# ── output schema ─────────────────────────────────────────────────────────────
FIELDS = [
    "company_name", "business_type", "region", "country",
    "years_in_business", "factory_area", "employees", "certifications",
    "website",
    "product_name", "composition", "specification", "category",
    "moq", "unit_price", "lead_time", "product_url",
]

DEFAULT_LEAD_TIME = "30 days"

KNOWN_CERTS = [
    "OEKO-TEX", "Oeko-Tex", "GOTS", "GRS", "Bluesign",
    "ISO 9001", "ISO 14001", "ISO 45001", "BSCI", "HIGG",
    "BCI", "OCS", "European Flax", "WRAP", "SA8000",
    "SEDEX", "RWS", "RCS",
]

# ── catalog URL guesses (tried in order) ─────────────────────────────────────
CATALOG_PATHS = [
    "/products", "/products/", "/product", "/product/",
    "/en/products", "/en/product", "/en/products/",
    "/fabrics", "/fabrics/", "/fabric", "/fabric/",
    "/catalog", "/catalog/", "/collection", "/collection/",
    "/goods", "/items", "/shop", "/store",
]

# ── product-link selectors (tried in order) ───────────────────────────────────
PRODUCT_LINK_SELS = [
    "a.product-card", "a.product-item", "a.product-link",
    ".product-list a", ".products a", ".product-grid a",
    ".item-list a", ".goods-list a",
    "a[href*='/product/']", "a[href*='/fabric/']",
    "a[href*='/item/']", "a[href*='/goods/']",
    ".pro-list a", ".proList a", ".proBox a",
    "article a", ".card a",
]

# ── spec-extraction patterns ──────────────────────────────────────────────────
SPEC_PATTERNS = {
    "composition": [
        r"(?:composition|material|content|fiber)[:\s]*([^\n<|]{3,60})",
        r"(?:100%|cotton|polyester|silk|linen|wool|cashmere|nylon|rayon|viscose|elastane)[^\n<|]{0,50}",
    ],
    "specification": [
        r"(?:weight|gsm|g/m²|oz)[:\s]*([\d\s\-–]+(?:gsm|g/m²|oz))",
        r"([\d]+\s*(?:gsm|g/m²|oz))",
        r"(?:width|usable width)[:\s]*([\d\s\-–]+\s*(?:cm|mm|inch|\"|\'))",
        r"(?:count|yarn count)[:\s]*([^\n<|]{3,40})",
    ],
    "moq": [
        r"(?:moq|min(?:imum)?\.?\s*order(?:\s*quantity)?)[:\s]*([\d,]+\s*(?:pcs?|pieces?|meters?|m|yds?|yards?|kg|sets?))",
        r"([\d,]+)\s*(?:pcs?|pieces?)\s*(?:min|minimum)",
        r"([\d,]+)\s*(?:meters?|m)\s*(?:min|minimum)",
    ],
    "lead_time": [
        r"(?:lead\s*time|delivery\s*time|production\s*time)[:\s]*([\d\s\-–]+\s*(?:days?|weeks?|months?))",
        r"([\d]+[\s\-–]+[\d]+\s*(?:days?|weeks?))",
    ],
    "unit_price": [
        r"(?:price|unit\s*price|fob)[:\s]*(?:US\$?|USD|CNY|¥|RMB)?\s*([\d,\.]+(?:\s*[\-–]\s*[\d,\.]+)?)\s*(?:/\s*(?:m|meter|pc|piece|yd|yard|kg|set))?",
        r"(?:US\$|USD|CNY)\s*([\d,\.]+)",
    ],
}

# ── helpers ───────────────────────────────────────────────────────────────────

def detect_certs(text: str) -> str:
    found = []
    lower = text.lower()
    for c in KNOWN_CERTS:
        if c.lower() in lower:
            found.append(c)
    return ", ".join(dict.fromkeys(found))  # deduplicated, order preserved


def extract_pattern(text: str, patterns: List[str]) -> str:
    for pat in patterns:
        m = re.search(pat, text, re.I)
        if m:
            return m.group(1).strip() if m.lastindex else m.group(0).strip()
    return ""


def parse_spec_table(soup: BeautifulSoup) -> Dict[str, str]:
    specs: Dict[str, str] = {}
    for table in soup.find_all("table"):
        for row in table.find_all("tr"):
            cells = row.find_all(["th", "td"])
            if len(cells) >= 2:
                k = cells[0].get_text(" ", strip=True).lower().strip(": ")
                v = cells[1].get_text(" ", strip=True)
                if k and v:
                    specs[k] = v
    for dl in soup.find_all("dl"):
        dts = dl.find_all("dt")
        dds = dl.find_all("dd")
        for dt, dd in zip(dts, dds):
            specs[dt.get_text(strip=True).lower()] = dd.get_text(strip=True)
    return specs


def spec_lookup(specs: Dict[str, str], *keys: str) -> str:
    for k in keys:
        for sk, sv in specs.items():
            if k in sk:
                return sv
    return ""


def infer_category(supplier_type: str) -> str:
    st = supplier_type.lower()
    if "zipper" in st:
        return "Zippers"
    if "button" in st:
        return "Buttons"
    if "trim" in st or "label" in st or "ribbon" in st or "lace" in st or "interlining" in st or "elastic" in st or "fastener" in st:
        return "Trims"
    if "oem" in st or "garment manufacturer" in st:
        return "OEM"
    return "Fabrics"


async def human_delay(lo: float = 1.5, hi: float = 3.5):
    await asyncio.sleep(random.uniform(lo, hi))


# ── CSV / JSONL writer ────────────────────────────────────────────────────────

class RowWriter:
    def __init__(self):
        self._header_done = OUT_CSV.exists() and OUT_CSV.stat().st_size > 0

    def write(self, row: Dict[str, Any]):
        flat = {k: (", ".join(v) if isinstance(v, list) else v) for k, v in row.items()}
        with OUT_CSV.open("a", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=FIELDS, extrasaction="ignore")
            if not self._header_done:
                w.writeheader()
                self._header_done = True
            w.writerow(flat)
        with OUT_JSONL.open("a", encoding="utf-8") as f:
            f.write(json.dumps(flat, ensure_ascii=False) + "\n")


def log(msg: str):
    print(msg, flush=True)
    with RUN_LOG.open("a", encoding="utf-8") as f:
        f.write(msg + "\n")


# ── core scraping ─────────────────────────────────────────────────────────────

async def extract_company_meta(soup: BeautifulSoup, page_text: str, row: Dict[str, str]) -> Dict[str, Any]:
    """Pull company-level fields — regex fallbacks when not in verified CSV."""
    yrs = ""
    m = re.search(r"(?:founded|established|since)[:\s]*(\d{4})", page_text, re.I)
    if m:
        import datetime
        yrs = str(datetime.date.today().year - int(m.group(1))) + " yrs"
    else:
        m2 = re.search(r"(\d+)\+?\s*years?\s*(?:of\s*)?(?:experience|history)", page_text, re.I)
        yrs = f"{m2.group(1)} yrs" if m2 else ""

    area = ""
    m = re.search(r"([\d,]+)\s*(?:sqm|m²|square met)", page_text, re.I)
    if m:
        area = m.group(1).replace(",", "") + " m²"

    emp = ""
    m = re.search(r"([\d,]+)\+?\s*(?:employee|worker|staff|people)", page_text, re.I)
    if m:
        emp = m.group(1).replace(",", "") + "+"

    return {
        "company_name":     row["company_name"],
        "business_type":    row["supplier_type"],
        "region":           row["region"],
        "country":          row.get("country", "China"),
        "years_in_business": yrs,
        "factory_area":     area,
        "employees":        emp,
        "certifications":   detect_certs(page_text),
        "website":          row["website"],
        "category":         infer_category(row["supplier_type"]),
    }


async def scrape_product_page(
    page: Page,
    url: str,
    company: Dict[str, Any],
    writer: RowWriter,
) -> bool:
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=20_000)
    except Exception as e:
        log(f"    [ERR goto] {url}: {e}")
        return False
    await human_delay(0.8, 1.8)

    content = await page.content()
    soup = BeautifulSoup(content, "html.parser")
    text = soup.get_text(" ")

    # product name — h1 or og:title
    og = soup.find("meta", property="og:title")
    name = ""
    h1 = soup.find("h1")
    if h1:
        name = h1.get_text(strip=True)
    elif og:
        name = og.get("content", "")

    if not name or len(name) < 3:
        return False

    specs = parse_spec_table(soup)

    composition = (
        spec_lookup(specs, "composition", "material", "content", "fiber")
        or extract_pattern(text, SPEC_PATTERNS["composition"])
    )
    specification = (
        spec_lookup(specs, "weight", "gsm", "g/m", "width", "count", "specification", "spec")
        or extract_pattern(text, SPEC_PATTERNS["specification"])
    )
    moq = (
        spec_lookup(specs, "moq", "min. order", "minimum order", "minimum quantity")
        or extract_pattern(text, SPEC_PATTERNS["moq"])
    )
    price = (
        spec_lookup(specs, "price", "unit price", "fob", "usd")
        or extract_pattern(text, SPEC_PATTERNS["unit_price"])
    )
    lt = (
        spec_lookup(specs, "lead time", "delivery time", "production time")
        or extract_pattern(text, SPEC_PATTERNS["lead_time"])
        or DEFAULT_LEAD_TIME
    )
    extra_certs = detect_certs(text)
    certs = ", ".join(filter(None, dict.fromkeys(
        [c.strip() for c in company["certifications"].split(",")] +
        [c.strip() for c in extra_certs.split(",")]
    ))) if extra_certs else company["certifications"]

    row = {
        **company,
        "certifications": certs,
        "product_name":   name,
        "composition":    composition,
        "specification":  specification,
        "moq":            moq,
        "unit_price":     price,
        "lead_time":      lt,
        "product_url":    url,
    }
    writer.write(row)
    log(f"    + {name}")
    return True


async def find_product_links(page: Page, base_url: str) -> List[str]:
    """Try common catalog paths and collect product-detail links."""
    origin = "/".join(base_url.rstrip("/").split("/")[:3])
    links: List[str] = []
    tried: set = set()

    async def harvest(url: str):
        if url in tried:
            return
        tried.add(url)
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=15_000)
        except Exception:
            return
        await human_delay(1.0, 2.0)
        content = await page.content()
        soup = BeautifulSoup(content, "html.parser")

        for sel in PRODUCT_LINK_SELS:
            found = soup.select(sel)
            if found:
                for a in found:
                    href = a.get("href", "")
                    if not href or href.startswith("#") or href.startswith("mailto"):
                        continue
                    full = href if href.startswith("http") else origin + href
                    if full not in links and full != url:
                        links.append(full)
                if len(links) >= 3:
                    return

    # Try the home page first
    await harvest(base_url)

    # Try catalog sub-paths
    if not links:
        for path in CATALOG_PATHS:
            await harvest(origin + path)
            if links:
                break

    return links[:50]  # cap at 50 products per company


async def scrape_company(
    page: Page,
    row: Dict[str, str],
    writer: RowWriter,
):
    url = row["website"].rstrip("/")
    log(f"\n{'='*60}")
    log(f"  {row['company_name']}  ({url})")

    # Visit homepage for company metadata
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=20_000)
    except Exception as e:
        log(f"  [ERR] Could not load {url}: {e}")
        _save_fallback(row, url, writer)
        return
    await human_delay(1.5, 3.0)

    content = await page.content()
    soup = BeautifulSoup(content, "html.parser")
    text = soup.get_text(" ")
    company = await extract_company_meta(soup, text, row)

    # Get product links
    product_links = await find_product_links(page, url)
    log(f"  Found {len(product_links)} product link(s)")

    if not product_links:
        # Save a single company-level row with no product detail
        _save_fallback(row, url, writer, company)
        return

    saved = 0
    for link in product_links:
        ok = await scrape_product_page(page, link, company, writer)
        if ok:
            saved += 1

    if saved == 0:
        _save_fallback(row, url, writer, company)
    log(f"  => Saved {saved} product row(s)")


def _save_fallback(
    row: Dict[str, str],
    url: str,
    writer: RowWriter,
    company: Optional[Dict[str, Any]] = None,
):
    """Save one row with company info but no product-level data."""
    if company is None:
        company = {
            "company_name":     row["company_name"],
            "business_type":    row["supplier_type"],
            "region":           row["region"],
            "country":          row.get("country", "China"),
            "years_in_business": "",
            "factory_area":     "",
            "employees":        "",
            "certifications":   "",
            "website":          row["website"],
            "category":         infer_category(row["supplier_type"]),
        }
    writer.write({
        **company,
        "product_name":   "",
        "composition":    "",
        "specification":  "",
        "moq":            "",
        "unit_price":     "",
        "lead_time":      DEFAULT_LEAD_TIME,
        "product_url":    url,
    })
    log(f"  => Saved company-level fallback row")


# ── load targets ──────────────────────────────────────────────────────────────

def load_targets() -> List[Dict[str, str]]:
    targets: List[Dict[str, str]] = []

    def read(csv_path: Path, country: str):
        if not csv_path.exists():
            log(f"[WARN] {csv_path} not found, skipping")
            return
        with csv_path.open(encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                row["country"] = country
                targets.append(row)

    read(CHINA_CSV, "China")
    read(JAPAN_CSV, "Japan")
    log(f"Loaded {len(targets)} targets ({sum(1 for t in targets if t['country']=='China')} China, {sum(1 for t in targets if t['country']=='Japan')} Japan)")
    return targets


# ── main ──────────────────────────────────────────────────────────────────────

async def main():
    targets = load_targets()
    if not targets:
        log("No targets found. Exiting.")
        return

    # Allow resuming — skip already-scraped companies
    scraped: set = set()
    if OUT_JSONL.exists():
        with OUT_JSONL.open(encoding="utf-8") as f:
            for line in f:
                try:
                    d = json.loads(line)
                    scraped.add(d.get("website", ""))
                except json.JSONDecodeError:
                    pass
        if scraped:
            log(f"Resuming: {len(scraped)} company website(s) already scraped")

    writer = RowWriter()

    async with async_playwright() as p:
        browser: Browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/126.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1920, "height": 1080},
            locale="en-US",
        )
        page = await context.new_page()

        total = len(targets)
        done = 0
        for row in targets:
            ws = row.get("website", "").rstrip("/")
            if ws in scraped:
                log(f"[SKIP] {row['company_name']} (already scraped)")
                done += 1
                continue

            await scrape_company(page, row, writer)
            scraped.add(ws)
            done += 1
            log(f"  Progress: {done}/{total}")

            # Polite inter-company pause
            await human_delay(2.0, 5.0)

        await page.close()
        await browser.close()

    log(f"\nDone. Output: {OUT_CSV}")
    log(f"       JSONL: {OUT_JSONL}")
    log(f"       Log:   {RUN_LOG}")


if __name__ == "__main__":
    asyncio.run(main())
