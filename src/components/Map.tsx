import { useEffect, useRef, useCallback, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import { Feature, GeoJsonObject, Point } from 'geojson';
import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
import L from 'leaflet';
import farmsData from '../data/farms-wgs84.json';
import goldData from '../data/gold-potential-wgs84.json';
import lulcData from '../data/lulc-wgs84.json';

interface FarmProperties {
  NAME: string | null;
  STATUS: string;
}

interface GoldProperties {
  DN: number;
  Area: number;
  Class: string;
}

interface LULCProperties {
  DN: number;
  Area_Ha: number;
  ClassName: string;
}

// Color scheme for gold potential (blue → red)
const goldColorScheme: Record<string, string> = {
  'Very Low Potential': '#1e3a8a',
  'Low Potential': '#3b82f6',
  'Moderate Potential': '#8b5cf6',
  'High Potential': '#f97316',
  'Very High Potential': '#dc2626',
};

// Color scheme for LULC (Land Use)
const lulcColorScheme: Record<string, string> = {
  'Water': '#3b82f6',
  'Builtup': '#6b7280',
  'Croplands': '#facc15',
  'Vegetation': '#22c55e',
  'Wooded Grasslands': '#15803d',
  'Bareland': '#d4d4d4',
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

function LayerToggles({ 
  showFarms, 
  setShowFarms,
  showGold, 
  setShowGold,
  showLULC,
  setShowLULC
}: { 
  showFarms: boolean;
  setShowFarms: (show: boolean) => void;
  showGold: boolean;
  setShowGold: (show: boolean) => void;
  showLULC: boolean;
  setShowLULC: (show: boolean) => void;
}) {
  return (
    <div style={{
      position: 'absolute',
      top: '80px',
      right: '20px',
      background: 'white',
      padding: '12px 16px',
      borderRadius: '8px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      border: '2px solid #e5e7eb',
      minWidth: '180px',
    }}>
      <div style={{ fontWeight: 600, marginBottom: '4px', fontSize: '15px' }}>Layers</div>
      
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
        <input 
          type="checkbox" 
          checked={showFarms}
          onChange={(e) => setShowFarms(e.target.checked)}
          style={{ cursor: 'pointer', width: '18px', height: '18px' }}
        />
        <span>Farms</span>
      </label>
      
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
        <input 
          type="checkbox" 
          checked={showGold}
          onChange={(e) => setShowGold(e.target.checked)}
          style={{ cursor: 'pointer', width: '18px', height: '18px' }}
        />
        <span>Gold Potential</span>
      </label>
      
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
        <input 
          type="checkbox" 
          checked={showLULC}
          onChange={(e) => setShowLULC(e.target.checked)}
          style={{ cursor: 'pointer', width: '18px', height: '18px' }}
        />
        <span>Land Use</span>
      </label>
    </div>
  );
}

export function Map() {
  const [showFarms, setShowFarms] = useState(true);
  const [showGold, setShowGold] = useState(true);
  const [showLULC, setShowLULC] = useState(true);
  
  const farmsRef = useRef<GeoJSON.FeatureCollection>(farmsData as GeoJSON.FeatureCollection);
  const lulcRef = useRef<GeoJSON.FeatureCollection>(lulcData as GeoJSON.FeatureCollection);
  const popupRef = useRef<L.Popup | null>(null);

  // Find which farm contains a given point
  const findContainingFarm = useCallback((lng: number, lat: number): Feature | null => {
    const point: Point = { type: 'Point', coordinates: [lng, lat] };
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

  // Find which LULC class contains a given point
  const findContainingLULC = useCallback((lng: number, lat: number): Feature | null => {
    const point: Point = { type: 'Point', coordinates: [lng, lat] };
    for (const lulc of lulcRef.current.features) {
      try {
        if (booleanPointInPolygon(point, lulc.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon)) {
          return lulc;
        }
      } catch (e) {
        continue;
      }
    }
    return null;
  }, []);

  // Style functions
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

  const getLULCStyle = (feature?: Feature) => {
    const className = (feature?.properties as LULCProperties)?.ClassName;
    return {
      fillColor: lulcColorScheme[className] || '#9ca3af',
      weight: 1,
      opacity: 0.7,
      color: '#374151',
      fillOpacity: 0.5,
      dashArray: '5, 5',
    };
  };

  // Helper function to create popup content
  const createPopupContent = (
    goldProps: GoldProperties | null,
    lulcProps: LULCProperties | null,
    farmProps: FarmProperties | null
  ): HTMLDivElement => {
    const popupContent = document.createElement('div');
    popupContent.style.fontFamily = 'system-ui, sans-serif';
    popupContent.style.minWidth = '260px';
    
    let html = '<div style="padding: 8px;">';
    
    // Gold Potential Section
    if (goldProps) {
      const goldColor = goldColorScheme[goldProps.Class] || '#6b7280';
      html += `
        <h3 style="margin: 0 0 8px 0; color: ${goldColor}; font-size: 16px; font-weight: 600;">
          🏆 Gold Potential: ${goldProps.Class}
        </h3>
        <p style="margin: 4px 0; color: #6b7280; font-size: 13px;">
          <strong>Gold Area:</strong> ${goldProps.Area.toLocaleString()} m²
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 10px 0;" />
      `;
    }
    
    // Land Use Section - Always show if available
    if (lulcProps) {
      const lulcColor = lulcColorScheme[lulcProps.ClassName] || '#22c55e';
      html += `
        <p style="margin: 4px 0; color: #374151; font-size: 14px;">
          <strong>🌿 Land Use:</strong> 
          <span style="color: ${lulcColor}; font-weight: 500;">${lulcProps.ClassName}</span>
        </p>
        <p style="margin: 4px 0; color: #6b7280; font-size: 13px;">
          <strong>Land Area:</strong> ${lulcProps.Area_Ha.toLocaleString()} ha
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 10px 0;" />
      `;
    }
    
    // Farm Section
    if (farmProps) {
      html += `
        <p style="margin: 4px 0; color: #374151; font-size: 14px;">
          <strong>📍 Located on Farm:</strong> ${farmProps.NAME || 'Unnamed'}
        </p>
        <p style="margin: 4px 0; font-size: 14px;">
          <strong>Farm Status:</strong> 
          <span style="color: ${farmProps.STATUS === 'Commercial' ? '#16a34a' : '#2563eb'}; font-weight: 500;">
            ${farmProps.STATUS}
          </span>
        </p>
      `;
    } else {
      html += `
        <p style="margin: 4px 0; color: #dc2626; font-size: 14px; font-style: italic;">
          📍 No farm found at this location
        </p>
      `;
    }
    
    html += '</div>';
    popupContent.innerHTML = html;
    return popupContent;
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
      
      const containingLULC = findContainingLULC(lng, lat);
      const lulcProps = containingLULC
        ? (containingLULC.properties as LULCProperties)
        : null;

      const popupContent = createPopupContent(goldProps, lulcProps, farmProps);

      if (popupRef.current) popupRef.current.remove();
      
      popupRef.current = L.popup()
        .setLatLng(e.latlng)
        .setContent(popupContent)
        .openOn(e.target._map);
    });

    const pathLayer = layer as L.Path;
    layer.on('mouseover', () => pathLayer.setStyle({ weight: 3, fillOpacity: 0.8 }));
    layer.on('mouseout', () => pathLayer.setStyle({ weight: 1, fillOpacity: 0.6 }));
  };

  // Popup for farms
  const onFarmClick = (feature: Feature, layer: L.Layer) => {
    const props = feature.properties as FarmProperties;
    layer.bindPopup(`
      <div style="font-family: system-ui, sans-serif;">
        <h3 style="margin: 0 0 8px 0; color: #2c3e50;">${props.NAME || 'Unnamed'}</h3>
        <p style="margin: 0; color: #7f8c8d;">
          <strong>Status:</strong>
          <span style="color: ${props.STATUS === 'Commercial' ? '#27ae60' : '#2980b9'}">${props.STATUS}</span>
        </p>
      </div>
    `);
  };

  // Popup for LULC
  const onLULCClick = (feature: Feature, layer: L.Layer) => {
    const props = feature.properties as LULCProperties;
    const classColor = lulcColorScheme[props.ClassName] || '#9ca3af';
    
    layer.bindPopup(`
      <div style="font-family: system-ui, sans-serif;">
        <h3 style="margin: 0 0 8px 0; color: ${classColor}; font-size: 16px; font-weight: 600;">
          🌿 ${props.ClassName}
        </h3>
        <p style="margin: 4px 0; color: #6b7280; font-size: 13px;">
          <strong>Area:</strong> ${props.Area_Ha.toLocaleString()} ha
        </p>
      </div>
    `);
  };

  return (
    <MapContainer center={[-17.5, 31.5]} zoom={8} style={{ height: '100vh', width: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      
      {showFarms && (
        <GeoJSON
          data={farmsData as GeoJsonObject}
          style={getFarmStyle}
          onEachFeature={onFarmClick}
        />
      )}
      
      {showLULC && (
        <GeoJSON
          data={lulcData as GeoJsonObject}
          style={getLULCStyle}
          onEachFeature={onLULCClick}
        />
      )}
      
      {showGold && (
        <GeoJSON
          data={goldData as GeoJsonObject}
          style={getGoldStyle}
          onEachFeature={onGoldClick}
        />
      )}
      
      <MapBounds data={farmsData as GeoJsonObject} />
      
      <LayerToggles 
        showFarms={showFarms} setShowFarms={setShowFarms}
        showGold={showGold} setShowGold={setShowGold}
        showLULC={showLULC} setShowLULC={setShowLULC}
      />
      
      {/* Legend */}
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
        maxHeight: '70vh',
        overflowY: 'auto',
      }}>
        {showGold && (
          <>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>Gold Potential</h4>
            {Object.entries(goldColorScheme).map(([cls, color]) => (
              <div key={cls} style={{ display: 'flex', alignItems: 'center', margin: '4px 0' }}>
                <div style={{ width: '16px', height: '16px', backgroundColor: color, marginRight: '8px', border: '1px solid #1f2937' }} />
                <span>{cls.replace(' Potential', '')}</span>
              </div>
            ))}
            <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '12px 0' }} />
          </>
        )}
        
        {showLULC && (
          <>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>Land Use</h4>
            {Object.entries(lulcColorScheme).map(([cls, color]) => (
              <div key={cls} style={{ display: 'flex', alignItems: 'center', margin: '4px 0' }}>
                <div style={{ width: '16px', height: '16px', backgroundColor: color, marginRight: '8px', border: '1px solid #374151' }} />
                <span>{cls}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </MapContainer>
  );
}
