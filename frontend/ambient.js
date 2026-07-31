/* ═══════════════════════════════════════════════════════════════════════════
   ISRO RIT DIGITAL TWIN — AMBIENT SCREEN-EDGE WEATHER ENGINE v6.0
   ─────────────────────────────────────────────────────────────────────────
   Sleek, natural, and elegant screen-edge atmosphere framing the dashboard.
   Restrained to outer ~8% of screen width (~80px margin) so it never feels
   oversized, blocky, or intrusive.
═══════════════════════════════════════════════════════════════════════════ */

let ambientCanvasLeft = null;
let ambientCanvasRight = null;
let ctxLeft = null;
let ctxRight = null;

let ambientParticlesLeft = [];
let ambientParticlesRight = [];

let activeAmbientMode = "none"; // "none" | "heat" | "cold" | "rain"
let ambientIntensity = 0;
let ambientSoundMuted = false;
let thunderAudioCtx = null;
let lastLightningTime = 0;
let nextLightningDelay = 8000;
let _ambientReducedMotion = false;
let _ambientLastTime = 0;

function initAmbientEngine() {
  ambientCanvasLeft = document.getElementById("ambient-canvas-left");
  ambientCanvasRight = document.getElementById("ambient-canvas-right");

  if (!ambientCanvasLeft || !ambientCanvasRight) return;

  ctxLeft = ambientCanvasLeft.getContext("2d");
  ctxRight = ambientCanvasRight.getContext("2d");

  resizeAmbientCanvases();
  window.addEventListener("resize", resizeAmbientCanvases);

  _ambientReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", (e) => {
    _ambientReducedMotion = e.matches;
  });

  // Auto-resume Web Audio API context & Thunderstorm.mp3 on any user interaction
  const resumeAudio = () => {
    if (thunderAudioCtx && thunderAudioCtx.state === "suspended") {
      thunderAudioCtx.resume();
    }
    const thunderAudio = document.getElementById("ambient-thunder-audio");
    if (!ambientSoundMuted && activeAmbientMode === "rain" && thunderAudio && thunderAudio.paused) {
      thunderAudio.play().catch(() => {});
    }
  };
  document.addEventListener("click", resumeAudio, { once: false });
  document.addEventListener("keydown", resumeAudio, { once: false });
  document.addEventListener("touchstart", resumeAudio, { once: false });

  initThunderAudioCtx();

  const btn = document.getElementById("sound-toggle-btn");
  if (btn) {
    btn.classList.toggle("active", !ambientSoundMuted);
    btn.innerHTML = !ambientSoundMuted
      ? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>'
      : '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
  }

  _ambientLastTime = performance.now();
  requestAnimationFrame(ambientAnimationLoop);
}

function initThunderAudioCtx() {
  if (!thunderAudioCtx) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        thunderAudioCtx = new AudioCtx();
      }
    } catch (e) {
      console.warn("Web Audio API init error:", e);
    }
  }
}

// Sized strictly to outer 8% of screen (~80px–95px margin)
function resizeAmbientCanvases() {
  const w = Math.max(75, Math.min(100, Math.floor(window.innerWidth * 0.08)));
  const h = window.innerHeight;

  if (ambientCanvasLeft && ambientCanvasRight) {
    ambientCanvasLeft.width = w;
    ambientCanvasLeft.height = h;
    ambientCanvasRight.width = w;
    ambientCanvasRight.height = h;
  }
}

// ── SOUND CONTROLS ────────────────────────────────────────────
function toggleAmbientSound() {
  initThunderAudioCtx();
  if (thunderAudioCtx && thunderAudioCtx.state === "suspended") {
    thunderAudioCtx.resume();
  }

  ambientSoundMuted = !ambientSoundMuted;
  const btn = document.getElementById("sound-toggle-btn");
  if (btn) {
    btn.classList.toggle("active", !ambientSoundMuted);
    btn.innerHTML = !ambientSoundMuted
      ? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>'
      : '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
  }

  const thunderAudio = document.getElementById("ambient-thunder-audio");
  if (!ambientSoundMuted) {
    if (activeAmbientMode === "rain" && thunderAudio) {
      thunderAudio.play().catch(() => {});
    } else {
      triggerThunderAudio(0.4);
    }
  } else {
    if (thunderAudio) {
      thunderAudio.pause();
    }
  }
}

