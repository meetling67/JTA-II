import React, { useEffect, useRef } from 'react';
import { Compass, MapPin, Navigation, ShieldAlert, Trash2, X } from 'lucide-react';
import { HudSnapshot, PoiKind } from '../game/types';

interface MinimapProps {
  hud: HudSnapshot;
  onToggleMap: () => void;
  onSetGps: (x: number, z: number, label?: string) => void;
  onClearGps: () => void;
}

const POI_GLYPHS: Record<PoiKind, string> = {
  weapon: 'W',
  clothing: 'C',
  garage: 'T',
  store: '+',
  bank: '$',
};

function drawCityVectorLayer(
  ctx: CanvasRenderingContext2D,
  hud: HudSnapshot,
  worldToCanvas: (wx: number, wz: number) => { x: number; y: number },
  pxPerMeter: number,
  showLabels: boolean
): void {
  const { minX, maxX, minZ, maxZ } = hud.cityBounds;

  // Water strip north of promenade (z < -36)
  const waterTL = worldToCanvas(minX, minZ);
  const waterBR = worldToCanvas(maxX, -36);
  ctx.fillStyle = '#0c2744';
  ctx.fillRect(
    waterTL.x,
    waterTL.y,
    waterBR.x - waterTL.x,
    waterBR.y - waterTL.y
  );

  // Land base south of z = -36
  const landTL = worldToCanvas(minX, -36);
  const landBR = worldToCanvas(maxX, maxZ);
  ctx.fillStyle = '#181f2c';
  ctx.fillRect(
    landTL.x,
    landTL.y,
    landBR.x - landTL.x,
    landBR.y - landTL.y
  );

  // City blocks between roads
  ctx.fillStyle = '#242d3d';
  const xs = hud.nsRoads;
  const zs = hud.ewRoads;
  for (let r = 0; r < zs.length - 1; r++) {
    for (let c = 0; c < xs.length - 1; c++) {
      const bx1 = xs[c] + 5.5;
      const bx2 = xs[c + 1] - 5.5;
      const bz1 = zs[r] + 5.5;
      const bz2 = zs[r + 1] - 5.5;
      if (bx2 <= bx1 || bz2 <= bz1) continue;
      const p1 = worldToCanvas(bx1, bz1);
      const p2 = worldToCanvas(bx2, bz2);
      ctx.fillRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
      ctx.lineWidth = Math.max(0.75, pxPerMeter * 0.4);
      ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
    }
  }

  // Roads
  const roadW = Math.max(2.4, 9.5 * pxPerMeter);
  ctx.fillStyle = '#0b1019';
  for (const rz of zs) {
    const p1 = worldToCanvas(minX, rz);
    const p2 = worldToCanvas(maxX, rz);
    ctx.fillRect(p1.x, p1.y - roadW * 0.5, p2.x - p1.x, roadW);
  }
  for (const rx of xs) {
    const p1 = worldToCanvas(rx, -32);
    const p2 = worldToCanvas(rx, maxZ);
    ctx.fillRect(p1.x - roadW * 0.5, p1.y, roadW, p2.y - p1.y);
  }

  // Pier extension
  const pierTL = worldToCanvas(-14, -64);
  const pierBR = worldToCanvas(14, -34);
  ctx.fillStyle = '#47362b';
  ctx.fillRect(pierTL.x, pierTL.y, pierBR.x - pierTL.x, pierBR.y - pierTL.y);

  // Road dashed centerlines on full-screen map
  if (showLabels) {
    ctx.save();
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.18)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 6]);
    for (const rz of zs) {
      const p1 = worldToCanvas(minX, rz);
      const p2 = worldToCanvas(maxX, rz);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    for (const rx of xs) {
      const p1 = worldToCanvas(rx, -32);
      const p2 = worldToCanvas(rx, maxZ);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Purple GPS route polyline
  if (hud.gpsPin && hud.gpsPath.length >= 2) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.strokeStyle = 'rgba(168, 85, 247, 0.45)';
    ctx.lineWidth = Math.max(5, pxPerMeter * 4.2);
    ctx.beginPath();
    hud.gpsPath.forEach((pt, idx) => {
      const cp = worldToCanvas(pt.x, pt.z);
      if (idx === 0) ctx.moveTo(cp.x, cp.y);
      else ctx.lineTo(cp.x, cp.y);
    });
    ctx.stroke();

    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = Math.max(2.4, pxPerMeter * 2.1);
    ctx.beginPath();
    hud.gpsPath.forEach((pt, idx) => {
      const cp = worldToCanvas(pt.x, pt.z);
      if (idx === 0) ctx.moveTo(cp.x, cp.y);
      else ctx.lineTo(cp.x, cp.y);
    });
    ctx.stroke();
    ctx.restore();
  }

  // Police cruisers & dismounted officers
  const flash = Math.floor(Date.now() / 220) % 2 === 0;
  for (const ent of hud.radarEntities) {
    const cp = worldToCanvas(ent.x, ent.z);
    const r = showLabels ? 5.5 : 3.8;
    ctx.beginPath();
    ctx.arc(cp.x, cp.y, r + 1.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cp.x, cp.y, r, 0, Math.PI * 2);
    ctx.fillStyle =
      ent.kind === 'officer'
        ? '#ef4444'
        : hud.wantedLevel > 0
          ? flash
            ? '#ef4444'
            : '#3b82f6'
          : '#38bdf8';
    ctx.fill();
  }

  // POI Shop icons
  for (const poi of hud.pois) {
    const cp = worldToCanvas(poi.doorX, poi.doorZ);
    const r = showLabels ? 10 : 7.5;

    ctx.beginPath();
    ctx.arc(cp.x, cp.y, r + 1.5, 0, Math.PI * 2);
    ctx.fillStyle = '#060a12';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cp.x, cp.y, r, 0, Math.PI * 2);
    ctx.fillStyle = poi.color;
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${showLabels ? 11 : 9}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(POI_GLYPHS[poi.kind], cp.x, cp.y + 0.5);

    if (showLabels) {
      ctx.font = '700 11px system-ui, sans-serif';
      const labelW = ctx.measureText(poi.shortLabel).width + 10;
      ctx.fillStyle = 'rgba(5, 9, 16, 0.84)';
      ctx.fillRect(cp.x - labelW * 0.5, cp.y + r + 3, labelW, 16);
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(poi.shortLabel, cp.x, cp.y + r + 11);
    }
  }

  // Purple GPS Pin marker
  if (hud.gpsPin) {
    const gp = worldToCanvas(hud.gpsPin.x, hud.gpsPin.z);
    ctx.save();
    ctx.beginPath();
    ctx.arc(gp.x, gp.y, showLabels ? 13 : 9, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(168, 85, 247, 0.32)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(gp.x, gp.y, showLabels ? 6.5 : 5, 0, Math.PI * 2);
    ctx.fillStyle = '#a855f7';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#f3e8ff';
    ctx.stroke();
    ctx.restore();
  }
}

