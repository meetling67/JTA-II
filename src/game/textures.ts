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

export interface PbrTextureSet {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
}

export interface FacadePbrTextureSet {
  map: THREE.CanvasTexture;
  emissiveMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  metalnessMap: THREE.CanvasTexture;
}

function drawBranchingCrack(
  cCtx: CanvasRenderingContext2D,
  rCtx: CanvasRenderingContext2D,
  bCtx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  steps: number,
  stepLen: number,
  angle: number,
  width: number
): void {
  let x = startX;
  let y = startY;
  let a = angle;

  for (let i = 0; i < steps; i++) {
    const nx = x + Math.cos(a) * stepLen;
    const ny = y + Math.sin(a) * stepLen;

    // Pale weathered dust edge on albedo
    cCtx.strokeStyle = 'rgba(72, 78, 88, 0.36)';
    cCtx.lineWidth = width + 2.2;
    cCtx.beginPath();
    cCtx.moveTo(x, y);
    cCtx.lineTo(nx, ny);
    cCtx.stroke();

    // Deep dark crack fissure on albedo
    cCtx.strokeStyle = 'rgba(10, 12, 16, 0.85)';
    cCtx.lineWidth = width;
    cCtx.beginPath();
    cCtx.moveTo(x, y);
    cCtx.lineTo(nx, ny);
    cCtx.stroke();

    // High roughness inside fissure
    rCtx.strokeStyle = '#f2f2f2';
    rCtx.lineWidth = width + 1.5;
    rCtx.beginPath();
    rCtx.moveTo(x, y);
    rCtx.lineTo(nx, ny);
    rCtx.stroke();

    // Deep bump depression
    bCtx.strokeStyle = '#181818';
    bCtx.lineWidth = width + 1.2;
    bCtx.beginPath();
    bCtx.moveTo(x, y);
    bCtx.lineTo(nx, ny);
    bCtx.stroke();

    if (width > 1.2 && i % 3 === 1 && Math.random() < 0.65) {
      drawBranchingCrack(
        cCtx,
        rCtx,
        bCtx,
        nx,
        ny,
        Math.max(3, Math.floor(steps * 0.5)),
        stepLen * 0.72,
        a + (Math.random() > 0.5 ? 0.55 : -0.55),
        Math.max(0.8, width * 0.6)
      );
    }

    x = nx;
    y = ny;
    a += (Math.random() - 0.5) * 0.7;
  }
}

/**
 * High-detail 1024px cracked asphalt PBR texture set with aggregate grit,
 * branching fractures, tire polish tracks, double-yellow median, and crisp lane striping.
 */
export function createAsphaltPBR(anisotropy: number, hasCenterLine = true): PbrTextureSet {
  const [canvas, ctx] = makeCanvas(1024, 1024);
  const [rCanvas, rCtx] = makeCanvas(1024, 1024);
  const [bCanvas, bCtx] = makeCanvas(1024, 1024);

  ctx.fillStyle = '#161920';
  ctx.fillRect(0, 0, 1024, 1024);
  rCtx.fillStyle = '#cfcfcf'; // ~0.81 base asphalt roughness
  rCtx.fillRect(0, 0, 1024, 1024);
  bCtx.fillStyle = '#808080'; // neutral mid-height
  bCtx.fillRect(0, 0, 1024, 1024);

  // Fine mineral aggregate speckles across color, roughness & bump
  for (let i = 0; i < 22000; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const v = 24 + Math.floor(Math.random() * 32);
    ctx.fillStyle = `rgb(${v}, ${v + 2}, ${v + 6})`;
    ctx.fillRect(x, y, 2, 2);

    const rv = 175 + Math.floor(Math.random() * 65);
    rCtx.fillStyle = `rgb(${rv},${rv},${rv})`;
    rCtx.fillRect(x, y, 2, 2);

    const bv = 100 + Math.floor(Math.random() * 64);
    bCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
    bCtx.fillRect(x, y, 2, 2);
  }

  // Polished tire wear bands (darker albedo, smoother lower roughness for HDRI/sun sheen)
  const bandGrad = ctx.createLinearGradient(0, 0, 1024, 0);
  bandGrad.addColorStop(0, 'rgba(0,0,0,0)');
  bandGrad.addColorStop(0.18, 'rgba(10,12,16,0.34)');
  bandGrad.addColorStop(0.32, 'rgba(0,0,0,0)');
  bandGrad.addColorStop(0.68, 'rgba(0,0,0,0)');
  bandGrad.addColorStop(0.82, 'rgba(10,12,16,0.34)');
  bandGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bandGrad;
  ctx.fillRect(0, 0, 1024, 1024);

  const rBandGrad = rCtx.createLinearGradient(0, 0, 1024, 0);
  rBandGrad.addColorStop(0, 'rgba(120,120,120,0)');
  rBandGrad.addColorStop(0.18, 'rgba(120,120,120,0.45)');
  rBandGrad.addColorStop(0.32, 'rgba(120,120,120,0)');
  rBandGrad.addColorStop(0.68, 'rgba(120,120,120,0)');
  rBandGrad.addColorStop(0.82, 'rgba(120,120,120,0.45)');
  rBandGrad.addColorStop(1, 'rgba(120,120,120,0)');
  rCtx.fillStyle = rBandGrad;
  rCtx.fillRect(0, 0, 1024, 1024);

  // Branching asphalt cracks & tar-sealed repair seams
  for (let c = 0; c < 11; c++) {
    drawBranchingCrack(
      ctx,
      rCtx,
      bCtx,
      60 + Math.random() * 900,
      40 + Math.random() * 940,
      7 + Math.floor(Math.random() * 6),
      22 + Math.random() * 18,
      Math.random() * Math.PI * 2,
      1.6 + Math.random() * 1.4
    );
  }

  // Glossy tar-filled longitudinal joint
  ctx.strokeStyle = 'rgba(12, 14, 18, 0.58)';
  ctx.lineWidth = 4;
  rCtx.strokeStyle = '#6e6e6e';
  rCtx.lineWidth = 5;
  for (let s = 0; s < 3; s++) {
    const sx0 = 140 + s * 360 + Math.random() * 40;
    ctx.beginPath();
    rCtx.beginPath();
    ctx.moveTo(sx0, 0);
    rCtx.moveTo(sx0, 0);
    for (let y = 128; y <= 1024; y += 128) {
      const wx = sx0 + (Math.random() - 0.5) * 26;
      ctx.lineTo(wx, y);
      rCtx.lineTo(wx, y);
    }
    ctx.stroke();
    rCtx.stroke();
  }

  if (hasCenterLine) {
    // Slightly smoother & raised thermoplastic white road paint
    const markPaint = (x: number, y: number, w: number, h: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
      rCtx.fillStyle = '#7c7c7c';
      rCtx.fillRect(x, y, w, h);
      bCtx.fillStyle = '#a0a0a0';
      bCtx.fillRect(x, y, w, h);
    };

    // Crisp white outer shoulder lines
    markPaint(22, 0, 12, 1024, 'rgba(248, 250, 252, 0.92)');
    markPaint(990, 0, 12, 1024, 'rgba(248, 250, 252, 0.92)');

    // Crisp double center line (warm amber-white) & dashed white lane dividers
    markPaint(498, 0, 9, 1024, 'rgba(248, 250, 252, 0.92)');
    markPaint(517, 0, 9, 1024, 'rgba(248, 250, 252, 0.92)');

    for (let y = 20; y < 1024; y += 128) {
      markPaint(256, y, 10, 68, 'rgba(248, 250, 252, 0.9)');
      markPaint(758, y, 10, 68, 'rgba(248, 250, 252, 0.9)');
      markPaint(508, y + 26, 8, 12, '#f8fafc');
    }
  }

  return {
    map: finalizeTexture(canvas, anisotropy, 1, 1, true),
    roughnessMap: finalizeTexture(rCanvas, anisotropy, 1, 1, false),
    bumpMap: finalizeTexture(bCanvas, anisotropy, 1, 1, false),
  };
}

