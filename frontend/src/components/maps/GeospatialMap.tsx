import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import {
  Activity,
  CloudRain,
  Compass,
  Droplets,
  Info,
  Layers,
  MapPin,
  Maximize2,
  Minimize2,
  RotateCcw,
  Thermometer,
  Waves,
  Wind,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { latLonToUtm43N, PILOT_CONFIG, STATION_RISK_META } from '../../engine/pilotConfig';
import {
  renderRasterOverlayDataUrl,
  renderSafeZonesOverlayDataUrl,
  renderVegetationBaseUrl,
  renderZoneOverlayDataUrl,
} from '../../services/mapService';
import type {
  AlertTier,
  BasemapStyle,
  Intervention,
  MapLayerVisibility,
  MapRasterLayer,
  MonitoringStation,
  Scenario,
  SelectedMapFeature,
  SimResult,
  TwinGrid,
} from '../../types/floodforge';
import { cn } from '../../utils/cn';
import { formatCoord, formatNumber, formatPKR } from '../../utils/formatters';
import { AlertTierBadge, StationRiskBadge } from '../ui/Primitives';

interface GeospatialMapProps {
  twin: TwinGrid;
  simResult: SimResult;
  baselineResult?: SimResult;
  scenario: Scenario;
  stations?: MonitoringStation[];
  selectedStationId?: string | null;
  onSelectStation?: (stationId: string | null) => void;
  interventions?: Intervention[];
  layers: MapLayerVisibility;
  onToggleLayer?: (key: keyof MapLayerVisibility) => void;
  activeRaster?: MapRasterLayer;
  onActiveRasterChange?: (r: MapRasterLayer) => void;
  basemap?: BasemapStyle;
  onBasemapChange?: (b: BasemapStyle) => void;
  viewMode?: 'mitigated' | 'baseline' | 'delta';
  rasterOpacity?: number;
  selectedFeature?: SelectedMapFeature | null;
  onSelectFeature?: (f: SelectedMapFeature | null) => void;
  focusTarget?: { lat: number; lon: number; zoom?: number } | null;
  heightClass?: string;
  showQuickLayerBar?: boolean;
  showInlineInfoPanel?: boolean;
}

const BASEMAP_URLS: Record<
  BasemapStyle,
  { url: string; attribution: string; label: string; className?: string }
> = {
  municipal_green: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors | Municipal GIS',
    label: 'Municipal Map',
    className: 'municipal-green-tiles',
  },
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    label: 'Street Map',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{x}/{y}',
    attribution: 'Tiles &copy; Esri',
    label: 'Satellite',
  },
  tactical_grid: {
    url: '',
    attribution: 'FloodForge Municipal Vector Base',
    label: 'Vector Only',
  },
};