function drawPlayerArrow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  yaw: number,
  size: number
): void {
  // In world coordinates: yaw = 0 faces +Z (down on north-up map), yaw = PI faces -Z (up/north)
  // Canvas angle from +Y-down -> screen heading:
  const angle = -yaw + Math.PI;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  ctx.beginPath();
  ctx.moveTo(0, -size * 1.25);
  ctx.lineTo(size * 0.85, size * 0.9);
  ctx.lineTo(0, size * 0.42);
  ctx.lineTo(-size * 0.85, size * 0.9);
  ctx.closePath();

  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = '#0f172a';
  ctx.stroke();
  ctx.restore();
}

export const Minimap: React.FC<MinimapProps> = ({
  hud,
  onToggleMap,
  onSetGps,
  onClearGps,
}) => {
  const radarCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fullMapCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Draw bottom-left circular radar minimap
  useEffect(() => {
    const canvas = radarCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = 160;
    if (canvas.width !== size * dpr) {
      canvas.width = size * dpr;
      canvas.height = size * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = '#0a101b';
    ctx.fillRect(0, 0, size, size);

    // Zoom radius ~ 118m around player
    const pxPerMeter = 0.72;
    const worldToRadar = (wx: number, wz: number) => ({
      x: size / 2 + (wx - hud.playerX) * pxPerMeter,
      y: size / 2 + (wz - hud.playerZ) * pxPerMeter,
    });

    drawCityVectorLayer(ctx, hud, worldToRadar, pxPerMeter, false);
    drawPlayerArrow(ctx, size / 2, size / 2, hud.playerYaw, 7.5);
    ctx.restore();
  }, [hud]);

  // Draw full-screen interactive map when expanded
  useEffect(() => {
    if (!hud.mapOpen) return;
    const canvas = fullMapCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = 780;
    const h = 560;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }

    const { minX, maxX, minZ, maxZ } = hud.cityBounds;
    const pad = 22;
    const scaleX = (w - pad * 2) / (maxX - minX);
    const scaleZ = (h - pad * 2) / (maxZ - minZ);
    const scale = Math.min(scaleX, scaleZ);
    const offsetX = (w - (maxX - minX) * scale) * 0.5;
    const offsetY = (h - (maxZ - minZ) * scale) * 0.5;

    const worldToFull = (wx: number, wz: number) => ({
      x: offsetX + (wx - minX) * scale,
      y: offsetY + (wz - minZ) * scale,
    });

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, w, h);

    drawCityVectorLayer(ctx, hud, worldToFull, scale, true);

    const pScreen = worldToFull(hud.playerX, hud.playerZ);
    drawPlayerArrow(ctx, pScreen.x, pScreen.y, hud.playerYaw, 9.5);
    ctx.restore();
  }, [hud]);

  const handleFullMapClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = fullMapCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * 780;
    const cy = ((e.clientY - rect.top) / rect.height) * 560;

    const { minX, maxX, minZ, maxZ } = hud.cityBounds;
    const pad = 22;
    const scaleX = (780 - pad * 2) / (maxX - minX);
    const scaleZ = (560 - pad * 2) / (maxZ - minZ);
    const scale = Math.min(scaleX, scaleZ);
    const offsetX = (780 - (maxX - minX) * scale) * 0.5;
    const offsetY = (560 - (maxZ - minZ) * scale) * 0.5;

    const worldX = minX + (cx - offsetX) / scale;
    const worldZ = minZ + (cy - offsetY) / scale;

    // Snap label to nearest POI if clicked close to it
    let label = 'GPS Waypoint';
    let targetX = worldX;
    let targetZ = worldZ;
    for (const poi of hud.pois) {
      if (Math.hypot(worldX - poi.doorX, worldZ - poi.doorZ) < 16) {
        label = poi.name;
        targetX = poi.doorX;
        targetZ = poi.doorZ;
        break;
      }
    }
    onSetGps(targetX, targetZ, label);
  };

  return (
    <>
      {/* Bottom-left circular radar minimap */}
      <div className="pointer-events-auto fixed bottom-4 left-4 z-20 flex flex-col items-center gap-1.5">
        <button
          type="button"
          onClick={onToggleMap}
          title="Click or press M to expand City Map & set Purple GPS route"
          className="group relative h-[160px] w-[160px] overflow-hidden rounded-full border-2 border-white/25 bg-slate-950/90 shadow-2xl transition hover:border-purple-400"
        >
          <canvas ref={radarCanvasRef} className="h-full w-full" />
          <div className="pointer-events-none absolute top-1.5 left-1/2 -translate-x-1/2 rounded bg-slate-950/80 px-1.5 py-0.5 text-[9px] font-black tracking-widest text-slate-300">
            N
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 via-slate-950/50 to-transparent py-1.5 text-center text-[9px] font-bold tracking-wider text-purple-200 uppercase">
            Map · M
          </div>
        </button>

        {hud.gpsPin && (
          <div className="flex items-center gap-2 rounded-lg border border-purple-500/40 bg-slate-950/88 px-2.5 py-1 text-[10px] font-bold text-purple-200 backdrop-blur-md">
            <Navigation className="h-3 w-3 text-purple-400" />
            <span className="max-w-[100px] truncate">{hud.gpsPin.label ?? 'GPS'}</span>
            <span className="tabular-nums text-purple-300">{hud.gpsDistMeters}m</span>
          </div>
        )}
      </div>

      {/* Full-Screen Interactive City Map Modal */}
      {hud.mapOpen && (
        <div
          className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md"
          onClick={onToggleMap}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-950/95 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <Compass className="h-5 w-5 text-purple-400" />
                <div>
                  <h2 className="text-sm font-black tracking-wide text-white uppercase">
                    Sunset Palms City Map & Purple GPS Routing
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Click anywhere on the map or pick a shop to place a glowing purple GPS route
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {hud.gpsPin && (
                  <button
                    type="button"
                    onClick={onClearGps}
                    className="flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-purple-500/40 bg-purple-500/15 px-3 py-1.5 text-xs font-bold text-purple-200 hover:bg-purple-500/25"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Clear Pin ({hud.gpsDistMeters}m)
                  </button>
                )}
                <button
                  type="button"
                  onClick={onToggleMap}
                  className="flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20"
                >
                  <X className="h-3.5 w-3.5" />
                  Close (M)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[1fr_250px]">
              <div className="relative overflow-hidden rounded-xl border border-white/10 bg-slate-900">
                <canvas
                  ref={fullMapCanvasRef}
                  onClick={handleFullMapClick}
                  className="h-auto w-full cursor-crosshair block"
                />
              </div>

              <div className="flex flex-col gap-2">
                <div className="text-[10px] font-black tracking-widest text-slate-400 uppercase">
                  Key Shops & Landmarks
                </div>
                {hud.pois.map((poi) => (
                  <button
                    key={poi.id}
                    type="button"
                    onClick={() => onSetGps(poi.doorX, poi.doorZ, poi.name)}
                    className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left transition hover:border-purple-400/50 hover:bg-purple-500/10"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black text-white"
                        style={{ backgroundColor: poi.color }}
                      >
                        {POI_GLYPHS[poi.kind]}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-xs font-bold text-white">
                          {poi.shortLabel}
                        </div>
                        <div className="truncate text-[10px] text-slate-400">
                          {poi.district}
                        </div>
                      </div>
                    </div>
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-purple-400" />
                  </button>
                ))}

                <div className="mt-auto rounded-xl border border-white/10 bg-white/5 p-3 text-[11px] text-slate-300 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-white">
                    <ShieldAlert className="h-3.5 w-3.5 text-sky-400" />
                    Police & Store Rules
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    Police only dispatch if a cruiser witnesses a store break-in. Security guards drop in 1 gunshot or 3 punches.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
