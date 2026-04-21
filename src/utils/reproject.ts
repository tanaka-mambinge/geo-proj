import proj4 from 'proj4';

// Define EPSG:32736 projection (UTM Zone 36S)
proj4.defs(
  'EPSG:32736',
  '+proj=utm +zone=36 +south +datum=WGS84 +units=m +no_defs'
);

// Test coordinate from the Farms data (Hereford Estate first point)
// These are UTM Zone 36S coordinates
export function testProjection(): void {
  const testX = 338348.5363161451;  // easting in meters
  const testY = 8075343.511608983;  // northing in meters

  console.log('Original UTM (EPSG:32736):', { x: testX, y: testY });

  // Convert from EPSG:32736 to WGS84 (returns [longitude, latitude])
  const [lng, lat] = proj4('EPSG:32736', 'WGS84', [testX, testY]);

  console.log('Converted to WGS84 [lng, lat]:', { lng, lat });
  // Expected: roughly lng=31.1°, lat=-17.4° (Zimbabwe)
}

// Reproject a single coordinate pair [x, y] from UTM to [lng, lat]
function reprojectPair(coord: number[]): number[] {
  const [x, y] = coord;
  const [lng, lat] = proj4('EPSG:32736', 'WGS84', [x, y]);
  return [lng, lat];
}

// Reproject a linear ring (array of coordinate pairs)
function reprojectLinearRing(ring: number[][]): number[][] {
  return ring.map(reprojectPair);
}

// Reproject a polygon (array of linear rings, first is outer, rest are holes)
function reprojectPolygon(polygon: number[][][]): number[][][] {
  return polygon.map(reprojectLinearRing);
}

// Reproject a multipolygon (array of polygons)
function reprojectMultiPolygon(multipolygon: number[][][][]): number[][][][] {
  return multipolygon.map(reprojectPolygon);
}

export function reprojectGeoJSON(geojson: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  console.log('Reprojecting GeoJSON with', geojson.features.length, 'features');

  const features = geojson.features.map((feature): GeoJSON.Feature => {
    const geometry = feature.geometry;
    
    if (geometry.type === 'MultiPolygon') {
      const multiPolygon: GeoJSON.MultiPolygon = {
        type: 'MultiPolygon',
        coordinates: reprojectMultiPolygon(geometry.coordinates as number[][][][])
      };
      return {
        type: 'Feature',
        properties: feature.properties,
        geometry: multiPolygon
      };
    } else if (geometry.type === 'Polygon') {
      const polygon: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates: reprojectPolygon(geometry.coordinates as number[][][])
      };
      return {
        type: 'Feature',
        properties: feature.properties,
        geometry: polygon
      };
    }
    
    // For other geometry types, return as-is
    return {
      type: 'Feature',
      properties: feature.properties,
      geometry
    };
  });

  // Return with CRS info as extended FeatureCollection
  const result = {
    type: 'FeatureCollection' as const,
    features,
    crs: {
      type: 'name' as const,
      properties: {
        name: 'urn:ogc:def:crs:OGC:1.3:CRS84'  // WGS84 (longitude, latitude)
      }
    }
  };

  // Log the first feature's first coordinate to verify
  const firstFeature = result.features[0];
  if (firstFeature?.geometry?.type === 'MultiPolygon') {
    const firstCoord = firstFeature.geometry.coordinates[0][0][0];
    console.log('First reprojected coordinate [lng, lat]:', firstCoord);
  }

  return result as GeoJSON.FeatureCollection;
}
