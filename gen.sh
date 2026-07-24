#!/bin/bash
# Generate all Diffui image assets in parallel, download to assets/
T="tB65M2II2pN4"
API="https://diffui.ai/api/build/generate-image"
mkdir -p assets

gen () {
  local name="$1" prompt="$2" w="$3" h="$4" q="$5"
  local body
  body=$(python3 -c "import json,sys; print(json.dumps({'authToken':'$T','prompt':sys.argv[1],'width':int(sys.argv[2]),'height':int(sys.argv[3]),'quality':sys.argv[4]}))" "$prompt" "$w" "$h" "$q")
  for attempt in 1 2 3; do
    resp=$(curl -s -X POST "$API" -H "Content-Type: application/json" -d "$body")
    url=$(python3 -c "import json,sys;print(json.load(sys.stdin).get('url',''))" <<<"$resp" 2>/dev/null)
    if [ -n "$url" ]; then
      curl -sL -o "assets/${name}.webp" "$url"
      # also png for potential inspection not needed
      if [ -s "assets/${name}.webp" ]; then echo "OK  $name"; return 0; fi
    fi
    echo "retry $name ($attempt): $resp" >&2
    sleep 5
  done
  echo "FAIL $name" >&2
}

# Fabric swatches (512x512 medium) reused across pages
gen linen        "Top-down flat lay macro of natural beige linen woven fabric, soft draped folds, neutral studio light, high detail textile weave" 512 512 medium &
gen cotton-jersey "Macro photo of olive green organic cotton jersey knit fabric twisted into a soft spiral swirl, studio light, neutral background" 512 512 medium &
gen denim        "Rolled dark indigo blue denim fabric bolt, macro texture of denim weave, neutral studio background" 512 512 medium &
gen jersey-knit  "Cream white soft jersey knit fabric twisted into a spiral swirl, macro textile texture, studio light" 512 512 medium &
gen nylon-taslan "Olive green nylon taslan technical fabric with subtle ripstop grid, draped folds, macro studio photo" 512 512 medium &
gen wool-flannel "Soft warm taupe brown wool flannel fabric, brushed surface, gentle folds, macro studio photo" 512 512 medium &
gen poly-twill   "Light grey blue polyester twill fabric, smooth diagonal weave, soft draped folds, macro studio photo" 512 512 medium &
gen recycled-poly "Sage green recycled polyester fabric flat lay, matte woven texture, macro studio photo" 512 512 medium &
gen satin        "Champagne beige satin fabric with glossy smooth sheen and soft flowing folds, macro studio photo" 512 512 medium &
gen fleece       "Charcoal dark grey fleece fabric, warm fuzzy pile texture, folded, macro studio photo" 512 512 medium &
gen chambray     "Light blue chambray cotton shirting fabric, subtle weave, soft folds, macro studio photo" 512 512 medium &
gen canvas       "Natural tan cotton canvas heavy-duty fabric, coarse weave texture, folded, macro studio photo" 512 512 medium &
wait
gen houndstooth  "Brown and cream houndstooth wool fabric pattern, folded corner, macro studio photo" 512 512 medium &
gen cotton-rib   "Beige cotton rib knit fabric, vertical ribbed texture, soft folds, macro studio photo" 512 512 medium &
gen rayon-suiting "Dark navy polyester rayon suiting fabric, smooth drape, macro studio photo" 512 512 medium &
gen cotton-twill  "Natural cream cotton twill fabric folded diagonally, visible diagonal twill weave, macro studio photo, neutral background" 768 512 medium &
gen fabric-stack "Neatly folded stack of denim and neutral apparel fabrics in blues and beige, studio product photo on white" 512 512 medium &
gen zipper       "Macro close-up of antique brass metal zipper on dark fabric, product photo, neutral background" 512 512 medium &
gen ribbon       "Roll of natural beige grosgrain ribbon trim unspooling, product photo on soft neutral background" 512 512 medium &
gen yarn-cones   "Cones of olive green and cream cotton yarn threads, product photo on neutral background" 512 512 medium &
gen sewing-machine "Vintage industrial sewing machine, product photo on neutral background, soft studio light" 512 512 medium &
gen cutsew       "Bright modern garment factory floor with rows of workers sewing at machines, cut and sew production line, documentary photo" 768 512 medium &
gen factory-interior "Interior of a modern textile mill with rows of weaving and dyeing machinery, industrial photo, soft light" 512 512 medium &
wait
echo "=== ALL DONE ==="
ls -la assets/