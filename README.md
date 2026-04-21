# Farms Map Application

A React web application for visualizing farm boundaries, gold potential zones, and land use data on an interactive map using OpenStreetMap and satellite imagery.

![Farms Map Screenshot](./screenshot.png)

## Features

- **Interactive Map**: OpenStreetMap, Satellite (ESRI), and Topographic base layers
- **Three Overlay Layers**:
  - **Farms**: 132 farm boundaries with Commercial/State Land classification
  - **Gold Potential**: 5 zones showing gold potential levels (Very Low to Very High)
  - **Land Use**: 6 land cover classes (Water, Builtup, Croplands, Vegetation, Wooded Grasslands, Bareland)
- **Click Interactions**: Click gold cells to see gold potential + land use + farm information
- **Layer Toggles**: Show/hide any overlay layer independently
- **Responsive Legends**: Dynamic legends showing only visible layers

## Prerequisites

- **Node.js** (version 18 or higher)
- **npm** (comes with Node.js)

## Installation

1. **Clone or copy the project** to your local machine:
   ```bash
   cd farms-map
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Prepare the data** (if you have original GeoJSON files in `data/` folder):
   ```bash
   node scripts/reproject-data.cjs
   ```
   This reprojects the coordinate systems from EPSG:32736 to WGS84 for web display.

## Running the Application

### Development Mode

Start the development server with hot reloading:

```bash
npm run dev
```

Open your browser and navigate to: **http://localhost:5173/**

The page will automatically reload when you make changes to the code.

### Production Build

Build the application for production:

```bash
npm run build
```

The built files will be in the `dist/` folder. You can serve these files with any static file server.

To preview the production build locally:

```bash
npm run preview
```

## Project Structure

```
├── data/                          # Original GeoJSON data (EPSG:32736)
│   ├── Farms.geojson              # Farm boundaries
│   ├── GoldPotentialMap.geojson   # Gold potential zones
│   └── LULCMAP.geojson            # Land use/land cover data
│
├── src/
│   ├── components/
│   │   └── Map.tsx               # Main map component with all layers
│   ├── data/                      # Processed data (WGS84)
│   │   ├── farms-wgs84.json
│   │   ├── gold-potential-wgs84.json
│   │   └── lulc-wgs84.json
│   ├── utils/
│   │   └── reproject.ts          # Coordinate reprojection utilities
│   ├── App.tsx                    # Root component
│   ├── main.tsx                   # Entry point
│   └── index.css                  # Global styles
│
├── scripts/
│   └── reproject-data.cjs         # Data preprocessing script
│
├── index.html                     # HTML entry point
├── package.json                   # Dependencies and scripts
├── tsconfig.json                  # TypeScript configuration
├── vite.config.ts                 # Vite configuration
└── README.md                      # This file
```

## Data Processing

The original data files use **EPSG:32736** (UTM Zone 36S) coordinate system, which is converted to **WGS84** (EPSG:4326) for web mapping:

```
EPSG:32736 → WGS84
[x, y in meters] → [longitude, latitude in degrees]
```

This conversion is done automatically by the `scripts/reproject-data.cjs` script using the `proj4` library.

## Technologies Used

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Leaflet** - Interactive mapping library
- **React-Leaflet** - React components for Leaflet
- **Turf.js** - Geospatial analysis (point-in-polygon)
- **Proj4** - Coordinate system transformations

## Layer Information

### Farms Layer
- **Colors**: Green (Commercial farms), Blue (State Land)
- **Click**: Shows farm name and status

### Gold Potential Layer
- **Colors**: Blue → Red gradient (Very Low → Very High)
- **Click**: Shows gold potential class, area, land use, and farm info

### Land Use Layer
- **Colors**:
  - Water: Blue
  - Builtup: Gray
  - Croplands: Yellow
  - Vegetation: Green
  - Wooded Grasslands: Dark Green
  - Bareland: Light Gray
- **Style**: Dashed outline for visibility
- **Click**: Shows land use class and area in hectares

## Browser Compatibility

Tested on:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

## License

This project uses:
- OpenStreetMap data (© OpenStreetMap contributors)
- ESRI World Imagery (© Esri)

## Troubleshooting

**Port 5173 is already in use:**
```bash
npm run dev -- --port 3000
```

**Build fails with TypeScript errors:**
Make sure all dependencies are installed:
```bash
rm -rf node_modules package-lock.json
npm install
```

**Data files not showing:**
Run the reprojection script:
```bash
node scripts/reproject-data.cjs
```

## Development

To add new features or modify existing ones:

1. Edit files in `src/components/`
2. The dev server will automatically reload
3. Test your changes at http://localhost:5173/
4. Build for production when ready: `npm run build`

## Contact

For questions or issues, please refer to the project documentation or create an issue in the repository.
