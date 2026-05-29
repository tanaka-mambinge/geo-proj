import type { ButtonHTMLAttributes } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LayersControl, MapContainer, Pane, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { Feature, MultiPolygon, Point, Polygon } from 'geojson';
import { jsPDF } from 'jspdf';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';

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

interface RpcReportItem {
  label: string;
  area_sqm: number;
  status?: string;
}

interface RpcPolygonReport {
  selected_area_sqm: number;
  gold_areas: RpcReportItem[];
  land_use_areas: RpcReportItem[];
  farm_areas: RpcReportItem[];
  timings?: {
    db_duration_ms?: number;
  };
}

interface RpcPointInsight {
  gold: {
    dn: number;
    area: number;
    class: string;
  } | null;
  land_use: {
    dn: number;
    area_ha: number;
    class_name: string;
  } | null;
  farm: {
    name: string | null;
    status: string;
  } | null;
}

interface ExportableFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSON.Feature[];
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

const SUPABASE_RPC_URL =
  import.meta.env.VITE_SUPABASE_RPC_URL || 'http://127.0.0.1:54321/rest/v1/rpc/generate_polygon_report';

const SUPABASE_POINT_RPC_URL =
  import.meta.env.VITE_SUPABASE_POINT_RPC_URL || 'http://127.0.0.1:54321/rest/v1/rpc/generate_point_insight';

const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const STUDY_AREA_BOUNDS: [[number, number], [number, number]] = [
  [-17.527702197260002, 31.345144218345418],
  [-16.822900267188242, 32.01250999308711],
];

const TILE_LAYER_OPTIONS = {
  bounds: STUDY_AREA_BOUNDS,
  maxNativeZoom: 14,
  maxZoom: 18,
  minZoom: 8,
  opacity: 0.9,
};

const isPolygonFeature = (
  feature: Feature | GeoJSON.Feature<GeoJSON.Geometry>
): feature is Feature<Polygon | MultiPolygon> =>
  feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon';

const isLeafletPolygonLayer = (layer: L.Layer): layer is L.Polygon => layer instanceof L.Polygon;

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

