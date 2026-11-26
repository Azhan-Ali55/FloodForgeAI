import { useState } from 'react';
import {
  Compass,
  Eye,
  Info,
  Layers,
  MapPin,
  SlidersHorizontal,
} from 'lucide-react';
import { GeospatialMap } from '../components/maps/GeospatialMap';
import { AlertTierBadge, MunicipalPanel } from '../components/ui/Primitives';
import { useFloodForge } from '../context/FloodForgeContext';
import type {
  BasemapStyle,
  MapLayerVisibility,
  MapRasterLayer,
  SelectedMapFeature,
} from '../types/floodforge';
import { cn } from '../utils/cn';
import { formatCoord } from '../utils/formatters';

export function IntelligenceMap() {
  const {
    twin,
    simScenario,
    simBaselineResult,
    simActiveResult,
    monitoringStations,
    selectedStationId,
    setSelectedStationId,
    optResult,
  } = useFloodForge();

  const [layers, setLayers] = useState<MapLayerVisibility>({
    flood_risk: true,
    rainfall: false,
    elevation: false,
    population: false,
    waterway: true,
    roads: true,
    buildings: true,
    facilities: false,
    stations: true,
    interventions: true,
    neighborhoods: true,
  });

  const [activeRaster, setActiveRaster] = useState<MapRasterLayer>('flood_risk');
  const [basemap, setBasemap] = useState<BasemapStyle>('municipal_green');
  const [viewMode, setViewMode] = useState<'mitigated' | 'baseline' | 'delta'>('mitigated');
  const [rasterOpacity, setRasterOpacity] = useState(0.6);
  const [selectedFeature, setSelectedFeature] = useState<SelectedMapFeature | null>(null);

  const activeSim = optResult ? optResult.optimizedResult : simActiveResult;
  const baselineSim = optResult ? optResult.baselineResult : simBaselineResult;
  const interventions = optResult?.allCandidates ?? [];

  const selectRasterLayer = (layer: MapRasterLayer) => {
    setActiveRaster(layer);
    setLayers((prev) => ({
      ...prev,
      flood_risk: layer === 'flood_risk',
      rainfall: layer === 'rainfall',
      elevation: layer === 'elevation',
      population: layer === 'population',
    }));
  };

  const toggleVectorLayer = (key: keyof MapLayerVisibility) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-bold text-[#173C79]">
            Flood Risk &amp; Geospatial Monitoring Map
          </h1>
          <p className="text-xs sm:text-sm text-[#5A6A7E]">
            Multi-layer 30 m GIS explorer across Nullah Lai topography, monitoring stations, waterways, and mitigation candidate sites.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-sm bg-white border border-[#D6DCE4] p-1 self-start">
          {(
            [
              ['mitigated', 'Post-Mitigation'],
              ['baseline', 'Unmitigated Baseline'],
              ['delta', 'Risk Delta'],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={cn(
                'px-2.5 py-1 rounded-sm text-xs font-semibold transition-colors cursor-pointer',
                viewMode === mode
                  ? 'bg-[#173C79] text-white'
                  : 'text-[#5A6A7E] hover:text-[#173C79]'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Layer Control Sidebar */}
        <MunicipalPanel
          title="Geospatial Layer Controls"
          icon={<Layers className="w-4 h-4" />}
          className="xl:col-span-3 h-fit"
          bodyClassName="p-3.5 space-y-4"
        >
          {/* Raster Overlays */}
          <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#5A6A7E]">
              30 m Screening Raster (Active Layer)
            </div>
            {(
              [
                ['flood_risk', 'Flood Risk Zones'],
                ['rainfall', 'Rainfall Distribution'],
                ['elevation', 'Elevation (DEM GLO-30 Proxy)'],
                ['population', 'Population Density'],
              ] as Array<[MapRasterLayer, string]>
            ).map(([key, label]) => {
              const checked = layers[key];
              return (
                <label
                  key={key}
                  className={cn(
                    'flex items-center justify-between p-2 rounded-sm border text-xs cursor-pointer transition-colors',
                    checked
                      ? 'bg-[#EEF3FA] border-[#173C79] text-[#173C79] font-semibold'
                      : 'bg-[#F5F6F7] border-[#D6DCE4] text-[#26364A] hover:bg-[#EEF3FA]/50'
                  )}
                >
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      if (checked) {
                        setLayers((prev) => ({ ...prev, [key]: false }));
                      } else {
                        selectRasterLayer(key);
                      }
                    }}
                    className="accent-[#173C79]"
                  />
                </label>
              );
            })}
          </div>

          {/* Opacity Slider */}
          <div className="space-y-1.5 pt-2 border-t border-[#E6EAEF]">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#5A6A7E] flex items-center gap-1.5">
                <SlidersHorizontal className="w-3 h-3 text-[#173C79]" />
                Raster Opacity
              </span>
              <span className="font-mono font-semibold text-[#173C79]">
                {Math.round(rasterOpacity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.15}
              max={1}
              step={0.05}
              value={rasterOpacity}
              onChange={(e) => setRasterOpacity(Number(e.target.value))}
              className="w-full"
            />
          </div>

          {/* Vector & Station Checkboxes */}
          <div className="space-y-1.5 pt-2 border-t border-[#E6EAEF]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#5A6A7E]">
              Monitoring &amp; Vector Layers
            </div>
            {(
              [
                ['stations', 'Monitoring Stations (12 Nodes)'],
                ['waterway', 'River & Water-Level Network'],
                ['roads', 'Roads & Transport Corridors'],
                ['buildings', 'Building Exposure Clusters'],
                ['interventions', 'Mitigation Intervention Sites'],
                ['neighborhoods', 'Neighborhood Wards & Labels'],
              ] as Array<[keyof MapLayerVisibility, string]>
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between py-1.5 px-2 rounded-sm hover:bg-[#F5F6F7] text-xs text-[#26364A] cursor-pointer"
              >
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={layers[key]}
                  onChange={() => toggleVectorLayer(key)}
                  className="accent-[#173C79]"
                />
              </label>
            ))}
          </div>

          <div className="p-2.5 rounded-sm bg-[#F5F6F7] border border-[#D6DCE4] text-[10px] text-[#5A6A7E] leading-relaxed flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-[#173C79] flex-shrink-0 mt-0.5" />
            <span>
              Outputs represent 30 m screening-level runoff proxies (EPSG:32643), not surveyed street-level flood depths.
            </span>
          </div>
        </MunicipalPanel>

        {/* Main Interactive Map */}
        <div className="xl:col-span-6">
          <GeospatialMap
            twin={twin}
            simResult={activeSim}
            baselineResult={baselineSim}
            scenario={simScenario}
            stations={monitoringStations}
            selectedStationId={selectedStationId}
            onSelectStation={setSelectedStationId}
            interventions={interventions}
            layers={layers}
            onToggleLayer={toggleVectorLayer}
            activeRaster={activeRaster}
            onActiveRasterChange={selectRasterLayer}
            basemap={basemap}
            onBasemapChange={setBasemap}
            viewMode={viewMode}
            rasterOpacity={rasterOpacity}
            selectedFeature={selectedFeature}
            onSelectFeature={setSelectedFeature}
            heightClass="h-[520px] xl:h-[680px]"
            showQuickLayerBar={false}
            showInlineInfoPanel={false}
          />
        </div>

        {/* Dedicated Feature Inspection Panel */}
        <MunicipalPanel
          title="Feature Intelligence Panel"
          icon={<Eye className="w-4 h-4" />}
          className="xl:col-span-3 h-fit"
          bodyClassName="p-3.5 flex flex-col justify-between gap-4"
        >
          <div>
            {selectedFeature ? (
              <div className="space-y-3">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[#173C79]">
                    {selectedFeature.kind} Feature
                  </div>
                  <h3 className="text-sm font-bold text-[#26364A] mt-0.5">
                    {selectedFeature.title}
                  </h3>
                  <p className="text-xs text-[#5A6A7E]">{selectedFeature.subtitle}</p>
                </div>

                <div className="p-2.5 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC] space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[#5A6A7E]">Risk Category</span>
                    <AlertTierBadge tier={selectedFeature.riskCategory} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#5A6A7E]">Associated Zone</span>
                    <span className="text-[#26364A] font-semibold text-right">
                      {selectedFeature.zoneName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#5A6A7E]">WGS84</span>
                    <span className="font-mono text-[11px] text-[#26364A]">
                      {formatCoord(selectedFeature.lat, selectedFeature.lon)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#5A6A7E]">EPSG:32643</span>
                    <span className="font-mono text-[11px] text-[#173C79]">
                      {selectedFeature.utmCoords}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#5A6A7E]">
                    Exposure &amp; Physical Attributes
                  </div>
                  <div className="divide-y divide-[#E6EAEF] rounded-sm bg-[#F5F6F7] border border-[#E2E6EC] px-2.5">
                    {selectedFeature.details.map((d) => (
                      <div
                        key={d.label}
                        className="py-2 flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="text-[#5A6A7E]">{d.label}</span>
                        <span
                          className={cn(
                            'font-mono font-semibold text-right',
                            d.accent === 'red'
                              ? 'text-[#D94343]'
                              : d.accent === 'emerald'
                                ? 'text-[#55A85F]'
                                : d.accent === 'amber'
                                  ? 'text-[#EF8735]'
                                  : d.accent === 'cyan'
                                    ? 'text-[#173C79]'
                                    : 'text-[#26364A]'
                          )}
                        >
                          {d.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-10 px-3 text-center space-y-2.5 rounded-sm border border-dashed border-[#CBD5E1] bg-[#F5F6F7]">
                <MapPin className="w-6 h-6 text-[#173C79] mx-auto opacity-80" />
                <div className="text-xs font-bold text-[#173C79]">
                  Select Any Map Feature
                </div>
                <p className="text-[11px] text-[#5A6A7E] leading-relaxed">
                  Click any monitoring station marker, 30 m grid cell, road corridor, intervention site, or neighborhood ward to inspect its telemetry.
                </p>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-[#E6EAEF] space-y-1.5 text-[11px] text-[#5A6A7E]">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-[#173C79]" />
                Grid Resolution
              </span>
              <span className="font-mono font-semibold text-[#26364A]">30 m × 30 m</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Coordinate System</span>
              <span className="font-mono font-semibold text-[#26364A]">UTM 43N / WGS84</span>
            </div>
          </div>
        </MunicipalPanel>
      </div>
    </div>
  );
}