function triggerThunderAudio(volumeScale = 1.0) {
  if (ambientSoundMuted) return;
  initThunderAudioCtx();
  if (!thunderAudioCtx) return;

  try {
    if (thunderAudioCtx.state === "suspended") {
      thunderAudioCtx.resume();
    }

    const now = thunderAudioCtx.currentTime;
    const masterGain = thunderAudioCtx.createGain();
    masterGain.gain.setValueAtTime(0.60 * volumeScale, now);
    masterGain.connect(thunderAudioCtx.destination);

    const subOsc = thunderAudioCtx.createOscillator();
    const subGain = thunderAudioCtx.createGain();
    subOsc.type = "sine";
    subOsc.frequency.setValueAtTime(95, now);
    subOsc.frequency.exponentialRampToValueAtTime(22, now + 1.8);

    subGain.gain.setValueAtTime(0.70, now);
    subGain.gain.exponentialRampToValueAtTime(0.01, now + 2.0);

    subOsc.connect(subGain);
    subGain.connect(masterGain);
    subOsc.start(now);
    subOsc.stop(now + 2.1);

    const bufferSize = thunderAudioCtx.sampleRate * 2.2;
    const buffer = thunderAudioCtx.createBuffer(1, bufferSize, thunderAudioCtx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (thunderAudioCtx.sampleRate * 0.5));
    }
    const noiseSource = thunderAudioCtx.createBufferSource();
    noiseSource.buffer = buffer;

    const filter = thunderAudioCtx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(160, now);
    filter.frequency.exponentialRampToValueAtTime(30, now + 1.8);

    const noiseGain = thunderAudioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.65, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 2.2);

    noiseSource.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(masterGain);
    noiseSource.start(now);

    setTimeout(() => {
      if (ambientSoundMuted || !thunderAudioCtx) return;
      try {
        const echoTime = thunderAudioCtx.currentTime;
        const echoSub = thunderAudioCtx.createOscillator();
        const echoGain = thunderAudioCtx.createGain();
        echoSub.type = "triangle";
        echoSub.frequency.setValueAtTime(60, echoTime);
        echoSub.frequency.exponentialRampToValueAtTime(18, echoTime + 1.4);
        echoGain.gain.setValueAtTime(0.30 * volumeScale, echoTime);
        echoGain.gain.exponentialRampToValueAtTime(0.01, echoTime + 1.4);
        echoSub.connect(echoGain);
        echoGain.connect(thunderAudioCtx.destination);
        echoSub.start(echoTime);
        echoSub.stop(echoTime + 1.5);
      } catch (e) {}
    }, 220);

  } catch (e) {
    console.warn("Thunder audio synth error:", e);
  }
}

// ── UPDATE WEATHER MODES ──────────────────────────────────────
function updateAmbientWeatherState(maxTemp, minTemp, rainfall) {
  let newMode = "none";
  let intensity = 0;

  // USER DIRECTIVE WEATHER RULES:
  // 1. Min Temp < 10°C -> SNOW
  // 2. Rainfall > 0 mm -> RAIN
  // 3. Not Raining (and Min Temp >= 10°C) -> FLAMES
  if (minTemp < 10) {
    newMode = "cold";
    intensity = Math.min(1, (10 - minTemp) / 10);
  } else if (rainfall > 0) {
    newMode = "rain";
    intensity = Math.min(1, rainfall / 60);
  } else {
    newMode = "heat";
    intensity = Math.min(1, Math.max(0.4, (maxTemp - 20) / 25));
  }

  activeAmbientMode = newMode;
  ambientIntensity = intensity;

  const leftCanvas = document.getElementById("ambient-canvas-left");
  const rightCanvas = document.getElementById("ambient-canvas-right");
  if (!leftCanvas || !rightCanvas) return;

  leftCanvas.className = "ambient-canvas";
  rightCanvas.className = "ambient-canvas";

  const flameLeft = document.getElementById("ambient-flame-left");
  const flameRight = document.getElementById("ambient-flame-right");
  const thunderAudio = document.getElementById("ambient-thunder-audio");

  if (activeAmbientMode === "heat") {
    leftCanvas.classList.add("heat-vignette");
    rightCanvas.classList.add("heat-vignette");
    flameLeft?.classList.add("active");
    flameRight?.classList.add("active");
    document.querySelectorAll(".ambient-flame-video").forEach(v => {
      if (v.paused) v.play().catch(() => {});
    });
    if (thunderAudio) {
      thunderAudio.pause();
    }
  } else {
    flameLeft?.classList.remove("active");
    flameRight?.classList.remove("active");
    if (activeAmbientMode === "cold") {
      leftCanvas.classList.add("cold-vignette");
      rightCanvas.classList.add("cold-vignette");
      if (thunderAudio) {
        thunderAudio.pause();
      }
    } else if (activeAmbientMode === "rain") {
      leftCanvas.classList.add("rain-vignette");
      rightCanvas.classList.add("rain-vignette");
      if (!ambientSoundMuted && thunderAudio) {
        if (thunderAudio.paused) thunderAudio.play().catch(() => {});
      }
    } else {
      if (thunderAudio) {
        thunderAudio.pause();
      }
    }
  }

  if (leftCanvas.width > 0) {
    spawnAmbientParticles(leftCanvas.width, leftCanvas.height);
  }
}