function StationPopupCard({
  station,
  onClose,
}: {
  station: MonitoringStation;
  onClose: () => void;
}) {
  const riskMeta = STATION_RISK_META[station.riskLevel];
  return (
    <div className="bg-white text-[#26364A] text-xs font-sans">
      {/* Header */}
      <div className="px-3 py-2 bg-[#173C79] text-white flex items-start justify-between gap-2 rounded-t-[3px]">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-sm bg-white/15 text-white font-semibold whitespace-nowrap flex-shrink-0">
              {station.stationCode}
            </span>
            <span className="font-semibold text-xs truncate">{station.name}</span>
          </div>
          <div className="text-[10px] text-white/80 flex items-center gap-1 mt-0.5 truncate">
            <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
            <span className="truncate">
              {station.location} ({station.sector})
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Close station popup"
          className="p-0.5 rounded hover:bg-white/15 text-white/85 hover:text-white cursor-pointer flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Risk & Coordinates Strip */}
      <div className="px-3 py-2 bg-[#F5F6F7] border-b border-[#E2E6EC] flex items-center justify-between gap-2">
        <StationRiskBadge level={station.riskLevel} />
        <span className="font-mono text-[10px] text-[#5A6A7E]">
          {formatCoord(station.lat, station.lon)}
        </span>
      </div>

      {/* Telemetry Metrics Grid */}
      <div className="p-3 grid grid-cols-2 gap-2">
        <div className="p-2 rounded-sm bg-[#F8F9FA] border border-[#E2E6EC]">
          <div className="flex items-center gap-1 text-[10px] text-[#5A6A7E]">
            <CloudRain className="w-3 h-3 text-[#244D8F]" />
            <span>Rainfall</span>
          </div>
          <div className="font-mono font-bold text-[13px] text-[#26364A] mt-0.5">
            {station.rainfallMmHr !== null ? `${station.rainfallMmHr.toFixed(1)} mm/h` : 'Data unavailable'}
          </div>
        </div>

        <div className="p-2 rounded-sm bg-[#F8F9FA] border border-[#E2E6EC]">
          <div className="flex items-center gap-1 text-[10px] text-[#5A6A7E]">
            <Waves className="w-3 h-3 text-[#173C79]" />
            <span>Water Level (Proxy)</span>
          </div>
          <div
            className="font-mono font-bold text-[13px] mt-0.5"
            style={{ color: riskMeta.textHex }}
          >
            {station.waterLevelM !== null
              ? `${station.waterLevelM.toFixed(2)} m`
              : 'Data unavailable'}
          </div>
        </div>

        <div className="p-2 rounded-sm bg-[#F8F9FA] border border-[#E2E6EC]">
          <div className="flex items-center gap-1 text-[10px] text-[#5A6A7E]">
            <Thermometer className="w-3 h-3 text-[#EF8735]" />
            <span>Air Temp</span>
          </div>
          <div className="font-mono font-semibold text-xs text-[#26364A] mt-0.5">
            {station.temperatureC !== null ? `${station.temperatureC.toFixed(1)} °C` : 'Data unavailable'}
          </div>
        </div>

        <div className="p-2 rounded-sm bg-[#F8F9FA] border border-[#E2E6EC]">
          <div className="flex items-center gap-1 text-[10px] text-[#5A6A7E]">
            <Wind className="w-3 h-3 text-[#55A85F]" />
            <span>Wind Speed</span>
          </div>
          <div className="font-mono font-semibold text-xs text-[#26364A] mt-0.5">
            {station.windSpeedKmh !== null ? `${station.windSpeedKmh.toFixed(1)} km/h` : 'Data unavailable'}
          </div>
        </div>
      </div>

      {/* Secondary Station Metadata */}
      <div className="px-3 pb-2.5 space-y-1 text-[11px] border-t border-[#E6EAEF] pt-2">
        <div className="flex items-center justify-between">
          <span className="text-[#5A6A7E] flex items-center gap-1">
            <Droplets className="w-3 h-3 text-[#244D8F]" />
            Soil Moisture (0–9 cm)
          </span>
          <span className="font-mono font-semibold text-[#173C79]">
            {station.soilMoistureLabel}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[#5A6A7E] flex items-center gap-1">
            <Activity className="w-3 h-3 text-[#55A85F]" />
            Station Status
          </span>
          <span
            className={cn(
              'font-semibold text-[11px]',
              station.operationalStatus === 'Operational'
                ? 'text-[#2F6F37]'
                : station.operationalStatus === 'Elevated Load'
                  ? 'text-[#A64D0B]'
                  : 'text-[#5A6A7E]'
            )}
          >
            {station.operationalStatus}
          </span>
        </div>
        <div className="flex items-center justify-between text-[10px] text-[#5A6A7E] pt-1 border-t border-[#F0F1F2]">
          <span>Runoff proxy: {station.modeledAccumulationMm.toFixed(1)} mm</span>
          <span className="font-mono">{station.lastUpdated.split(',').pop()?.trim()}</span>
        </div>
      </div>
    </div>
  );
}

export function GeospatialMap({
  twin,
  simResult,
  baselineResult,
  scenario,
  stations = [],
  selectedStationId: externalStationId,
  onSelectStation,
  interventions = [],
  layers,
  onToggleLayer,
  activeRaster: externalRaster,
  onActiveRasterChange,
  basemap: externalBasemap,
  onBasemapChange,
  viewMode = 'mitigated',
  rasterOpacity = 0.58,
  selectedFeature: externalFeature,
  onSelectFeature,
  focusTarget,
  heightClass = 'h-[500px] lg:h-[600px]',
  showQuickLayerBar = true,
  showInlineInfoPanel = true,
}: GeospatialMapProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const vegOverlayRef = useRef<L.ImageOverlay | null>(null);
  const zoneOverlayRef = useRef<L.ImageOverlay | null>(null);
  const imageOverlayRef = useRef<L.ImageOverlay | null>(null);
  const safeZoneOverlayRef = useRef<L.ImageOverlay | null>(null);
  const vectorGroupRef = useRef<L.LayerGroup | null>(null);
  const stationGroupRef = useRef<L.LayerGroup | null>(null);
  const popupRef = useRef<L.Popup | null>(null);
  const popupHostRef = useRef<HTMLDivElement>(document.createElement('div'));

  const [internalBasemap, setInternalBasemap] = useState<BasemapStyle>('municipal_green');
  const [internalRaster, setInternalRaster] = useState<MapRasterLayer>('flood_risk');
  const [internalFeature, setInternalFeature] = useState<SelectedMapFeature | null>(null);
  const [internalStationId, setInternalStationId] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(true);
  const [quickLayersOpen, setQuickLayersOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  const basemap = externalBasemap ?? internalBasemap;
  const setBasemap = onBasemapChange ?? setInternalBasemap;

  const selectedStationId =
    externalStationId !== undefined ? externalStationId : internalStationId;
  const setSelectedStationId = onSelectStation ?? setInternalStationId;

  const activeRaster: MapRasterLayer = useMemo(() => {
    if (externalRaster) return externalRaster;
    if (layers.flood_risk) return 'flood_risk';
    if (layers.rainfall) return 'rainfall';
    if (layers.elevation) return 'elevation';
    if (layers.population) return 'population';
    return internalRaster;
  }, [externalRaster, layers, internalRaster]);

  const setActiveRaster = onActiveRasterChange ?? setInternalRaster;
  const selectedFeature =
    externalFeature !== undefined ? externalFeature : internalFeature;
  const setSelectedFeature = onSelectFeature ?? setInternalFeature;

  const studyCfg = PILOT_CONFIG.studyAreas[twin.studyAreaId];

  const selectedStation = useMemo(
    () => stations.find((s) => s.id === selectedStationId) ?? null,
    [stations, selectedStationId]
  );

  // Track responsive viewport for mobile bottom-sheet vs floating map popup
  useEffect(() => {
    const onResize = () => setIsMobileViewport(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Initialize Leaflet Map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: studyCfg.center,
      zoom: studyCfg.defaultZoom,
      zoomControl: false,
      minZoom: 11,
      maxZoom: 17,
    });

    L.control.scale({ imperial: false, metric: true, position: 'bottomleft' }).addTo(map);

    const vectorGroup = L.layerGroup().addTo(map);
    const stationGroup = L.layerGroup().addTo(map);
    vectorGroupRef.current = vectorGroup;
    stationGroupRef.current = stationGroup;
    mapRef.current = map;

    map.on('mousemove', (ev: L.LeafletMouseEvent) => {
      setCursorCoords({ lat: ev.latlng.lat, lon: ev.latlng.lng });
    });

    return () => {
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      vegOverlayRef.current = null;
      zoneOverlayRef.current = null;
      imageOverlayRef.current = null;
      vectorGroupRef.current = null;
      stationGroupRef.current = null;
      popupRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Pan/zoom smoothly when studyArea changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setView(studyCfg.center, studyCfg.defaultZoom, { animate: true });
  }, [studyCfg]);

  // Focus target from hotspot/alert click (instant pan so anchored popup autoPan stays accurate)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusTarget) return;
    map.setView([focusTarget.lat, focusTarget.lon], focusTarget.zoom ?? 14, {
      animate: false,
    });
  }, [focusTarget]);

  // Switch basemap tiles + light-green vegetation base
  const vegBaseUrl = useMemo(() => renderVegetationBaseUrl(twin), [twin]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }
    if (vegOverlayRef.current) {
      map.removeLayer(vegOverlayRef.current);
      vegOverlayRef.current = null;
    }

    const spec = BASEMAP_URLS[basemap];
    if (spec.url) {
      const layer = L.tileLayer(spec.url, {
        attribution: spec.attribution,
        maxZoom: 18,
        maxNativeZoom: basemap === 'satellite' ? 15 : 18,
        className: spec.className ?? '',
      });
      layer.addTo(map);
      layer.bringToBack();
      tileLayerRef.current = layer;
    }

    if ((basemap === 'municipal_green' || basemap === 'tactical_grid') && vegBaseUrl) {
      const { south, west, north, east } = twin.bbox_wgs84;
      const vegLayer = L.imageOverlay(
        vegBaseUrl,
        L.latLngBounds([south, west], [north, east]),
        { opacity: basemap === 'tactical_grid' ? 0.85 : 0.42, interactive: false }
      );
      vegLayer.addTo(map);
      vegOverlayRef.current = vegLayer;
    }
  }, [basemap, vegBaseUrl, twin.bbox_wgs84]);

  // Raster overlay generation & update
  const rasterVisible =
    layers.flood_risk || layers.rainfall || layers.elevation || layers.population;

  const rasterDataUrl = useMemo(() => {
    if (!rasterVisible) return '';
    return renderRasterOverlayDataUrl(
      activeRaster,
      twin,
      simResult,
      scenario,
      baselineResult,
      viewMode
    );
  }, [rasterVisible, activeRaster, twin, simResult, scenario, baselineResult, viewMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (imageOverlayRef.current) {
      map.removeLayer(imageOverlayRef.current);
      imageOverlayRef.current = null;
    }

    if (rasterVisible && rasterDataUrl) {
      const { south, west, north, east } = twin.bbox_wgs84;
      const bounds = L.latLngBounds([south, west], [north, east]);
      const overlay = L.imageOverlay(rasterDataUrl, bounds, {
        opacity: rasterOpacity,
        interactive: false,
      });
      overlay.addTo(map);
      imageOverlayRef.current = overlay;
    }
  }, [rasterVisible, rasterDataUrl, twin.bbox_wgs84, rasterOpacity]);

  // Safe High-Ground Zones overlay (<25 mm runoff)
  const safeZoneDataUrl = useMemo(() => {
    if (!layers.safe_zones) return '';
    return renderSafeZonesOverlayDataUrl(twin, simResult);
  }, [layers.safe_zones, twin, simResult]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (safeZoneOverlayRef.current) {
      map.removeLayer(safeZoneOverlayRef.current);
      safeZoneOverlayRef.current = null;
    }
    if (layers.safe_zones && safeZoneDataUrl) {
      const { south, west, north, east } = twin.bbox_wgs84;
      const bounds = L.latLngBounds([south, west], [north, east]);
      const overlay = L.imageOverlay(safeZoneDataUrl, bounds, {
        opacity: 0.65,
        interactive: false,
      });
      overlay.addTo(map);
      safeZoneOverlayRef.current = overlay;
    }
  }, [layers.safe_zones, safeZoneDataUrl, twin.bbox_wgs84]);

  // Color-coded Zone 1 (Upstream Islamabad Blue) & Zone 2 (Downstream Rawalpindi Amber) overlay
  const zoneDataUrl = useMemo(() => {
    if (!layers.neighborhoods) return '';
    return renderZoneOverlayDataUrl(twin);
  }, [layers.neighborhoods, twin]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (zoneOverlayRef.current) {
      map.removeLayer(zoneOverlayRef.current);
      zoneOverlayRef.current = null;
    }
    if (layers.neighborhoods && zoneDataUrl) {
      const { south, west, north, east } = twin.bbox_wgs84;
      const bounds = L.latLngBounds([south, west], [north, east]);
      const overlay = L.imageOverlay(zoneDataUrl, bounds, {
        opacity: 0.85,
        interactive: false,
      });
      overlay.addTo(map);
      zoneOverlayRef.current = overlay;
    }
  }, [layers.neighborhoods, zoneDataUrl, twin.bbox_wgs84]);

  // Handle map background click: dismiss active station popup or inspect grid cell
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onMapClick = (ev: L.LeafletMouseEvent) => {
      if (selectedStationId) {
        setSelectedStationId(null);
        return;
      }
      if (!showInlineInfoPanel && !onSelectFeature) return;

      const { lat, lng } = ev.latlng;
      const { north, south, west, east } = twin.bbox_wgs84;
      if (lat < south || lat > north || lng < west || lng > east) return;

      const row = Math.min(
        twin.rows - 1,
        Math.max(0, Math.floor(((north - lat) / (north - south)) * twin.rows))
      );
      const col = Math.min(
        twin.cols - 1,
        Math.max(0, Math.floor(((lng - west) / (east - west)) * twin.cols))
      );
      const idx = row * twin.cols + col;
      const acc = simResult.accumulation_mm[idx];
      const baseAcc = baselineResult ? baselineResult.accumulation_mm[idx] : acc;
      const zId = twin.zones[idx];
      const zName = twin.zone_meta.find((z) => z.id === zId)?.name ?? `Zone ${zId}`;
      const lc = twin.land_cover[idx] as keyof typeof PILOT_CONFIG.land_cover_labels;

      const riskCategory: AlertTier =
        acc >= 85 ? 'Warning' : acc >= 50 ? 'Watch' : acc >= 25 ? 'Advisory' : 'Normal';

      setSelectedFeature({
        kind: 'cell',
        title: `30 m Screening Cell [${row}, ${col}]`,
        subtitle: `${PILOT_CONFIG.land_cover_labels[lc] ?? 'Urban'} · Imperviousness ${(twin.f_imp[idx] * 100).toFixed(0)}%`,
        lat,
        lon: lng,
        utmCoords: latLonToUtm43N(lat, lng),
        zoneName: zName,
        riskCategory,
        details: [
          {
            label: 'Modeled Runoff Proxy',
            value: `${acc.toFixed(1)} mm`,
            accent: acc >= 50 ? 'red' : 'cyan',
          },
          {
            label: 'Baseline Delta',
            value: `${acc - baseAcc >= 0 ? '+' : ''}${(acc - baseAcc).toFixed(1)} mm`,
            accent: acc - baseAcc < -1 ? 'emerald' : 'amber',
          },
          { label: 'Elevation (GLO-30 proxy)', value: `${twin.dem[idx].toFixed(1)} m` },
          { label: 'Buildings in Cell', value: `${twin.buildings[idx]}` },
          { label: 'Population Estimate', value: `${twin.population[idx].toFixed(0)} people` },
        ],
      });
    };

    map.on('click', onMapClick);
    return () => {
      map.off('click', onMapClick);
    };
  }, [
    twin,
    simResult,
    baselineResult,
    selectedStationId,
    setSelectedStationId,
    setSelectedFeature,
    showInlineInfoPanel,
    onSelectFeature,
  ]);

  // Render vector layers (neighborhoods, waterways, roads, buildings, facilities, interventions)
  useEffect(() => {
    const group = vectorGroupRef.current;
    if (!group) return;
    group.clearLayers();

    // 1. Neighborhood boundaries (Zone 1 Upstream Islamabad Blue vs. Zone 2 Downstream Rawalpindi Amber)
    if (layers.neighborhoods) {
      for (const zm of twin.zone_meta) {
        const isUpstreamIslamabad = zm.id === 1 || zm.sector === 'Islamabad';
        const zoneColor = isUpstreamIslamabad ? '#173C79' : '#EF8735';
        const poly = L.polygon(zm.polygon, {
          color: zoneColor,
          weight: 1.5,
          dashArray: '5 4',
          fillColor: zoneColor,
          fillOpacity: 0.04,
        });
        poly.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          setSelectedStationId(null);
          const centerLat = (zm.bounds.north + zm.bounds.south) / 2;
          const centerLon = (zm.bounds.east + zm.bounds.west) / 2;
          setSelectedFeature({
            kind: 'zone',
            title: zm.name,
            subtitle: `${zm.sector} · ${zm.populationDensityLabel}`,
            lat: centerLat,
            lon: centerLon,
            utmCoords: latLonToUtm43N(centerLat, centerLon),
            zoneName: zm.name,
            riskCategory: 'Advisory',
            details: [
              { label: 'Jurisdiction', value: zm.sector },
              { label: 'Urban Fabric', value: zm.populationDensityLabel },
              { label: 'Zone ID', value: `Ward-${String(zm.id).padStart(2, '0')}` },
            ],
          });
        });
        poly.addTo(group);

        // Clean geographic ward label at centroid
        const centerLat = (zm.bounds.north + zm.bounds.south) / 2;
        const centerLon = (zm.bounds.east + zm.bounds.west) / 2;
        L.marker([centerLat, centerLon], {
          interactive: false,
          icon: L.divIcon({
            className: 'ff-map-label',
            html: `<span>${zm.name.split('&')[0].trim()}</span>`,
            iconSize: [120, 16],
            iconAnchor: [60, 8],
          }),
        }).addTo(group);
      }
    }

    // 2. Roads & transport corridors (pale municipal casing + white core)
    if (layers.roads) {
      for (const rc of twin.road_corridors) {
        L.polyline(rc.coords, {
          color: '#B8C4CE',
          weight: rc.classification === 'Primary Arterial' ? 4.4 : 3.0,
          opacity: 0.85,
        }).addTo(group);

        const line = L.polyline(rc.coords, {
          color: '#FFFFFF',
          weight: rc.classification === 'Primary Arterial' ? 2.4 : 1.5,
          opacity: 0.95,
        });
        line.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          setSelectedStationId(null);
          const mid = rc.coords[Math.floor(rc.coords.length / 2)];
          setSelectedFeature({
            kind: 'road',
            title: rc.name,
            subtitle: rc.classification,
            lat: mid[0],
            lon: mid[1],
            utmCoords: latLonToUtm43N(mid[0], mid[1]),
            zoneName: rc.zoneNames.join(', '),
            riskCategory: 'Watch',
            details: [
              { label: 'Classification', value: rc.classification },
              { label: 'Corridor Zones', value: rc.zoneNames.join(' · ') },
              {
                label: 'Exposed Network Segments',
                value: `${simResult.metrics.road_segments_exposed} segments basin-wide`,
                accent: 'amber',
              },
            ],
          });
        });
        line.bindTooltip(`${rc.name}`, { sticky: true });
        line.addTo(group);
      }
    }

    // 3. Waterway & drainage network (clear blue municipal river styling)
    if (layers.waterway) {
      for (const wp of twin.waterway_paths) {
        L.polyline(wp.coords, {
          color: '#173C79',
          weight: wp.name.includes('Main') ? 5.0 : 3.2,
          opacity: 0.35,
        }).addTo(group);

        L.polyline(wp.coords, {
          color: '#2B7CC9',
          weight: wp.name.includes('Main') ? 3.2 : 2.0,
          opacity: 0.95,
        })
          .bindTooltip(wp.name, { sticky: true })
          .addTo(group);
      }
    }

    // 4. Building exposure clusters (only high-density exposed hotspots so dots don't form a uniform grid)
    if (layers.buildings) {
      for (let r = 2; r < twin.rows; r += 3) {
        for (let c = 2; c < twin.cols; c += 3) {
          const idx = r * twin.cols + c;
          if (
            twin.buildings[idx] >= 6 &&
            simResult.exposed_mask[idx] === 1 &&
            simResult.accumulation_mm[idx] >= 65
          ) {
            const lat =
              twin.bbox_wgs84.north -
              ((r + 0.5) / twin.rows) * (twin.bbox_wgs84.north - twin.bbox_wgs84.south);
            const lon =
              twin.bbox_wgs84.west +
              ((c + 0.5) / twin.cols) * (twin.bbox_wgs84.east - twin.bbox_wgs84.west);
            L.circleMarker([lat, lon], {
              radius: 2.6,
              color: '#D94343',
              weight: 1,
              fillColor: '#EF8735',
              fillOpacity: 0.72,
            }).addTo(group);
          }
        }
      }
    }

    // 5. Critical facilities (shown only when station markers layer is off, to avoid duplicate overlap)
    if (layers.facilities && !layers.stations) {
      for (const fac of twin.facility_records) {
        const idx = fac.row * twin.cols + fac.col;
        const isExposed = simResult.exposed_mask[idx] === 1;
        const color = isExposed ? '#D94343' : '#55A85F';

        const marker = L.circleMarker([fac.lat, fac.lon], {
          radius: 6.5,
          color: '#FFFFFF',
          weight: 2,
          fillColor: color,
          fillOpacity: 0.95,
        });

        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          const acc = simResult.accumulation_mm[idx];
          setSelectedFeature({
            kind: 'facility',
            title: fac.name,
            subtitle: `Critical Infrastructure · ${fac.type.replace('_', ' ').toUpperCase()}`,
            lat: fac.lat,
            lon: fac.lon,
            utmCoords: latLonToUtm43N(fac.lat, fac.lon),
            zoneName: fac.zoneName,
            riskCategory: isExposed ? 'Warning' : 'Normal',
            details: [
              {
                label: 'Exposure Status',
                value: isExposed ? 'Within Modeled Risk Area' : 'Outside 50mm Screening Mask',
                accent: isExposed ? 'red' : 'emerald',
              },
              { label: 'Local Runoff Proxy', value: `${acc.toFixed(1)} mm` },
              { label: 'Elevation', value: `${twin.dem[idx].toFixed(1)} m` },
              { label: 'Grid Cell', value: `[${fac.row}, ${fac.col}]` },
            ],
          });
        });
        marker.bindTooltip(`${fac.name}`, { direction: 'top' });
        marker.addTo(group);
      }
    }

    // 6. Mitigation intervention locations
    if (layers.interventions && interventions.length > 0) {
      for (const iv of interventions) {
        const meta = PILOT_CONFIG.interventions[iv.type];
        const marker = L.circleMarker([iv.lat, iv.lon], {
          radius: iv.selected ? 6 : 4,
          color: '#173C79',
          weight: iv.selected ? 2 : 1,
          fillColor: meta.color,
          fillOpacity: iv.selected ? 0.9 : 0.45,
        });

        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          setSelectedStationId(null);
          setSelectedFeature({
            kind: 'intervention',
            title: `${iv.id} — ${meta.label}`,
            subtitle: iv.selected ? 'Selected Portfolio Site' : 'Candidate Site',
            lat: iv.lat,
            lon: iv.lon,
            utmCoords: latLonToUtm43N(iv.lat, iv.lon),
            zoneName: iv.zoneName,
            riskCategory: 'Normal',
            details: [
              { label: 'Intervention Type', value: meta.label, accent: 'cyan' },
              { label: 'Design Capacity', value: `${formatNumber(iv.size)} ${iv.unit}` },
              { label: 'Estimated Cost', value: formatPKR(iv.cost_pkr), accent: 'amber' },
              {
                label: 'Modeled Impact',
                value: `-${iv.expected_impact_pct.toFixed(2)}% weighted exposure`,
                accent: 'emerald',
              },
            ],
          });
        });

        marker.bindTooltip(`${iv.id}: ${meta.label} (${formatPKR(iv.cost_pkr)})`, {
          direction: 'top',
        });
        marker.addTo(group);
      }
    }
  }, [
    twin,
    simResult,
    layers,
    interventions,
    setSelectedFeature,
    setSelectedStationId,
  ]);

  // Render interactive circular Monitoring Station markers
  useEffect(() => {
    const group = stationGroupRef.current;
    if (!group) return;
    group.clearLayers();

    if (!layers.stations || stations.length === 0) return;

    for (const st of stations) {
      const isSelected = st.id === selectedStationId;
      const meta = STATION_RISK_META[st.riskLevel];

      // Outer navy highlight halo ONLY on the selected station
      if (isSelected) {
        L.circleMarker([st.lat, st.lon], {
          radius: 14,
          color: '#173C79',
          weight: 2.5,
          fillColor: '#173C79',
          fillOpacity: 0.16,
          interactive: false,
        }).addTo(group);
      }

      const marker = L.circleMarker([st.lat, st.lon], {
        radius: isSelected ? 9.5 : 7.5,
        color: isSelected ? '#173C79' : '#FFFFFF',
        weight: isSelected ? 3 : 2.2,
        fillColor: meta.hex,
        fillOpacity: 0.98,
      });

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        setSelectedStationId(st.id);
        setSelectedFeature({
          kind: 'station',
          title: `${st.stationCode} — ${st.name}`,
          subtitle: `${st.location} (${st.sector})`,
          lat: st.lat,
          lon: st.lon,
          utmCoords: st.utmCoords,
          zoneName: st.location,
          riskCategory:
            st.riskLevel === 'Critical'
              ? 'Warning'
              : st.riskLevel === 'High'
                ? 'Watch'
                : st.riskLevel === 'Moderate'
                  ? 'Advisory'
                  : 'Normal',
          details: [
            { label: 'Risk Classification', value: meta.label },
            {
              label: 'Rainfall',
              value:
                st.rainfallMmHr !== null ? `${st.rainfallMmHr.toFixed(1)} mm/h` : 'Data unavailable',
            },
            {
              label: 'Water Level (Proxy)',
              value: st.waterLevelM !== null ? `${st.waterLevelM.toFixed(2)} m` : 'Data unavailable',
            },
            {
              label: 'Air Temp',
              value: st.temperatureC !== null ? `${st.temperatureC.toFixed(1)} °C` : 'Data unavailable',
            },
            {
              label: 'Status',
              value: st.operationalStatus,
            },
          ],
        });
      });

      marker.bindTooltip(`${st.stationCode} · ${st.name} (${meta.label})`, {
        direction: 'top',
        offset: [0, -8],
        className: 'ff-station-tooltip',
      });

      marker.addTo(group);
    }
  }, [stations, layers.stations, selectedStationId, setSelectedStationId, setSelectedFeature]);

  // Anchor / update Leaflet white popup for selected station on desktop/tablet
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!selectedStation || isMobileViewport || !layers.stations) {
      if (popupRef.current) {
        map.closePopup(popupRef.current);
        popupRef.current = null;
      }
      return;
    }

    if (!popupRef.current) {
      const popup = L.popup({
        closeButton: false,
        autoClose: false,
        closeOnClick: false,
        autoPan: true,
        autoPanPaddingTopLeft: L.point(24, 64),
        autoPanPaddingBottomRight: L.point(54, 44),
        className: 'ff-station-popup',
        maxWidth: 310,
        minWidth: 270,
        offset: [0, -10],
      });
      popup.setContent(popupHostRef.current);
      popupRef.current = popup;
    }

    popupRef.current.setLatLng([selectedStation.lat, selectedStation.lon]);
    if (!popupRef.current.isOpen()) {
      popupRef.current.openOn(map);
    } else {
      popupRef.current.update();
    }
  }, [selectedStation, isMobileViewport, layers.stations, focusTarget]);

  // Fullscreen listener
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      setTimeout(() => mapRef.current?.invalidateSize(), 150);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!wrapperRef.current) return;
    if (!document.fullscreenElement) {
      wrapperRef.current.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  return (
    <div
      ref={wrapperRef}
      className={cn(
        'relative isolate z-0 rounded overflow-hidden border border-[#D6DCE4] bg-[#DCEAD5]',
        isFullscreen ? 'h-screen w-screen' : heightClass
      )}
    >
      {/* Map Canvas Container */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Portal Popup Content into Leaflet Popup Host (Desktop/Tablet) */}
      {selectedStation &&
        !isMobileViewport &&
        layers.stations &&
        createPortal(
          <StationPopupCard
            station={selectedStation}
            onClose={() => setSelectedStationId(null)}
          />,
          popupHostRef.current
        )}

      {/* Top-Left: Basemap & Layer Selector */}
      <div className="absolute top-3 left-3 z-[400] flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded bg-white/95 border border-[#CBD5E1] p-0.5 shadow-sm">
          {(['municipal_green', 'osm', 'satellite', 'tactical_grid'] as BasemapStyle[]).map(
            (bm) => (
              <button
                key={bm}
                type="button"
                onClick={() => setBasemap(bm)}
                className={cn(
                  'px-2 py-1 rounded-sm text-[11px] font-semibold transition-colors cursor-pointer',
                  basemap === bm
                    ? 'bg-[#173C79] text-white'
                    : 'text-[#26364A] hover:bg-[#F0F1F2]'
                )}
              >
                {BASEMAP_URLS[bm].label}
              </button>
            )
          )}
        </div>

        {showQuickLayerBar && onToggleLayer && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setQuickLayersOpen((v) => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-white/95 border border-[#CBD5E1] text-[11px] font-semibold text-[#173C79] hover:bg-[#F0F1F2] shadow-sm cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 text-[#173C79]" />
              Map Layers
            </button>

            {quickLayersOpen && (
              <div className="absolute left-0 mt-1.5 w-64 rounded bg-white border border-[#CBD5E1] p-3 shadow-lg space-y-2.5 z-[800]">
                <div className="flex items-center justify-between border-b border-[#E6EAEF] pb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#173C79]">
                    Environmental Overlays
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuickLayersOpen(false)}
                    className="text-[#5A6A7E] hover:text-[#26364A] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      ['flood_risk', 'Flood Risk Zones'],
                      ['rainfall', 'Rainfall Dist.'],
                      ['elevation', 'Elevation'],
                      ['population', 'Population'],
                    ] as Array<[MapRasterLayer, string]>
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        if (layers[key]) {
                          onToggleLayer(key);
                        } else {
                          setActiveRaster(key);
                          if (!layers[key]) onToggleLayer(key);
                        }
                      }}
                      className={cn(
                        'px-2 py-1 rounded-sm text-[11px] border text-left cursor-pointer font-medium',
                        layers[key] && activeRaster === key
                          ? 'bg-[#173C79] border-[#173C79] text-white'
                          : 'bg-[#F5F6F7] border-[#D6DCE4] text-[#26364A] hover:bg-[#E8ECF2]'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="pt-1.5 border-t border-[#E6EAEF] space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#5A6A7E]">
                    Monitoring &amp; GIS Features
                  </div>
                  {(
                    [
                      ['stations', 'Monitoring Stations'],
                      ['waterway', 'Rivers & Waterways'],
                      ['neighborhoods', 'Ward Boundaries & Labels'],
                      ['roads', 'Road Corridors'],
                      ['buildings', 'Exposed Building Clusters'],
                      ['safe_zones', 'Safe High-Ground Zones (<25 mm)'],
                      ['interventions', 'Mitigation Sites'],
                    ] as Array<[keyof MapLayerVisibility, string]>
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className="flex items-center justify-between text-xs text-[#26364A] cursor-pointer"
                    >
                      <span>{label}</span>
                      <input
                        type="checkbox"
                        checked={Boolean(layers[key])}
                        onChange={() => onToggleLayer(key)}
                        className="rounded border-[#CBD5E1] accent-[#173C79]"
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Top-Right: Zoom, Reset, Fullscreen, Legend toggle */}
      <div className="absolute top-3 right-3 z-[400] flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => mapRef.current?.zoomIn()}
          title="Zoom in"
          className="w-8 h-8 rounded bg-white/95 border border-[#CBD5E1] text-[#173C79] hover:bg-[#F0F1F2] flex items-center justify-center shadow-sm cursor-pointer"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => mapRef.current?.zoomOut()}
          title="Zoom out"
          className="w-8 h-8 rounded bg-white/95 border border-[#CBD5E1] text-[#173C79] hover:bg-[#F0F1F2] flex items-center justify-center shadow-sm cursor-pointer"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() =>
            mapRef.current?.setView(studyCfg.center, studyCfg.defaultZoom, {
              animate: true,
            })
          }
          title="Reset extent"
          className="w-8 h-8 rounded bg-white/95 border border-[#CBD5E1] text-[#173C79] hover:bg-[#F0F1F2] flex items-center justify-center shadow-sm cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={toggleFullscreen}
          title="Toggle fullscreen"
          className="w-8 h-8 rounded bg-white/95 border border-[#CBD5E1] text-[#173C79] hover:bg-[#F0F1F2] flex items-center justify-center shadow-sm cursor-pointer"
        >
          {isFullscreen ? (
            <Minimize2 className="w-3.5 h-3.5" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setLegendOpen((v) => !v)}
          title="Toggle legend"
          className={cn(
            'w-8 h-8 rounded border flex items-center justify-center shadow-sm cursor-pointer',
            legendOpen
              ? 'bg-[#173C79] border-[#173C79] text-white'
              : 'bg-white/95 border-[#CBD5E1] text-[#5A6A7E]'
          )}
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Bottom-Left (above scale): Coordinate Readout */}
      <div className="absolute bottom-8 left-3 z-[400] hidden sm:flex items-center gap-2 px-2.5 py-1 rounded bg-white/92 border border-[#CBD5E1] text-[10px] font-mono text-[#26364A] shadow-sm">
        <Compass className="w-3 h-3 text-[#173C79]" />
        <span>
          {cursorCoords
            ? formatCoord(cursorCoords.lat, cursorCoords.lon)
            : formatCoord(studyCfg.center[0], studyCfg.center[1])}
        </span>
        <span className="text-[#CBD5E1]">|</span>
        <span className="text-[#5A6A7E]">Nullah Lai Basin</span>
      </div>

      {/* Bottom-Right: Municipal Map Legend */}
      {legendOpen && (
        <div className="absolute bottom-3 right-3 z-[400] w-56 rounded bg-white/95 border border-[#CBD5E1] p-2.5 text-[11px] space-y-2 shadow-md">
          <div className="flex items-center justify-between border-b border-[#E6EAEF] pb-1">
            <span className="font-semibold text-[10px] uppercase tracking-wider text-[#173C79]">
              Station Risk &amp; Map Key
            </span>
            <span className="font-mono text-[9px] text-[#5A6A7E]">Flood Risk</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 text-[10px] text-[#26364A]">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#55A85F] border border-white shadow-xs" />
              <span>Low Risk</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#F2C94C] border border-white shadow-xs" />
              <span>Moderate</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#EF8735] border border-white shadow-xs" />
              <span>High Risk</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#D94343] border border-white shadow-xs" />
              <span>Critical</span>
            </div>
          </div>

          <div className="pt-1.5 border-t border-[#E6EAEF] space-y-1 text-[10px] text-[#26364A]">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#173C79] border border-white shadow-xs flex-shrink-0" />
              <span>Zone 1: Upstream Islamabad</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#EF8735] border border-white shadow-xs flex-shrink-0" />
              <span>Zone 2: Downstream Rawalpindi</span>
            </div>
          </div>

          <div className="pt-1.5 border-t border-[#E6EAEF] flex items-center justify-between text-[10px] text-[#5A6A7E]">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[#2B7CC9]" />
              Nullah Lai
            </span>
            <span>Click marker for details</span>
          </div>
        </div>
      )}

      {/* Inline Feature Info Drawer (when clicking non-station GIS features) */}
      {showInlineInfoPanel && selectedFeature && selectedFeature.kind !== 'station' && (
        <div className="absolute top-14 left-3 z-[410] w-72 rounded bg-white border border-[#CBD5E1] p-3 shadow-lg space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-bold text-[#173C79] truncate">
                {selectedFeature.title}
              </div>
              <div className="text-[10px] text-[#5A6A7E] truncate">
                {selectedFeature.subtitle}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedFeature(null)}
              className="text-[#5A6A7E] hover:text-[#26364A] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#E6EAEF]">
            <span className="text-[10px] font-mono text-[#5A6A7E]">
              {formatCoord(selectedFeature.lat, selectedFeature.lon)}
            </span>
            <AlertTierBadge tier={selectedFeature.riskCategory} />
          </div>

          <div className="text-[11px] text-[#5A6A7E]">
            Zone: <span className="text-[#26364A] font-semibold">{selectedFeature.zoneName}</span>
          </div>

          <div className="space-y-1 pt-1 border-t border-[#E6EAEF]">
            {selectedFeature.details.map((d) => (
              <div key={d.label} className="flex items-center justify-between text-[11px] gap-2">
                <span className="text-[#5A6A7E]">{d.label}</span>
                <span className="font-mono font-semibold text-[#26364A]">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mobile Responsive Bottom Sheet for Selected Station */}
      {selectedStation && isMobileViewport && layers.stations && (
        <div className="fixed inset-x-0 bottom-0 z-[1000] p-3 bg-[#26364A]/35 backdrop-blur-[1px]">
          <div className="max-w-md mx-auto rounded shadow-2xl border border-[#CBD5E1] overflow-hidden">
            <StationPopupCard
              station={selectedStation}
              onClose={() => setSelectedStationId(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
