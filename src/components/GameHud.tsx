import React, { useState } from 'react';
import {
  Camera,
  CarFront,
  ChevronDown,
  ChevronUp,
  Crosshair,
  DoorOpen,
  Footprints,
  Heart,
  Moon,
  Pause,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Star,
  Store,
  Sun,
  Sunset,
  Swords,
} from 'lucide-react';
import { HudSnapshot, TimeOfDay, WeaponKind } from '../game/types';
import { Minimap } from './Minimap';
import { ShopMenuModal } from './ShopMenuModal';

interface GameHudProps {
  hud: HudSnapshot;
  onPause: () => void;
  onToggleCamera: () => void;
  onInteractVehicle: () => void;
  onInteractKey: () => void;
  onExitShop: () => void;
  onBreakIn: () => void;
  onPunch: () => void;
  onFireWeapon: () => void;
  onCycleWeapon: () => void;
  onEquipWeapon: (kind: WeaponKind) => void;
  onTimeOfDayChange: (tod: TimeOfDay) => void;
  onTouchMove: (x: number, y: number) => void;
  onRespawn: () => void;
  onToggleMap: () => void;
  onSetGps: (x: number, z: number, label?: string) => void;
  onClearGps: () => void;
  onCloseShopMenu: () => void;
  onBuyOrCollectWeapon: (kind: Exclude<WeaponKind, 'unarmed'>, cost: number) => void;
  onBuyAmmo: (kind: Exclude<WeaponKind, 'unarmed'>, amount: number, cost: number) => void;
  onBuySnack: (healAmount: number, cost: number, label: string) => void;
  onApplyOutfit: (shirtHex: number, shortsHex: number, hairHex: number) => void;
  onRepairVehicle: () => void;
  onRepaintVehicle: (colorHex: number) => void;
  onTuneVehicle: () => void;
  onRobStore: () => void;
}

