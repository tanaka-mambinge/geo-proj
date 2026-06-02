const fs = require('fs');
const path = require('path');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  ImageRun,
  WidthType,
  LevelFormat,
} = require('docx');

const outputPath = '/home/t12e/Documents/geo-app-methodology.docx';
const diagramPath = '/home/t12e/Documents/geo-app-methodology-flow.png';
const diagramWidthPx = 586;
const diagramHeightPx = 862;
const maxDiagramWidth = 420;
const diagramDisplayWidth = maxDiagramWidth;
const diagramDisplayHeight = Math.round((diagramHeightPx / diagramWidthPx) * diagramDisplayWidth);

const bullets = [
  'Farms.geojson for farm boundaries and status information.',
  'GoldPotentialMap.geojson for gold potential zones and classes.',
  'LULCMAP.geojson for land use and land cover categories.',
];

const simpleSteps = [
  'Start with the original GeoJSON files in EPSG:32736.',
  'Load the raw features into Supabase tables without losing the original geometry structure.',
  'Use PostGIS to clean, validate, split, and index the geometries for faster analysis.',
  'Create RPC functions for polygon analysis and point inspection.',
  'Generate raster map tiles from the source data for fast browser display.',
  'Build a React and Leaflet frontend that shows the tile layers and sends analysis requests to Supabase.',
  'Deploy the frontend to Vercel and connect it to the hosted Supabase project with environment variables.',
];

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: 'Arial', size: 22 },
      },
    },
    paragraphStyles: [
      {
        id: 'Heading1',
        name: 'Heading 1',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { font: 'Arial', size: 32, bold: true },
        paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 0 },
      },
      {
        id: 'Heading2',
        name: 'Heading 2',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { font: 'Arial', size: 28, bold: true },
        paragraph: { spacing: { before: 180, after: 120 }, outlineLevel: 1 },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: '•',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
      {
        reference: 'numbers',
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: '%1.',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 180 },
          children: [new TextRun({ text: 'Methodology for Building the Geo App', bold: true, size: 34 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 300 },
          children: [new TextRun('A simple explanation of how the app was created from the source data.')],
        }),

        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('1. Purpose of the App')] }),
        new Paragraph('The app was built to help users view farms, gold potential zones, and land use information on an interactive map. It also allows users to click a point or draw a polygon and receive analysis results from the backend.'),

        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('2. Source Data Used')] }),
        ...bullets.map((item) => new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun(item)] })),
        new Paragraph('All three files were originally stored in EPSG:32736, which was kept as the main analysis coordinate system in the backend.'),

        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('3. Simple Workflow')] }),
        fs.existsSync(diagramPath)
          ? new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 200 },
              children: [
                new ImageRun({
                  type: 'png',
                  data: fs.readFileSync(diagramPath),
                  transformation: { width: diagramDisplayWidth, height: diagramDisplayHeight },
                  altText: {
                    title: 'Geo app workflow diagram',
                    description: 'Workflow showing data import, processing, tile generation, and frontend analysis.',
                    name: 'Geo app workflow diagram',
                  },
                }),
              ],
            })
          : new Paragraph('Workflow diagram was not available at document build time.'),

        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('4. Method Used to Build the App')] }),
        ...simpleSteps.map((item) => new Paragraph({ numbering: { reference: 'numbers', level: 0 }, children: [new TextRun(item)] })),

        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('5. Backend Methodology')] }),
        new Paragraph('The backend was built in Supabase using Postgres and PostGIS. The raw GeoJSON features were first loaded into raw tables. After that, PostGIS functions were used to validate geometries, extract polygon parts, and create optimized analysis tables for farms, gold, and land use.'),
        new Paragraph('A refresh function rebuilt the analysis tables whenever new data was imported. Two RPC functions were then used by the frontend: one for polygon-based area analysis and one for point inspection.'),

        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('6. Frontend Methodology')] }),
        new Paragraph('The frontend was built with React, TypeScript, Vite, and Leaflet. Static raster tiles were used for the overlay layers so that the map could load quickly in the browser. When the user clicks or draws on the map, the frontend sends GeoJSON to Supabase and displays the returned results in a simple side panel.'),

        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('7. Deployment Method')] }),
        new Paragraph('The frontend was deployed to Vercel as a static web app. The backend data and spatial analysis functions were hosted in Supabase. Environment variables were used in Vercel so the frontend could call the live Supabase RPC endpoints securely using the public anon key.'),

        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('8. Final Output')] }),
        new Paragraph('The final result is a deployed web map application that combines static overlay tiles for fast display and PostGIS-powered analysis for accurate point and polygon queries. This approach kept the user experience simple while still supporting large spatial datasets.'),
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(outputPath, buffer);
  console.log(`Wrote ${outputPath}`);
});
