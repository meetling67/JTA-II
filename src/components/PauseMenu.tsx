import React, { useRef } from 'react';
import { Film, Music, RotateCcw, Upload, X } from 'lucide-react';
import { FpsLimit, GraphicsQuality, ParadiseHeatSettings, TimeOfDay } from '../game/types';

interface PauseMenuProps {
  open: boolean;
  settings: ParadiseHeatSettings;
  musicStatus: string;
  onUpdateSettings: (patch: Partial<ParadiseHeatSettings>) => void;
  onLoadCustomSong: (file: File) => void;
  onRestoreDefaultMusic: () => void;
  onResume: () => void;
  onResetCity: () => void;
  onShowLoading: () => void;
}

export const PauseMenu: React.FC<PauseMenuProps> = ({
  open,
  settings,
  musicStatus,
  onUpdateSettings,
  onLoadCustomSong,
  onRestoreDefaultMusic,
  onResume,
  onResetCity,
  onShowLoading,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4 sm:p-6"
      style={{ backgroundColor: 'rgba(5, 9, 16, 0.86)' }}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/15 p-6 sm:p-8 text-slate-100 shadow-2xl"
        style={{ backgroundColor: '#0b111c' }}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-wider text-white">
              JTA · PARADISE HEAT
            </h1>
            <p className="mt-1 text-xs font-medium tracking-widest text-pink-300">
              PRESENTED BY BALLOON GAMES · YOUR CITY. YOUR RULES.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onShowLoading}
              className="flex items-center gap-2 rounded-lg border border-purple-400/30 bg-purple-950/60 px-3.5 py-2 text-xs font-semibold text-purple-200 hover:bg-purple-900/70 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Film className="h-3.5 w-3.5 text-sky-300" />
              <span>Loading Intro</span>
            </button>
            <button
              type="button"
              onClick={onResetCity}
              className="flex items-center gap-2 rounded-lg border border-white/15 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset City</span>
            </button>
            <button
              type="button"
              onClick={onResume}
              className="flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 cursor-pointer whitespace-nowrap shrink-0"
            >
              <X className="h-3.5 w-3.5" />
              <span>Resume · Esc</span>
            </button>
          </div>
        </div>

        {/* Two-column settings grid mirroring ParadiseHeatPauseMenu.cpp */}
        <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-2">
          {/* Left Column: Mouse, Graphics, FPS, Time of Day */}
          <div className="space-y-6">
            <section>
              <h2 className="text-sm font-semibold text-slate-100">Mouse &amp; Touchpad</h2>
              <div className="mt-3 space-y-4">
                <label className="flex items-center justify-between gap-3 text-sm text-slate-300 cursor-pointer">
                  <span>Reverse vertical look</span>
                  <input
                    type="checkbox"
                    checked={settings.invertPointerY}
                    onChange={(e) => onUpdateSettings({ invertPointerY: e.target.checked })}
                    className="h-4 w-4 accent-amber-500"
                  />
                </label>

                <div>
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>Sensitivity</span>
                    <span className="font-mono-tabular text-amber-400">
                      {settings.pointerSensitivity.toFixed(2)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.25}
                    max={2}
                    step={0.05}
                    value={settings.pointerSensitivity}
                    onChange={(e) =>
                      onUpdateSettings({ pointerSensitivity: parseFloat(e.target.value) })
                    }
                    className="mt-1.5 w-full accent-amber-500"
                  />
                </div>
              </div>
            </section>

            <section className="border-t border-white/10 pt-5">
              <h2 className="text-sm font-semibold text-slate-100">
                Graphics · {settings.quality === 'detailed' ? 'Detailed' : 'Balanced'}
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(['balanced', 'detailed'] as GraphicsQuality[]).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => onUpdateSettings({ quality: q })}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold capitalize transition-colors cursor-pointer ${
                      settings.quality === q
                        ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                        : 'border-white/10 bg-slate-900 text-slate-300 hover:text-white'
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>

              <div className="mt-4">
                <span className="text-xs text-slate-300">Frame rate limit</span>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {([0, 30, 60, 120] as FpsLimit[]).map((fps) => (
                    <button
                      key={fps}
                      type="button"
                      onClick={() => onUpdateSettings({ fpsLimit: fps })}
                      className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        settings.fpsLimit === fps
                          ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                          : 'border-white/10 bg-slate-900 text-slate-300 hover:text-white'
                      }`}
                    >
                      {fps === 0 ? 'Unlimited' : `${fps} FPS`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <span className="text-xs text-slate-300">City District Lighting</span>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(
                    [
                      { id: 'dusk', label: 'JTA Dusk' },
                      { id: 'day', label: 'Day' },
                      { id: 'sunset', label: 'Golden Hour' },
                      { id: 'night', label: 'Night' },
                    ] as { id: TimeOfDay; label: string }[]
                  ).map((tod) => (
                    <button
                      key={tod.id}
                      type="button"
                      onClick={() => onUpdateSettings({ timeOfDay: tod.id })}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        settings.timeOfDay === tod.id
                          ? tod.id === 'dusk'
                            ? 'border-pink-400 bg-purple-500/25 text-pink-200'
                            : 'border-amber-400 bg-amber-500/20 text-amber-300'
                          : 'border-white/10 bg-slate-900 text-slate-300 hover:text-white'
                      }`}
                    >
                      {tod.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </div>

          {/* Right Column: Audio, Custom Soundtrack & Controls */}
          <div className="space-y-6">
            <section>
              <h2 className="text-sm font-semibold text-slate-100">Audio</h2>
              <div className="mt-3 space-y-3">
                {(
                  [
                    { key: 'masterVolume', label: 'Master volume' },
                    { key: 'musicVolume', label: 'Background music' },
                    { key: 'engineVolume', label: 'Car & motorcycle engines' },
                    { key: 'reactionVolume', label: 'Shouts & human reactions' },
                  ] as const
                ).map(({ key, label }) => (
                  <div key={key}>
                    <div className="flex items-center justify-between text-xs text-slate-300">
                      <span>{label}</span>
                      <span className="font-mono-tabular text-slate-400">
                        {Math.round(settings[key] * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      value={settings[key]}
                      onChange={(e) =>
                        onUpdateSettings({ [key]: parseFloat(e.target.value) })
                      }
                      className="mt-1 w-full accent-amber-500"
                    />
                  </div>
                ))}
              </div>
            </section>

            <section className="border-t border-white/10 pt-5">
              <h2 className="text-sm font-semibold text-slate-100">Your Soundtrack</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Choose an MP3, WAV, M4A, or OGG file. Your song loops while playing and pauses
                with the game.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onLoadCustomSong(file);
                }}
              />

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 rounded-lg border border-white/15 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-100 hover:bg-slate-700 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Upload className="h-3.5 w-3.5 text-amber-400" />
                  <span>Browse for music…</span>
                </button>
                <button
                  type="button"
                  onClick={onRestoreDefaultMusic}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-300 hover:text-white cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Music className="h-3.5 w-3.5" />
                  <span>Restore built-in music</span>
                </button>
              </div>
              <p className="mt-2 text-xs text-amber-300/90">Active: {musicStatus}</p>
            </section>

            <section className="border-t border-white/10 pt-5">
              <h2 className="text-sm font-semibold text-slate-100">Controls</h2>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-slate-300">
                <span>WASD / Arrows</span>
                <span className="text-slate-400">Move or drive</span>
                <span>Shift</span>
                <span className="text-slate-400">Sprint on foot</span>
                <span>Space</span>
                <span className="text-slate-400">Jump / Vehicle brake</span>
                <span>E</span>
                <span className="text-slate-400">Enter or exit vehicle</span>
                <span>F</span>
                <span className="text-slate-400">Punch</span>
                <span>V</span>
                <span className="text-slate-400">Chase / Cockpit view</span>
                <span>Click / Drag</span>
                <span className="text-slate-400">Look around</span>
                <span>ESC</span>
                <span className="text-slate-400">Pause / Resume</span>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};