const WEAPON_SHORT: Record<WeaponKind, string> = {
  unarmed: 'Fists',
  pistol: '9mm Pistol',
  smg: 'Micro SMG',
  rifle: 'Carbine',
};

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  onPause,
  onToggleCamera,
  onInteractVehicle,
  onInteractKey,
  onExitShop,
  onBreakIn,
  onPunch,
  onFireWeapon,
  onCycleWeapon,
  onEquipWeapon,
  onTimeOfDayChange,
  onRespawn,
  onToggleMap,
  onSetGps,
  onClearGps,
  onCloseShopMenu,
  onBuyOrCollectWeapon,
  onBuyAmmo,
  onBuySnack,
  onApplyOutfit,
  onRepairVehicle,
  onRepaintVehicle,
  onTuneVehicle,
  onRobStore,
}) => {
  const [dockCollapsed, setDockCollapsed] = useState(false);

  if (hud.paused) return null;

  if (hud.isDead) {
    return (
      <div className="pointer-events-auto fixed inset-0 z-20 flex flex-col items-center justify-center bg-black/55 px-6 text-center backdrop-blur-[2px]">
        <div className="max-w-lg rounded-2xl border border-rose-500/40 bg-slate-950/88 px-10 py-9 shadow-2xl">
          <div className="font-display text-4xl sm:text-5xl font-black tracking-widest text-rose-500 drop-shadow-lg">
            MISSION FAILED
          </div>
          <div className="mt-3 text-lg sm:text-xl font-bold tracking-wide text-slate-100">
            Jamadar is heartbroken.
          </div>
          <button
            type="button"
            onClick={onRespawn}
            className="mt-7 inline-flex items-center gap-2.5 rounded-xl bg-emerald-500 px-7 py-3 text-sm font-bold tracking-wide text-slate-950 shadow-lg transition-transform hover:scale-105 hover:bg-emerald-400 active:scale-95 cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Respawn</span>
          </button>
        </div>
      </div>
    );
  }

  const showMirrorFrame = hud.mode === 'car' && hud.cameraView === 'cockpit';
  const healthPct = Math.max(0, Math.min(100, Math.round((hud.health / Math.max(1, hud.maxHealth)) * 100)));
  const healthBarColor =
    healthPct > 50 ? 'bg-emerald-400' : healthPct > 25 ? 'bg-amber-400' : 'bg-rose-500';
  const showCrosshair =
    hud.mode === 'foot' &&
    !hud.shopMenuOpen &&
    !hud.mapOpen &&
    (hud.cameraView === 'firstperson' || hud.equippedWeapon !== 'unarmed');

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4 sm:p-5">
      {/* Subtle hit damage vignette */}
      {hud.damageFlash > 0.02 && (
        <div
          className="pointer-events-none fixed inset-0 transition-opacity duration-100"
          style={{
            opacity: hud.damageFlash * 0.65,
            boxShadow: 'inset 0 0 110px 36px rgba(225, 29, 72, 0.78)',
          }}
        />
      )}

      {/* Subtle Weapon Aim Crosshair */}
      {showCrosshair && (
        <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
          <div className="relative h-5 w-5">
            <span className="absolute left-1/2 top-0 h-1.5 w-0.5 -translate-x-1/2 bg-white/85" />
            <span className="absolute bottom-0 left-1/2 h-1.5 w-0.5 -translate-x-1/2 bg-white/85" />
            <span className="absolute left-0 top-1/2 h-0.5 w-1.5 -translate-y-1/2 bg-white/85" />
            <span className="absolute right-0 top-1/2 h-0.5 w-1.5 -translate-y-1/2 bg-white/85" />
            <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-400" />
          </div>
        </div>
      )}

      {/* Top Row: Brand + Cash + Health + Weapon Status | Rearview Mirror | Wanted + Menu */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div
            className="pointer-events-auto rounded-lg border border-purple-400/20 px-3.5 py-2.5 min-w-[235px]"
            style={{ backgroundColor: 'rgba(9, 6, 22, 0.86)' }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="font-display text-sm font-bold tracking-wider text-pink-300">
                JTA <span className="text-sky-300">·</span>{' '}
                <span className="text-white">PARADISE HEAT</span>
              </div>
              <span className="font-mono-tabular text-xs font-black text-emerald-400">
                ${hud.cash.toLocaleString()}
              </span>
            </div>

            <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-300">
              <span>{hud.districtZone}</span>
              <span aria-hidden="true">·</span>
              <span>{hud.vehicleLabel}</span>
            </div>

            {/* GTA-style green health bar */}
            <div className="mt-2 flex items-center gap-2">
              <Heart
                className={`h-3.5 w-3.5 shrink-0 ${
                  healthPct > 25 ? 'fill-emerald-400 text-emerald-400' : 'fill-rose-500 text-rose-500'
                }`}
              />
              <div className="h-2.5 flex-1 overflow-hidden rounded-sm border border-white/15 bg-slate-900">
                <div
                  className={`h-full transition-[width] duration-150 ${healthBarColor}`}
                  style={{ width: `${healthPct}%` }}
                />
              </div>
              <span className="font-mono-tabular text-[11px] font-bold text-emerald-300">
                {hud.health}
              </span>
            </div>
          </div>

          {/* Equipped Weapon & Quick Weapon Switch Bar */}
          {hud.mode === 'foot' && (
            <div
              className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-white/12 px-2.5 py-1.5"
              style={{ backgroundColor: 'rgba(9, 6, 22, 0.84)' }}
            >
              {(
                [
                  { w: 'pistol', keyLabel: '1' },
                  { w: 'smg', keyLabel: '2' },
                  { w: 'rifle', keyLabel: '3' },
                  { w: 'unarmed', keyLabel: '4' },
                ] as { w: WeaponKind; keyLabel: string }[]
              ).map(({ w, keyLabel }) => {
                const owned = w === 'unarmed' || hud.ownedWeapons.includes(w);
                if (!owned) return null;
                const active = hud.equippedWeapon === w;
                return (
                  <button
                    key={w}
                    type="button"
                    onClick={() => onEquipWeapon(w)}
                    className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold transition whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-purple-500 text-white'
                        : 'bg-white/5 text-slate-300 hover:bg-white/15'
                    }`}
                  >
                    <span className="text-[9px] opacity-75">{keyLabel}</span>
                    <span>{WEAPON_SHORT[w]}</span>
                    {w !== 'unarmed' && (
                      <span className="font-mono-tabular text-[10px] text-amber-300">
                        {hud.ammo[w]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Top-Center Live Rearview Mirror Bezel */}
        {showMirrorFrame && (
          <div className="hidden sm:flex flex-col items-center">
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

        {/* Top-Right Wanted Stars + Pause Action */}
        <div className="flex items-start gap-2.5">
          {hud.wantedLevel > 0 && (
            <div
              className="pointer-events-auto rounded-lg border border-rose-500/45 px-3.5 py-2 text-right"
              style={{ backgroundColor: 'rgba(18, 6, 16, 0.88)' }}
            >
              <div className="flex items-center justify-end gap-1">
                <ShieldAlert className="mr-1 h-3.5 w-3.5 text-rose-400" />
                {[1, 2, 3].map((star) => (
                  <Star
                    key={star}
                    className={`h-3.5 w-3.5 ${
                      star <= hud.wantedLevel
                        ? 'fill-rose-400 text-rose-400'
                        : 'text-slate-600'
                    }`}
                  />
                ))}
              </div>
              <div className="mt-0.5 text-[11px] font-semibold text-rose-200 whitespace-nowrap">
                {hud.wantedReason || 'Police Pursuit'}
              </div>
              {hud.evasionRatio > 0.02 && (
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full bg-sky-400 transition-[width] duration-150"
                    style={{ width: `${Math.round(hud.evasionRatio * 100)}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {hud.bustedNotice && hud.wantedLevel === 0 && (
            <div
              className="pointer-events-auto rounded-lg border border-amber-400/50 px-3.5 py-2 text-xs font-bold tracking-wider text-amber-300"
              style={{ backgroundColor: 'rgba(18, 12, 6, 0.9)' }}
            >
              BUSTED · CHARGES CLEARED
            </div>
          )}

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
      </div>

      {/* Bottom-Left Circular Minimap Radar & Full-Screen Map Modal */}
      <Minimap
        hud={hud}
        onToggleMap={onToggleMap}
        onSetGps={onSetGps}
        onClearGps={onClearGps}
      />

      {/* Interactive Shop Menu Modal */}
      <ShopMenuModal
        hud={hud}
        onClose={onCloseShopMenu}
        onBuyOrCollectWeapon={onBuyOrCollectWeapon}
        onBuyAmmo={onBuyAmmo}
        onBuySnack={onBuySnack}
        onApplyOutfit={onApplyOutfit}
        onRepairVehicle={onRepairVehicle}
        onRepaintVehicle={onRepaintVehicle}
        onTuneVehicle={onTuneVehicle}
        onRobStore={onRobStore}
      />

      {/* Center-Bottom Prompts + Collapsible Control Dock (offset cleanly past circular radar) */}
      <div className="flex flex-col items-center gap-2.5 md:pl-[178px]">
        {/* Contextual Action Prompt */}
        {(hud.canEnterVehicle ||
          hud.activeShop ||
          hud.nearShopName ||
          hud.lastEventText) && (
          <div
            className="pointer-events-auto flex flex-wrap items-center justify-center gap-2.5 rounded-lg border border-white/10 px-4 py-1.5 text-xs text-slate-100"
            style={{ backgroundColor: 'rgba(5, 9, 16, 0.86)' }}
          >
            {hud.activeShop && !hud.shopMenuOpen ? (
              <>
                <button
                  type="button"
                  onClick={onInteractKey}
                  className="flex items-center gap-1.5 font-bold text-amber-300 hover:text-amber-200 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Store className="h-3.5 w-3.5" />
                  <span>Press E · {hud.activeShopName} Menu</span>
                </button>
                <span className="text-slate-500">·</span>
                <button
                  type="button"
                  onClick={onBreakIn}
                  className="font-bold text-rose-300 hover:text-rose-200 cursor-pointer whitespace-nowrap shrink-0"
                >
                  Press R · Break In
                </button>
                <span className="text-slate-500">·</span>
                <button
                  type="button"
                  onClick={onExitShop}
                  className="flex items-center gap-1 font-bold text-sky-300 hover:text-sky-200 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <DoorOpen className="h-3.5 w-3.5" />
                  <span>Exit to Street</span>
                </button>
              </>
            ) : hud.nearShopName ? (
              <div className="flex items-center gap-2">
                <span className="font-semibold text-purple-300">
                  {hud.nearShopName}: Walk into glowing door to enter
                </span>
                {hud.nearShopName.includes('Turbo Customs') && (
                  <button
                    type="button"
                    onClick={onInteractKey}
                    className="rounded bg-amber-500 px-2 py-0.5 text-[11px] font-black text-slate-950 hover:bg-amber-400 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Garage Menu · E
                  </button>
                )}
                {hud.canBreakInStore && (
                  <button
                    type="button"
                    onClick={onBreakIn}
                    className="rounded bg-rose-500/80 px-2 py-0.5 text-[11px] font-black text-white hover:bg-rose-400 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Break In · R
                  </button>
                )}
              </div>
            ) : hud.canEnterVehicle ? (
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
            className="pointer-events-auto flex flex-wrap items-center justify-center gap-3 sm:gap-4 rounded-xl border border-white/12 px-4 py-2.5 shadow-2xl"
            style={{
              backgroundColor: 'rgba(5, 9, 16, 0.88)',
              maxWidth: 'min(820px, 92vw)',
            }}
          >
            {/* Speedometer & Gear */}
            <div className="flex items-baseline gap-2 pr-3 border-r border-white/10">
              <span
                className={`font-mono-tabular text-2xl font-semibold ${
                  hud.isSpeeding ? 'text-rose-400' : 'text-white'
                }`}
              >
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
                  {hud.equippedWeapon !== 'unarmed' ? (
                    <button
                      type="button"
                      onClick={onFireWeapon}
                      className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-500 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Crosshair className="h-3.5 w-3.5" />
                      <span>Shoot · Click/G</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onPunch}
                      className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700/80 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Swords className="h-3.5 w-3.5 text-amber-400" />
                      <span>Punch · F</span>
                    </button>
                  )}

                  {hud.ownedWeapons.length > 1 && (
                    <button
                      type="button"
                      onClick={onCycleWeapon}
                      className="flex items-center gap-1 rounded-lg border border-white/10 bg-slate-800/80 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700/80 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <span>Gun · Q</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={onToggleCamera}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-800/80 px-2.5 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700/80 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Camera className="h-3.5 w-3.5 text-sky-400" />
                    <span>
                      {hud.cameraView === 'firstperson' ? '3rd-Person · V' : '1st-Person · V'}
                    </span>
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
                        {hud.cameraView === 'cockpit' ? 'Chase · V' : 'Cockpit · V'}
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
                  { id: 'dusk', label: 'Dusk', Icon: Sparkles },
                  { id: 'day', label: 'Day', Icon: Sun },
                  { id: 'sunset', label: 'Sunset', Icon: Sunset },
                  { id: 'night', label: 'Night', Icon: Moon },
                ] as const
              ).map(({ id, label, Icon }) => {
                const active = hud.timeOfDay === id;
                const activeClass =
                  id === 'dusk'
                    ? 'bg-gradient-to-r from-pink-500 via-purple-500 to-sky-500 text-white'
                    : 'bg-amber-500 text-slate-950';
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onTimeOfDayChange(id)}
                    className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      active ? activeClass : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            {/* Quiet Controls Hint */}
            <div className="hidden xl:flex items-center gap-2 text-[11px] text-slate-400 pl-2 border-l border-white/10">
              <span>WASD</span>
              <span aria-hidden="true">·</span>
              <span>1/Scroll Gun</span>
              <span aria-hidden="true">·</span>
              <span>R-Click Aim</span>
              <span aria-hidden="true">·</span>
              <span>V 1st-Person</span>
              <span aria-hidden="true">·</span>
              <span>M Map</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
