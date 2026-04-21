const proj4 = require('proj4');
const fs = require('fs');

// Define EPSG:32736 projection (UTM Zone 36S)
proj4.defs(
  'EPSG:32736',
  '+proj=utm +zone=36 +south +datum=WGS84 +units=m +no_defs'
);

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

// Generic reprojection function for any GeoJSON
function reprojectGeoJSON(geojson) {
  const reprojectedFeatures = geojson.features.map((feature) => {
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

  return {
    type: 'FeatureCollection',
    crs: {
      type: 'name',
      properties: {
        name: 'urn:ogc:def:crs:OGC:1.3:CRS84'
      }
    },
    features: reprojectedFeatures
  };
}

// Load and reproject Farms data
console.log('Reprojecting Farms data...');
const farmsData = JSON.parse(fs.readFileSync('data/Farms.geojson', 'utf8'));
const farmsReprojected = reprojectGeoJSON(farmsData);
fs.writeFileSync('src/data/farms-wgs84.json', JSON.stringify(farmsReprojected, null, 2));
console.log('✓ Saved src/data/farms-wgs84.json');

// Load and reproject Gold Potential data
console.log('\nReprojecting Gold Potential data...');
const goldData = JSON.parse(fs.readFileSync('data/GoldPotentialMap.geojson', 'utf8'));
const goldReprojected = reprojectGeoJSON(goldData);
fs.writeFileSync('src/data/gold-potential-wgs84.json', JSON.stringify(goldReprojected, null, 2));
console.log('✓ Saved src/data/gold-potential-wgs84.json');

// Log summary
console.log('\n=== Summary ===');
console.log(`Farms: ${farmsReprojected.features.length} features`);
console.log(`Gold Potential: ${goldReprojected.features.length} features`);
console.log('\nGold Potential classes:');
const classes = {};
goldReprojected.features.forEach(f => {
  const cls = f.properties.Class;
  classes[cls] = (classes[cls] || 0) + 1;
});
Object.entries(classes).forEach(([cls, count]) => {
  console.log(`  - ${cls}: ${count} cells`);
});
