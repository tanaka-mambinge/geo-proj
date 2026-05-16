import type { ButtonHTMLAttributes } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GeoJSON, LayersControl, MapContainer, Pane, TileLayer, useMap } from 'react-leaflet';
import { Feature, GeoJsonObject, MultiPolygon, Point, Polygon } from 'geojson';
import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
import area from '@turf/area';
import intersect from '@turf/intersect';
import { featureCollection } from '@turf/helpers';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
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

interface LULCComplianceInfo {
  regulation: string;
  claimStatus: string;
  decision: string;
}

interface AreaBreakdownItem {
  label: string;
  areaSqMeters: number;
  color?: string;
  secondaryLabel?: string;
  compliance?: LULCComplianceInfo | null;
}

interface PolygonReport {
  selectedAreaSqMeters: number;
  goldAreas: AreaBreakdownItem[];
  landUseAreas: AreaBreakdownItem[];
  farmAreas: AreaBreakdownItem[];
}

interface GeomanCreateEvent {
  layer: L.Layer;
  shape: string;
}

interface GeomanEditEvent {
  layer: L.Layer;
}

type InteractionMode = 'point' | 'polygon';

type LULCComplianceKey =
  | 'Croplands'
  | 'Builtup'
  | 'Water'
  | 'Vegetation'
  | 'Wooded Grasslands'
  | 'Bareland';

const goldColorScheme: Record<string, string> = {
  'Very Low Potential': '#1e3a8a',
  'Low Potential': '#3b82f6',
  'Moderate Potential': '#8b5cf6',
  'High Potential': '#f97316',
  'Very High Potential': '#dc2626',
};

const lulcColorScheme: Record<string, string> = {
  Water: '#3b82f6',
  Builtup: '#6b7280',
  Croplands: '#facc15',
  Vegetation: '#22c55e',
  'Wooded Grasslands': '#15803d',
  Bareland: '#d4d4d4',
};

const lulcComplianceInfo: Record<LULCComplianceKey, LULCComplianceInfo> = {
  Croplands: {
    regulation: "Farmer's permission is required.",
    claimStatus: 'Confirm with mining Cadastre Register (Mashonaland Central Province)',
    decision: 'Proceed with permission + Cadastre Verification Required',
  },
  Builtup: {
    regulation: 'This area is strictly restricted.',
    claimStatus: 'Confirm with local authorities (Mashonaland Central Province)',
    decision: 'Restricted Area (Government Exemption + EIA Approval)',
  },
  Water: {
    regulation: 'Mining is prohibited in water bodies.',
    claimStatus: 'Confirm with local authorities (Mashonaland Central Province)',
    decision: 'No-Go Zone (EIA + Water Authority Approval Required)',
  },
  Vegetation: {
    regulation: 'Environmental protection law applies; clearance requires EIA approval.',
    claimStatus: 'Confirm with Environmental Agency (Mashonaland Central Province)',
    decision: 'Proceed with permission + EIA Approval',
  },
  'Wooded Grasslands': {
    regulation: 'Environmental protection law applies; clearance requires EIA approval.',
    claimStatus: 'Confirm with Environmental Agency (Mashonaland Central Province)',
    decision: 'Proceed with permission + EIA Approval',
  },
  Bareland: {
    regulation: 'This area is open for prospecting.',
    claimStatus: 'No additional permissions required',
    decision: 'Proceed with permission + Cadastre Verification Required',
  },
};

const normalizeLULCClassName = (className: string) => className.toLowerCase().replace(/\s+/g, ' ').trim();

const getLULCComplianceInfo = (className: string) => {
  const normalized = normalizeLULCClassName(className);

  switch (normalized) {
    case 'croplands':
      return lulcComplianceInfo.Croplands;
    case 'builtup':
    case 'built up':
      return lulcComplianceInfo.Builtup;
    case 'water':
      return lulcComplianceInfo.Water;
    case 'vegetation':
      return lulcComplianceInfo.Vegetation;
    case 'wooded grasslands':
    case 'wooded grassland':
    case 'wooded grasland':
      return lulcComplianceInfo['Wooded Grasslands'];
    case 'bareland':
      return lulcComplianceInfo.Bareland;
    default:
      return null;
  }
};

const formatSquareMeters = (value: number) => `${value.toLocaleString(undefined, { maximumFractionDigits: 0 })} m²`;

