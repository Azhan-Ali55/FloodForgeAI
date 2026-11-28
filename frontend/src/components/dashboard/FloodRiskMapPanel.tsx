import React from 'react';
import { Map as MapIcon, SlidersHorizontal } from 'lucide-react';
import type {
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
import { GeospatialMap } from '../maps/GeospatialMap';
import { MunicipalPanel } from '../ui/Primitives';
import type { MapComparisonMode } from './MitigationComparisonPanel';

interface FloodRiskMapPanelProps {
  twin: TwinGrid;
  simResult: SimResult;
  baselineResult?: SimResult;
  scenario: Scenario;
  stations: MonitoringStation[];
  selectedStationId: string | null;
  onSelectStation: (id: string | null) => void;
  interventions: Intervention[];
  layers: MapLayerVisibility;
  onToggleLayer: (k: keyof MapLayerVisibility) => void;
  activeRaster: MapRasterLayer;
  onActiveRasterChange: (r: MapRasterLayer) => void;
  basemap: BasemapStyle;
  onBasemapChange: (b: BasemapStyle) => void;
  mapViewMode: MapComparisonMode;
  onMapViewModeChange: (m: MapComparisonMode) => void;
  compareSplitPct: number;
  onCompareSplitChange: (pct: number) => void;
  selectedFeature: SelectedMapFeature | null;
  onSelectFeature: (f: SelectedMapFeature | null) => void;
}

export const FloodRiskMapPanel = React.memo(function FloodRiskMapPanel({
  twin,
  simResult,
  baselineResult,
  scenario,
  stations,
  selectedStationId,
  onSelectStation,
  interventions,
  layers,
  onToggleLayer,
  activeRaster,
  onActiveRasterChange,
  basemap,
  onBasemapChange,
  mapViewMode,
  onMapViewModeChange,
  compareSplitPct,
  onCompareSplitChange,
  selectedFeature,
  onSelectFeature,
}: FloodRiskMapPanelProps) {
  return (
    <MunicipalPanel
      title="Flood Risk Map"
      subtitle="30 m Nullah Lai Hydrological Twin · Islamabad & Rawalpindi"
      icon={<MapIcon className="w-4 h-4" />}
      rightSlot={
        <div
          role="group"
          aria-label="Map scenario comparison mode"
          className="flex flex-wrap items-center rounded-md bg-[#F1F5F9] border border-[#E2E8F0] p-0.5 text-xs max-w-full"
        >
          {(
            [
              ['baseline', 'Before'],
              ['mitigated', 'After'],
              ['compare', 'Split Compare'],
              ['delta', 'Delta'],
            ] as Array<[MapComparisonMode, string]>
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={mapViewMode === mode}
              onClick={() => onMapViewModeChange(mode)}
              className={cn(
                'px-2.5 py-1 rounded font-medium transition-colors cursor-pointer whitespace-nowrap',
                mapViewMode === mode
                  ? 'bg-[#FFFFFF] text-[#0F172A] shadow-2xs border border-[#CBD5E1]'
                  : 'text-[#64748B] hover:text-[#0F172A] border border-transparent'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      }
      bodyClassName="p-0"
    >
      <GeospatialMap
        twin={twin}
        simResult={simResult}
        baselineResult={baselineResult}
        scenario={scenario}
        stations={stations}
        selectedStationId={selectedStationId}
        onSelectStation={onSelectStation}
        interventions={interventions}
        layers={layers}
        onToggleLayer={onToggleLayer}
        activeRaster={activeRaster}
        onActiveRasterChange={onActiveRasterChange}
        basemap={basemap}
        onBasemapChange={onBasemapChange}
        viewMode={mapViewMode}
        compareSplitPct={compareSplitPct}
        onCompareSplitChange={onCompareSplitChange}
        selectedFeature={selectedFeature}
        onSelectFeature={onSelectFeature}
        heightClass="h-[420px] sm:h-[500px] lg:h-[580px]"
      />

      {mapViewMode === 'compare' && (
        <div className="px-4 py-2 bg-[#F1F6FB] border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2 text-xs text-[#334155]">
          <span className="flex items-center gap-1.5 font-medium">
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#0F766E]" />
            Left ({compareSplitPct}%): Unmitigated Before · Right ({100 - compareSplitPct}%): Mitigated After ({interventions.length} sites)
          </span>
          <span className="text-[11px] text-[#64748B]">
            Synchronized pan and zoom across both inundation layers
          </span>
        </div>
      )}
    </MunicipalPanel>
  );
});
