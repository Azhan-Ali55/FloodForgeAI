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
import { Tooltip } from '../ui/Tooltip';
import type { MapComparisonMode } from './MitigationComparisonPanel';

const COMPARISON_MODE_OPTIONS: Array<{
  mode: MapComparisonMode;
  label: string;
  tip: string;
}> = [
  { mode: 'baseline', label: 'Before', tip: 'Display modeled inundation without the selected mitigation portfolio.' },
  { mode: 'mitigated', label: 'After', tip: 'Display modeled inundation with the selected mitigation portfolio.' },
  { mode: 'compare', label: 'Split Compare', tip: 'Compare baseline and mitigated inundation side by side.' },
  { mode: 'delta', label: 'Delta', tip: 'Highlight modeled changes in inundation.' },
];

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
          className="flex flex-wrap items-center rounded-lg bg-white/95 border border-white/25 p-0.5 text-xs max-w-full"
        >
          {COMPARISON_MODE_OPTIONS.map(({ mode, label, tip }) => (
            <Tooltip key={mode} content={tip} side="bottom">
              <button
                type="button"
                aria-pressed={mapViewMode === mode}
                onClick={() => onMapViewModeChange(mode)}
                className={cn(
                  'px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer whitespace-nowrap',
                  mapViewMode === mode
                    ? 'bg-[#12345B] text-white shadow-2xs'
                    : 'text-[#475569] hover:text-[#10223D]'
                )}
              >
                {label}
              </button>
            </Tooltip>
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
