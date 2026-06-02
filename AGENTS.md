# Geo Proj Notes

## Repo Split

- Frontend/app repo: `~/Code/geo-proj`
- Data + Supabase + tile generation repo: `~/Code/geo-proj-supabase`

When updating source datasets or overlay tiles, do the work from `geo-proj-supabase`, then check the resulting files in `geo-proj`.

## Canonical Source Data

The import and tile scripts use the canonical files under:

- `~/Code/geo-proj/data/Farms.geojson`
- `~/Code/geo-proj/data/GoldPotentialMap.geojson`
- `~/Code/geo-proj/data/LULCMAP.geojson`

Older snapshots may be archived in versioned folders like `data/v1` and `data/v2`, but `data/` is what import and tile generation read.

## Local Supabase Refresh

To refresh the local Docker-backed Supabase instance from the canonical `data/` files:

```bash
cd ~/Code/geo-proj-supabase
npx supabase db reset --local
npm run import
```

If the local stack is down, start or restart it first:

```bash
cd ~/Code/geo-proj-supabase
npx supabase start
```

The import script overwrites raw tables and rebuilds the derived geometry tables. It does not append.

## Tile Generation

Legacy command:

```bash
cd ~/Code/geo-proj-supabase
npm run tiles
```

Preferred command:

```bash
cd ~/Code/geo-proj-supabase
npm run tiles:experimental
```

Use the experimental renderer for current work. It is much faster and now defaults to backend-normalized geometry from local Supabase.

Useful examples:

```bash
npm run tiles:experimental -- --dataset lulc --tile-size 512
npm run tiles:experimental -- --tile-size 512
npm run tiles:experimental -- --tile-size 256
```

## Important Tile Rule

The frontend `TileLayer` still uses the standard XYZ tile pyramid.

- Keep `tileSize: 256` in `src/components/Map.tsx`
- Keep `zoomOffset: 0`

Higher-resolution tile images like `512x512` are acceptable, but do not change the Leaflet overlay to a custom tile pyramid unless you intend to rework the client behavior too.

## Geometry Source Rule

Do not generate final thematic tiles from raw `data/*.geojson` unless you are explicitly testing raw-source behavior.

For final tiles, use the backend-normalized local Supabase tables:

- `public.farms_parts`
- `public.gold_parts`
- `public.lulc_parts`

That keeps tile geometry aligned with popup/report results.

## Output And Backups

Primary live tile path:

- `~/Code/geo-proj/public/tiles`

Experimental or temporary outputs may be written to:

- `public/tiles-experimental`
- `public/tiles-db-256-temp`
- `public/tiles-db-512-temp`
- `public/tiles-lulc-db-test`
- `public/tiles-lulc-fix-test`

Before swapping in a new live tile tree, back up the existing `public/tiles` directory to a timestamped folder under `public/`.

Do not include those backup/test directories in normal commits unless explicitly requested.
