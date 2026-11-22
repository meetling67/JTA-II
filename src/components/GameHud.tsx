import React, { useState } from 'react';
import {
  Camera,
  CarFront,
  ChevronDown,
  ChevronUp,
  Footprints,
  Moon,
  Pause,
  Sun,
  Sunset,
  Swords,
} from 'lucide-react';
import { HudSnapshot, TimeOfDay } from '../game/types';

interface GameHudProps {
  hud: HudSnapshot;
  onPause: () => void;
  onToggleCamera: () => void;
  onInteractVehicle: () => void;
  onPunch: () => void;
  onTimeOfDayChange: (tod: TimeOfDay) => void;
  onTouchMove: (x: number, y: number) => void;
}

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  onPause,
  onToggleCamera,
  onInteractVehicle,
  onPunch,
  onTimeOfDayChange,
}) => {
  const [dockCollapsed, setDockCollapsed] = useState(false);

  if (hud.paused) return null;

  const showMirrorFrame = hud.mode === 'car' && hud.cameraView === 'cockpit';

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4 sm:p-5">
      {/* Top Row: Minimal Title + Optional Cockpit Rearview Frame + Pause Button */}
      <div className="flex items-start justify-between gap-4">
        {/* Top-Left Brand & Zone */}
        <div
          className="pointer-events-auto rounded-lg border border-white/10 px-3.5 py-2"
          style={{ backgroundColor: 'rgba(5, 9, 16, 0.82)' }}
        >
          <div className="font-display text-sm font-bold tracking-wider text-amber-400">
            PARADISE HEAT
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-300">
            <span>{hud.districtZone}</span>
            <span aria-hidden="true">·</span>
            <span>{hud.vehicleLabel}</span>
          </div>
        </div>

        {/* Top-Center Live Rearview Mirror Bezel (aligned with WebGL scissor mirror in Cockpit mode) */}
        {showMirrorFrame && (
          <div
            className="hidden sm:flex flex-col items-center"
            style={{ marginTop: '0px' }}
          >
            <div
              className="border-2 border-slate-700 rounded-md shadow-lg"
              style={{
                width: 'min(280px, 24vw)',
                height: 'calc(min(280px, 24vw) * 0.28)',
                backgroundColor: 'transparent',
              }}
            />
            <span className="mt-1 text-[11px] font-medium tracking-wide text-slate-200 drop-shadow">
              Rearview Mirror
            </span>
          </div>
        )}

        {/* Top-Right Single Pause Action */}
        <button
          type="button"
          onClick={onPause}
          className="pointer-events-auto flex items-center gap-2 rounded-lg border border-white/15 px-3.5 py-2 text-xs font-semibold text-slate-100 transition-colors hover:border-amber-400/60 hover:text-amber-300 whitespace-nowrap shrink-0 cursor-pointer"
          style={{ backgroundColor: 'rgba(5, 9, 16, 0.84)' }}
        >
          <Pause className="h-3.5 w-3.5" />
          <span>Menu · Esc</span>
        </button>
      </div>

      {/* Center-Bottom Prompts + Collapsible Control Dock */}
      <div className="flex flex-col items-center gap-2.5">
        {/* Subtle Contextual Prompt */}
        {(hud.canEnterVehicle || hud.lastEventText) && (
          <div
            className="pointer-events-auto flex items-center gap-3 rounded-lg border border-white/10 px-4 py-1.5 text-xs text-slate-100"
            style={{ backgroundColor: 'rgba(5, 9, 16, 0.84)' }}
          >
            {hud.canEnterVehicle ? (
              <button
                type="button"
                onClick={onInteractVehicle}
                className="flex items-center gap-2 font-semibold text-amber-300 hover:text-amber-200 cursor-pointer whitespace-nowrap shrink-0"
              >
                <CarFront className="h-3.5 w-3.5" />
                <span>Press E to enter {hud.nearbyVehicleLabel}</span>
              </button>
            ) : (
              <span className="text-slate-200">{hud.lastEventText}</span>
            )}
          </div>
        )}

        {/* Collapse Toggle */}
        <button
          type="button"
          onClick={() => setDockCollapsed((c) => !c)}
          className="pointer-events-auto flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:text-white cursor-pointer whitespace-nowrap shrink-0"
          style={{ backgroundColor: 'rgba(5, 9, 16, 0.82)' }}
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="h-3 w-3" />
              <span>Show HUD</span>
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              <span>Hide HUD</span>
            </>
          )}
        </button>

        {/* Collapsible Bottom Dock */}
        {!dockCollapsed && (
          <div
            className="pointer-events-auto flex flex-wrap items-center justify-center gap-3 sm:gap-5 rounded-xl border border-white/12 px-4 py-2.5 shadow-2xl"
            style={{
              backgroundColor: 'rgba(5, 9, 16, 0.88)',
              maxWidth: 'min(920px, 95vw)',
            }}
          >
            {/* Speedometer & Gear */}
            <div className="flex items-baseline gap-2.5 pr-2 border-r border-white/10">
              <span className="font-mono-tabular text-2xl font-semibold text-white">
                {hud.speedKmh}
              </span>
              <span className="text-[11px] font-medium text-slate-400">KM/H</span>
              <span className="font-mono-tabular ml-1 text-xs font-semibold text-amber-400">
                {hud.gearLabel}
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {hud.mode === 'foot' ? (
                <>
                  <button
                    type="button"
                    onClick={onPunch}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700/80 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Swords className="h-3.5 w-3.5 text-amber-400" />
                    <span>Punch · F</span>
                  </button>
                  {hud.canEnterVehicle && (
                    <button
                      type="button"
                      onClick={onInteractVehicle}
                      className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <CarFront className="h-3.5 w-3.5" />
                      <span>Enter · E</span>
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onInteractVehicle}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700/80 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Footprints className="h-3.5 w-3.5 text-amber-400" />
                    <span>Exit · E</span>
                  </button>
                  {hud.mode === 'car' && (
                    <button
                      type="button"
                      onClick={onToggleCamera}
                      className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700/80 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Camera className="h-3.5 w-3.5 text-sky-400" />
                      <span>
                        {hud.cameraView === 'cockpit' ? 'Chase Cam · V' : 'Cockpit · V'}
                      </span>
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Time of Day Profile Switcher */}
            <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-slate-900/90 p-1">
              {(
                [
                  { id: 'day', label: 'Day', Icon: Sun },
                  { id: 'sunset', label: 'Sunset', Icon: Sunset },
                  { id: 'night', label: 'Night', Icon: Moon },
                ] as const
              ).map(({ id, label, Icon }) => {
                const active = hud.timeOfDay === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onTimeOfDayChange(id)}
                    className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            {/* Quiet Controls Hint */}
            <div className="hidden md:flex items-center gap-2 text-[11px] text-slate-400 pl-2 border-l border-white/10">
              <span>WASD Move/Drive</span>
              <span aria-hidden="true">·</span>
              <span>Shift Run</span>
              <span aria-hidden="true">·</span>
              <span>Space Jump/Brake</span>
              <span aria-hidden="true">·</span>
              <span>Drag/Click Look</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