export function createAsphaltTexture(anisotropy: number, hasCenterLine = true): THREE.CanvasTexture {
  return createAsphaltPBR(anisotropy, hasCenterLine).map;
}

/**
 * Crisp crosswalk stripe texture with worn stop bars.
 */
export function createCrosswalkTexture(anisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = '#22262e';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 4000; i++) {
    const v = 26 + Math.floor(Math.random() * 20);
    ctx.fillStyle = `rgb(${v}, ${v + 2}, ${v + 5})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }

  ctx.fillStyle = '#f1f5f9';
  for (let x = 28; x < 484; x += 68) {
    ctx.fillRect(x, 42, 38, 428);
  }
  return finalizeTexture(canvas, anisotropy, 1, 1, true);
}

/**
 * Weathered concrete & travertine sidewalk PBR texture set with slab expansion seams,
 * broom-finish surface grain, and subtle hairline slab cracks.
 */
export function createSidewalkPBR(anisotropy: number): PbrTextureSet {
  const [canvas, ctx] = makeCanvas(1024, 1024);
  const [rCanvas, rCtx] = makeCanvas(1024, 1024);
  const [bCanvas, bCtx] = makeCanvas(1024, 1024);

  ctx.fillStyle = '#c5bfb5';
  ctx.fillRect(0, 0, 1024, 1024);
  rCtx.fillStyle = '#dcdcdc';
  rCtx.fillRect(0, 0, 1024, 1024);
  bCtx.fillStyle = '#929292';
  bCtx.fillRect(0, 0, 1024, 1024);

  const tile = 128;
  for (let gx = 0; gx < 1024; gx += tile) {
    for (let gy = 0; gy < 1024; gy += tile) {
      const shade = 184 + Math.floor(Math.random() * 20);
      ctx.fillStyle = `rgb(${shade}, ${shade - 4}, ${shade - 10})`;
      ctx.fillRect(gx + 3, gy + 3, tile - 6, tile - 6);

      const rShade = 205 + Math.floor(Math.random() * 30);
      rCtx.fillStyle = `rgb(${rShade},${rShade},${rShade})`;
      rCtx.fillRect(gx + 3, gy + 3, tile - 6, tile - 6);

      const bShade = 138 + Math.floor(Math.random() * 18);
      bCtx.fillStyle = `rgb(${bShade},${bShade},${bShade})`;
      bCtx.fillRect(gx + 3, gy + 3, tile - 6, tile - 6);
    }
  }

  // Concrete broom-finish speckles
  for (let i = 0; i < 12000; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const v = 155 + Math.floor(Math.random() * 42);
    ctx.fillStyle = `rgba(${v}, ${v - 4}, ${v - 8}, 0.45)`;
    ctx.fillRect(x, y, 2, 2);

    const bv = 120 + Math.floor(Math.random() * 48);
    bCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
    bCtx.fillRect(x, y, 2, 2);
  }

  // Subtle corner hairline concrete cracks
  for (let c = 0; c < 6; c++) {
    drawBranchingCrack(
      ctx,
      rCtx,
      bCtx,
      Math.random() * 1024,
      Math.random() * 1024,
      5,
      16,
      Math.random() * Math.PI * 2,
      1.1
    );
  }

  // Sharp recessed grout & expansion joints
  ctx.strokeStyle = 'rgba(70, 66, 60, 0.56)';
  ctx.lineWidth = 4;
  rCtx.strokeStyle = '#f5f5f5';
  rCtx.lineWidth = 5;
  bCtx.strokeStyle = '#383838';
  bCtx.lineWidth = 5;
  for (let p = 0; p <= 1024; p += tile) {
    for (const target of [ctx, rCtx, bCtx]) {
      target.beginPath();
      target.moveTo(p, 0);
      target.lineTo(p, 1024);
      target.stroke();
      target.beginPath();
      target.moveTo(0, p);
      target.lineTo(1024, p);
      target.stroke();
    }
  }

  return {
    map: finalizeTexture(canvas, anisotropy, 6, 6, true),
    roughnessMap: finalizeTexture(rCanvas, anisotropy, 6, 6, false),
    bumpMap: finalizeTexture(bCanvas, anisotropy, 6, 6, false),
  };
}

export function createSidewalkTexture(anisotropy: number): THREE.CanvasTexture {
  return createSidewalkPBR(anisotropy).map;
}

/**
 * High-detail 1024px architectural facade PBR texture set with recessed mullions,
 * glossy HDRI-reflective glass panes, matte masonry cladding, and warm/cyan/neon night glow.
 */
export function createBuildingFacadeTexture(
  anisotropy: number,
  wallHex: string,
  windowHex: string,
  litRatio = 0.25,
  accentHex = '#ec4899'
): FacadePbrTextureSet {
  const [colorCanvas, cCtx] = makeCanvas(1024, 1024);
  const [emitCanvas, eCtx] = makeCanvas(1024, 1024);
  const [roughCanvas, rCtx] = makeCanvas(1024, 1024);
  const [metalCanvas, mCtx] = makeCanvas(1024, 1024);

  cCtx.fillStyle = wallHex;
  cCtx.fillRect(0, 0, 1024, 1024);

  // Masonry / concrete surface variation
  for (let i = 0; i < 6500; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    cCtx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
    cCtx.fillRect(x, y, 3, 3);
  }

  // Matte stone/concrete base PBR values
  rCtx.fillStyle = '#dedede'; // ~0.87 matte facade wall
  rCtx.fillRect(0, 0, 1024, 1024);
  mCtx.fillStyle = '#121212'; // non-metallic facade wall
  mCtx.fillRect(0, 0, 1024, 1024);

  // Concrete panel seam lines
  cCtx.strokeStyle = 'rgba(0, 0, 0, 0.16)';
  cCtx.lineWidth = 3;
  for (let x = 0; x <= 1024; x += 128) {
    cCtx.beginPath();
    cCtx.moveTo(x, 0);
    cCtx.lineTo(x, 1024);
    cCtx.stroke();
  }

  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, 1024, 1024);

  const cols = 8;
  const rows = 10;
  const cellW = 1024 / cols;
  const cellH = 1024 / rows;

  for (let r = 0; r < rows; r++) {
    // Architectural spandrel slab
    cCtx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    cCtx.fillRect(0, r * cellH, 1024, 12);
    cCtx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    cCtx.fillRect(0, r * cellH + 12, 1024, 4);

    for (let c = 0; c < cols; c++) {
      const wx = c * cellW + 16;
      const wy = r * cellH + 22;
      const ww = cellW - 32;
      const wh = cellH - 36;

      // Recessed dark aluminum frame & sill
      cCtx.fillStyle = '#12161f';
      cCtx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
      rCtx.fillStyle = '#686868';
      rCtx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
      mCtx.fillStyle = '#909090';
      mCtx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);

      // Tinted reflective architectural glass gradient
      const grad = cCtx.createLinearGradient(wx, wy, wx + ww * 0.4, wy + wh);
      grad.addColorStop(0, windowHex);
      grad.addColorStop(0.55, '#19314a');
      grad.addColorStop(1, '#0e1926');
      cCtx.fillStyle = grad;
      cCtx.fillRect(wx, wy, ww, wh);

      // Mirror-smooth glass roughness & metallic reflection response for RoomEnvironment
      rCtx.fillStyle = '#141414'; // ~0.08 glossy glass
      rCtx.fillRect(wx, wy, ww, wh);
      mCtx.fillStyle = '#9c9c9c'; // crisp sky/sunset reflection
      mCtx.fillRect(wx, wy, ww, wh);

      // Venetian blind / interior floor depth
      const blindDrop = Math.floor(wh * (0.18 + ((r * 5 + c * 3) % 4) * 0.08));
      cCtx.fillStyle = 'rgba(255, 255, 255, 0.14)';
      cCtx.fillRect(wx, wy, ww, blindDrop);

      // Vertical mullion + horizontal transom bar
      cCtx.fillStyle = '#1e2530';
      cCtx.fillRect(wx + ww * 0.5 - 2, wy, 4, wh);
      cCtx.fillRect(wx, wy + wh * 0.65, ww, 3);
      rCtx.fillStyle = '#646464';
      rCtx.fillRect(wx + ww * 0.5 - 2, wy, 4, wh);
      rCtx.fillRect(wx, wy + wh * 0.65, ww, 3);

      // Night/dusk/sunset interior lighting
      const hash = ((r * 37 + c * 19 + 7) % 100) / 100;
      if (hash < litRatio) {
        if (hash < litRatio * 0.48) {
          eCtx.fillStyle = '#ffd9a0';
        } else if (hash < litRatio * 0.82) {
          eCtx.fillStyle = '#93c5fd';
        } else {
          eCtx.fillStyle = accentHex;
        }
        eCtx.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
        // Keep mullion & partial blind silhouettes in emissive map
        eCtx.fillStyle = '#000000';
        eCtx.fillRect(wx + ww * 0.5 - 2, wy, 4, wh);
        eCtx.fillRect(wx, wy + wh * 0.65, ww, 3);
        eCtx.fillStyle = 'rgba(0,0,0,0.28)';
        eCtx.fillRect(wx + 2, wy + 2, ww - 4, Math.floor(blindDrop * 0.7));
      }
    }
  }

  return {
    map: finalizeTexture(colorCanvas, anisotropy, 1, 2, true),
    emissiveMap: finalizeTexture(emitCanvas, anisotropy, 1, 2, true),
    roughnessMap: finalizeTexture(roughCanvas, anisotropy, 1, 2, false),
    metalnessMap: finalizeTexture(metalCanvas, anisotropy, 1, 2, false),
  };
}

/**
 * Curtain-wall glass skyscraper texture designed for reflective sunset HDR sky
 * (metalness: 0.7, roughness: 0.2) with crisp dark mullions and glowing interior floors.
 */
export function createGlassSkyscraperTexture(
  anisotropy: number,
  glassTintHex = '#325a7a',
  mullionHex = '#151c26',
  litRatio = 0.42,
  accentHex = '#fbbf24'
): { map: THREE.CanvasTexture; emissiveMap: THREE.CanvasTexture } {
  const [cCanvas, cCtx] = makeCanvas(1024, 1024);
  const [eCanvas, eCtx] = makeCanvas(1024, 1024);

  cCtx.fillStyle = glassTintHex;
  cCtx.fillRect(0, 0, 1024, 1024);
  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, 1024, 1024);

  const cols = 10;
  const rows = 14;
  const cw = 1024 / cols;
  const ch = 1024 / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px = c * cw + 4;
      const py = r * ch + 6;
      const pw = cw - 8;
      const ph = ch - 12;

      // Subtle reflective glass pane gradient
      const g = cCtx.createLinearGradient(px, py, px + pw, py + ph);
      g.addColorStop(0, glassTintHex);
      g.addColorStop(0.55, '#4c7ca3');
      g.addColorStop(1, '#1d364f');
      cCtx.fillStyle = g;
      cCtx.fillRect(px, py, pw, ph);

      // Subtle interior floor band & blinds
      cCtx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      cCtx.fillRect(px, py, pw, Math.floor(ph * (0.15 + ((r * 7 + c * 3) % 4) * 0.08)));

      // Illuminated sunset/night interior offices
      const h = ((r * 41 + c * 23 + 11) % 100) / 100;
      if (h < litRatio) {
        eCtx.fillStyle =
          h < litRatio * 0.55 ? '#ffd494' : h < litRatio * 0.85 ? '#93c5fd' : accentHex;
        eCtx.fillRect(px + 2, py + 2, pw - 4, ph - 4);
        eCtx.fillStyle = 'rgba(0,0,0,0.35)';
        eCtx.fillRect(px + 2, py + 2, pw - 4, Math.floor(ph * 0.25));
      }
    }

    // Horizontal steel spandrel beam
    cCtx.fillStyle = mullionHex;
    cCtx.fillRect(0, r * ch, 1024, 8);
    eCtx.fillStyle = '#000000';
    eCtx.fillRect(0, r * ch, 1024, 8);
  }

  // Vertical anodized mullions
  cCtx.fillStyle = mullionHex;
  for (let c = 0; c <= cols; c++) {
    cCtx.fillRect(c * cw - 3, 0, 6, 1024);
    eCtx.fillRect(c * cw - 3, 0, 6, 1024);
  }

  return {
    map: finalizeTexture(cCanvas, anisotropy, 1, 2, true),
    emissiveMap: finalizeTexture(eCanvas, anisotropy, 1, 2, true),
  };
}

/**
 * Detailed running-bond brick apartment facade texture with mortar courses,
 * stone window lintels/sills, and warm glowing apartment windows.
 */
export function createBrickApartmentTexture(
  anisotropy: number,
  brickRgb: [number, number, number] = [148, 72, 54],
  litRatio = 0.46
): FacadePbrTextureSet {
  const [cCanvas, cCtx] = makeCanvas(1024, 1024);
  const [eCanvas, eCtx] = makeCanvas(1024, 1024);
  const [rCanvas, rCtx] = makeCanvas(1024, 1024);
  const [mCanvas, mCtx] = makeCanvas(1024, 1024);

  // Mortar base
  cCtx.fillStyle = '#9c9288';
  cCtx.fillRect(0, 0, 1024, 1024);
  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, 1024, 1024);
  rCtx.fillStyle = '#dcdcdc';
  rCtx.fillRect(0, 0, 1024, 1024);
  mCtx.fillStyle = '#121212';
  mCtx.fillRect(0, 0, 1024, 1024);

  // Running-bond brick courses
  const brickH = 16;
  const brickW = 40;
  for (let row = 0; row < 1024 / brickH; row++) {
    const y = row * brickH;
    const offset = (row % 2) * (brickW * 0.5);
    for (let x = -brickW; x < 1024; x += brickW) {
      const shade = 0.82 + ((row * 17 + x * 13) % 35) * 0.01;
      const r = Math.min(255, Math.round(brickRgb[0] * shade));
      const g = Math.min(255, Math.round(brickRgb[1] * shade));
      const b = Math.min(255, Math.round(brickRgb[2] * shade));
      cCtx.fillStyle = `rgb(${r},${g},${b})`;
      cCtx.fillRect(x + offset + 2, y + 2, brickW - 3, brickH - 3);
    }
  }

  // Apartment window bays
  const cols = 6;
  const rows = 8;
  const cw = 1024 / cols;
  const ch = 1024 / rows;

  for (let r = 0; r < rows; r++) {
    // Stone cornice ledge per floor
    cCtx.fillStyle = '#bfb6aa';
    cCtx.fillRect(0, r * ch, 1024, 10);

    for (let c = 0; c < cols; c++) {
      const wx = c * cw + 34;
      const wy = r * ch + 28;
      const ww = cw - 68;
      const wh = ch - 48;

      // Stone lintel & sill
      cCtx.fillStyle = '#cfc6b8';
      cCtx.fillRect(wx - 6, wy - 9, ww + 12, 9);
      cCtx.fillRect(wx - 6, wy + wh, ww + 12, 8);

      // Dark window sash + reflective glass
      cCtx.fillStyle = '#1b2028';
      cCtx.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
      cCtx.fillStyle = '#2a4259';
      cCtx.fillRect(wx, wy, ww, wh);
      rCtx.fillStyle = '#1c1c1c';
      rCtx.fillRect(wx, wy, ww, wh);
      mCtx.fillStyle = '#808080';
      mCtx.fillRect(wx, wy, ww, wh);

      // Cross sash bars
      cCtx.fillStyle = '#e2e8f0';
      cCtx.fillRect(wx + ww * 0.5 - 2, wy, 4, wh);
      cCtx.fillRect(wx, wy + wh * 0.52, ww, 4);

      const h = ((r * 29 + c * 43 + 5) % 100) / 100;
      if (h < litRatio) {
        eCtx.fillStyle = h < litRatio * 0.72 ? '#ffd28e' : '#ffe8ba';
        eCtx.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
        eCtx.fillStyle = '#000000';
        eCtx.fillRect(wx + ww * 0.5 - 2, wy, 4, wh);
        eCtx.fillRect(wx, wy + wh * 0.52, ww, 4);
      }
    }
  }

  return {
    map: finalizeTexture(cCanvas, anisotropy, 1, 2, true),
    emissiveMap: finalizeTexture(eCanvas, anisotropy, 1, 2, true),
    roughnessMap: finalizeTexture(rCanvas, anisotropy, 1, 2, false),
    metalnessMap: finalizeTexture(mCanvas, anisotropy, 1, 2, false),
  };
}

/**
 * Ground-floor boutique/cafe storefront display windows with glowing shop interiors.
 */
export function createStorefrontFacadeTexture(
  anisotropy: number,
  frameHex = '#1e293b',
  glowHex = '#ffd7a0'
): { map: THREE.CanvasTexture; emissiveMap: THREE.CanvasTexture } {
  const [cCanvas, cCtx] = makeCanvas(512, 256);
  const [eCanvas, eCtx] = makeCanvas(512, 256);

  cCtx.fillStyle = frameHex;
  cCtx.fillRect(0, 0, 512, 256);
  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, 512, 256);

  const bays = 4;
  const bw = 512 / bays;
  for (let i = 0; i < bays; i++) {
    const x = i * bw + 14;
    const y = 26;
    const w = bw - 28;
    const h = 196;

    const grad = cCtx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#5a7f9e');
    grad.addColorStop(0.55, '#2b4760');
    grad.addColorStop(1, '#1a2736');
    cCtx.fillStyle = grad;
    cCtx.fillRect(x, y, w, h);

    // Warm shop interior display glow
    eCtx.fillStyle = i === 1 ? '#93c5fd' : glowHex;
    eCtx.fillRect(x + 4, y + 8, w - 8, h - 14);
    eCtx.fillStyle = 'rgba(0,0,0,0.45)';
    eCtx.fillRect(x + 4, y + h - 42, w - 8, 36);
  }

  return {
    map: finalizeTexture(cCanvas, anisotropy, 2, 1, true),
    emissiveMap: finalizeTexture(eCanvas, anisotropy, 2, 1, true),
  };
}

/**
 * Suburban residential plaster & shuttered window facade texture for Suburban district.
 */
export function createSuburbanHouseTexture(
  anisotropy: number,
  stuccoHex = '#e6dccf',
  trimHex = '#475569'
): { map: THREE.CanvasTexture; emissiveMap: THREE.CanvasTexture } {
  const [cCanvas, cCtx] = makeCanvas(512, 512);
  const [eCanvas, eCtx] = makeCanvas(512, 512);

  cCtx.fillStyle = stuccoHex;
  cCtx.fillRect(0, 0, 512, 512);
  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, 512, 512);

  // Subtle horizontal siding bands
  cCtx.fillStyle = 'rgba(0,0,0,0.05)';
  for (let y = 0; y < 512; y += 16) {
    cCtx.fillRect(0, y, 512, 2);
  }

  const cols = 4;
  const rows = 3;
  const cw = 512 / cols;
  const ch = 512 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wx = c * cw + 26;
      const wy = r * ch + 34;
      const ww = cw - 52;
      const wh = ch - 68;

      // Shutters
      cCtx.fillStyle = trimHex;
      cCtx.fillRect(wx - 10, wy, 9, wh);
      cCtx.fillRect(wx + ww + 1, wy, 9, wh);

      // Warm window frame & glass
      cCtx.fillStyle = '#f8fafc';
      cCtx.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
      cCtx.fillStyle = '#28455e';
      cCtx.fillRect(wx, wy, ww, wh);
      cCtx.fillStyle = '#f8fafc';
      cCtx.fillRect(wx + ww * 0.5 - 2, wy, 4, wh);
      cCtx.fillRect(wx, wy + wh * 0.5 - 2, ww, 4);

      if ((r * 7 + c * 5) % 3 !== 0) {
        eCtx.fillStyle = '#ffd699';
        eCtx.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
        eCtx.fillStyle = '#000000';
        eCtx.fillRect(wx + ww * 0.5 - 2, wy, 4, wh);
        eCtx.fillRect(wx, wy + wh * 0.5 - 2, ww, 4);
      }
    }
  }

  return {
    map: finalizeTexture(cCanvas, anisotropy, 1, 1, true),
    emissiveMap: finalizeTexture(eCanvas, anisotropy, 1, 1, true),
  };
}

/**
 * Corrugated industrial warehouse steel & skylight bay facade texture for Industrial district.
 */
export function createIndustrialFacadeTexture(
  anisotropy: number,
  steelHex = '#3b424c'
): { map: THREE.CanvasTexture; emissiveMap: THREE.CanvasTexture } {
  const [cCanvas, cCtx] = makeCanvas(512, 512);
  const [eCanvas, eCtx] = makeCanvas(512, 512);

  cCtx.fillStyle = steelHex;
  cCtx.fillRect(0, 0, 512, 512);
  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, 512, 512);

  // Corrugated vertical ribs
  for (let x = 0; x < 512; x += 8) {
    cCtx.fillStyle = x % 16 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.14)';
    cCtx.fillRect(x, 0, 4, 512);
  }

  // Yellow/black industrial hazard stripe band
  cCtx.fillStyle = '#eab308';
  cCtx.fillRect(0, 392, 512, 24);
  cCtx.fillStyle = '#111827';
  for (let x = -32; x < 544; x += 40) {
    cCtx.beginPath();
    cCtx.moveTo(x, 392);
    cCtx.lineTo(x + 20, 392);
    cCtx.lineTo(x + 6, 416);
    cCtx.lineTo(x - 14, 416);
    cCtx.closePath();
    cCtx.fill();
  }

  // Upper factory clerestory windows
  for (let c = 0; c < 4; c++) {
    const wx = c * 128 + 16;
    cCtx.fillStyle = '#141920';
    cCtx.fillRect(wx - 3, 54, 102, 68);
    cCtx.fillStyle = '#2d4558';
    cCtx.fillRect(wx, 57, 96, 62);
    if (c % 2 === 0) {
      eCtx.fillStyle = '#fde68a';
      eCtx.fillRect(wx + 2, 59, 92, 58);
    }
  }

  // Roll-up steel loading dock doors
  for (let b = 0; b < 2; b++) {
    const dx = 48 + b * 240;
    cCtx.fillStyle = '#1f242c';
    cCtx.fillRect(dx, 260, 176, 252);
    cCtx.fillStyle = '#475569';
    for (let y = 272; y < 508; y += 22) {
      cCtx.fillRect(dx + 8, y, 160, 16);
    }
  }

  return {
    map: finalizeTexture(cCanvas, anisotropy, 1, 1, true),
    emissiveMap: finalizeTexture(eCanvas, anisotropy, 1, 1, true),
  };
}

/**
 * Realistic irregular crimson ground blood splatter decal texture (transparent background).
 */
export function createBloodDecalTexture(anisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  ctx.clearRect(0, 0, 256, 256);

  const cx = 128;
  const cy = 128;
  const grad = ctx.createRadialGradient(cx, cy, 8, cx, cy, 92);
  grad.addColorStop(0, 'rgba(92, 4, 8, 0.96)');
  grad.addColorStop(0.55, 'rgba(138, 10, 16, 0.88)');
  grad.addColorStop(1, 'rgba(120, 8, 12, 0)');

  // Irregular central pool
  ctx.fillStyle = grad;
  ctx.beginPath();
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = 48 + Math.sin(a * 5) * 14 + Math.cos(a * 3) * 12;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  // Outer splatter droplets
  for (let i = 0; i < 28; i++) {
    const a = (i * 2.39996) % (Math.PI * 2);
    const dist = 42 + ((i * 37) % 66);
    const rad = 3 + ((i * 13) % 9);
    ctx.fillStyle = i % 2 === 0 ? 'rgba(110, 8, 12, 0.86)' : 'rgba(148, 14, 20, 0.78)';
    ctx.beginPath();
    ctx.ellipse(
      cx + Math.cos(a) * dist,
      cy + Math.sin(a) * dist,
      rad * 1.35,
      rad * 0.85,
      a,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  const tex = finalizeTexture(canvas, anisotropy, 1, 1, true);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * Procedural dark weathered urban ground lot PBR texture (replaces flat ground color).
 */
export function createGroundTerrainPBR(anisotropy: number): PbrTextureSet {
  const [canvas, ctx] = makeCanvas(512, 512);
  const [rCanvas, rCtx] = makeCanvas(512, 512);
  const [bCanvas, bCtx] = makeCanvas(512, 512);

  ctx.fillStyle = '#1b1f26';
  ctx.fillRect(0, 0, 512, 512);
  rCtx.fillStyle = '#e5e5e5';
  rCtx.fillRect(0, 0, 512, 512);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const v = 20 + Math.floor(Math.random() * 24);
    ctx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
    ctx.fillRect(x, y, 2, 2);
    const bv = 105 + Math.floor(Math.random() * 48);
    bCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
    bCtx.fillRect(x, y, 2, 2);
  }

  return {
    map: finalizeTexture(canvas, anisotropy, 24, 18, true),
    roughnessMap: finalizeTexture(rCanvas, anisotropy, 24, 18, false),
    bumpMap: finalizeTexture(bCanvas, anisotropy, 24, 18, false),
  };
}

/**
 * Procedural weathered marina wood plank PBR texture for the pier deck.
 */
export function createWoodPierPBR(anisotropy: number): PbrTextureSet {
  const [canvas, ctx] = makeCanvas(512, 512);
  const [rCanvas, rCtx] = makeCanvas(512, 512);
  const [bCanvas, bCtx] = makeCanvas(512, 512);

  const plankH = 32;
  for (let y = 0; y < 512; y += plankH) {
    const tone = 92 + Math.floor(Math.random() * 28);
    ctx.fillStyle = `rgb(${tone}, ${Math.floor(tone * 0.72)}, ${Math.floor(tone * 0.5)})`;
    ctx.fillRect(0, y, 512, plankH - 2);

    rCtx.fillStyle = `rgb(${195 + Math.floor(Math.random() * 30)},${195},${195})`;
    rCtx.fillRect(0, y, 512, plankH - 2);

    bCtx.fillStyle = '#909090';
    bCtx.fillRect(0, y, 512, plankH - 2);

    // Wood grain streaks
    ctx.fillStyle = 'rgba(30, 18, 10, 0.16)';
    for (let g = 0; g < 6; g++) {
      ctx.fillRect(0, y + 4 + g * 4, 512, 1.5);
    }

    // Plank seam
    ctx.fillStyle = '#241810';
    ctx.fillRect(0, y + plankH - 2, 512, 2);
    bCtx.fillStyle = '#282828';
    bCtx.fillRect(0, y + plankH - 2, 512, 2);
  }

  return {
    map: finalizeTexture(canvas, anisotropy, 2, 4, true),
    roughnessMap: finalizeTexture(rCanvas, anisotropy, 2, 4, false),
    bumpMap: finalizeTexture(bCanvas, anisotropy, 2, 4, false),
  };
}

/**
 * Procedural architectural concrete/metal panel PBR texture for building roofs, awnings & plaza trims.
 */
export function createConcreteTrimPBR(anisotropy: number, baseHex = '#64748b'): PbrTextureSet {
  const [canvas, ctx] = makeCanvas(512, 512);
  const [rCanvas, rCtx] = makeCanvas(512, 512);
  const [bCanvas, bCtx] = makeCanvas(512, 512);

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 512, 512);
  rCtx.fillStyle = '#c8c8c8';
  rCtx.fillRect(0, 0, 512, 512);
  bCtx.fillStyle = '#848484';
  bCtx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 4500; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
    ctx.fillRect(x, y, 2, 2);
  }

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.lineWidth = 3;
  bCtx.strokeStyle = '#3c3c3c';
  bCtx.lineWidth = 3;
  for (let p = 0; p <= 512; p += 128) {
    for (const target of [ctx, bCtx]) {
      target.beginPath();
      target.moveTo(p, 0);
      target.lineTo(p, 512);
      target.stroke();
      target.beginPath();
      target.moveTo(0, p);
      target.lineTo(512, p);
      target.stroke();
    }
  }

  return {
    map: finalizeTexture(canvas, anisotropy, 2, 2, true),
    roughnessMap: finalizeTexture(rCanvas, anisotropy, 2, 2, false),
    bumpMap: finalizeTexture(bCanvas, anisotropy, 2, 2, false),
  };
}

/**
 * Illuminated ground-floor storefront signage texture ("BALLOON MOTORS", "PARADISE", etc.)
 */
export function createStorefrontSignTexture(
  anisotropy: number,
  title: string,
  bgHex: string,
  accentHex: string
): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 128);
  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, 512, 128);

  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 496, 112);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 42px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 256, 66);

  return finalizeTexture(canvas, anisotropy, 1, 1, true);
}

/**
 * Crisp coastal ocean wave texture with sunlit/twilight specular highlights.
 */
export function createWaterTexture(anisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(1024, 1024);
  const grad = ctx.createLinearGradient(0, 0, 1024, 1024);
  grad.addColorStop(0, '#0b4f6e');
  grad.addColorStop(0.5, '#126e8c');
  grad.addColorStop(1, '#083d59');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 1024);

  for (let i = 0; i < 1400; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const w = 24 + Math.random() * 68;
    ctx.fillStyle =
      i % 3 === 0
        ? 'rgba(165, 243, 252, 0.16)'
        : i % 3 === 1
          ? 'rgba(244, 114, 182, 0.08)'
          : 'rgba(4, 24, 38, 0.22)';
    ctx.fillRect(x, y, w, 3);
  }

  return finalizeTexture(canvas, anisotropy, 18, 18, true);
}

/**
 * High-contrast digital + analog cockpit dashboard gauge cluster.
 */
export function createDashboardTexture(anisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 160);
  ctx.fillStyle = '#0c1018';
  ctx.fillRect(0, 0, 512, 160);

  const drawDial = (cx: number, label: string, ringColor: string) => {
    ctx.beginPath();
    ctx.arc(cx, 80, 56, 0, Math.PI * 2);
    ctx.fillStyle = '#05070c';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = ringColor;
    ctx.stroke();

    for (let i = 0; i <= 12; i++) {
      const a = Math.PI * 0.75 + (i / 12) * Math.PI * 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 40, 80 + Math.sin(a) * 40);
      ctx.lineTo(cx + Math.cos(a) * 51, 80 + Math.sin(a) * 51);
      ctx.strokeStyle = i >= 10 ? '#f43f5e' : '#e2e8f0';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, 110);
  };

  drawDial(135, 'KM/H', '#38bdf8');
  drawDial(377, 'RPM', '#e879f9');

  // Center infotainment navigation screen
  ctx.fillStyle = '#111936';
  ctx.fillRect(216, 36, 80, 88);
  ctx.strokeStyle = '#a855f7';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(216, 36, 80, 88);
  ctx.strokeStyle = '#38bdf8';
  ctx.beginPath();
  ctx.moveTo(228, 108);
  ctx.lineTo(256, 62);
  ctx.lineTo(282, 82);
  ctx.stroke();

  return finalizeTexture(canvas, anisotropy, 1, 1, true);
}

/**
 * Crisp retroreflective regulatory Speed Limit road sign ("SPEED LIMIT 50").
 */
export function createSpeedLimitSignTexture(
  anisotropy: number,
  limitKmh = 50
): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 320);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 256, 320);

  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 10;
  ctx.strokeRect(10, 10, 236, 300);

  // Red regulatory accent ring/bar at top
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(20, 20, 216, 12);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SPEED', 128, 72);
  ctx.fillText('LIMIT', 128, 110);

  ctx.font = 'bold 126px sans-serif';
  ctx.fillText(String(limitKmh), 128, 238);

  ctx.fillStyle = '#475569';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('KM / H', 128, 282);

  return finalizeTexture(canvas, anisotropy, 1, 1, true);
}

/**
 * Crisp black-and-white Police Interceptor door panel crest texture.
 */
export function createPoliceDoorTexture(anisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 128);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 256, 128);

  // Gold & navy shield stripe
  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(0, 16, 256, 14);
  ctx.fillStyle = '#eab308';
  ctx.fillRect(0, 30, 256, 5);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 38px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('POLICE', 128, 74);

  ctx.fillStyle = '#1d4ed8';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('PARADISE CITY · 911', 128, 108);

  return finalizeTexture(canvas, anisotropy, 1, 1, true);
}

export interface HumanFaceOptions {
  skinColor: number;
  hairColor: number;
  eyeColor?: string;
  lipColor?: string;
  facialHair?: 'none' | 'stubble' | 'beard';
  freckles?: boolean;
  anisotropy?: number;
}

const faceTextureCache = new Map<string, THREE.CanvasTexture>();

function shadeRgb(hexNum: number, factor: number, alpha = 1): string {
  const r = Math.min(255, Math.max(0, Math.round(((hexNum >> 16) & 0xff) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(((hexNum >> 8) & 0xff) * factor)));
  const b = Math.min(255, Math.max(0, Math.round((hexNum & 0xff) * factor)));
  return alpha < 1 ? `rgba(${r},${g},${b},${alpha})` : `rgb(${r},${g},${b})`;
}

/**
 * Generates a realistic, detailed 512x512 human head/face UV texture mapped for
 * SphereGeometry(phiStart = -PI/2) so the face sits cleanly centered at +Z (x = 256).
 */
export function createHumanFaceTexture(options: HumanFaceOptions): THREE.CanvasTexture {
  const {
    skinColor,
    hairColor,
    eyeColor = '#3b281c',
    lipColor,
    facialHair = 'none',
    freckles = false,
    anisotropy = 4,
  } = options;

  const key = `${skinColor}_${hairColor}_${eyeColor}_${lipColor ?? ''}_${facialHair}_${freckles ? 1 : 0}`;
  const cached = faceTextureCache.get(key);
  if (cached) return cached;

  const [canvas, ctx] = makeCanvas(512, 512);
  const cx = 256;

  // 1. Base warm skin tone across head
  ctx.fillStyle = shadeRgb(skinColor, 1.0);
  ctx.fillRect(0, 0, 512, 512);

  // Subtle ambient subsurface gradient (warmer cheeks/face front, slightly cooler jaw/nape)
  const faceGlow = ctx.createRadialGradient(cx, 266, 18, cx, 266, 155);
  faceGlow.addColorStop(0, shadeRgb(skinColor, 1.08, 0.55));
  faceGlow.addColorStop(0.55, shadeRgb(skinColor, 1.0, 0.2));
  faceGlow.addColorStop(1, shadeRgb(skinColor, 0.84, 0.55));
  ctx.fillStyle = faceGlow;
  ctx.fillRect(0, 0, 512, 512);

  // Fine organic skin pores / tonal variation (deterministic pattern)
  for (let i = 0; i < 650; i++) {
    const px = 172 + ((i * 73) % 168);
    const py = 180 + ((i * 137) % 195);
    ctx.fillStyle = i % 2 === 0 ? shadeRgb(skinColor, 0.92, 0.16) : shadeRgb(skinColor, 1.08, 0.12);
    ctx.fillRect(px, py, 2, 2);
  }

  // 2. Hair coverage on crown, back of head, and temples
  const hairMain = shadeRgb(hairColor, 1.0);
  const hairDark = shadeRgb(hairColor, 0.72);
  ctx.fillStyle = hairMain;
  // Crown + back wrap
  ctx.fillRect(0, 0, 512, 168);
  ctx.fillRect(0, 168, 166, 165);
  ctx.fillRect(346, 168, 166, 165);
  // Nape taper
  const napeGrad = ctx.createLinearGradient(0, 320, 0, 410);
  napeGrad.addColorStop(0, hairMain);
  napeGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = napeGrad;
  ctx.fillRect(0, 320, 156, 90);
  ctx.fillRect(356, 320, 156, 90);

  // Curved natural forehead hairline
  ctx.fillStyle = shadeRgb(skinColor, 0.99);
  ctx.beginPath();
  ctx.ellipse(cx, 204, 86, 46, 0, Math.PI, Math.PI * 2);
  ctx.fill();

  // Subtle hair strand shading at crown
  ctx.strokeStyle = hairDark;
  ctx.lineWidth = 2;
  for (let hx = 10; hx < 510; hx += 10) {
    ctx.beginPath();
    ctx.moveTo(hx, 0);
    ctx.lineTo(hx + (hx < cx ? -6 : 6), 165);
    ctx.stroke();
  }

  // 3. Soft cheekbone warmth & eye socket contour
  for (const side of [-1, 1]) {
    const cheekX = cx + side * 36;
    const blush = ctx.createRadialGradient(cheekX, 290, 2, cheekX, 290, 26);
    blush.addColorStop(0, 'rgba(218, 108, 102, 0.22)');
    blush.addColorStop(1, 'rgba(218, 108, 102, 0)');
    ctx.fillStyle = blush;
    ctx.fillRect(cheekX - 30, 262, 60, 58);

    // Eye socket shadow
    const eyeX = cx + side * 24;
    const socket = ctx.createRadialGradient(eyeX, 246, 2, eyeX, 246, 20);
    socket.addColorStop(0, shadeRgb(skinColor, 0.78, 0.36));
    socket.addColorStop(1, shadeRgb(skinColor, 1.0, 0));
    ctx.fillStyle = socket;
    ctx.fillRect(eyeX - 24, 224, 48, 44);
  }

  // Optional freckles across nose bridge and upper cheeks
  if (freckles) {
    ctx.fillStyle = shadeRgb(skinColor, 0.68, 0.45);
    for (let f = 0; f < 26; f++) {
      const fx = cx - 32 + ((f * 19) % 64);
      const fy = 274 + ((f * 11) % 20);
      ctx.beginPath();
      ctx.arc(fx, fy, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 4. Eyes (almond sclera, shaded iris, pupil, specular catchlight, eyelids)
  for (const side of [-1, 1]) {
    const ex = cx + side * 24;
    const ey = 247;

    // Almond sclera (horizontally stretched ~2:1 for equirectangular sphere UV)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ex - 13, ey + 1);
    ctx.quadraticCurveTo(ex, ey - 7.5, ex + 13, ey + 1);
    ctx.quadraticCurveTo(ex, ey + 6.5, ex - 13, ey + 1);
    ctx.closePath();
    ctx.fillStyle = '#f1f5f9';
    ctx.fill();
    ctx.clip();

    // Soft upper eyelid shadow on sclera
    ctx.fillStyle = 'rgba(15, 23, 42, 0.18)';
    ctx.fillRect(ex - 14, ey - 8, 28, 4);

    // Iris (ellipse 2:1 horizontal stretch for equirectangular sphere)
    ctx.beginPath();
    ctx.ellipse(ex, ey, 6.8, 3.9, 0, 0, Math.PI * 2);
    ctx.fillStyle = eyeColor;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(10, 15, 25, 0.65)';
    ctx.stroke();

    // Pupil
    ctx.beginPath();
    ctx.ellipse(ex, ey, 3.2, 1.9, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#090d14';
    ctx.fill();

    // Corneal catchlight
    ctx.beginPath();
    ctx.ellipse(ex + 2.0, ey - 1.0, 1.5, 0.9, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();

    // Upper & lower lash lines + eyelid crease
    ctx.strokeStyle = '#1e1612';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(ex - 13.5, ey + 1);
    ctx.quadraticCurveTo(ex, ey - 7.5, ex + 13.5, ey + 1);
    ctx.stroke();

    ctx.strokeStyle = shadeRgb(skinColor, 0.64, 0.6);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(ex - 11, ey - 5.5);
    ctx.quadraticCurveTo(ex, ey - 10.5, ex + 11, ey - 5.5);
    ctx.stroke();

    // Natural eyebrows
    ctx.strokeStyle = hairDark;
    ctx.lineWidth = 4.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ex - side * 12, ey - 12);
    ctx.quadraticCurveTo(ex + side * 2, ey - 15.5, ex + side * 13, ey - 10.5);
    ctx.stroke();
  }

  // 5. Nose bridge shading, tip highlight & nostrils
  const noseBridgeGrad = ctx.createLinearGradient(cx - 10, 248, cx + 10, 248);
  noseBridgeGrad.addColorStop(0, shadeRgb(skinColor, 0.82, 0.35));
  noseBridgeGrad.addColorStop(0.5, shadeRgb(skinColor, 1.12, 0.45));
  noseBridgeGrad.addColorStop(1, shadeRgb(skinColor, 0.82, 0.35));
  ctx.fillStyle = noseBridgeGrad;
  ctx.fillRect(cx - 10, 248, 20, 40);

  // Under-nose shadow & nostrils
  ctx.fillStyle = shadeRgb(skinColor, 0.65, 0.52);
  ctx.beginPath();
  ctx.ellipse(cx, 290, 11, 3.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shadeRgb(skinColor, 0.42, 0.75);
  ctx.beginPath();
  ctx.ellipse(cx - 5.5, 289.5, 3.0, 1.5, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 5.5, 289.5, 3.0, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Subtle philtrum dimple
  ctx.fillStyle = shadeRgb(skinColor, 0.85, 0.38);
  ctx.fillRect(cx - 3, 294, 6, 14);

  // 6. Optional stubble / beard (before lips so lips stay clean)
  if (facialHair === 'stubble' || facialHair === 'beard') {
    const beardAlpha = facialHair === 'beard' ? 0.78 : 0.24;
    ctx.fillStyle = shadeRgb(hairColor, 0.85, beardAlpha);
    ctx.beginPath();
    ctx.moveTo(cx - 52, 296);
    ctx.quadraticCurveTo(cx - 38, 376, cx, 392);
    ctx.quadraticCurveTo(cx + 38, 376, cx + 52, 296);
    ctx.quadraticCurveTo(cx + 26, 326, cx, 326);
    ctx.quadraticCurveTo(cx - 26, 326, cx - 52, 296);
    ctx.closePath();
    ctx.fill();

    // Mustache
    ctx.beginPath();
    ctx.moveTo(cx - 20, 314);
    ctx.quadraticCurveTo(cx, 304, cx + 20, 314);
    ctx.quadraticCurveTo(cx, 318, cx - 20, 314);
    ctx.fill();
  }

  // 7. Sculpted upper & lower lips
  const lipTone = lipColor ?? shadeRgb(skinColor, 0.74);
  // Upper lip with cupid's bow
  ctx.fillStyle = lipTone;
  ctx.beginPath();
  ctx.moveTo(cx - 17, 322);
  ctx.quadraticCurveTo(cx - 6, 315, cx, 318.5);
  ctx.quadraticCurveTo(cx + 6, 315, cx + 17, 322);
  ctx.quadraticCurveTo(cx, 324, cx - 17, 322);
  ctx.closePath();
  ctx.fill();

  // Lower lip
  ctx.fillStyle = lipColor ? lipColor : shadeRgb(skinColor, 0.82);
  ctx.beginPath();
  ctx.moveTo(cx - 15, 322);
  ctx.quadraticCurveTo(cx, 332, cx + 15, 322);
  ctx.closePath();
  ctx.fill();

  // Subtle lower lip sheen & lip parting line
  ctx.strokeStyle = 'rgba(55, 22, 22, 0.65)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx - 16, 322);
  ctx.quadraticCurveTo(cx, 323.8, cx + 16, 322);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 235, 235, 0.24)';
  ctx.beginPath();
  ctx.ellipse(cx, 325.5, 7, 1.4, 0, 0, Math.PI * 2);
  ctx.fill();

  const tex = finalizeTexture(canvas, anisotropy, 1, 1, true);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  faceTextureCache.set(key, tex);
  return tex;
}
