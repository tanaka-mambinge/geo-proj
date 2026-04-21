const proj4 = require('proj4');
const farmsData = require('../src/data/farms.json');

// Define EPSG:32736 projection (UTM Zone 36S)
proj4.defs(
  'EPSG:32736',
  '+proj=utm +zone=36 +south +datum=WGS84 +units=m +no_defs'
);

// Test with a known coordinate from the data
const testX = 338348.5363161451;
const testY = 8075343.511608983;
console.log('Test coordinate (UTM Zone 36S):', { x: testX, y: testY });

const [lng, lat] = proj4('EPSG:32736', 'WGS84', [testX, testY]);
console.log('Converted to WGS84:', { lng, lat });

// Reproject a single coordinate pair [x, y] from UTM to [lng, lat]
function reprojectPair(coord) {
  const [x, y] = coord;
  const [lng, lat] = proj4('EPSG:32736', 'WGS84', [x, y]);
  return [lng, lat];
}

// Reproject a linear ring (array of coordinate pairs)
function reprojectLinearRing(ring) {
  return ring.map(reprojectPair);
}

// Reproject a polygon (array of linear rings)
function reprojectPolygon(polygon) {
  return polygon.map(reprojectLinearRing);
}

// Reproject a multipolygon (array of polygons)
function reprojectMultiPolygon(multipolygon) {
  return multipolygon.map(reprojectPolygon);
}

// Process first feature only for testing
const firstFeature = farmsData.features[0];
console.log('\nFirst feature name:', firstFeature.properties.NAME);
console.log('Geometry type:', firstFeature.geometry.type);
console.log('Original coordinates count:', firstFeature.geometry.coordinates[0][0].length);

if (firstFeature.geometry.type === 'MultiPolygon') {
  const reprojectedCoords = reprojectMultiPolygon(firstFeature.geometry.coordinates);
  console.log('\nFirst 3 reprojected coordinates [lng, lat]:');
  reprojectedCoords[0][0].slice(0, 3).forEach((coord, i) => {
    console.log(`  ${i + 1}: [${coord[0].toFixed(6)}, ${coord[1].toFixed(6)}]`);
  });
  
  // Verify these are in reasonable range for Zimbabwe
  const sample = reprojectedCoords[0][0][0];
  console.log('\nVerification:');
  console.log('  Longitude:', sample[0], '(should be ~31 for Zimbabwe)');
  console.log('  Latitude:', sample[1], '(should be ~-17 for Zimbabwe)');
}

// Reproject all features
console.log('\nReprojecting all', farmsData.features.length, 'features...');

const reprojectedFeatures = farmsData.features.map((feature) => {
  const geometry = feature.geometry;
  
  if (geometry.type === 'MultiPolygon') {
    return {
      type: 'Feature',
      properties: feature.properties,
      geometry: {
        type: 'MultiPolygon',
        coordinates: reprojectMultiPolygon(geometry.coordinates)
      }
    };
  } else if (geometry.type === 'Polygon') {
    return {
      type: 'Feature',
      properties: feature.properties,
      geometry: {
        type: 'Polygon',
        coordinates: reprojectPolygon(geometry.coordinates)
      }
    };
  }
  
  return feature;
});

console.log('Done! First feature reprojected name:', reprojectedFeatures[0].properties.NAME);

// Save reprojected data
const fs = require('fs');
const output = {
  type: 'FeatureCollection',
  crs: {
    type: 'name',
    properties: {
      name: 'urn:ogc:def:crs:OGC:1.3:CRS84'
    }
  },
  features: reprojectedFeatures
};

fs.writeFileSync('src/data/farms-wgs84.json', JSON.stringify(output, null, 2));
console.log('\nSaved reprojected data to src/data/farms-wgs84.json');
