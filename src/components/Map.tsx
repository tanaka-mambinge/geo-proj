import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import { Feature, GeoJsonObject } from 'geojson';
import L from 'leaflet';
import farmsData from '../data/farms-wgs84.json';

interface FarmProperties {
  NAME: string | null;
  STATUS: string;
}

function MapBounds({ data }: { data: GeoJsonObject }) {
  const map = useMap();

  useEffect(() => {
    try {
      const layer = L.geoJSON(data as GeoJSON.GeoJsonObject);
      const bounds = layer.getBounds();
      console.log('Map bounds:', bounds);
      if (bounds.isValid()) {
        console.log('Fitting to bounds...');
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    } catch (e) {
      console.error('Error calculating bounds:', e);
    }
  }, [map, data]);

  return null;
}

export function Map() {
  const [geoData, setGeoData] = useState<GeoJsonObject | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      console.log('Loading farms data:', farmsData);
      console.log('Number of features:', (farmsData as GeoJSON.FeatureCollection).features?.length);
      setGeoData(farmsData as GeoJsonObject);
    } catch (err) {
      console.error('Error loading GeoJSON:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, []);

  const getStyle = (feature?: Feature) => {
    const status = (feature?.properties as FarmProperties)?.STATUS;
    return {
      fillColor: status === 'Commercial' ? '#2ecc71' : '#3498db',
      weight: 2,
      opacity: 1,
      color: '#2c3e50',
      fillOpacity: 0.5,
    };
  };

  const onEachFeature = (feature: Feature, layer: L.Layer) => {
    const props = feature.properties as FarmProperties;
    const name = props.NAME || 'Unnamed';
    const status = props.STATUS;

    layer.bindPopup(`
      <div style="font-family: system-ui, sans-serif;">
        <h3 style="margin: 0 0 8px 0; color: #2c3e50;">${name}</h3>
        <p style="margin: 0; color: #7f8c8d;">
          <strong>Status:</strong>
          <span style="color: ${status === 'Commercial' ? '#27ae60' : '#2980b9'}">${status}</span>
        </p>
      </div>
    `);
  };

  if (error) {
    return (
      <div style={{ padding: '20px', color: 'red' }}>
        Error loading map: {error}
      </div>
    );
  }

  if (!geoData) {
    return <div style={{ padding: '20px' }}>Loading map data...</div>;
  }

  return (
    <MapContainer
      center={[-17.5, 31.5]}
      zoom={8}
      style={{ height: '100vh', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <GeoJSON
        data={geoData}
        style={getStyle}
        onEachFeature={onEachFeature}
      />
      <MapBounds data={geoData} />
    </MapContainer>
  );
}