const addBreakdownToPdf = (
  doc: jsPDF,
  title: string,
  items: AreaBreakdownItem[],
  startY: number,
  emptyMessage: string
) => {
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = startY;

  const ensureSpace = (required: number) => {
    if (y + required <= pageHeight - 20) {
      return;
    }

    doc.addPage();
    y = 20;
  };

  ensureSpace(18);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(title, 14, y);
  y += 8;

  if (items.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(emptyMessage, 14, y);
    return y + 8;
  }

  items.forEach((item) => {
    ensureSpace(item.compliance ? 28 : 16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(item.label, 14, y);
    doc.text(formatAreaSummary(item.areaSqMeters), 195, y, { align: 'right' });
    y += 6;

    doc.setFont('helvetica', 'normal');
    if (item.secondaryLabel) {
      doc.text(item.secondaryLabel, 14, y);
      y += 5;
    }
    if (item.compliance) {
      const complianceLines = doc.splitTextToSize(
        `Regulation: ${item.compliance.regulation}\nClaim Status: ${item.compliance.claimStatus}\nDecision: ${item.compliance.decision}`,
        180
      );
      doc.text(complianceLines, 14, y);
      y += complianceLines.length * 5;
    }
    y += 4;
  });

  return y;
};

function MapReadyBridge({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap();

  useEffect(() => {
    onReady(map);
  }, [map, onReady]);

  return null;
}

function PointInspectHandler({
  interactionMode,
  onInspect,
}: {
  interactionMode: InteractionMode;
  onInspect: (event: L.LeafletMouseEvent) => void;
}) {
  useMapEvents({
    click: (event) => {
      if (interactionMode !== 'point') {
        return;
      }

      onInspect(event);
    },
  });

  return null;
}

function MapBounds() {
  const map = useMap();

  useEffect(() => {
    const bounds = L.latLngBounds(STUDY_AREA_BOUNDS);
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }, [map]);

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
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [polygonReportError, setPolygonReportError] = useState<string | null>(null);
  const [polygonExportError, setPolygonExportError] = useState<string | null>(null);
  const [lastReportDbDurationMs, setLastReportDbDurationMs] = useState<number | null>(null);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [isDrawingPolygon, setIsDrawingPolygon] = useState(false);
  const [isEditingPolygon, setIsEditingPolygon] = useState(false);

  const popupRef = useRef<L.Popup | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  const selectedPolygonRef = useRef<L.Polygon | null>(null);

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
    setPolygonReportError(null);
    setPolygonExportError(null);
    setLastReportDbDurationMs(null);
    setIsGeneratingReport(false);
    setIsExportingPdf(false);
    setIsDrawingPolygon(false);
    setIsEditingPolygon(false);
  }, [mapInstance, setSelectedPolygon]);

  useEffect(() => {
    setPolygonReport(null);
    setPolygonReportError(null);
    setPolygonExportError(null);

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
      setPolygonReportError(null);
      setPolygonExportError(null);
      setLastReportDbDurationMs(null);
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
        setPolygonReportError(null);
        setPolygonExportError(null);
        setLastReportDbDurationMs(null);
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

  const mapRpcItems = useCallback((items: RpcReportItem[], type: 'gold' | 'landUse' | 'farm'): AreaBreakdownItem[] => {
    return items.map((item) => {
      if (type === 'gold') {
        return {
          label: item.label || 'Unknown',
          areaSqMeters: item.area_sqm,
          color: goldColorScheme[item.label] || '#6b7280',
        };
      }

      if (type === 'landUse') {
        return {
          label: item.label || 'Unknown',
          areaSqMeters: item.area_sqm,
          color: lulcColorScheme[item.label] || '#9ca3af',
          compliance: getLULCComplianceInfo(item.label || ''),
        };
      }

      return {
        label: item.label || 'Unnamed',
        areaSqMeters: item.area_sqm,
        secondaryLabel: item.status,
        color: item.status === 'Commercial' ? '#16a34a' : '#2563eb',
      };
    });
  }, []);

  const fetchPolygonReportFromLayer = useCallback(async (layer: L.Layer) => {
    const toGeoJSONLayer = layer as L.Layer & { toGeoJSON?: () => GeoJSON.Feature };
    if (!toGeoJSONLayer.toGeoJSON) {
      throw new Error('Selected layer cannot be converted to GeoJSON.');
    }

    const feature = toGeoJSONLayer.toGeoJSON();
    if (!isPolygonFeature(feature)) {
      throw new Error('Selected geometry is not a polygon.');
    }

    const response = await fetch(SUPABASE_RPC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        input_geometry: feature.geometry,
        input_srid: 4326,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Failed to generate polygon report.');
    }

    const rpcReport = (await response.json()) as RpcPolygonReport;
    setLastReportDbDurationMs(rpcReport.timings?.db_duration_ms ?? null);
    setPolygonReport({
      selectedAreaSqMeters: rpcReport.selected_area_sqm,
      goldAreas: mapRpcItems(rpcReport.gold_areas || [], 'gold'),
      landUseAreas: mapRpcItems(rpcReport.land_use_areas || [], 'landUse'),
      farmAreas: mapRpcItems(rpcReport.farm_areas || [], 'farm'),
    });
  }, [mapRpcItems]);

  useEffect(() => {
    const selectedPolygon = selectedPolygonRef.current;
    if (!selectedPolygon) {
      return;
    }

    const handleEdit = (event: GeomanEditEvent) => {
      setPolygonNeedsReport(true);
      setPolygonReportError(null);
      setPolygonExportError(null);
      setIsEditingPolygon(isLeafletPolygonLayer(event.layer) ? event.layer.pm.enabled() : false);
    };

    selectedPolygon.on('pm:edit', handleEdit);

    return () => {
      selectedPolygon.off('pm:edit', handleEdit);
    };
  }, [selectedPolygonRef.current]);

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

  const inspectPoint = useCallback(async (event: L.LeafletMouseEvent) => {
    const point: Point = { type: 'Point', coordinates: [event.latlng.lng, event.latlng.lat] };

    try {
      const response = await fetch(SUPABASE_POINT_RPC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          input_point: point,
          input_srid: 4326,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to inspect point.');
      }

      const insight = (await response.json()) as RpcPointInsight;
      if (!insight.gold && !insight.land_use && !insight.farm) {
        return;
      }

      openPopup(
        event.latlng,
        createPopupContent(
          insight.gold
            ? { DN: insight.gold.dn, Area: insight.gold.area, Class: insight.gold.class }
            : null,
          insight.land_use
            ? {
                DN: insight.land_use.dn,
                Area_Ha: insight.land_use.area_ha,
                ClassName: insight.land_use.class_name,
              }
            : null,
          insight.farm
            ? { NAME: insight.farm.name, STATUS: insight.farm.status }
            : null
        ),
        event.target
      );
    } catch (error) {
      console.error(error);
    }
  }, [openPopup]);

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

    setIsGeneratingReport(true);
    setPolygonReportError(null);

    void fetchPolygonReportFromLayer(selectedPolygon)
      .then(() => {
        setPolygonNeedsReport(false);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Failed to generate polygon report.';
        setPolygonReportError(message);
      })
      .finally(() => {
        setIsGeneratingReport(false);
      });
  }, [fetchPolygonReportFromLayer]);

  const buildExportFeatureCollection = useCallback((): ExportableFeatureCollection | null => {
    const selectedPolygon = selectedPolygonRef.current;
    if (!selectedPolygon) {
      return null;
    }

    const rawFeature = selectedPolygon.toGeoJSON() as GeoJSON.Feature;
    return {
      type: 'FeatureCollection',
      features: [
        {
          ...rawFeature,
          properties: {
            ...(rawFeature.properties || {}),
            source: 'geo-proj',
            exported_at: new Date().toISOString(),
            report_generated: Boolean(polygonReport),
            report_stale: polygonNeedsReport,
            selected_area_sqm: polygonReport?.selectedAreaSqMeters ?? null,
          },
        },
      ],
    };
  }, [polygonNeedsReport, polygonReport]);

  const downloadExportBundle = useCallback(async () => {
    if (!polygonReport) {
      return;
    }

    setIsExportingPdf(true);
    setPolygonExportError(null);

    try {
      const exportFeatureCollection = buildExportFeatureCollection();
      if (!exportFeatureCollection) {
        throw new Error('No polygon available to export.');
      }

      const createdAt = new Date();
      const fileStem = `polygon-export-${createdAt.toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;

      downloadBlob(
        new Blob([JSON.stringify(exportFeatureCollection, null, 2)], { type: 'application/geo+json' }),
        `${fileStem}.geojson`
      );

      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      let y = 16;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('Polygon Analysis Report', 14, y);
      y += 8;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.text(`Generated: ${createdAt.toLocaleString()}`, 14, y);
      y += 6;
      doc.text(`Selected area: ${formatAreaSummary(polygonReport.selectedAreaSqMeters)}`, 14, y);
      y += 6;
      doc.text('Geometry export CRS: EPSG:4326 (GeoJSON), analysis CRS: EPSG:32736', 14, y);
      y += 6;
      if (lastReportDbDurationMs !== null) {
        doc.text(`Report generation DB duration: ${lastReportDbDurationMs.toFixed(2)} ms`, 14, y);
        y += 6;
      }

      y = addBreakdownToPdf(doc, 'Gold potential overlap', polygonReport.goldAreas, y, 'No gold-potential polygons overlap this selection.') + 4;
      y = addBreakdownToPdf(doc, 'Land-use overlap', polygonReport.landUseAreas, y, 'No land-use polygons overlap this selection.') + 4;
      y = addBreakdownToPdf(doc, 'Farm overlap', polygonReport.farmAreas, y, 'No farms overlap this selection.') + 4;

      doc.save(`${fileStem}.pdf`);
    } catch (error) {
      setPolygonExportError(error instanceof Error ? error.message : 'Failed to create PDF report.');
    } finally {
      setIsExportingPdf(false);
    }
  }, [buildExportFeatureCollection, lastReportDbDurationMs, polygonReport]);

  return (
    <div className="map-shell">
      <aside className="map-sidebar">
        <div className="map-sidebar-section map-sidebar-hero">
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
            <div className="map-sidebar-stack">
              <p className="map-sidebar-muted">Start drawing, then double-click to finish the polygon. You can refine the selection afterward by toggling edit mode.</p>
              <div className="map-sidebar-actions">
                <SidebarButton onClick={startPolygonDrawing} disabled={!mapInstance || isDrawingPolygon}>
                  {isDrawingPolygon ? 'Drawing in progress...' : 'Start polygon drawing'}
                </SidebarButton>
                <SidebarButton onClick={generatePolygonReport} disabled={!selectedPolygonRef.current || isDrawingPolygon || isGeneratingReport}>
                  {isGeneratingReport ? 'Generating report...' : 'Generate report'}
                </SidebarButton>
                <SidebarButton onClick={togglePolygonEditing} disabled={!selectedPolygonRef.current || isDrawingPolygon}>
                  {isEditingPolygon ? 'Finish editing polygon' : 'Edit polygon'}
                </SidebarButton>
                <SidebarButton onClick={clearPolygonSelection} disabled={!selectedPolygonRef.current && !polygonReport}>
                  Clear polygon
                </SidebarButton>
              </div>
              <SidebarButton onClick={downloadExportBundle} disabled={!polygonReport || polygonNeedsReport || isGeneratingReport || isExportingPdf}>
                {isExportingPdf ? 'Preparing exports...' : 'Download exports'}
              </SidebarButton>
              {polygonReportError ? (
                <p className="map-sidebar-status map-sidebar-status-error">
                  {polygonReportError}
                </p>
              ) : null}
              {polygonExportError ? (
                <p className="map-sidebar-status map-sidebar-status-error">
                  {polygonExportError}
                </p>
              ) : null}
              {selectedPolygonRef.current && polygonNeedsReport ? (
                <p className="map-sidebar-status">
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
              <div className="map-sidebar-report-card">
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
          <PointInspectHandler interactionMode={interactionMode} onInspect={inspectPoint} />

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

          <Pane name="analysis-overlay-pane" style={{ zIndex: 350, pointerEvents: 'none' }}>
            {showFarms ? <TileLayer url="/tiles/farms/{z}/{x}/{y}.png" {...TILE_LAYER_OPTIONS} /> : null}
            {showGold ? <TileLayer url="/tiles/gold/{z}/{x}/{y}.png" {...TILE_LAYER_OPTIONS} /> : null}
            {showLULC ? <TileLayer url="/tiles/lulc/{z}/{x}/{y}.png" {...TILE_LAYER_OPTIONS} /> : null}
          </Pane>

          <MapBounds />
        </MapContainer>
      </div>
    </div>
  );
}