const formatHectares = (value: number) => `${(value / 10_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} ha`;

const formatAreaSummary = (value: number) => `${formatHectares(value)} (${formatSquareMeters(value)})`;

const isPolygonFeature = (
  feature: Feature | GeoJSON.Feature<GeoJSON.Geometry>
): feature is Feature<Polygon | MultiPolygon> =>
  feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon';

const isLeafletPolygonLayer = (layer: L.Layer): layer is L.Polygon => layer instanceof L.Polygon;

function MapReadyBridge({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap();

  useEffect(() => {
    onReady(map);
  }, [map, onReady]);

  return null;
}

function MapBounds({ data }: { data: GeoJsonObject }) {
  const map = useMap();

  useEffect(() => {
    try {
      const layer = L.geoJSON(data as GeoJSON.GeoJsonObject);
      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [30, 30] });
      }
    } catch (error) {
      console.error('Error calculating bounds:', error);
    }
  }, [map, data]);

  return null;
}

function AreaBreakdownSection({
  title,
  items,
  emptyMessage,
}: {
  title: string;
  items: AreaBreakdownItem[];
  emptyMessage: string;
}) {
  return (
    <section className="map-sidebar-section" style={{ gap: '12px' }}>
      <div>
        <h3 className="map-sidebar-title" style={{ fontSize: '14px' }}>{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="map-sidebar-muted">{emptyMessage}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {items.map((item) => (
            <div
              key={`${title}-${item.label}`}
              style={{
                padding: '12px',
                borderRadius: '10px',
                border: '1px solid #e5e7eb',
                background: '#f8fafc',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: item.color || '#111827' }}>{item.label}</p>
                  {item.secondaryLabel ? (
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#6b7280' }}>{item.secondaryLabel}</p>
                  ) : null}
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: '#374151', textAlign: 'right' }}>{formatAreaSummary(item.areaSqMeters)}</p>
              </div>
              {item.compliance ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <p style={{ margin: 0, fontSize: '12px', color: '#374151' }}><strong>Regulation:</strong> {item.compliance.regulation}</p>
                  <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}><strong>Claim Status:</strong> {item.compliance.claimStatus}</p>
                  <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}><strong>Decision:</strong> {item.compliance.decision}</p>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Legend({ showGold, showLULC }: { showGold: boolean; showLULC: boolean }) {
  if (!showGold && !showLULC) {
    return null;
  }

  return (
    <section className="map-sidebar-section">
      <div>
        <h2 className="map-sidebar-title">Legend</h2>
        <p className="map-sidebar-muted">Reference colors for the visible thematic layers.</p>
      </div>

      {showGold ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#111827' }}>Gold Potential</p>
          {Object.entries(goldColorScheme).map(([label, color]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '14px', height: '14px', borderRadius: '4px', background: color, border: '1px solid #1f2937' }} />
              <span style={{ fontSize: '13px', color: '#374151' }}>{label.replace(' Potential', '')}</span>
            </div>
          ))}
        </div>
      ) : null}

      {showLULC ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#111827' }}>Land Use</p>
          {Object.entries(lulcColorScheme).map(([label, color]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '14px', height: '14px', borderRadius: '4px', background: color, border: '1px solid #374151' }} />
              <span style={{ fontSize: '13px', color: '#374151' }}>{label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function SidebarButton({
  active = false,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...props}
      type={props.type || 'button'}
      className="map-sidebar-button"
      style={{
        background: active ? '#111827' : '#ffffff',
        color: active ? '#ffffff' : '#111827',
        borderColor: active ? '#111827' : '#d1d5db',
      }}
    >
      {children}
    </button>
  );
}

export function Map() {
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('point');
  const [showFarms, setShowFarms] = useState(true);
  const [showGold, setShowGold] = useState(true);
  const [showLULC, setShowLULC] = useState(false);
  const [polygonReport, setPolygonReport] = useState<PolygonReport | null>(null);
  const [polygonNeedsReport, setPolygonNeedsReport] = useState(false);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [isDrawingPolygon, setIsDrawingPolygon] = useState(false);
  const [isEditingPolygon, setIsEditingPolygon] = useState(false);

  const farmsRef = useRef<GeoJSON.FeatureCollection>(farmsData as GeoJSON.FeatureCollection);
  const goldRef = useRef<GeoJSON.FeatureCollection>(goldData as GeoJSON.FeatureCollection);
  const lulcRef = useRef<GeoJSON.FeatureCollection>(lulcData as GeoJSON.FeatureCollection);
  const popupRef = useRef<L.Popup | null>(null);
  const interactionModeRef = useRef<InteractionMode>('point');
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  const selectedPolygonRef = useRef<L.Polygon | null>(null);

  useEffect(() => {
    interactionModeRef.current = interactionMode;
  }, [interactionMode]);

  const closeActivePopup = useCallback(() => {
    if (popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }
  }, []);

  const setSelectedPolygon = useCallback((layer: L.Polygon | null) => {
    selectedPolygonRef.current = layer;
    setIsEditingPolygon(layer ? layer.pm.enabled() : false);
  }, []);

  const clearPolygonSelection = useCallback(() => {
    mapInstance?.pm.disableDraw();
    drawnItemsRef.current?.clearLayers();
    setSelectedPolygon(null);
    setPolygonReport(null);
    setPolygonNeedsReport(false);
    setIsDrawingPolygon(false);
    setIsEditingPolygon(false);
  }, [mapInstance, setSelectedPolygon]);

  useEffect(() => {
    if (interactionMode === 'point') {
      mapInstance?.pm.disableDraw();
      selectedPolygonRef.current?.pm.disable();
      setIsDrawingPolygon(false);
      setIsEditingPolygon(false);
    }
  }, [interactionMode, mapInstance]);

  useEffect(() => {
    if (!mapInstance) {
      return;
    }

    const drawnItems = L.featureGroup();
    drawnItems.addTo(mapInstance);
    drawnItemsRef.current = drawnItems;

    mapInstance.pm.setGlobalOptions({
      layerGroup: drawnItems,
      snappable: false,
      allowSelfIntersection: false,
      finishOnEnter: true,
    });

    const handleCreate = (event: GeomanCreateEvent) => {
      if (event.shape !== 'Polygon' || !isLeafletPolygonLayer(event.layer)) {
        return;
      }

      drawnItems.eachLayer((layer) => {
        if (layer !== event.layer) {
          drawnItems.removeLayer(layer);
        }
      });

      event.layer.pm.disable();
      setSelectedPolygon(event.layer);
      setPolygonReport(null);
      setPolygonNeedsReport(true);
      setIsDrawingPolygon(false);
    };

    const handleDrawStart = () => {
      setIsDrawingPolygon(true);
      selectedPolygonRef.current?.pm.disable();
      setIsEditingPolygon(false);
    };

    const handleDrawEnd = () => {
      setIsDrawingPolygon(false);
    };

    const handleRemove = () => {
      if (drawnItems.getLayers().length === 0) {
        setSelectedPolygon(null);
        setPolygonReport(null);
        setPolygonNeedsReport(false);
        setIsEditingPolygon(false);
      }
    };

    mapInstance.on('pm:create', handleCreate);
    mapInstance.on('pm:drawstart', handleDrawStart);
    mapInstance.on('pm:drawend', handleDrawEnd);
    mapInstance.on('pm:remove', handleRemove);

    return () => {
      mapInstance.off('pm:create', handleCreate);
      mapInstance.off('pm:drawstart', handleDrawStart);
      mapInstance.off('pm:drawend', handleDrawEnd);
      mapInstance.off('pm:remove', handleRemove);
      mapInstance.pm.disableDraw();
      drawnItems.remove();
      drawnItemsRef.current = null;
      selectedPolygonRef.current = null;
    };
  }, [mapInstance, setSelectedPolygon]);

  const findContainingFarm = useCallback((lng: number, lat: number): Feature | null => {
    const point: Point = { type: 'Point', coordinates: [lng, lat] };
    for (const farm of farmsRef.current.features) {
      try {
        if (booleanPointInPolygon(point, farm.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon)) {
          return farm;
        }
      } catch {
        continue;
      }
    }
    return null;
  }, []);

  const findContainingLULC = useCallback((lng: number, lat: number): Feature | null => {
    const point: Point = { type: 'Point', coordinates: [lng, lat] };
    for (const lulc of lulcRef.current.features) {
      try {
        if (booleanPointInPolygon(point, lulc.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon)) {
          return lulc;
        }
      } catch {
        continue;
      }
    }
    return null;
  }, []);

  const buildPolygonReport = useCallback((selection: Feature<Polygon | MultiPolygon>): PolygonReport => {
    const goldAreas = new globalThis.Map<string, AreaBreakdownItem>();
    const landUseAreas = new globalThis.Map<string, AreaBreakdownItem>();
    const farmAreas = new globalThis.Map<string, AreaBreakdownItem>();

    const accumulateOverlap = (
      source: GeoJSON.FeatureCollection,
      target: Map<string, AreaBreakdownItem>,
      getKey: (feature: Feature<Polygon | MultiPolygon>) => string,
      createItem: (feature: Feature<Polygon | MultiPolygon>, overlapArea: number) => AreaBreakdownItem
    ) => {
      for (const rawFeature of source.features) {
        if (!isPolygonFeature(rawFeature)) {
          continue;
        }

        try {
          const overlap = intersect(featureCollection([selection, rawFeature]));
          if (!overlap) {
            continue;
          }

          const overlapArea = area(overlap);
          if (overlapArea <= 0) {
            continue;
          }

          const key = getKey(rawFeature);
          const existing = target.get(key);
          if (existing) {
            existing.areaSqMeters += overlapArea;
          } else {
            target.set(key, createItem(rawFeature, overlapArea));
          }
        } catch {
          continue;
        }
      }
    };

    accumulateOverlap(
      goldRef.current,
      goldAreas,
      (feature) => ((feature.properties as GoldProperties)?.Class || 'Unknown'),
      (feature, overlapArea) => {
        const properties = feature.properties as GoldProperties;
        return {
          label: properties.Class || 'Unknown',
          areaSqMeters: overlapArea,
          color: goldColorScheme[properties.Class] || '#6b7280',
        };
      }
    );

    accumulateOverlap(
      lulcRef.current,
      landUseAreas,
      (feature) => ((feature.properties as LULCProperties)?.ClassName || 'Unknown'),
      (feature, overlapArea) => {
        const properties = feature.properties as LULCProperties;
        return {
          label: properties.ClassName || 'Unknown',
          areaSqMeters: overlapArea,
          color: lulcColorScheme[properties.ClassName] || '#9ca3af',
          compliance: getLULCComplianceInfo(properties.ClassName),
        };
      }
    );

    accumulateOverlap(
      farmsRef.current,
      farmAreas,
      (feature) => {
        const properties = feature.properties as FarmProperties;
        return `${properties.NAME || 'Unnamed'}-${properties.STATUS}`;
      },
      (feature, overlapArea) => {
        const properties = feature.properties as FarmProperties;
        return {
          label: properties.NAME || 'Unnamed',
          areaSqMeters: overlapArea,
          secondaryLabel: properties.STATUS,
          color: properties.STATUS === 'Commercial' ? '#16a34a' : '#2563eb',
        };
      }
    );

    const sortByArea = (items: AreaBreakdownItem[]) => items.sort((left, right) => right.areaSqMeters - left.areaSqMeters);

    return {
      selectedAreaSqMeters: area(selection),
      goldAreas: sortByArea(Array.from(goldAreas.values())),
      landUseAreas: sortByArea(Array.from(landUseAreas.values())),
      farmAreas: sortByArea(Array.from(farmAreas.values())),
    };
  }, []);

  const updatePolygonReportFromLayer = useCallback((layer: L.Layer) => {
    const toGeoJSONLayer = layer as L.Layer & { toGeoJSON?: () => GeoJSON.Feature };
    if (!toGeoJSONLayer.toGeoJSON) {
      return;
    }

    const feature = toGeoJSONLayer.toGeoJSON();
    if (!isPolygonFeature(feature)) {
      return;
    }

    setPolygonReport(buildPolygonReport(feature));
  }, [buildPolygonReport]);

  useEffect(() => {
    const selectedPolygon = selectedPolygonRef.current;
    if (!selectedPolygon) {
      return;
    }

    const handleEdit = (event: GeomanEditEvent) => {
      setPolygonNeedsReport(true);
      setIsEditingPolygon(isLeafletPolygonLayer(event.layer) ? event.layer.pm.enabled() : false);
    };

    selectedPolygon.on('pm:edit', handleEdit);

    return () => {
      selectedPolygon.off('pm:edit', handleEdit);
    };
  }, [selectedPolygonRef.current]);

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

  const createPopupContent = (
    goldProps: GoldProperties | null,
    lulcProps: LULCProperties | null,
    farmProps: FarmProperties | null
  ) => {
    const popupContent = document.createElement('div');
    popupContent.style.fontFamily = 'system-ui, sans-serif';
    popupContent.style.minWidth = '260px';

    let html = '<div style="padding: 8px;">';

    if (goldProps) {
      const goldColor = goldColorScheme[goldProps.Class] || '#6b7280';
      html += `
        <h3 style="margin: 0 0 8px 0; color: ${goldColor}; font-size: 16px; font-weight: 600;">
          Gold Potential: ${goldProps.Class}
        </h3>
        <p style="margin: 4px 0; color: #6b7280; font-size: 13px;">
          <strong>Gold Area:</strong> ${goldProps.Area.toLocaleString()} m²
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 10px 0;" />
      `;
    }

    if (lulcProps) {
      const lulcColor = lulcColorScheme[lulcProps.ClassName] || '#22c55e';
      const compliance = getLULCComplianceInfo(lulcProps.ClassName);
      html += `
        <p style="margin: 4px 0; color: #374151; font-size: 14px;">
          <strong>Land Use:</strong>
          <span style="color: ${lulcColor}; font-weight: 500;">${lulcProps.ClassName}</span>
        </p>
        <p style="margin: 4px 0; color: #6b7280; font-size: 13px;">
          <strong>Land Area:</strong> ${lulcProps.Area_Ha.toLocaleString()} ha
        </p>
        ${compliance ? `
          <div style="margin: 8px 0 0 0; padding: 10px 12px; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px;">
            <p style="margin: 0 0 6px 0; color: #111827; font-size: 13px; font-weight: 600;">Regulation</p>
            <p style="margin: 0 0 8px 0; color: #374151; font-size: 13px; line-height: 1.4;">${compliance.regulation}</p>
            <p style="margin: 0 0 4px 0; color: #6b7280; font-size: 13px;"><strong>Claim Status:</strong> ${compliance.claimStatus}</p>
            <p style="margin: 0; color: #6b7280; font-size: 13px;"><strong>Decision:</strong> ${compliance.decision}</p>
          </div>
        ` : ''}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 10px 0;" />
      `;
    }

    if (farmProps) {
      html += `
        <p style="margin: 4px 0; color: #374151; font-size: 14px;">
          <strong>Located on Farm:</strong> ${farmProps.NAME || 'Unnamed'}
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
          No farm found at this location
        </p>
      `;
    }

    html += '</div>';
    popupContent.innerHTML = html;
    return popupContent;
  };

  const openPopup = useCallback((latlng: L.LatLngExpression, content: string | HTMLElement, map: L.Map) => {
    closeActivePopup();
    popupRef.current = L.popup().setLatLng(latlng).setContent(content).openOn(map);
  }, [closeActivePopup]);

  const onGoldClick = (feature: Feature, layer: L.Layer) => {
    layer.on('click', (event: L.LeafletMouseEvent) => {
      if (interactionModeRef.current !== 'point') {
        return;
      }

      const goldProps = feature.properties as GoldProperties;
      const { lng, lat } = event.latlng;
      const containingFarm = findContainingFarm(lng, lat);
      const containingLULC = findContainingLULC(lng, lat);

      openPopup(
        event.latlng,
        createPopupContent(
          goldProps,
          containingLULC ? (containingLULC.properties as LULCProperties) : null,
          containingFarm ? (containingFarm.properties as FarmProperties) : null
        ),
        event.target._map
      );
    });

    const pathLayer = layer as L.Path;
    layer.on('mouseover', () => pathLayer.setStyle({ weight: 3, fillOpacity: 0.8 }));
    layer.on('mouseout', () => pathLayer.setStyle({ weight: 1, fillOpacity: 0.6 }));
  };

  const onFarmClick = (feature: Feature, layer: L.Layer) => {
    const props = feature.properties as FarmProperties;
    layer.on('click', (event: L.LeafletMouseEvent) => {
      if (interactionModeRef.current !== 'point') {
        return;
      }

      openPopup(
        event.latlng,
        `
          <div style="font-family: system-ui, sans-serif;">
            <h3 style="margin: 0 0 8px 0; color: #2c3e50;">${props.NAME || 'Unnamed'}</h3>
            <p style="margin: 0; color: #7f8c8d;">
              <strong>Status:</strong>
              <span style="color: ${props.STATUS === 'Commercial' ? '#27ae60' : '#2980b9'}">${props.STATUS}</span>
            </p>
          </div>
        `,
        event.target._map
      );
    });
  };

  const onLULCClick = (feature: Feature, layer: L.Layer) => {
    const props = feature.properties as LULCProperties;
    const classColor = lulcColorScheme[props.ClassName] || '#9ca3af';

    layer.on('click', (event: L.LeafletMouseEvent) => {
      if (interactionModeRef.current !== 'point') {
        return;
      }

      openPopup(
        event.latlng,
        `
          <div style="font-family: system-ui, sans-serif;">
            <h3 style="margin: 0 0 8px 0; color: ${classColor}; font-size: 16px; font-weight: 600;">
              ${props.ClassName}
            </h3>
            <p style="margin: 4px 0; color: #6b7280; font-size: 13px;">
              <strong>Area:</strong> ${props.Area_Ha.toLocaleString()} ha
            </p>
          </div>
        `,
        event.target._map
      );
    });
  };

  const startPolygonDrawing = useCallback(() => {
    if (!mapInstance || interactionMode !== 'polygon') {
      return;
    }

    closeActivePopup();
    clearPolygonSelection();
    mapInstance.pm.enableDraw('Polygon', {
      snappable: false,
      allowSelfIntersection: false,
      continueDrawing: false,
      finishOn: 'dblclick',
      pathOptions: {
        color: '#111827',
        weight: 2,
        fillColor: '#60a5fa',
        fillOpacity: 0.2,
      },
      templineStyle: {
        color: '#111827',
      },
      hintlineStyle: {
        color: '#60a5fa',
        dashArray: [4, 6],
      },
    });
  }, [clearPolygonSelection, closeActivePopup, interactionMode, mapInstance]);

  const togglePolygonEditing = useCallback(() => {
    const selectedPolygon = selectedPolygonRef.current;
    if (!selectedPolygon) {
      return;
    }

    if (selectedPolygon.pm.enabled()) {
      selectedPolygon.pm.disable();
      setIsEditingPolygon(false);
      return;
    }

    selectedPolygon.pm.enable({ allowSelfIntersection: false });
    setIsEditingPolygon(true);
  }, []);

  const generatePolygonReport = useCallback(() => {
    const selectedPolygon = selectedPolygonRef.current;
    if (!selectedPolygon) {
      return;
    }

    updatePolygonReportFromLayer(selectedPolygon);
    setPolygonNeedsReport(false);
  }, [updatePolygonReportFromLayer]);

  const renderOverlayLayers = (interactive: boolean, pane?: string) => (
    <>
      {showFarms ? (
        <GeoJSON
          key={`farms-${interactive ? 'interactive' : 'static'}`}
          data={farmsData as GeoJsonObject}
          style={getFarmStyle}
          onEachFeature={onFarmClick}
          interactive={interactive}
          pane={pane}
        />
      ) : null}

      {showLULC ? (
        <GeoJSON
          key={`lulc-${interactive ? 'interactive' : 'static'}`}
          data={lulcData as GeoJsonObject}
          style={getLULCStyle}
          onEachFeature={onLULCClick}
          interactive={interactive}
          pane={pane}
        />
      ) : null}

      {showGold ? (
        <GeoJSON
          key={`gold-${interactive ? 'interactive' : 'static'}`}
          data={goldData as GeoJsonObject}
          style={getGoldStyle}
          onEachFeature={onGoldClick}
          interactive={interactive}
          pane={pane}
        />
      ) : null}
    </>
  );

  return (
    <div className="map-shell">
      <aside className="map-sidebar">
        <div className="map-sidebar-section">
          <div>
            <p className="map-sidebar-eyebrow">Geo Inspector</p>
            <h1 className="map-sidebar-heading">Area and point analysis</h1>
            <p className="map-sidebar-muted">Switch between point inspection and polygon-based reporting without overlay panels covering the map.</p>
          </div>
        </div>

        <section className="map-sidebar-section">
          <div>
            <h2 className="map-sidebar-title">Mode</h2>
            <p className="map-sidebar-muted">Point mode keeps the click report. Polygon mode analyzes all areas covered by a drawn selection.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <SidebarButton active={interactionMode === 'point'} onClick={() => setInteractionMode('point')}>
              Point inspect
            </SidebarButton>
            <SidebarButton active={interactionMode === 'polygon'} onClick={() => setInteractionMode('polygon')}>
              Polygon report
            </SidebarButton>
          </div>

          {interactionMode === 'polygon' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <p className="map-sidebar-muted">Start drawing, then double-click to finish the polygon. You can refine the selection afterward by toggling edit mode.</p>
              <SidebarButton onClick={startPolygonDrawing} disabled={!mapInstance || isDrawingPolygon}>
                {isDrawingPolygon ? 'Drawing in progress...' : 'Start polygon drawing'}
              </SidebarButton>
              <SidebarButton onClick={generatePolygonReport} disabled={!selectedPolygonRef.current || isDrawingPolygon}>
                Generate report
              </SidebarButton>
              <SidebarButton onClick={togglePolygonEditing} disabled={!selectedPolygonRef.current || isDrawingPolygon}>
                {isEditingPolygon ? 'Finish editing polygon' : 'Edit polygon'}
              </SidebarButton>
              <SidebarButton onClick={clearPolygonSelection} disabled={!selectedPolygonRef.current && !polygonReport}>
                Clear polygon
              </SidebarButton>
              {selectedPolygonRef.current && polygonNeedsReport ? (
                <p className="map-sidebar-muted" style={{ marginTop: 0 }}>
                  Polygon changed. Generate report when you want to refresh the analysis.
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="map-sidebar-section">
          <div>
            <h2 className="map-sidebar-title">Layers</h2>
            <p className="map-sidebar-muted">Turn thematic layers on or off without competing with the drawing workflow.</p>
          </div>

          <label className="map-layer-toggle">
            <input type="checkbox" checked={showFarms} onChange={(event) => setShowFarms(event.target.checked)} />
            <span>Farms</span>
          </label>
          <label className="map-layer-toggle">
            <input type="checkbox" checked={showGold} onChange={(event) => setShowGold(event.target.checked)} />
            <span>Gold Potential</span>
          </label>
          <label className="map-layer-toggle">
            <input type="checkbox" checked={showLULC} onChange={(event) => setShowLULC(event.target.checked)} />
            <span>Land Use</span>
          </label>
        </section>

        <Legend showGold={showGold} showLULC={showLULC} />

        {interactionMode === 'polygon' && polygonReport ? (
          <>
            <section className="map-sidebar-section">
              <div>
                <h2 className="map-sidebar-title">Polygon report</h2>
                <p className="map-sidebar-muted">Overlap totals are calculated from the exact area shared between your polygon and each map layer.</p>
              </div>
              <div style={{ padding: '12px', borderRadius: '10px', background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                <p style={{ margin: 0, fontSize: '12px', color: '#1d4ed8', fontWeight: 700 }}>Selected area</p>
                <p style={{ margin: '6px 0 0 0', fontSize: '14px', color: '#111827', fontWeight: 600 }}>{formatAreaSummary(polygonReport.selectedAreaSqMeters)}</p>
              </div>
            </section>

            <AreaBreakdownSection title="Gold potential overlap" items={polygonReport.goldAreas} emptyMessage="No gold-potential polygons overlap this selection." />
            <AreaBreakdownSection title="Land-use overlap" items={polygonReport.landUseAreas} emptyMessage="No land-use polygons overlap this selection." />
            <AreaBreakdownSection title="Farm overlap" items={polygonReport.farmAreas} emptyMessage="No farms overlap this selection." />
          </>
        ) : null}
      </aside>

      <div className="map-canvas-panel">
        <MapContainer center={[-17.5, 31.5]} zoom={8} className="map-canvas">
          <MapReadyBridge onReady={setMapInstance} />

          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="OpenStreetMap">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
            </LayersControl.BaseLayer>

            <LayersControl.BaseLayer name="Satellite (ESRI)">
              <TileLayer
                attribution="Tiles &copy; Esri"
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                maxZoom={19}
              />
            </LayersControl.BaseLayer>

            <LayersControl.BaseLayer name="Topographic">
              <TileLayer
                attribution="Tiles &copy; Esri"
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
                maxZoom={19}
              />
            </LayersControl.BaseLayer>
          </LayersControl>

          {interactionMode === 'polygon' ? (
            <Pane name="analysis-overlay-pane" style={{ zIndex: 350, pointerEvents: 'none' }}>
              {renderOverlayLayers(false, 'analysis-overlay-pane')}
            </Pane>
          ) : (
            renderOverlayLayers(true)
          )}

          <MapBounds data={farmsData as GeoJsonObject} />
        </MapContainer>
      </div>
    </div>
  );
}