// ── PARTICLE SPAWNING ─────────────────────────────────────────
function spawnAmbientParticles(w, h) {
  ambientParticlesLeft = [];
  ambientParticlesRight = [];

  if (activeAmbientMode === "heat") {
    // ELEGANT SLEEK FIRE EMBERS & FLAME TONGUES
    const count = Math.round(35 + ambientIntensity * 25);
    for (let i = 0; i < count; i++) {
      ambientParticlesLeft.push(createFlameParticle(w, h, true));
      ambientParticlesRight.push(createFlameParticle(w, h, false));
    }
  } else if (activeAmbientMode === "cold") {
    const count = Math.round(45 + ambientIntensity * 30);
    for (let i = 0; i < count; i++) {
      ambientParticlesLeft.push(createSnowParticle(w, h));
      ambientParticlesRight.push(createSnowParticle(w, h));
    }
  } else if (activeAmbientMode === "rain") {
    // HIGH-VISIBILITY MONSOON RAIN STREAKS (90+ particles per side)
    const count = Math.round(90 + ambientIntensity * 70);
    for (let i = 0; i < count; i++) {
      ambientParticlesLeft.push(createRainParticle(w, h));
      ambientParticlesRight.push(createRainParticle(w, h));
    }
  }
}

// ── NATURAL SLEEK FLAME CREATION ──────────────────────────────
function createFlameParticle(w, h, isLeft) {
  const isTongue = Math.random() < 0.40;
  return {
    isTongue,
    x: isLeft ? Math.random() * w * 0.7 : w - Math.random() * w * 0.7,
    y: Math.random() * (h + 40),
    size: isTongue ? Math.random() * 10 + 6 : Math.random() * 2.2 + 1.0,
    height: isTongue ? Math.random() * 28 + 14 : 0,
    speedY: isTongue ? -(Math.random() * 2.2 + 1.2) : -(Math.random() * 3.2 + 1.8),
    speedX: (Math.random() - 0.5) * 0.8,
    opacity: isTongue ? Math.random() * 0.35 + 0.25 : Math.random() * 0.55 + 0.25,
    life: 0,
    maxLife: isTongue ? 45 + Math.random() * 30 : 65 + Math.random() * 45,
    seed: Math.random() * Math.PI * 2,
    hue: Math.random() < 0.30 ? "white" : Math.random() < 0.70 ? "gold" : "orange"
  };
}

function createSnowParticle(w, h) {
  const depth = Math.random();
  return {
    x: Math.random() * w,
    y: Math.random() * -h * 1.2,
    size: 1.0 + depth * 3.2,
    isStar: depth > 0.65,
    speedY: 0.6 + depth * 1.6 + ambientIntensity * 0.5,
    speedX: (Math.random() - 0.5) * 0.4,
    opacity: 0.2 + depth * 0.5,
    seed: Math.random() * Math.PI * 2,
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.03,
    swayAmp: 0.6 + depth * 1.0,
    swayFreq: 0.8 + Math.random() * 1.0
  };
}

