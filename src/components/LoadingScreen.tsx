import React, { useEffect, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import imgSupercar from '../assets/images/jta_loading_supercar_1795388434766.jpg';
import imgSkyline from '../assets/images/jta_loading_skyline_1795388434818.jpg';
import imgWaterfront from '../assets/images/jta_loading_waterfront_1795388434272.jpg';

interface LoadingScreenProps {
  visible: boolean;
  onEnterCity: () => void;
}

const SLIDES = [
  {
    src: imgSupercar,
    caption: 'CENTRAL PLAZA SHOWCASE · VELOCE GT-R',
    tip: 'Walk up to the illuminated Central Plaza plinth and press E to take the Veloce GT-R for a coastal sprint.',
    panStart: 'scale(1.04) translate3d(0%, 0%, 0)',
    panEnd: 'scale(1.12) translate3d(-2%, -1.5%, 0)',
  },
  {
    src: imgSkyline,
    caption: 'OCEANFRONT BOULEVARD · JTA DUSK',
    tip: 'Press V inside any car to switch to Cockpit View with a live WebGL rearview mirror.',
    panStart: 'scale(1.06) translate3d(-1.5%, 0%, 0)',
    panEnd: 'scale(1.14) translate3d(1.5%, -1%, 0)',
  },
  {
    src: imgWaterfront,
    caption: 'MARINA PIER & SOLSTICE ROADSTER',
    tip: 'Switch lighting anytime between JTA Dusk, Day, Golden Hour, and Night — or load your own MP3 soundtrack in Esc.',
    panStart: 'scale(1.04) translate3d(1.2%, -0.5%, 0)',
    panEnd: 'scale(1.12) translate3d(-1.5%, 1%, 0)',
  },
];

const LOADING_PHASES = [
  'Initializing Balloon Games 3D Engine…',
  'Streaming CityDistrict10x Waterfront & Towers…',
  'Detailing Veloce GT-R & Solstice Roadster…',
  'Calibrating JTA Dusk Neon & Live Mirrors…',
  'Ready for Oceanfront Boulevard',
];

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ visible, onEnterCity }) => {
  const [slideIdx, setSlideIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [zoomActive, setZoomActive] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setProgress(0);
    setSlideIdx(0);
    setZoomActive(false);

    const rafZoom = requestAnimationFrame(() => setZoomActive(true));
    const start = performance.now();
    const durationMs = 3400;

    let animId = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // Smooth ease-out progress with authentic GTA-style milestone pacing
      const eased = 1 - Math.pow(1 - t, 2.2);
      setProgress(Math.round(eased * 100));
      if (t < 1) {
        animId = requestAnimationFrame(step);
      }
    };
    animId = requestAnimationFrame(step);

    const slideTimer = window.setInterval(() => {
      setSlideIdx((prev) => (prev + 1) % SLIDES.length);
    }, 4200);

    return () => {
      cancelAnimationFrame(rafZoom);
      cancelAnimationFrame(animId);
      clearInterval(slideTimer);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        onEnterCity();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onEnterCity]);

  if (!visible) return null;

  const isReady = progress >= 100;
  const phaseIdx = Math.min(
    LOADING_PHASES.length - 1,
    Math.floor((progress / 100) * (LOADING_PHASES.length - 0.01))
  );
  const currentSlide = SLIDES[slideIdx];

  return (
    <div
      className="fixed inset-0 z-40 overflow-hidden select-none"
      style={{
        background:
          'radial-gradient(circle at 20% 20%, #3b0764 0%, #1e1b4b 45%, #070312 100%)',
      }}
    >
      {/* Animated GTA-style widescreen artwork backdrop */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {SLIDES.map((slide, idx) => {
          const active = idx === slideIdx;
          return (
            <img
              key={slide.caption}
              src={slide.src}
              alt={slide.caption}
              className="absolute inset-0 h-full w-full object-cover"
              style={{
                opacity: active ? 0.92 : 0,
                transform: active && zoomActive ? slide.panEnd : slide.panStart,
                transition: 'opacity 1100ms ease-in-out, transform 6500ms ease-out',
              }}
            />
          );
        })}

        {/* Purple-Pink-Blue GTA Color Grading & Legibility Scrim */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(135deg, rgba(88, 28, 135, 0.42) 0%, rgba(219, 39, 119, 0.24) 48%, rgba(14, 165, 233, 0.32) 100%)',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(7, 3, 18, 0.72) 0%, rgba(7, 3, 18, 0.14) 42%, rgba(7, 3, 18, 0.88) 100%)',
          }}
        />
      </div>

      {/* Foreground Layout */}
      <div className="relative z-10 flex h-full w-full flex-col justify-between p-6 sm:p-10 lg:p-12">
        {/* Top Row: Balloon Games Presenter Lockup + Scene Tag */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            {/* Custom Balloon Games Emblem */}
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-pink-400/40 shadow-lg"
              style={{
                background:
                  'linear-gradient(145deg, rgba(168, 85, 247, 0.9), rgba(236, 72, 153, 0.85) 55%, rgba(56, 189, 248, 0.9))',
              }}
            >
              <svg
                viewBox="0 0 36 36"
                className="h-7 w-7 text-white"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M18 3C11.2 3 6.5 8 6.5 14.2c0 5.4 4.1 9.3 7.5 11.8h8c3.4-2.5 7.5-6.4 7.5-11.8C29.5 8 24.8 3 18 3Z"
                  fill="currentColor"
                  fillOpacity="0.92"
                />
                <path
                  d="M18 3c-3 3.2-4.2 7.2-4.2 11.2 0 4.5 1.8 8.3 3.1 11.8M18 3c3 3.2 4.2 7.2 4.2 11.2 0 4.5-1.8 8.3-3.1 11.8"
                  stroke="#3b0764"
                  strokeWidth="1.5"
                />
                <rect x="14.5" y="28.5" width="7" height="4.2" rx="1" fill="currentColor" />
                <path d="M15 26l.5 2.5M21 26l-.5 2.5" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </div>
            <div>
              <div className="text-[11px] font-bold tracking-[0.28em] text-sky-300 uppercase">
                Presented By
              </div>
              <div className="font-display text-lg sm:text-xl font-bold tracking-wider text-white">
                BALLOON GAMES
              </div>
            </div>
          </div>

          <div
            className="rounded-lg border border-purple-300/25 px-3.5 py-2 text-right"
            style={{ backgroundColor: 'rgba(12, 6, 28, 0.84)' }}
          >
            <div className="text-[10px] font-semibold tracking-[0.24em] text-pink-300 uppercase">
              Loading Artwork {slideIdx + 1} / {SLIDES.length}
            </div>
            <div className="mt-0.5 font-display text-xs sm:text-sm font-bold tracking-wider text-sky-200">
              {currentSlide.caption}
            </div>
          </div>
        </div>

        {/* Center-Left Iconic JTA Lockup */}
        <div className="my-auto max-w-2xl">
          <div className="inline-block">
            <h1
              className="font-display text-7xl sm:text-8xl lg:text-9xl font-bold italic tracking-tighter leading-none"
              style={{
                backgroundImage:
                  'linear-gradient(125deg, #f0abfc 0%, #ec4899 38%, #a855f7 68%, #38bdf8 100%)',
                WebkitBackgroundClip: 'text',
                color: 'transparent',
                filter: 'drop-shadow(0 8px 28px rgba(168, 85, 247, 0.55))',
              }}
            >
              JTA
            </h1>
            <div className="mt-2 flex items-center gap-3">
              <div
                className="h-1 w-14 rounded-full"
                style={{
                  background: 'linear-gradient(90deg, #ec4899, #a855f7, #38bdf8)',
                }}
              />
              <span className="font-display text-base sm:text-xl font-bold tracking-[0.22em] text-white uppercase">
                PARADISE HEAT · EDITION
              </span>
            </div>
          </div>

          <p className="mt-4 max-w-xl text-sm sm:text-base leading-relaxed text-purple-100/90">
            {currentSlide.tip}
          </p>
        </div>

        {/* Bottom GTA Loading Bar + Enter City Action */}
        <div
          className="rounded-2xl border border-purple-400/25 p-5 sm:p-6 shadow-2xl"
          style={{ backgroundColor: 'rgba(9, 4, 24, 0.88)' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3 text-xs font-semibold tracking-wider uppercase">
                <span className="flex items-center gap-2 text-pink-300">
                  <Sparkles className="h-3.5 w-3.5 text-sky-400" />
                  <span>{LOADING_PHASES[phaseIdx]}</span>
                </span>
                <span className="font-mono-tabular text-sky-300">{progress}%</span>
              </div>

              {/* Gradient Progress Track */}
              <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-purple-950/90 border border-purple-500/25">
                <div
                  className="h-full rounded-full transition-[width] duration-150 ease-out"
                  style={{
                    width: `${progress}%`,
                    background:
                      'linear-gradient(90deg, #38bdf8 0%, #a855f7 52%, #ec4899 100%)',
                  }}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              {!isReady && (
                <button
                  type="button"
                  onClick={onEnterCity}
                  className="rounded-xl border border-purple-300/25 bg-purple-950/80 px-4 py-2.5 text-xs font-semibold tracking-wider text-purple-200 uppercase transition-colors hover:border-sky-400/60 hover:text-white cursor-pointer whitespace-nowrap shrink-0"
                >
                  Skip Intro
                </button>
              )}
              <button
                type="button"
                onClick={onEnterCity}
                className="flex items-center gap-2 rounded-xl px-6 py-3 text-xs sm:text-sm font-bold tracking-wider text-white uppercase shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.99] cursor-pointer whitespace-nowrap shrink-0"
                style={{
                  background: isReady
                    ? 'linear-gradient(120deg, #ec4899 0%, #a855f7 55%, #0ea5e9 100%)'
                    : 'linear-gradient(120deg, rgba(168, 85, 247, 0.72), rgba(56, 189, 248, 0.72))',
                }}
              >
                <span>{isReady ? 'Enter Paradise City' : 'Launch Now'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
