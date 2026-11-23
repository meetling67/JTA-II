import React from 'react';
import {
  Crosshair,
  DollarSign,
  HeartPulse,
  Paintbrush,
  Shirt,
  ShoppingBag,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import { HudSnapshot, WeaponKind } from '../game/types';

interface ShopMenuModalProps {
  hud: HudSnapshot;
  onClose: () => void;
  onBuyOrCollectWeapon: (kind: Exclude<WeaponKind, 'unarmed'>, cost: number) => void;
  onBuyAmmo: (kind: Exclude<WeaponKind, 'unarmed'>, amount: number, cost: number) => void;
  onBuySnack: (healAmount: number, cost: number, label: string) => void;
  onApplyOutfit: (shirtHex: number, shortsHex: number, hairHex: number) => void;
  onRepairVehicle: () => void;
  onRepaintVehicle: (colorHex: number) => void;
  onTuneVehicle: () => void;
  onRobStore: () => void;
}

const WEAPON_CATALOG: {
  kind: Exclude<WeaponKind, 'unarmed'>;
  name: string;
  desc: string;
  cost: number;
  ammoPack: number;
  ammoCost: number;
}[] = [
  {
    kind: 'pistol',
    name: '9mm Tactical Pistol',
    desc: 'Free starter sidearm · 1-shot vs Store Security',
    cost: 0,
    ammoPack: 36,
    ammoCost: 50,
  },
  {
    kind: 'smg',
    name: 'Micro SMG',
    desc: 'High fire-rate automatic submachine gun',
    cost: 450,
    ammoPack: 90,
    ammoCost: 85,
  },
  {
    kind: 'rifle',
    name: 'Carbine Rifle',
    desc: 'Long-range high-velocity precision rifle',
    cost: 900,
    ammoPack: 75,
    ammoCost: 110,
  },
];

const OUTFIT_PRESETS = [
  { label: 'Miami Sunset', shirt: 0xf43f5e, shorts: 0x0f172a, hair: 0x241913 },
  { label: 'Neon Vice', shirt: 0xa855f7, shorts: 0x1e293b, hair: 0x151110 },
  { label: 'Ocean Breeze', shirt: 0x06b6d4, shorts: 0xf8fafc, hair: 0x6b4423 },
  { label: 'Stealth Black', shirt: 0x18181b, shorts: 0x09090b, hair: 0x111111 },
  { label: 'Golden Palm', shirt: 0xf59e0b, shorts: 0x1f2937, hair: 0x3b2314 },
  { label: 'Emerald Strip', shirt: 0x10b981, shorts: 0x1e293b, hair: 0x4b2c20 },
];

const CAR_PAINTS = [
  { label: 'Electric Purple', hex: 0x7c3aed },
  { label: 'Crimson Gloss', hex: 0xdc2626 },
  { label: 'Cyber Cyan', hex: 0x06b6d4 },
  { label: 'Sunset Orange', hex: 0xf97316 },
  { label: 'Midnight Carbon', hex: 0x111827 },
  { label: 'Pearl Silver', hex: 0xe2e8f0 },
];

export const ShopMenuModal: React.FC<ShopMenuModalProps> = ({
  hud,
  onClose,
  onBuyOrCollectWeapon,
  onBuyAmmo,
  onBuySnack,
  onApplyOutfit,
  onRepairVehicle,
  onRepaintVehicle,
  onTuneVehicle,
  onRobStore,
}) => {
  if (!hud.shopMenuOpen || !hud.activeShop) return null;

  const shop = hud.activeShop;

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/15 bg-slate-950/95 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            {shop === 'weapon' && <Crosshair className="h-5 w-5 text-red-400" />}
            {shop === 'clothing' && <Shirt className="h-5 w-5 text-pink-400" />}
            {shop === 'garage' && <Wrench className="h-5 w-5 text-amber-400" />}
            {shop === 'store' && <ShoppingBag className="h-5 w-5 text-emerald-400" />}
            {shop === 'bank' && <DollarSign className="h-5 w-5 text-sky-400" />}
            <div>
              <h2 className="text-sm font-black tracking-wide text-white uppercase">
                {hud.activeShopName || 'City Shop'}
              </h2>
              <p className="text-[11px] text-slate-400">
                Cash Balance:{' '}
                <span className="font-bold tabular-nums text-emerald-400">
                  ${hud.cash.toLocaleString()}
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20"
          >
            <X className="h-3.5 w-3.5" />
            Close (E)
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {shop === 'weapon' && (
            <div className="space-y-2.5">
              {WEAPON_CATALOG.map((item) => {
                const owned = hud.ownedWeapons.includes(item.kind);
                const equipped = hud.equippedWeapon === item.kind;
                return (
                  <div
                    key={item.kind}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3.5"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{item.name}</span>
                        {owned && (
                          <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300 tabular-nums">
                            {hud.ammo[item.kind]} RDS
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">{item.desc}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      {owned && (
                        <button
                          type="button"
                          onClick={() => onBuyAmmo(item.kind, item.ammoPack, item.ammoCost)}
                          className="whitespace-nowrap shrink-0 rounded-lg border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs font-bold text-slate-200 hover:bg-white/20"
                        >
                          +{item.ammoPack} Ammo (${item.ammoCost})
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onBuyOrCollectWeapon(item.kind, item.cost)}
                        className={`whitespace-nowrap shrink-0 rounded-lg px-3.5 py-1.5 text-xs font-black transition ${
                          equipped
                            ? 'bg-emerald-500 text-slate-950'
                            : owned
                              ? 'bg-sky-500 text-slate-950 hover:bg-sky-400'
                              : 'bg-red-500 text-white hover:bg-red-400'
                        }`}
                      >
                        {equipped
                          ? 'Equipped'
                          : owned
                            ? 'Equip'
                            : item.cost === 0
                              ? 'Collect Free'
                              : `Buy $${item.cost}`}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {shop === 'clothing' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                Select a free outfit style below to update your character live:
              </p>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {OUTFIT_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => onApplyOutfit(preset.shirt, preset.shorts, preset.hair)}
                    className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 p-3 text-left transition hover:border-pink-400/60 hover:bg-pink-500/10"
                  >
                    <span
                      className="h-6 w-6 shrink-0 rounded-full border border-white/30"
                      style={{
                        backgroundColor: `#${preset.shirt.toString(16).padStart(6, '0')}`,
                      }}
                    />
                    <span className="text-xs font-bold text-white">{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {shop === 'garage' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={onRepairVehicle}
                  className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-left transition hover:bg-amber-500/20"
                >
                  <div>
                    <div className="text-xs font-black text-white">Full Body Repair</div>
                    <div className="text-[11px] text-amber-200/80">Fix dents & chassis damage</div>
                  </div>
                  <span className="whitespace-nowrap shrink-0 rounded bg-amber-500 px-2.5 py-1 text-xs font-black text-slate-950">
                    $150
                  </span>
                </button>

                <button
                  type="button"
                  onClick={onTuneVehicle}
                  className="flex items-center justify-between rounded-xl border border-purple-500/30 bg-purple-500/10 p-3.5 text-left transition hover:bg-purple-500/20"
                >
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-black text-white">
                      <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                      Turbo Stage-2 Tune
                    </div>
                    <div className="text-[11px] text-purple-200/80">+28% Top Speed & Accel</div>
                  </div>
                  <span className="whitespace-nowrap shrink-0 rounded bg-purple-500 px-2.5 py-1 text-xs font-black text-white">
                    $350
                  </span>
                </button>
              </div>

              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-slate-300">
                  <Paintbrush className="h-3.5 w-3.5 text-amber-400" />
                  Metallic Respray ($120)
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {CAR_PAINTS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => onRepaintVehicle(p.hex)}
                      className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-left hover:border-white/30"
                    >
                      <span
                        className="h-4 w-4 shrink-0 rounded-full border border-white/30"
                        style={{ backgroundColor: `#${p.hex.toString(16).padStart(6, '0')}` }}
                      />
                      <span className="truncate text-[11px] font-bold text-slate-200">
                        {p.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {shop === 'store' && (
            <div className="space-y-2.5">
              {[
                { label: 'Island Soda & Snack', heal: 25, cost: 30 },
                { label: 'Neon Surge Energy Drink', heal: 50, cost: 60 },
                { label: 'Emergency Trauma Medkit', heal: 100, cost: 120 },
              ].map((s) => (
                <div
                  key={s.label}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3.5"
                >
                  <div className="flex items-center gap-2.5">
                    <HeartPulse className="h-4 w-4 text-emerald-400" />
                    <div>
                      <div className="text-xs font-bold text-white">{s.label}</div>
                      <div className="text-[11px] text-emerald-400">Restores +{s.heal} Health</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onBuySnack(s.heal, s.cost, s.label)}
                    className="whitespace-nowrap shrink-0 rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-black text-slate-950 hover:bg-emerald-400"
                  >
                    Buy ${s.cost}
                  </button>
                </div>
              ))}
            </div>
          )}

          {shop === 'bank' && (
            <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 text-xs text-slate-200 space-y-2">
              <div className="font-black text-sky-300 uppercase">Pacific Bank Vault</div>
              <p className="text-slate-300 leading-relaxed">
                Armed private security guards protect the teller vault. Take out the guards (1 gunshot or 3 punches) and crack the vault to claim $2,500 — watch out for patrolling police cruisers outside!
              </p>
            </div>
          )}

          {/* Break-In / Heist Action */}
          <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3.5">
            <div className="text-[11px] text-slate-400">
              Alerts Store Security · Police only respond if they witness it
            </div>
            <button
              type="button"
              onClick={onRobStore}
              className="whitespace-nowrap shrink-0 rounded-lg border border-red-500/50 bg-red-500/20 px-3.5 py-1.5 text-xs font-black text-red-200 hover:bg-red-500/35"
            >
              Break Into {shop === 'bank' ? 'Vault' : 'Store'} (R)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