// ── HIGH-VISIBILITY RAIN STREAKS & WATER DROPS ───────────────
function createRainParticle(w, h) {
  const depth = Math.random(); // 0 = far, 1 = near foreground
  return {
    x: Math.random() * w,
    y: -Math.random() * h,
    length: 18 + depth * 28 + ambientIntensity * 14,
    speedY: 12 + depth * 16 + ambientIntensity * 8,
    speedX: -2.2 - depth * 1.2,
    opacity: 0.35 + depth * 0.55,
    color: depth > 0.7 ? "#ffffff" : depth > 0.3 ? "#bae6fd" : "#38bdf8",
    lineWidth: 1.2 + depth * 1.4,
    splashSize: 0,
    maxSplash: 3 + depth * 5
  };
}

// ── ANIMATION LOOP ────────────────────────────────────────────
function ambientAnimationLoop(timestamp) {
  if (!ctxLeft || !ctxRight) return;

  const dt = Math.min((timestamp - _ambientLastTime) / 16.67, 3);
  _ambientLastTime = timestamp;

  const w = ambientCanvasLeft.width;
  const h = ambientCanvasLeft.height;

  ctxLeft.clearRect(0, 0, w, h);
  ctxRight.clearRect(0, 0, w, h);

  if (!_ambientReducedMotion) {
    if (activeAmbientMode === "heat") {
      drawNaturalEdgeFlames(ctxLeft, ambientParticlesLeft, w, h, dt, timestamp, true);
      drawNaturalEdgeFlames(ctxRight, ambientParticlesRight, w, h, dt, timestamp, false);
    } else if (activeAmbientMode === "cold") {
      drawHeavySnowfall(ctxLeft, ambientParticlesLeft, w, h, dt, timestamp);
      drawHeavySnowfall(ctxRight, ambientParticlesRight, w, h, dt, timestamp);
    } else if (activeAmbientMode === "rain") {
      drawAmbientRain(ctxLeft, ambientParticlesLeft, w, h, dt);
      drawAmbientRain(ctxRight, ambientParticlesRight, w, h, dt);

      if (ambientIntensity > 0.15 && timestamp - lastLightningTime > nextLightningDelay) {
        triggerLightningFlash();
        lastLightningTime = timestamp;
        nextLightningDelay = (6000 + Math.random() * 8000) / (0.5 + ambientIntensity * 0.5);
      }
    }
  }

  requestAnimationFrame(ambientAnimationLoop);
}

// ── NATURAL SLEEK FLAME ENGINE ────────────────────────────────
// Organic, soft liquid fire creeping gently along the outer screen border
function drawNaturalEdgeFlames(ctx, particles, w, h, dt, now, isLeft) {
  const time = now * 0.001;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  for (let p of particles) {
    p.life += dt;
    const progress = p.life / p.maxLife;

    if (p.isTongue) {
      const alpha = p.opacity * (1 - progress * 0.8);
      const width = p.size * (1 - progress * 0.3);
      const length = p.height * (1 - progress * 0.2);

      const moveX = isLeft
        ? p.x + Math.sin(time * 3 + p.seed) * 8
        : p.x - Math.sin(time * 3 + p.seed) * 8;

      const grad = ctx.createRadialGradient(moveX, p.y, 0, moveX, p.y, width * 1.2);
      if (p.hue === "white") {
        grad.addColorStop(0, `rgba(255, 250, 220, ${alpha})`);
        grad.addColorStop(0.3, `rgba(255, 180, 20, ${alpha * 0.8})`);
        grad.addColorStop(0.7, `rgba(240, 70, 10, ${alpha * 0.4})`);
      } else {
        grad.addColorStop(0, `rgba(255, 160, 20, ${alpha})`);
        grad.addColorStop(0.5, `rgba(230, 60, 10, ${alpha * 0.75})`);
        grad.addColorStop(0.9, `rgba(160, 10, 0, ${alpha * 0.3})`);
      }
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");

      ctx.fillStyle = grad;
      ctx.beginPath();
      const dir = isLeft ? 1 : -1;
      ctx.moveTo(moveX, p.y - length);
      ctx.quadraticCurveTo(moveX + dir * width * 0.8, p.y - length * 0.4, moveX + dir * width * 0.3, p.y);
      ctx.quadraticCurveTo(moveX - dir * width * 0.3, p.y, moveX, p.y - length);
      ctx.closePath();
      ctx.fill();

      p.y += p.speedY * dt;
    } else {
      // Small Ember Spark
      const alpha = p.opacity * (1 - progress * 0.7);
      const currentSize = Math.max(0.6, p.size * (1 - progress * 0.25));

      ctx.fillStyle = p.hue === "white"
        ? `rgba(255,255,220,${alpha})`
        : p.hue === "gold"
        ? `rgba(255,200,40,${alpha})`
        : `rgba(255,90,15,${alpha})`;

      ctx.beginPath();
      ctx.arc(p.x, p.y, currentSize, 0, Math.PI * 2);
      ctx.fill();

      p.y += p.speedY * dt;
      p.x += (isLeft ? 1 : -1) * (Math.sin(time * 5 + p.seed) * 1.2 + 0.3) * dt;
    }

    if (progress >= 1 || p.y < -40) {
      Object.assign(p, createFlameParticle(w, h, isLeft));
    }
  }

  ctx.restore();
}

