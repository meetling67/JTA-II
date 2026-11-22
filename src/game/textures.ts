import * as THREE from 'three';

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function finalizeTexture(
  canvas: HTMLCanvasElement,
  anisotropy: number,
  repeatX = 1,
  repeatY = 1,
  srgb = true
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Procedural asphalt road texture with subtle aggregate grain and double-yellow / dashed lines.
 */
export function createAsphaltTexture(anisotropy: number, hasCenterLine = true): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = '#252930';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle asphalt aggregate speckles
  for (let i = 0; i < 6500; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const v = 28 + Math.floor(Math.random() * 24);
    ctx.fillStyle = `rgb(${v}, ${v + 2}, ${v + 5})`;
    ctx.fillRect(x, y, 2, 2);
  }

  // Subtle tire wear bands
  ctx.fillStyle = 'rgba(14, 16, 20, 0.26)';
  ctx.fillRect(92, 0, 56, 512);
  ctx.fillRect(364, 0, 56, 512);

  if (hasCenterLine) {
    // Double yellow center line
    ctx.fillStyle = '#e0a92b';
    ctx.fillRect(247, 0, 6, 512);
    ctx.fillRect(259, 0, 6, 512);

    // Outer white lane edge stripes
    ctx.fillStyle = 'rgba(236, 240, 245, 0.72)';
    ctx.fillRect(14, 0, 6, 512);
    ctx.fillRect(492, 0, 6, 512);

    // Dashed lane dividers
    ctx.fillStyle = 'rgba(232, 236, 242, 0.75)';
    for (let y = 16; y < 512; y += 64) {
      ctx.fillRect(126, y, 5, 34);
      ctx.fillRect(381, y, 5, 34);
    }
  }

  return finalizeTexture(canvas, anisotropy, 1, 1, true);
}

/**
 * Procedural crosswalk stripe texture.
 */
export function createCrosswalkTexture(anisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#272b33';
  ctx.fillRect(0, 0, 256, 256);

  ctx.fillStyle = '#eaedf2';
  for (let x = 16; x < 248; x += 36) {
    ctx.fillRect(x, 22, 20, 212);
  }
  return finalizeTexture(canvas, anisotropy, 1, 1, true);
}

/**
 * Procedural concrete sidewalk paver texture.
 */
export function createSidewalkTexture(anisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = '#b9b4aa';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 4200; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const v = 165 + Math.floor(Math.random() * 28);
    ctx.fillStyle = `rgb(${v}, ${v - 4}, ${v - 10})`;
    ctx.fillRect(x, y, 2, 2);
  }

  // Paver expansion joints
  ctx.strokeStyle = 'rgba(85, 80, 74, 0.35)';
  ctx.lineWidth = 3;
  for (let p = 0; p <= 512; p += 128) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(512, p);
    ctx.stroke();
  }

  return finalizeTexture(canvas, anisotropy, 6, 6, true);
}

/**
 * Procedural architectural window facade texture (Day vs Night emissive map).
 * Replicates CityDistrict10x/DayMaterials vs Night lit windows from prepare_project.py!
 */
export function createBuildingFacadeTexture(
  anisotropy: number,
  wallHex: string,
  windowHex: string,
  litRatio = 0.08
): { map: THREE.CanvasTexture; emissiveMap: THREE.CanvasTexture } {
  const [colorCanvas, cCtx] = makeCanvas(512, 512);
  const [emitCanvas, eCtx] = makeCanvas(512, 512);

  cCtx.fillStyle = wallHex;
  cCtx.fillRect(0, 0, 512, 512);

  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, 512, 512);

  const cols = 8;
  const rows = 10;
  const cellW = 512 / cols;
  const cellH = 512 / rows;

  for (let r = 0; r < rows; r++) {
    // Architectural horizontal floor spandrel band
    cCtx.fillStyle = 'rgba(0, 0, 0, 0.14)';
    cCtx.fillRect(0, r * cellH, 512, 6);

    for (let c = 0; c < cols; c++) {
      const wx = c * cellW + 9;
      const wy = r * cellH + 11;
      const ww = cellW - 18;
      const wh = cellH - 18;

      // Window frame
      cCtx.fillStyle = '#1b2029';
      cCtx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);

      // Glazing with subtle blind gradient
      const grad = cCtx.createLinearGradient(wx, wy, wx, wy + wh);
      grad.addColorStop(0, windowHex);
      grad.addColorStop(1, '#1d2d3e');
      cCtx.fillStyle = grad;
      cCtx.fillRect(wx, wy, ww, wh);

      // Blinds line
      cCtx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      cCtx.fillRect(wx, wy, ww, Math.floor(wh * (0.25 + ((r * 7 + c * 3) % 4) * 0.1)));

      // Night window illumination
      const hash = ((r * 31 + c * 17) % 100) / 100;
      if (hash < litRatio) {
        eCtx.fillStyle = hash < litRatio * 0.5 ? '#ffd699' : '#b7e2ff';
        eCtx.fillRect(wx, wy, ww, wh);
      }
    }
  }

  return {
    map: finalizeTexture(colorCanvas, anisotropy, 1, 2, true),
    emissiveMap: finalizeTexture(emitCanvas, anisotropy, 1, 2, true),
  };
}

/**
 * Procedural waterfront ocean surface normal/ripple canvas texture.
 */
export function createWaterTexture(anisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  const grad = ctx.createLinearGradient(0, 0, 512, 512);
  grad.addColorStop(0, '#0e5b78');
  grad.addColorStop(0.5, '#13728f');
  grad.addColorStop(1, '#0b4e68');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 420; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const w = 18 + Math.random() * 44;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(135, 224, 245, 0.14)' : 'rgba(6, 38, 54, 0.18)';
    ctx.fillRect(x, y, w, 3);
  }

  return finalizeTexture(canvas, anisotropy, 14, 14, true);
}

/**
 * Procedural dashboard gauge texture for cockpit interior.
 */
export function createDashboardTexture(anisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 160);
  ctx.fillStyle = '#11151d';
  ctx.fillRect(0, 0, 512, 160);

  // Two backlit instrument dials
  const drawDial = (cx: number, label: string) => {
    ctx.beginPath();
    ctx.arc(cx, 80, 56, 0, Math.PI * 2);
    ctx.fillStyle = '#070a0f';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#f59e0b';
    ctx.stroke();

    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 40, 80 + Math.sin(a) * 40);
      ctx.lineTo(cx + Math.cos(a) * 50, 80 + Math.sin(a) * 50);
      ctx.strokeStyle = i >= 8 ? '#ef4444' : '#e2e8f0';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, 108);
  };

  drawDial(150, 'KM/H');
  drawDial(362, 'RPM');

  // Center infotainment map glow
  ctx.fillStyle = '#0f2738';
  ctx.fillRect(226, 44, 60, 72);
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.strokeRect(226, 44, 60, 72);

  return finalizeTexture(canvas, anisotropy, 1, 1, true);
}
