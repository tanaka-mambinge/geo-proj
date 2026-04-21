import { useEffect, useRef, useCallback, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import { Feature, GeoJsonObject, Point } from 'geojson';
import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
import L from 'leaflet';
import farmsData from '../data/farms-wgs84.json';
import goldData from '../data/gold-potential-wgs84.json';

interface FarmProperties {
  NAME: string | null;
  STATUS: string;
}

interface GoldProperties {
  DN: number;
  Area: number;
  Class: string;
}

// Color scheme for gold potential (blue → red)
const goldColorScheme: Record<string, string> = {
  'Very Low Potential': '#1e3a8a', // Deep blue
  'Low Potential': '#3b82f6',      // Blue
  'Moderate Potential': '#8b5cf6', // Purple
  'High Potential': '#f97316',     // Orange
  'Very High Potential': '#dc2626', // Deep red
};

function MapBounds({ data }: { data: GeoJsonObject }) {
  const map = useMap();

  useEffect(() => {
    try {
      const layer = L.geoJSON(data as GeoJSON.GeoJsonObject);
      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    } catch (e) {
      console.error('Error calculating bounds:', e);
    }
  }, [map, data]);

  return null;
}

function LayerToggle({ 
  showGold, 
  setShowGold 
}: { 
  showGold: boolean; 
  setShowGold: (show: boolean) => void;
}) {
  return (
    <div style={{
      position: 'absolute',
      top: '80px',
      right: '20px',
      background: 'white',
      padding: '8px 16px',
      borderRadius: '8px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      zIndex: 1000,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      border: '2px solid #e5e7eb',
      userSelect: 'none',
    }} onClick={() => setShowGold(!showGold)}>
      <input 
        type="checkbox" 
        checked={showGold} 
        onChange={(e) => {
          e.stopPropagation();
          setShowGold(e.target.checked);
        }}
        style={{ cursor: 'pointer', width: '18px', height: '18px' }}
      />
      <span style={{ fontWeight: 500 }}>Show Gold Potential</span>
    </div>
  );
}

export function Map() {
  const [showGold, setShowGold] = useState(true);
  const farmsRef = useRef<GeoJSON.FeatureCollection>(farmsData as GeoJSON.FeatureCollection);
  const popupRef = useRef<L.Popup | null>(null);

  // Find which farm contains a given point
  const findContainingFarm = useCallback((lng: number, lat: number): Feature | null => {
    const point: Point = {
      type: 'Point',
      coordinates: [lng, lat]
    };

    for (const farm of farmsRef.current.features) {
      try {
        if (booleanPointInPolygon(point, farm.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon)) {
          return farm;
        }
      } catch (e) {
        continue;
      }
    }
    return null;
  }, []);

  // Style for farms layer
  const getFarmStyle = (feature?: Feature) => {
    const status = (feature?.properties as FarmProperties)?.STATUS;
    return {
      fillColor: status === 'Commercial' ? '#2ecc71' : '#3498db',
      weight: 2,
      opacity: 1,
      color: '#2c3e50',
      fillOpacity: 0.4,
    };
  };

  // Style for gold potential layer
  const getGoldStyle = (feature?: Feature) => {
    const goldClass = (feature?.properties as GoldProperties)?.Class;
    return {
      fillColor: goldColorScheme[goldClass] || '#6b7280',
      weight: 1,
      opacity: 0.8,
      color: '#1f2937',
      fillOpacity: 0.6,
    };
  };

  // Click handler for gold cells
  const onGoldClick = (feature: Feature, layer: L.Layer) => {
    layer.on('click', (e: L.LeafletMouseEvent) => {
      const goldProps = feature.properties as GoldProperties;
      const { lng, lat } = e.latlng;
      
      const containingFarm = findContainingFarm(lng, lat);
      const farmProps = containingFarm 
        ? (containingFarm.properties as FarmProperties)
        : null;

      const popupContent = document.createElement('div');
      popupContent.style.fontFamily = 'system-ui, sans-serif';
      popupContent.style.minWidth = '250px';
      
      const goldColor = goldColorScheme[goldProps.Class] || '#6b7280';
      
      popupContent.innerHTML = `
        <div style="padding: 8px;">
          <h3 style="margin: 0 0 8px 0; color: ${goldColor}; font-size: 16px; font-weight: 600;">
            🏆 Gold Potential: ${goldProps.Class}
          </h3>
          <p style="margin: 4px 0; color: #6b7280; font-size: 13px;">
            <strong>Gold Area:</strong> ${goldProps.Area.toLocaleString()} m²
          </p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 10px 0;" />
          ${farmProps ? `
            <p style="margin: 4px 0; color: #374151; font-size: 14px;">
              <strong>📍 Located on Farm:</strong> ${farmProps.NAME || 'Unnamed'}
            </p>
            <p style="margin: 4px 0; font-size: 14px;">
              <strong>Farm Status:</strong> 
              <span style="color: ${farmProps.STATUS === 'Commercial' ? '#16a34a' : '#2563eb'}; font-weight: 500;">
                ${farmProps.STATUS}
              </span>
            </p>
          ` : `
            <p style="margin: 4px 0; color: #dc2626; font-size: 14px; font-style: italic;">
              📍 No farm found at this location
            </p>
          `}
        </div>
      `;

      if (popupRef.current) {
        popupRef.current.remove();
      }
      
      popupRef.current = L.popup()
        .setLatLng(e.latlng)
        .setContent(popupContent)
        .openOn(e.target._map);
    });

    const pathLayer = layer as L.Path;
    layer.on('mouseover', () => {
      pathLayer.setStyle({ weight: 3, fillOpacity: 0.8 });
    });
    
    layer.on('mouseout', () => {
      pathLayer.setStyle({ weight: 1, fillOpacity: 0.6 });
    });
  };

  // Popup for farms
  const onFarmClick = (feature: Feature, layer: L.Layer) => {
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
        data={farmsData as GeoJsonObject}
        style={getFarmStyle}
        onEachFeature={onFarmClick}
      />
      
      {showGold && (
        <GeoJSON
          data={goldData as GeoJsonObject}
          style={getGoldStyle}
          onEachFeature={onGoldClick}
        />
      )}
      
      <MapBounds data={farmsData as GeoJsonObject} />
      <LayerToggle showGold={showGold} setShowGold={setShowGold} />
      
      {/* Legend - only show when gold is visible */}
      {showGold && (
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          background: 'white',
          padding: '12px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          fontFamily: 'system-ui, sans-serif',
          fontSize: '12px',
          zIndex: 1000,
        }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>Gold Potential</h4>
          {Object.entries(goldColorScheme).map(([cls, color]) => (
            <div key={cls} style={{ display: 'flex', alignItems: 'center', margin: '4px 0' }}>
              <div style={{
                width: '16px',
                height: '16px',
                backgroundColor: color,
                marginRight: '8px',
                border: '1px solid #1f2937',
              }} />
              <span>{cls.replace(' Potential', '')}</span>
            </div>
          ))}
        </div>
      )}
    </MapContainer>
  );
}