function drawHeavySnowfall(ctx, particles, w, h, dt, now) {
  const time = now * 0.001;

  for (let p of particles) {
    ctx.save();
    ctx.globalAlpha = p.opacity;

    if (p.isStar) {
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.strokeStyle = "#e0f2fe";
      ctx.lineWidth = 0.7;

      ctx.beginPath();
      for (let arm = 0; arm < 6; arm++) {
        const angle = (arm / 6) * Math.PI * 2;
        const len = p.size;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(angle) * len, Math.sin(angle) * len);
      }
      ctx.stroke();

      ctx.fillStyle = "rgba(224, 242, 254, 0.4)";
      ctx.beginPath();
      ctx.arc(0, 0, p.size * 0.3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
      grad.addColorStop(0, "rgba(240, 249, 255, 0.9)");
      grad.addColorStop(0.5, "rgba(224, 242, 254, 0.5)");
      grad.addColorStop(1, "rgba(224, 242, 254, 0)");

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    p.y += p.speedY * dt;
    p.x += Math.sin(time * p.swayFreq + p.seed) * p.swayAmp * dt + p.speedX * dt;
    p.rotation += p.rotSpeed * dt;

    if (p.y > h + 30) {
      Object.assign(p, createSnowParticle(w, h));
      p.y = -20;
    }
  }
  ctx.globalAlpha = 1.0;
}

// ── HIGH-VISIBILITY MONSOON RAIN DRAWING ─────────────────────
function drawAmbientRain(ctx, particles, w, h, dt) {
  ctx.save();
  ctx.shadowBlur = 5;
  ctx.shadowColor = "rgba(56, 189, 248, 0.7)";

  for (let p of particles) {
    if (p.splashSize > 0) {
      // Draw water splash ripple at drop impact
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.splashSize, p.splashSize * 0.4, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(186, 230, 253, ${0.8 - p.splashSize / p.maxSplash})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();

      p.splashSize += 0.8 * dt;
      if (p.splashSize >= p.maxSplash) {
        Object.assign(p, createRainParticle(w, h));
      }
    } else {
      // Draw bright monsoon rain streak
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + p.speedX * 2.5, p.y + p.length);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.lineWidth;
      ctx.globalAlpha = Math.min(1.0, p.opacity);
      ctx.stroke();

      p.y += p.speedY * dt;
      p.x += p.speedX * dt;

      // Trigger splash when drop hits near bottom
      if (p.y > h - 40 && Math.random() < 0.35) {
        p.splashSize = 1;
      } else if (p.y > h + 20) {
        Object.assign(p, createRainParticle(w, h));
      }
    }
  }

  ctx.restore();
}

function triggerLightningFlash() {
  const flashOverlay = document.createElement("div");
  flashOverlay.className = "lightning-flash-overlay";
  document.body.appendChild(flashOverlay);

  setTimeout(() => {
    flashOverlay.remove();
  }, 80);

  const thunderDelay = 250 + Math.random() * 250;
  setTimeout(() => {
    triggerThunderAudio(1.0);
  }, thunderDelay);
}

document.addEventListener("DOMContentLoaded", () => {
  initAmbientEngine();
});
