import React, { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Shield, MagnetIcon, Zap, Heart } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- AUDIO SYSTEM ---
class AudioEngine {
  ctx: AudioContext | null = null;
  enabled = true;

  // Music sequencer state
  isPlayingMusic = false;
  nextNoteTime = 0;
  current16thNote = 0;
  tempo = 110;
  scheduleAheadTime = 0.1;
  timerID: number | null = null;
  nightFactor = 0;
  bgmGain: GainNode | null = null;
  
  // Ambient Sound State
  currentWeather: 'none' | 'rain' | 'dust' = 'none';
  ambientGain: GainNode | null = null;
  ambientFilter: BiquadFilterNode | null = null;
  noiseNode: AudioBufferSourceNode | null = null;

  init() {
    if (!this.ctx) {
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextCtor();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      this.stopMusic();
      const prevWeather = this.currentWeather;
      this.updateWeather('none');
      this.currentWeather = prevWeather; // keep track so it can resume if enabled again
    }
  }

  startMusic() {
    if (!this.ctx || !this.enabled || this.isPlayingMusic) return;
    this.isPlayingMusic = true;
    this.current16thNote = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    
    if (!this.bgmGain) {
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.connect(this.ctx.destination);
    }
    this.bgmGain.gain.setValueAtTime(0.3, this.ctx.currentTime); // Global BGM volume

    this.scheduleMusic();
  }

  stopMusic() {
    this.isPlayingMusic = false;
    if (this.timerID !== null) {
      window.clearTimeout(this.timerID);
      this.timerID = null;
    }
  }

  updateMusic(nightFactor: number) {
    this.nightFactor = nightFactor;
  }

  updateWeather(weatherType: 'none' | 'rain' | 'dust') {
    if (!this.ctx) return;
    if (!this.enabled && weatherType !== 'none') return;
    
    if (this.currentWeather === weatherType) return;
    this.currentWeather = weatherType;

    if (weatherType === 'none') {
      if (this.ambientGain) {
        this.ambientGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
      }
      return;
    }

    if (!this.ambientGain) {
      this.ambientGain = this.ctx.createGain();
      this.ambientGain.connect(this.ctx.destination);
      this.ambientGain.gain.value = 0;
      
      this.ambientFilter = this.ctx.createBiquadFilter();
      this.ambientFilter.connect(this.ambientGain);

      // Create noise buffer
      const bufferSize = this.ctx.sampleRate * 2;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseNode = this.ctx.createBufferSource();
      this.noiseNode.buffer = buffer;
      this.noiseNode.loop = true;
      this.noiseNode.connect(this.ambientFilter);
      this.noiseNode.start();
    }

    if (weatherType === 'rain') {
      this.ambientFilter!.type = 'bandpass';
      this.ambientFilter!.frequency.setTargetAtTime(1000, this.ctx.currentTime, 0.1);
      this.ambientFilter!.Q.setTargetAtTime(0.5, this.ctx.currentTime, 0.1);
      this.ambientGain.gain.setTargetAtTime(0.1, this.ctx.currentTime, 1);
    } else if (weatherType === 'dust') {
      this.ambientFilter!.type = 'lowpass';
      this.ambientFilter!.frequency.setTargetAtTime(400, this.ctx.currentTime, 0.1);
      this.ambientFilter!.Q.setTargetAtTime(0.5, this.ctx.currentTime, 0.1);
      this.ambientGain.gain.setTargetAtTime(0.4, this.ctx.currentTime, 1);
    }
  }

  scheduleMusic = () => {
    if (!this.isPlayingMusic || !this.enabled || !this.ctx) return;
    
    // If we fell too far behind (e.g. suspended context), catch up
    if (this.nextNoteTime < this.ctx.currentTime - 0.1) {
      this.nextNoteTime = this.ctx.currentTime + 0.05;
    }
    
    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
      try {
        this.playNote(this.current16thNote, this.nextNoteTime);
      } catch (e) {
        console.error("Audio Engine Error:", e);
      }
      this.nextNote();
    }
    this.timerID = window.setTimeout(this.scheduleMusic, 25);
  };

  nextNote() {
    const secondsPerBeat = 60.0 / this.tempo;
    this.nextNoteTime += 0.25 * secondsPerBeat; // 16th note
    this.current16thNote = (this.current16thNote + 1) % 16;
  }

  getFrequency(midi: number) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  playNote(step: number, time: number) {
     if (!this.ctx || !this.bgmGain) return;
     
     // 3-3-2 Clave / Dhol beat: 0, 3, 6, 8, 11, 14
     if ([0, 3, 6, 8, 11, 14].includes(step)) {
       const osc = this.ctx.createOscillator();
       const gain = this.ctx.createGain();
       osc.connect(gain);
       gain.connect(this.bgmGain);
       
       osc.type = 'sine';
       osc.frequency.setValueAtTime(100, time);
       osc.frequency.exponentialRampToValueAtTime(40, time + 0.1);
       
       gain.gain.setValueAtTime(0.4, time);
       gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
       
       osc.start(time);
       osc.stop(time + 0.2);
     }
     
     // Snare/Tari (clap or high drum): 4, 12
     if ([4, 12].includes(step)) {
       const osc = this.ctx.createOscillator();
       const gain = this.ctx.createGain();
       osc.connect(gain);
       gain.connect(this.bgmGain);
       
       osc.type = 'square';
       osc.frequency.setValueAtTime(300, time);
       
       gain.gain.setValueAtTime(0.05, time);
       gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
       
       osc.start(time);
       osc.stop(time + 0.1);
     }

     // Melody using Pentatonic/Mixolydian (Raag Khamaj feel)
     // C(60), D(62), E(64), F(65), G(67), A(69), Bb(70)
     const melodyDay = [60, null, 62, null, 64, 65, 67, null, 65, null, 64, 62, 60, null, null, null];
     const melodyNight = [60, 67, 60, 67, 70, 69, 67, null, 65, 67, 65, 64, 62, null, null, null];
     
     const mArr = this.nightFactor > 0.5 ? melodyNight : melodyDay;
     const note = mArr[step];
     
     if (note !== null) {
       const osc = this.ctx.createOscillator();
       const gain = this.ctx.createGain();
       const filter = this.ctx.createBiquadFilter();
       
       osc.connect(gain);
       gain.connect(filter);
       filter.connect(this.bgmGain);
       
       filter.type = 'lowpass';
       filter.frequency.value = 1200;
       
       if (this.nightFactor > 0.5) {
         // Night: Santoor/Sitar-like (Sawtooth with fast decay)
         osc.type = 'sawtooth';
         gain.gain.setValueAtTime(0.1, time);
         gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
       } else {
         // Day: Flute-like (Triangle with some sustain)
         osc.type = 'triangle';
         gain.gain.setValueAtTime(0.001, time);
         gain.gain.linearRampToValueAtTime(0.1, time + 0.05); // attack
         gain.gain.linearRampToValueAtTime(0.001, time + 0.3);  // release
       }
       
       osc.frequency.setValueAtTime(this.getFrequency(note), time);
       
       osc.start(time);
       osc.stop(time + 0.35);
     }
  }

  playJump() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    // Quick "hup!" upward sweep
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.1);
    
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
    
    osc.start(t);
    osc.stop(t + 0.1);
  }

  playCoin() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    // Metallic chime / ting!
    osc.type = 'sine';
    osc.frequency.setValueAtTime(987.77, t); 
    osc.frequency.setValueAtTime(1318.51, t + 0.05); 
    
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.setValueAtTime(0.15, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
    
    osc.start(t);
    osc.stop(t + 0.3);
  }

  playPowerup() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.setValueAtTime(600, t + 0.1);
    osc.frequency.setValueAtTime(800, t + 0.2);
    
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
    
    osc.start(t);
    osc.stop(t + 0.3);
  }

  playShieldBreak() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.2);
    
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
    
    osc.start(t);
    osc.stop(t + 0.2);
  }

  playGameOver() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    
    const playHorn = (time: number, dur: number, freq: number) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      
      // Auto-rickshaw peee-peee!
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, time);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.9, time + dur);
      
      gain.gain.setValueAtTime(0.2, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + dur);
      
      osc.start(time);
      osc.stop(time + dur);
    };
    
    // Rickshaw horn crash pattern (Pee! Pee! Peeeeee...)
    playHorn(t, 0.2, 400);
    playHorn(t + 0.3, 0.2, 400);
    playHorn(t + 0.6, 0.6, 350);
  }

  playWhoosh() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    
    // Smooth white noise for whoosh
    const bufferSize = this.ctx.sampleRate * 0.4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    // Use bandpass to sweep frequencies
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.Q.value = 1.0;
    
    // Sweep frequency up then down
    noiseFilter.frequency.setValueAtTime(300, t);
    noiseFilter.frequency.exponentialRampToValueAtTime(1500, t + 0.2);
    noiseFilter.frequency.exponentialRampToValueAtTime(400, t + 0.4);
    
    // Smooth volume fade
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.01, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.25, t + 0.2);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
    
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    
    noise.start(t);
    noise.stop(t + 0.4);
  }
}

const audio = new AudioEngine();

// --- GAME CONSTANTS ---
const LOGICAL_HEIGHT = 240;
const GROUND_Y = 200;
const GRAVITY = 0.6;
const JUMP_POWER = -10;
type Difficulty = 'Easy' | 'Medium' | 'Hard';

const getDifficultyConfig = (diff: Difficulty) => {
  switch (diff) {
    case 'Easy': return { initialSpeed: 3.5, maxSpeed: 8, obstacleChance: 0.015, spacingMin: 350, spacingMax: 550, powerupInterval: 500 };
    case 'Hard': return { initialSpeed: 5.5, maxSpeed: 16, obstacleChance: 0.035, spacingMin: 150, spacingMax: 300, powerupInterval: 800 };
    case 'Medium':
    default: return { initialSpeed: 4.5, maxSpeed: 12, obstacleChance: 0.02, spacingMin: 250, spacingMax: 450, powerupInterval: 600 };
  }
};

const MIN_SPEED = 4.5;
const MAX_SPEED = 12;

// --- UTILS ---
const randomRange = (min: number, max: number) => Math.random() * (max - min) + min;

// --- DRAWING FUNCTIONS ---

function drawPlayer(ctx: CanvasRenderingContext2D, x: number, y: number, isJumping: boolean, tick: number, shirtColor = '#F0F0F0', playerModel: 'male' | 'female' = 'male', isDead = false) {
  const isRunning = tick % 20 < 10 && !isJumping;

  ctx.save();
  ctx.translate(x, y - 4); // shift up slightly as model is taller now

  // Draw Dynamic Pixel Shadow
  const distanceToGround = Math.max(0, GROUND_Y - y - 30 + 4);
  const shadowOpacity = Math.max(0.05, 0.35 - distanceToGround * 0.003);
  const shadowWidth = Math.floor(Math.max(4, 16 - distanceToGround * 0.15));
  
  ctx.fillStyle = `rgba(0, 0, 0, ${shadowOpacity})`;
  // Draw blocky pseudo-ellipse
  ctx.fillRect(8 - shadowWidth / 2, GROUND_Y - y + 4, shadowWidth, 3);
  if (shadowWidth > 6) {
    ctx.fillRect(8 - shadowWidth / 2 + 2, GROUND_Y - y + 3, shadowWidth - 4, 1);
    ctx.fillRect(8 - shadowWidth / 2 + 2, GROUND_Y - y + 7, shadowWidth - 4, 1);
  }

  if (isDead) {
    ctx.translate(8, 15);
    ctx.rotate(Math.PI / 2); // Tumble forward
    ctx.translate(-8, -15);
  }

  const skin = '#D89E73';
  const pants = playerModel === 'female' ? '#1D4E89' : '#3C3C3C'; 
  const shoes = playerModel === 'female' ? '#F45B69' : '#222222'; 
  const hair = playerModel === 'female' ? '#4A2511' : '#2C1A0F';

  // Hair Back
  ctx.fillStyle = hair;
  if (playerModel === 'female') {
    const ponyY = isJumping ? 2 : (isRunning ? 5 : 4);
    ctx.fillRect(-2, ponyY, 6, 8);
    ctx.fillRect(-4, ponyY + 2, 4, 6); 
  }
  
  // Head/Face
  ctx.fillStyle = skin;
  ctx.fillRect(4, -2, 10, 10);
  
  // Features (Eyes, Blush)
  ctx.fillStyle = '#000'; 
  ctx.fillRect(11, 1, 2, 2); 
  if (playerModel === 'female') {
    ctx.fillStyle = 'rgba(255, 100, 100, 0.4)'; 
    ctx.fillRect(9, 4, 3, 2);
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(10, 5, 4, 3);
  }

  // Hair Front/Top
  ctx.fillStyle = hair;
  if (playerModel === 'female') {
    ctx.fillRect(3, -3, 10, 4); 
    ctx.fillRect(3, -1, 3, 7);  
    ctx.fillRect(11, -3, 3, 3); 
  } else {
    ctx.fillRect(3, -3, 10, 3);
    ctx.fillRect(2, -2, 2, 2); 
    ctx.fillRect(5, -4, 4, 2);
    ctx.fillRect(4, 0, 2, 4); 
  }

  // Torso / Shirt
  ctx.fillStyle = shirtColor;
  if (playerModel === 'female') {
    ctx.fillRect(4, 8, 8, 11);
    ctx.fillRect(5, 19, 6, 2);
  } else {
    ctx.fillRect(3, 8, 10, 12);
  }

  // Arms Back
  ctx.fillStyle = skin;
  if (isJumping) {
    ctx.fillRect(5, 7, 3, 8); 
    ctx.fillStyle = shirtColor;
    ctx.fillRect(4, 8, 4, 4); 
  } else if (isRunning) {
    ctx.fillRect(7, 10, 4, 8); 
  } else {
    ctx.fillRect(6, 9, 3, 9);
    ctx.fillStyle = shirtColor;
    ctx.fillRect(5, 8, 5, 5); 
  }

  // Legs and Shoes
  ctx.fillStyle = pants;
  let legY = 20;
  if (playerModel === 'female') legY = 21; // slightly higher pants start

  if (isJumping) {
    ctx.fillRect(5, legY, 6, 4);
    ctx.fillRect(9, legY + 4, 4, 4); 
    ctx.fillRect(3, legY - 1, 5, 6);
    
    ctx.fillStyle = shoes;
    ctx.fillRect(9, 28, 6, 4); 
    ctx.fillRect(2, 25, 4, 4); 
  } else if (isRunning) {
    ctx.fillRect(5, legY, 4, 5);
    ctx.fillRect(9, legY + 4, 4, 4); 
    ctx.fillRect(7, legY - 1, 4, 9); 
    
    ctx.fillStyle = shoes;
    ctx.fillRect(9, 28, 6, 4); 
    ctx.fillRect(6, 28, 6, 4);
  } else {
    if (playerModel === 'female') {
      ctx.fillRect(5, legY, 3, 8);
      ctx.fillRect(9, legY, 3, 8);
    } else {
      ctx.fillRect(4, legY, 4, 8);
      ctx.fillRect(9, legY, 4, 8);
    }
    ctx.fillStyle = shoes;
    ctx.fillRect(4, 28, 5, 4);
    ctx.fillRect(9, 28, 5, 4);
  }
  
  // Front Arm overlay
  if (!isJumping && isRunning) {
    ctx.fillStyle = skin;
    ctx.fillRect(3, 9, 4, 8); 
    ctx.fillStyle = shirtColor;
    ctx.fillRect(2, 8, 5, 4); 
  }

  ctx.restore();
}

function drawAuto(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number, nightFactor: number) {
  ctx.save();
  ctx.translate(x, y);
  
  // Vibration
  const vibrate = Math.random() < 0.5 ? 1 : 0;
  ctx.translate(0, vibrate);
  
  // Roof
  ctx.fillStyle = '#FFD700'; 
  ctx.fillRect(4, 0, 26, 4);
  
  // Pillars
  ctx.fillStyle = '#111';
  ctx.fillRect(4, 4, 2, 8); 
  ctx.fillRect(26, 4, 2, 8); 
  
  // Passengers inside (shadows)
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(6, 4, 20, 8);
  
  // Lower Body (Green)
  ctx.fillStyle = '#006400';
  ctx.fillRect(2, 12, 32, 10);
  
  // Front nose (facing left)
  ctx.fillRect(0, 14, 4, 8);
  
  // Yellow strip
  ctx.fillStyle = '#FFD700';
  ctx.fillRect(2, 16, 32, 2);

  // Wheels
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(8, 24, 4, 0, Math.PI * 2);
  ctx.arc(26, 24, 4, 0, Math.PI * 2);
  ctx.fill();
  
  // Wheel hubs
  ctx.fillStyle = '#DDD';
  ctx.beginPath();
  ctx.arc(8, 24, 1.5, 0, Math.PI * 2);
  ctx.arc(26, 24, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Headlight
  if (nightFactor > 0.2) {
    const flicker = Math.random() > 0.1 ? 1 : 0.4;
    const intensity = Math.min(1, (nightFactor - 0.2) * 2) * flicker;
    
    // Light bulb
    ctx.fillStyle = `rgba(255, 255, 200, ${intensity})`;
    ctx.fillRect(-2, 14, 2, 3);
    
    // Beam
    ctx.fillStyle = `rgba(255, 255, 100, ${intensity * 0.3})`;
    ctx.beginPath();
    ctx.moveTo(-2, 15);
    ctx.lineTo(-40, 5);
    ctx.lineTo(-40, 25);
    ctx.fill();
  }

  ctx.restore();
}

function drawDog(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number) {
  ctx.save();
  ctx.translate(x, y);

  const bob = Math.sin(tick * 0.4) * 2; // Walk cycle bounce
  ctx.translate(0, bob);

  // Body
  ctx.fillStyle = '#C28F5A'; // Brown/Stray dog color
  ctx.fillRect(4, 12, 16, 8);
  
  // Head
  ctx.fillRect(-2, 8, 8, 8);
  // Snout
  ctx.fillRect(-6, 12, 4, 4);
  // Nose
  ctx.fillStyle = '#111';
  ctx.fillRect(-6, 12, 2, 2);
  
  // Ears
  ctx.fillStyle = '#9e7347';
  ctx.fillRect(2, 6, 2, 4);

  // Tail (wagging)
  const wag = Math.sin(tick * 0.8) * 3;
  ctx.beginPath();
  ctx.moveTo(20, 12);
  ctx.lineTo(24, 8 + wag);
  ctx.strokeStyle = '#C28F5A';
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // Legs
  const sway1 = Math.sin(tick * 0.5) * 3;
  const sway2 = Math.sin(tick * 0.5 + Math.PI) * 3;
  ctx.fillStyle = '#C28F5A';
  ctx.fillRect(6 + sway1, 20, 2, 6);
  ctx.fillRect(10 + sway2, 20, 2, 6);
  ctx.fillRect(16 + sway2, 20, 2, 6);
  ctx.fillRect(20 + sway1, 20, 2, 6);

  ctx.restore();
}

function drawChaiCart(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number, nightFactor: number) {
  ctx.save();
  ctx.translate(x, y);

  // Tarp top 
  ctx.fillStyle = '#0055AA';
  ctx.fillRect(0, -4, 30, 4);
  
  // Poles
  ctx.fillStyle = '#555';
  ctx.fillRect(2, 0, 2, 14);
  ctx.fillRect(26, 0, 2, 14);

  // Cart body
  ctx.fillStyle = '#8B4513';
  ctx.fillRect(0, 14, 32, 10);
  
  // Tea kettle
  ctx.fillStyle = '#AAA';
  ctx.fillRect(20, 10, 6, 4);
  ctx.fillStyle = '#888';
  ctx.fillRect(18, 12, 2, 2); // spout

  // Steam/Smoke
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  const steamOffset1 = Math.sin(tick * 0.1) * 2;
  const steamOffset2 = Math.sin(tick * 0.1 + Math.PI) * 2;
  ctx.beginPath();
  ctx.arc(19 + steamOffset1, 8 - (tick % 20) * 0.5, 2, 0, Math.PI * 2);
  ctx.arc(19 + steamOffset2, 4 - ((tick + 10) % 20) * 0.5, 3, 0, Math.PI * 2);
  ctx.fill();

  // Wheels
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(8, 26, 5, 0, Math.PI * 2);
  ctx.arc(24, 26, 5, 0, Math.PI * 2);
  ctx.fill();

  // Lantern if night
  if (nightFactor > 0.3) {
    ctx.fillStyle = `rgba(255, 200, 50, ${nightFactor})`;
    ctx.fillRect(10, 8, 4, 6);
    
    ctx.fillStyle = `rgba(255, 200, 50, ${nightFactor * 0.3})`;
    ctx.beginPath();
    ctx.arc(12, 11, 20, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawKite(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number) {
  ctx.save();
  ctx.translate(x, y);
  
  const bob = Math.sin(tick * 0.1) * 3;
  ctx.translate(0, bob);
  
  // Kite body
  ctx.fillStyle = '#FF3366'; // Pink
  ctx.beginPath();
  ctx.moveTo(12, 0);
  ctx.lineTo(24, 12);
  ctx.lineTo(12, 24);
  ctx.lineTo(0, 12);
  ctx.fill();
  
  // Cross sticks
  ctx.strokeStyle = '#F0D080'; // wood
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(12, 0);
  ctx.lineTo(12, 24);
  ctx.moveTo(0, 12);
  ctx.lineTo(24, 12);
  ctx.stroke();

  // Tail
  ctx.strokeStyle = '#FFF';
  ctx.beginPath();
  ctx.moveTo(12, 24);
  ctx.quadraticCurveTo(8, 30, 16, 36);
  ctx.stroke();

  // String (manja)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.beginPath();
  ctx.moveTo(12, 12);
  ctx.lineTo(50, 100);
  ctx.stroke();
  
  ctx.restore();
}

function drawBicycle(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number) {
  ctx.save();
  ctx.translate(x, y);

  // Wheels rotating
  const wheelRot = tick * -0.4;

  ctx.strokeStyle = '#222';
  ctx.lineWidth = 2;
  
  // Back wheel
  ctx.save();
  ctx.translate(8, 16);
  ctx.rotate(wheelRot);
  ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.stroke();
  ctx.restore();

  // Front wheel
  ctx.save();
  ctx.translate(28, 16);
  ctx.rotate(wheelRot);
  ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.stroke();
  ctx.restore();

  // Frame
  ctx.strokeStyle = '#228B22'; // Green
  ctx.beginPath();
  ctx.moveTo(8, 16); // Back wheel center
  ctx.lineTo(14, 6); // Seat
  ctx.lineTo(24, 6); // Handlebars connect
  ctx.lineTo(28, 16); // Front wheel center
  ctx.moveTo(14, 6);
  ctx.lineTo(18, 16); // Pedals
  ctx.moveTo(18, 16);
  ctx.lineTo(24, 6);
  ctx.stroke();

  // Pedaling animation
  const pedalRot = tick * -0.4;
  ctx.save();
  ctx.translate(18, 16);
  ctx.rotate(pedalRot);
  ctx.strokeStyle = '#555';
  ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.stroke();
  ctx.restore();

  // Rider
  const pedalBob = Math.sin(tick * 0.4) * 2;
  ctx.fillStyle = '#111';
  ctx.fillRect(12, -4 + pedalBob, 6, 12 - pedalBob); // body
  ctx.fillRect(14, -10 + pedalBob, 4, 5); // head
  
  // Leg
  ctx.strokeStyle = '#111';
  ctx.beginPath();
  ctx.moveTo(14, 6 + pedalBob);
  ctx.lineTo(18 + Math.cos(pedalRot)*4, 16 + Math.sin(pedalRot)*4);
  ctx.stroke();

  // Arm to handlebar
  ctx.beginPath();
  ctx.moveTo(16, 0 + pedalBob);
  ctx.lineTo(22, 4);
  ctx.stroke();

  ctx.restore();
}

function drawPothole(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);

  // Dark hole
  ctx.fillStyle = '#1A1513';
  ctx.beginPath();
  ctx.ellipse(15, 4, 15, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cracks
  ctx.strokeStyle = '#2A201D';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(5, 4); ctx.lineTo(-2, 8);
  ctx.moveTo(25, 4); ctx.lineTo(32, 6);
  ctx.stroke();

  ctx.restore();
}

function drawVendor(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number) {
  ctx.save();
  ctx.translate(x, y);

  const walkBob = Math.sin(tick * 0.3) * 2;

  // Vendor person pushing cart
  ctx.fillStyle = '#8D4321'; // person body
  ctx.fillRect(-6, 2 + walkBob, 6, 15 - walkBob);
  ctx.fillRect(-5, -6 + walkBob, 5, 6); // head
  
  // Cart body
  ctx.fillStyle = '#8B4513';
  ctx.fillRect(0, 10, 26, 8);
  
  // Goods (pyramid of fruits)
  ctx.fillStyle = '#FE5A1D'; // Orange-red fruits
  ctx.beginPath();
  ctx.arc(6, 8, 3, 0, Math.PI * 2);
  ctx.arc(12, 8, 3, 0, Math.PI * 2);
  ctx.arc(18, 8, 3, 0, Math.PI * 2);
  ctx.arc(9, 4, 3, 0, Math.PI * 2);
  ctx.arc(15, 4, 3, 0, Math.PI * 2);
  ctx.arc(12, 0, 3, 0, Math.PI * 2);
  ctx.fill();

  // Wheel rotation
  const wheelRot = tick * -0.2;
  ctx.save();
  ctx.translate(16, 22);
  ctx.rotate(wheelRot);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-6, 0); ctx.lineTo(6, 0);
  ctx.moveTo(0, -6); ctx.lineTo(0, 6);
  ctx.stroke();
  ctx.restore();
  
  // Supports
  ctx.strokeStyle = '#666';
  ctx.beginPath();
  ctx.moveTo(4, 18); ctx.lineTo(4, 24);
  ctx.stroke();

  ctx.restore();
}

function drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number, tickOffset: number) {
  ctx.save();
  ctx.translate(x, y);

  const bobOffset = Math.sin((tick + tickOffset) * 0.1) * 3;
  ctx.translate(0, bobOffset);

  // Outer ring
  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  ctx.arc(6, 6, 6, 0, Math.PI * 2);
  ctx.fill();

  // Inner ring
  ctx.fillStyle = '#FFC107';
  ctx.beginPath();
  ctx.arc(6, 6, 4, 0, Math.PI * 2);
  ctx.fill();

  // Rupee symbol or gleam
  ctx.fillStyle = '#FFF';
  ctx.fillRect(4, 4, 4, 1);
  ctx.fillRect(5, 5, 2, 4);

  ctx.restore();
}

function drawParticle(ctx: CanvasRenderingContext2D, p: {x: number, y: number, life: number, type: 'coin'|'hit'|'powerup'|'shield_break'}) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.globalAlpha = Math.max(0, p.life / 30); // Fade out over 30 frames
  
  if (p.type === 'coin') {
    ctx.fillStyle = '#FFD700'; // Gold spark
    // Plus shape for sparkle
    ctx.fillRect(-1, -3, 2, 6);
    ctx.fillRect(-3, -1, 6, 2);
  } else if (p.type === 'hit') {
    ctx.fillStyle = '#FF3333'; // Red fragments for impact
    ctx.fillRect(-2, -2, 4, 4);
  } else if (p.type === 'powerup') {
    ctx.fillStyle = '#64C8FF'; // Blue spark
    ctx.fillRect(-1, -1, 3, 3);
  } else if (p.type === 'shield_break') {
    ctx.fillStyle = '#E8C396'; // broken fafda
    ctx.fillRect(-2, -2, 4, 4);
  }
  
  ctx.restore();
}

function drawFloatingText(ctx: CanvasRenderingContext2D, ft: {x: number, y: number, text: string, color: string, life: number}) {
  ctx.save();
  ctx.translate(ft.x, ft.y);
  ctx.globalAlpha = Math.max(0, ft.life / 30);
  
  ctx.fillStyle = ft.color;
  ctx.font = 'bold 14px "Inter", sans-serif'; // Assume Inter or default sans-serif is loaded
  ctx.textAlign = 'center';
  
  // Text outline for visibility
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.strokeText(ft.text, 0, 0);
  ctx.fillText(ft.text, 0, 0);

  ctx.restore();
}

function drawPowerup(ctx: CanvasRenderingContext2D, x: number, y: number, type: 'shield' | 'magnet' | 'double', tick: number, tickOffset: number) {
  ctx.save();
  ctx.translate(x, y);

  const bobOffset = Math.sin((tick + tickOffset) * 0.1) * 3;
  ctx.translate(0, bobOffset);

  // Aura
  ctx.fillStyle = type === 'shield' ? 'rgba(100, 200, 255, 0.4)' : type === 'double' ? 'rgba(255, 200, 0, 0.4)' : 'rgba(255, 100, 100, 0.4)';
  ctx.beginPath();
  ctx.arc(8, 8, 14, 0, Math.PI * 2);
  ctx.fill();

  if (type === 'shield') {
    // Shield icon (Fafda)
    ctx.fillStyle = '#E8C396'; 
    ctx.fillRect(4, 2, 8, 14);
    ctx.fillStyle = '#C29F74';
    ctx.fillRect(6, 4, 2, 10);
  } else if (type === 'double') {
    // 2x icon
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('2x', 8, 8);
  } else {
    // Magnet icon
    ctx.strokeStyle = '#FF3333';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(8, 6, 5, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = '#CCC';
    ctx.fillRect(2, 6, 3, 4);
    ctx.fillRect(11, 6, 3, 4);
  }

  ctx.restore();
}

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, nightFactor: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = nightFactor > 0.5 ? '#2B2B3B' : '#FFD98A';
  ctx.globalAlpha = 0.5;
  
  // Simple pixel block cloud
  ctx.fillRect(w * 0.2, -10, w * 0.6, 10);
  ctx.fillRect(0, 0, w, 10);
  ctx.fillRect(w * 0.1, 10, w * 0.8, 4);

  ctx.restore();
}

function drawBird(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number, phaseOffset: number = 0) {
  ctx.save();
  const drawX = Math.round(x);
  const drawY = Math.round(y);
  ctx.translate(drawX, drawY);
  ctx.fillStyle = '#222';
  const flap = Math.sin(tick * 0.2 + phaseOffset) > 0;
  if (flap) {
    ctx.fillRect(0, 0, 4, 1);
    ctx.fillRect(-2, -2, 2, 2);
    ctx.fillRect(4, -2, 2, 2);
  } else {
    ctx.fillRect(0, 0, 4, 1);
    ctx.fillRect(-2, 1, 2, 2);
    ctx.fillRect(4, 1, 2, 2);
  }
  ctx.restore();
}

function drawPedestrian(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number, dir: number = 1, color: string = '#4A2511', phaseOffset: number = 0) {
  ctx.save();
  // Ensure pixel-perfect rendering to avoid subpixel jitter
  const drawX = Math.round(x);
  ctx.translate(drawX + (dir === -1 ? 8 : 0), Math.round(y));
  if (dir === -1) {
    ctx.scale(-1, 1);
  }
  ctx.fillStyle = color; // shadow/silhouette color
  const walkBob = Math.round(Math.sin(tick * 0.15 + phaseOffset) * 2);
  
  // Head
  ctx.fillRect(2, walkBob, 4, 4);
  // Body
  ctx.fillRect(1, 4 + walkBob, 6, 8);
  // Legs
  const legSwing = Math.round(Math.sin(tick * 0.15 + phaseOffset) * 3);
  ctx.fillRect(1 + Math.max(0, legSwing), 12 + walkBob, 2, 7);
  ctx.fillRect(5 + Math.min(0, legSwing), 12 + walkBob, 2, 7);
  
  ctx.restore();
}

function drawStreetlight(ctx: CanvasRenderingContext2D, x: number, y: number, nightFactor: number) {
  ctx.save();
  ctx.translate(x, y);
  
  // Pole
  ctx.fillStyle = '#333';
  ctx.fillRect(0, -60, 4, 60);
  ctx.fillRect(-10, -60, 14, 4);
  
  // Lamp housing
  ctx.fillStyle = '#222';
  ctx.fillRect(-12, -58, 6, 4);

  // Light glow (only fades in when it's dark)
  if (nightFactor > 0.2) {
    const intensity = Math.min(1, (nightFactor - 0.2) * 2);
    // Core light
    ctx.fillStyle = `rgba(255, 255, 200, ${intensity})`;
    ctx.fillRect(-11, -56, 4, 2);
    
    // Large ambient glow
    const gradient = ctx.createRadialGradient(-9, -56, 1, -9, -10, 40);
    gradient.addColorStop(0, `rgba(255, 255, 100, ${intensity * 0.6})`);
    gradient.addColorStop(1, 'rgba(255, 255, 100, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(-9, -56, 40, 0, Math.PI * 2);
    ctx.fill();
    
    // Cone on the ground
    ctx.fillStyle = `rgba(255, 255, 100, ${intensity * 0.15})`;
    ctx.beginPath();
    ctx.moveTo(-9, -56);
    ctx.lineTo(-40, 0);
    ctx.lineTo(20, 0);
    ctx.fill();
  }
  
  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, scrollX: number, canvasWidth: number, tick: number) {
  // Day/Night cycle logic (repeats every 24000 distance units)
  const cyclePhase = (scrollX % 24000) / 24000;
  // Map phase to a night factor 0 (Day) -> 1 (Night) -> 0 (Day)
  const nightFactor = Math.max(0, Math.sin(cyclePhase * Math.PI * 2));
  
  // Clear with sunset sky
  const skyGrad = ctx.createLinearGradient(0, 0, 0, 200);
  skyGrad.addColorStop(0, '#FF7A00');
  skyGrad.addColorStop(1, '#FFB703');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, canvasWidth, LOGICAL_HEIGHT);

  // Draw Sun/Moon
  const celestialY = 80 + Math.sin(cyclePhase * Math.PI * 2) * 100;
  ctx.fillStyle = nightFactor > 0.5 ? '#FFF' : '#FFE169'; // Turns to moon at night
  ctx.beginPath();
  let sunX = canvasWidth * 0.75;
  ctx.arc(sunX, celestialY, 40, 0, Math.PI * 2);
  ctx.fill();

  // --- LAYER 0: CLOUDS --- (Very slow parallax - 0.05 speed)
  const clouds = [
    {x: 40, y: 30, w: 80}, {x: 280, y: 60, w: 120}, {x: 550, y: 40, w: 60}, {x: 750, y: 70, w: 90}
  ];
  const cloudOffset = Math.floor(-((scrollX * 0.05) + (tick * 0.2)) % 800);
  ctx.save();
  for (let repeat = 0; repeat < 2; repeat++) {
    ctx.save();
    ctx.translate(cloudOffset + repeat * 800, 0);
    clouds.forEach(c => drawCloud(ctx, c.x, c.y, c.w, nightFactor));
    ctx.restore();
  }
  ctx.restore();

  // --- LAYER 0.5: DISTANT HILLS / FAR BACKGROUND --- (Slow parallax - 0.1 speed)
  ctx.fillStyle = nightFactor > 0.5 ? '#1A1820' : '#DF7F4B'; 
  const distantHills = [
    {x: 0, w: 120, h: 40}, {x: 80, w: 160, h: 55}, {x: 220, w: 110, h: 30},
    {x: 310, w: 190, h: 65}, {x: 480, w: 140, h: 45}, {x: 600, w: 200, h: 35}
  ];
  const layer05Offset = Math.floor(-((scrollX * 0.1) + (tick * 0.1)) % 800);
  ctx.save();
  for (let repeat = 0; repeat < 2; repeat++) {
    ctx.save();
    ctx.translate(layer05Offset + repeat * 800, 0);
    distantHills.forEach(h => {
      ctx.fillRect(h.x, GROUND_Y - h.h, h.w, h.h);
      if (h.h >= 50) {
        ctx.fillRect(h.x + 20, GROUND_Y - h.h - 15, h.w - 40, 15);
      }
    });
    ctx.restore();
  }
  ctx.restore();

  // Draw Birds - Parallax (0.15 speed)
  ctx.fillStyle = nightFactor > 0.5 ? '#111' : '#222';
  const birds = [
    {x: 100, y: 50}, {x: 250, y: 80}, {x: 450, y: 60}, {x: 700, y: 90}
  ];
  const birdOffset = Math.floor(-(scrollX * 0.15) % 800);
  ctx.save();
  for (let repeat = 0; repeat < 2; repeat++) {
    ctx.save();
    // Wrap around based on canvas width or 800 interval
    ctx.translate(birdOffset + repeat * 800, 0);
    birds.forEach((b, idx) => drawBird(ctx, b.x, b.y, tick, idx * 10));
    ctx.restore();
  }
  ctx.restore();

  // Night Sky Darkening Overlay (applied behind main buildings for atmosphere)
  if (nightFactor > 0) {
    ctx.fillStyle = `rgba(10, 10, 30, ${nightFactor * 0.7})`;
    ctx.fillRect(0, 0, canvasWidth, LOGICAL_HEIGHT);
  }

  // Draw Skyline (Amdvad Heritage + Modern) - Parallax layer 1 (Medium-Slow speed - 0.25)
  ctx.fillStyle = nightFactor > 0.5 ? '#140C0C' : '#D66A3D'; // Darken buildings at night
  const skyPattern1 = [
    {x: 0, w: 40, h: 60}, {x: 40, w: 60, h: 40}, {x: 100, w: 20, h: 80}, // Buildings
    {x: 180, w: 80, h: 50, type: 'minaret'}, // Jama Masjid / Minarets
    {x: 280, w: 50, h: 90, type: 'patang'}, // Patang Hotel
    {x: 350, w: 60, h: 40}, {x: 410, w: 90, h: 70}, 
    {x: 550, w: 100, h: 100, type: 'dome'}, // Dome
    {x: 700, w: 50, h: 50}, {x: 750, w: 50, h: 80}
  ];

  ctx.save();
  // Loop pattern for parallax
  const bgOffset1 = Math.floor(-(scrollX * 0.25) % 800);
  for (let repeat = 0; repeat < 2; repeat++) {
    ctx.save();
    ctx.translate(bgOffset1 + repeat * 800, 0);
    for (const b of skyPattern1) {
      if (b.type === 'minaret') {
        ctx.fillRect(b.x, GROUND_Y - b.h, 10, b.h);
        ctx.fillRect(b.x + 40, GROUND_Y - b.h, 10, b.h);
        ctx.fillRect(b.x + 10, GROUND_Y - b.h + 20, 30, b.h - 20);
      } else if (b.type === 'patang') {
        ctx.fillRect(b.x + 20, GROUND_Y - b.h, 10, b.h); // stem
        ctx.fillRect(b.x, GROUND_Y - b.h, 50, 20); // disc
      } else if (b.type === 'dome') {
        ctx.fillRect(b.x, GROUND_Y - b.h / 2, b.w, b.h / 2);
        ctx.beginPath();
        ctx.arc(b.x + b.w/2, GROUND_Y - b.h / 2, b.w/2, Math.PI, 0);
        ctx.fill();
      } else {
        ctx.fillRect(b.x, GROUND_Y - b.h, b.w, b.h);
      }
    }
    ctx.restore();
  }
  ctx.restore();

  // Parallax layer 2 (Medium speed) - Street level details (trees, walls, people)
  ctx.fillStyle = nightFactor > 0.5 ? '#110805' : '#8D4321'; 
  const skyPattern2 = [
    {x: 50, w: 30, h: 40, type: 'tree'}, {x: 180, type: 'streetlight'}, {x: 200, w: 100, h: 20}, // wall
    {x: 340, type: 'pedestrian'}, {x: 400, w: 40, h: 50, type: 'tree'}, 
    {x: 520, type: 'streetlight'}, {x: 600, w: 30, h: 60, type: 'tree'},
    {x: 680, type: 'pedestrian'}, {x: 750, w: 60, h: 10}
  ];

  const bgOffset2 = Math.floor(-(scrollX * 0.5) % 800);
  ctx.save();
  for (let repeat = 0; repeat < 2; repeat++) {
    ctx.save();
    ctx.translate(bgOffset2 + repeat * 800, 0);
    for (const b of skyPattern2) {
      if (b.type === 'tree') {
        ctx.fillRect(b.x + (b.w||0)/3, GROUND_Y - (b.h||0)/2, (b.w||0)/3, (b.h||0)/2); // trunk
        ctx.beginPath();
        ctx.arc(b.x + (b.w||0)/2, GROUND_Y - (b.h||0)/2, (b.w||0)/2, 0, Math.PI*2); // leaves
        ctx.fill();
      } else if (b.type === 'pedestrian') {
        drawPedestrian(ctx, b.x, GROUND_Y - 19, tick);
      } else if (b.type === 'streetlight') {
        drawStreetlight(ctx, b.x, GROUND_Y, nightFactor);
      } else {
        ctx.fillRect(b.x, GROUND_Y - (b.h||0), b.w||0, b.h||0);
      }
    }
    ctx.restore();
  }
  ctx.restore();

  // --- LAYER 2.5: Dynamic NPCs on Sidewalk ---
  const npcColors = nightFactor > 0.5 
    ? ['#110805', '#160B08', '#0D0604', '#1F110C']
    : ['#5A2D1B', '#3E2A20', '#603322', '#3D2012', '#4B3629'];
  ctx.save();
  for (let i = 0; i < 24; i++) {
    const baseSpeed = 0.3 + ((i * 11) % 7) * 0.1;
    const dir = (i % 2 === 0) ? 1 : -1;
    const color = npcColors[i % npcColors.length];
    
    const worldX = (i * 200 + tick * baseSpeed * dir);
    let screenX = (worldX - scrollX * 0.5) % 2400;
    
    if (screenX < -200) screenX += 2400;
    else if (screenX > 2200) screenX -= 2400;
    
    if (screenX > -100 && screenX < canvasWidth + 100) {
      drawPedestrian(ctx, screenX, GROUND_Y - 19, tick, dir, color, i * 45);
    }
  }
  ctx.restore();

  // Secondary Night Overlay to cast shadows on layer 2
  if (nightFactor > 0.6) {
    ctx.fillStyle = `rgba(0, 0, 0, ${(nightFactor - 0.6) * 1.5})`;
    ctx.fillRect(0, 0, canvasWidth, GROUND_Y);
  }

  // Draw Ground
  ctx.fillStyle = nightFactor > 0.5 ? '#1A1513' : '#3A2E2C';
  ctx.fillRect(0, GROUND_Y, canvasWidth, LOGICAL_HEIGHT - GROUND_Y);

  // Ground details (potholes, lines)
  ctx.fillStyle = nightFactor > 0.5 ? '#2A201D' : '#5A4A46';
  const groundOffset = -scrollX % 100;
  for (let i = -1; i < (canvasWidth / 100) + 1; i++) {
    ctx.fillRect(groundOffset + i * 100, GROUND_Y + 10, 40, 2);
    ctx.fillRect(groundOffset + i * 100 + 40, GROUND_Y + 25, 20, 2);
  }

  // Draw Cloud Shadows on Ground
  const shadowOpacity = 0.15 * (1 - nightFactor);
  if (shadowOpacity > 0.01) {
    ctx.fillStyle = `rgba(0, 0, 0, ${shadowOpacity})`;
    ctx.save();
    for (let repeat = 0; repeat < 2; repeat++) {
      ctx.save();
      ctx.translate(cloudOffset + repeat * 800, 0);
      clouds.forEach(c => {
        ctx.beginPath();
        // Draw an elliptical shadow directly below the cloud
        ctx.ellipse(c.x + c.w * 0.5, GROUND_Y + 15, c.w * 0.6, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }
    ctx.restore();
  }
}

// --- GAME COMPONENT ---

export default function AmdvadRunner() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [dimensions, setDimensions] = useState({ w: 800, h: LOGICAL_HEIGHT });

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        // Calculate logical width to keep pixel height at 240 without stretching
        const safeHeight = Math.max(1, rect.height);
        let logicalWidth = Math.max(400, Math.floor(LOGICAL_HEIGHT * (rect.width / safeHeight)));
        if (isNaN(logicalWidth) || !isFinite(logicalWidth)) logicalWidth = 800;
        setDimensions({ w: logicalWidth, h: LOGICAL_HEIGHT });
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Game State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [highScoresList, setHighScoresList] = useState<number[]>([]);
  const [shirtColor, setShirtColor] = useState('#F0F0F0');
  const [playerModel, setPlayerModel] = useState<'male' | 'female'>('male');
  const [showHighScores, setShowHighScores] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>('Medium');
  const [lives, setLives] = useState(3);
  const [coinsCollected, setCoinsCollected] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(true);
  
  const [missionCompleted, setMissionCompleted] = useState(false);
  const dailyMission = useRef({ description: 'Collect 50 coins in one run', target: 50 }).current;
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    if (isPlaying && !isGameOver && score === 0) {
      setShowTutorial(true);
      const t = setTimeout(() => setShowTutorial(false), 5000);
      return () => clearTimeout(t);
    } else if (!isPlaying || isGameOver) {
      setShowTutorial(false);
    }
  }, [isPlaying, isGameOver]);

  // Expose powerup state to React for the HUD
  const [activeEventHUD, setActiveEventHUD] = useState<{type: 'none' | 'heavy_traffic' | 'golden_hour', timer: number}>({ type: 'none', timer: 0 });
  const [activePowerupsHUD, setActivePowerupsHUD] = useState({ shield: false, magnetTime: 0, doubleTime: 0 });
  const [multiplierHUD, setMultiplierHUD] = useState(1);
  const [speedHUD, setSpeedHUD] = useState(0);

  const toggleAudio = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    audio.toggle();
    setAudioEnabled(audio.enabled);
    if (audio.enabled && isPlaying && !isGameOver) {
      audio.startMusic();
    }
  };

  // Mutable Game Refs to avoid state closures in game loop
  const gameState = useRef({
    playerY: GROUND_Y - 30,
    playerVY: 0,
    isJumping: false,
    distance: 0,
    speed: getDifficultyConfig('Medium').initialSpeed,
    difficultyConfig: getDifficultyConfig('Medium'),
    tick: 0,
    score: 0,
    coinStreak: 0,
    distanceStreak: 0,
    baseMultiplier: 1,
    obstacles: [] as {x: number, y: number, type: 'auto' | 'dog' | 'chai' | 'pothole' | 'bicycle' | 'vendor' | 'kite', w: number, h: number, passed?: boolean}[],
    coins: [] as {x: number, y: number, w: number, h: number, tickOffset: number}[],
    powerups: [] as {x: number, y: number, type: 'shield' | 'magnet' | 'double', w: number, h: number, tickOffset: number}[],
    particles: [] as {x: number, y: number, vx: number, vy: number, life: number, type: 'coin'|'hit'|'powerup'|'shield_break'}[],
    floatingTexts: [] as {x: number, y: number, text: string, color: string, life: number}[],
    activePowerups: { shield: false, magnetTime: 0, doubleTime: 0 },
    screenShake: 0,
    hitBlink: 0,
    lives: 3,
    invincibleTimer: 0,
    weather: { type: 'none' as 'none' | 'rain' | 'dust', timer: 1000, particles: [] as {x: number, y: number, vx: number, vy: number, l: number, s: number}[] },
    event: { type: 'none' as 'none' | 'heavy_traffic' | 'golden_hour', timer: 0 },
    deathTimer: 0,
  });

  const triggerHaptic = (pattern: number | number[]) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        // Ignore haptics errors
      }
    }
  };

  const jump = () => {
    if (showHighScores || showCustomize) return;
    audio.init();
    if (!isPlaying && !isGameOver) {
      setIsPlaying(true);
      audio.startMusic();
      return;
    }
    if (isGameOver) {
      return;
    }
    if (!gameState.current.isJumping) {
      triggerHaptic(15);
      gameState.current.playerVY = JUMP_POWER;
      gameState.current.isJumping = true;
      audio.playJump();
    }
  };

  const resetGame = () => {
    const config = getDifficultyConfig(difficulty);
    gameState.current = {
      playerY: GROUND_Y - 30,
      playerVY: 0,
      isJumping: false,
      distance: 0,
      speed: config.initialSpeed,
      difficultyConfig: config,
      tick: 0,
      score: 0,
      coinStreak: 0,
      distanceStreak: 0,
      baseMultiplier: 1,
      obstacles: [],
      coins: [],
      powerups: [],
      particles: [],
      floatingTexts: [],
      activePowerups: { shield: false, magnetTime: 0, doubleTime: 0 },
      screenShake: 0,
      hitBlink: 0,
      lives: 3,
      invincibleTimer: 0,
      weather: { type: 'none', timer: 1000, particles: [] },
      event: { type: 'none', timer: 0 },
      deathTimer: 0,
    };
    setActivePowerupsHUD({ shield: false, magnetTime: 0, doubleTime: 0 });
    setActiveEventHUD({ type: 'none', timer: 0 });
    setMultiplierHUD(1);
    setSpeedHUD(Math.floor(config.initialSpeed * 8));
    setScore(0);
    setLives(3);
    setCoinsCollected(0);
    setIsGameOver(false);
    setIsPlaying(true);
    audio.startMusic();
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.key === ' ' || e.key === 'ArrowUp') {
        e.preventDefault();
        jump();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, isGameOver, showHighScores, showCustomize]);

  // Touch controls
  const handleCanvasClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if ((e.target as HTMLElement).tagName === 'BUTTON') return; // Don't jump if clicking a button
    jump();
  };

  const [shareText, setShareText] = useState('Share Score');

  const handleShare = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    const text = `I just scored ${score} points and collected ₹${coinsCollected} in Amdvad Runner! Can you beat my high score of ${highScore}?`;
    if (navigator.share) {
      navigator.share({
        title: 'Amdvad Runner',
        text: text,
      }).catch(console.error);
    } else {
      navigator.clipboard.writeText(text);
      setShareText('Copied!');
      setTimeout(() => setShareText('Share Score'), 2000);
    }
  };

  useEffect(() => {
    if (coinsCollected >= dailyMission.target && !missionCompleted && isPlaying && !isGameOver) {
      setMissionCompleted(true);
      gameState.current.floatingTexts.push({
        x: dimensions.w / 2,
        y: LOGICAL_HEIGHT / 4,
        text: 'MISSION COMPLETE!',
        color: '#4ADE80',
        life: 100
      });
      triggerHaptic([100, 50, 100]);
    }
  }, [coinsCollected, missionCompleted, isPlaying, isGameOver, dailyMission.target, dimensions.w]);

  // Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Ensure pixelated rendering
    ctx.imageSmoothingEnabled = false;

    let animationFrameId: number;
    let lastTime = 0;
    const FPS = 60;
    const frameInterval = 1000 / FPS;

    const gameLoop = (time: number) => {
      if (!lastTime) lastTime = time;
      const deltaTime = time - lastTime;

      if (deltaTime < frameInterval) {
        animationFrameId = requestAnimationFrame(gameLoop);
        return;
      }

      lastTime = time - (deltaTime % frameInterval);

      const state = gameState.current;

      if (isPlaying && !isGameOver) {
        state.tick++;

        if (state.invincibleTimer > 0) {
          state.invincibleTimer--;
        }

        if (state.deathTimer > 0) {
          state.deathTimer--;
          state.playerY += state.playerVY;
          state.playerVY += GRAVITY;
          if (state.playerY >= GROUND_Y - 30) {
            state.playerY = GROUND_Y - 30;
          }
          if (state.deathTimer <= 0) {
            setIsGameOver(true);
            setIsPlaying(false);
          }
        } else {
        state.distance += state.speed;
        state.distanceStreak += state.speed;
        
        if (state.distanceStreak > 2000) {
          state.baseMultiplier++;
          state.distanceStreak = 0;
          state.floatingTexts.push({ x: 50, y: state.playerY - 20, text: `STREAK! MULTIPLIER UP!`, color: '#FFD700', life: 50 });
          triggerHaptic(50);
        }
        
        let currentMultiplier = state.baseMultiplier + Math.floor(state.coinStreak / 5);
        if (state.activePowerups.doubleTime > 0) {
          currentMultiplier *= 2;
        }

        // Increase speed gradually
        if (state.distance % 1000 < state.speed && state.speed < state.difficultyConfig.maxSpeed) {
          state.speed += 0.2;
        }

        state.score += (state.speed / 10) * currentMultiplier;
        
        if (state.tick % 5 === 0) {
           setScore(Math.floor(state.score));
           setMultiplierHUD(currentMultiplier);
           setSpeedHUD(Math.floor(state.speed * 8));
        }

        // Physics
        state.playerY += state.playerVY;
        state.playerVY += GRAVITY;

        if (state.playerY >= GROUND_Y - 30) {
          state.playerY = GROUND_Y - 30;
          state.playerVY = 0;
          state.isJumping = false;
        }

        const cyclePhase = (state.distance % 24000) / 24000;
        const nightFactor = Math.max(0, Math.sin(cyclePhase * Math.PI * 2));
        audio.updateMusic(nightFactor);

        // Spawn Obstacles
        // We only spawn if the distance from the last obstacle is big enough
        let spacingMin = state.difficultyConfig.spacingMin;
        let spacingMax = state.difficultyConfig.spacingMax;
        let obstacleChance = state.difficultyConfig.obstacleChance;
        
        if (state.event.type === 'heavy_traffic') {
          spacingMin *= 0.6;
          spacingMax *= 0.6;
          obstacleChance = Math.min(0.9, obstacleChance * 1.5);
        }

        const lastObstacle = state.obstacles[state.obstacles.length - 1];
        if (!lastObstacle || (dimensions.w - lastObstacle.x > randomRange(spacingMin, spacingMax))) {
          if (Math.random() < obstacleChance) {
            const typeValue = Math.random();
            let type: 'auto' | 'dog' | 'chai' | 'pothole' | 'bicycle' | 'vendor' | 'kite' = 'auto';
            let w = 34, h = 28;
            let y = GROUND_Y - h;
            
            if (typeValue > 0.85) { type = 'kite'; w = 24; h = 24; y = GROUND_Y - 60; }
            else if (typeValue > 0.70) { type = 'bicycle'; w = 34; h = 24; y = GROUND_Y - 24; }
            else if (typeValue > 0.55) { type = 'pothole'; w = 30; h = 8; y = GROUND_Y - 5; }
            else if (typeValue > 0.40) { type = 'vendor'; w = 26; h = 28; y = GROUND_Y - 28; }
            else if (typeValue > 0.25) { type = 'dog'; w = 28; h = 26; y = GROUND_Y - 26; }
            else if (typeValue > 0.15) { type = 'chai'; w = 32; h = 32; y = GROUND_Y - 32; }

            state.obstacles.push({
              x: dimensions.w,
              y,
              type,
              w, h
            });
          }
        }

        // Move and cleanup obstacles
        for (let i = state.obstacles.length - 1; i >= 0; i--) {
          const obs = state.obstacles[i];
          const isBicycle = obs.type === 'bicycle';
          const isDog = obs.type === 'dog';
          obs.x -= isBicycle ? state.speed * 1.3 : isDog ? state.speed * 1.1 : state.speed;

          // Hitbox collision (Player is roughly 16x30, x=50)
          const playerHitbox = { x: 54, y: state.playerY + 4, w: 10, h: 26 };
          const obsHitbox = { x: obs.x + 4, y: obs.y + 4, w: obs.w - 8, h: obs.h - 8 };

          if (
            playerHitbox.x < obsHitbox.x + obsHitbox.w &&
            playerHitbox.x + playerHitbox.w > obsHitbox.x &&
            playerHitbox.y < obsHitbox.y + obsHitbox.h &&
            playerHitbox.y + playerHitbox.h > obsHitbox.y
          ) {
            if (state.invincibleTimer > 0) continue;

            // Check shield
            if (state.activePowerups.shield) {
              state.activePowerups.shield = false;
              state.baseMultiplier = 1;
              state.distanceStreak = 0;
              state.coinStreak = 0;
              setActivePowerupsHUD(prev => ({ ...prev, shield: false }));
              audio.playShieldBreak();
              state.obstacles.splice(i, 1);
              state.screenShake = 10;
              for (let p = 0; p < 12; p++) {
                state.particles.push({
                  x: playerHitbox.x + playerHitbox.w / 2,
                  y: playerHitbox.y + playerHitbox.h / 2,
                  vx: (Math.random() - 0.5) * 8,
                  vy: (Math.random() - 0.5) * 8 - 2,
                  life: 20 + Math.random() * 10,
                  type: 'shield_break'
                });
              }
              continue;
            }

            // Collision!
            if (state.deathTimer === 0) {
              if (state.lives > 1) {
                state.lives--;
                setLives(state.lives);
                state.invincibleTimer = 90;
                state.hitBlink = 30;
                state.screenShake = 15;
                state.baseMultiplier = 1;
                state.distanceStreak = 0;
                state.coinStreak = 0;
                if (state.speed > state.difficultyConfig.initialSpeed) {
                  state.speed -= 1;
                  setSpeedHUD(Math.floor(state.speed * 8));
                }
                triggerHaptic([50]);
                audio.playShieldBreak();
                for (let p = 0; p < 10; p++) {
                  state.particles.push({
                    x: playerHitbox.x + playerHitbox.w / 2,
                    y: playerHitbox.y + playerHitbox.h / 2,
                    vx: (Math.random() - 0.5) * 8,
                    vy: (Math.random() - 0.5) * 8 - 2,
                    life: 20 + Math.random() * 10,
                    type: 'hit'
                  });
                }
                continue;
              }

              state.lives = 0;
              setLives(0);
              state.deathTimer = 60;
              state.baseMultiplier = 1;
              state.distanceStreak = 0;
              state.coinStreak = 0;
              state.speed = 0;
              state.playerVY = -6;
              
              triggerHaptic([100, 50, 100]);
              audio.stopMusic();
              audio.updateWeather('none');
              const finalScore = Math.floor(state.score);
              setHighScore(prev => Math.max(prev, finalScore));
              setHighScoresList(prev => {
                const newList = [...prev, finalScore].sort((a, b) => b - a).slice(0, 5);
                return newList;
              });
              audio.playGameOver();
              
              // Visual feedback
              state.screenShake = 20;
              state.hitBlink = 60;
              for (let p = 0; p < 15; p++) {
                state.particles.push({
                  x: playerHitbox.x + playerHitbox.w / 2,
                  y: playerHitbox.y + playerHitbox.h / 2,
                  vx: (Math.random() - 0.5) * 8,
                  vy: (Math.random() - 0.5) * 8 - 2,
                  life: 20 + Math.random() * 20,
                  type: 'hit'
                });
              }
            }
          }

          if (obs.x + obs.w < 0) {
            state.obstacles.splice(i, 1);
          } else if (!obs.passed && state.deathTimer === 0) {
            if (obs.x + obs.w < playerHitbox.x) {
              obs.passed = true;
              
              const gapAbove = obsHitbox.y - (playerHitbox.y + playerHitbox.h);
              const gapBelow = playerHitbox.y - (obsHitbox.y + obsHitbox.h);
              const verticalGap = Math.max(gapAbove, gapBelow);
              
              if (verticalGap >= 0 && verticalGap < 45) {
                state.score += 50;
                audio.playWhoosh();
                state.floatingTexts.push({
                  x: playerHitbox.x,
                  y: state.playerY - 30,
                  text: '+50 NEAR MISS!',
                  color: '#38BDF8',
                  life: 40
                });
              }
            }
          }
        }

        // Spawn Coins
        let coinTick = state.event.type === 'golden_hour' ? 15 : 50;
        let coinChance = state.event.type === 'golden_hour' ? 0.9 : 0.7; // Wait, originally was > 0.3 which is 70%

        if (state.tick % coinTick === 0 && Math.random() < coinChance) {
          const isHigh = Math.random() > 0.5;
          const yPos = isHigh ? GROUND_Y - 80 : GROUND_Y - 30; // High jump or low grab
          state.coins.push({
            x: dimensions.w,
            y: yPos,
            w: 12,
            h: 12,
            tickOffset: Math.random() * 100
          });
        }

        // Spawn Powerups
        if (state.tick % state.difficultyConfig.powerupInterval === 0 && state.tick > 0) {
          const isHigh = Math.random() > 0.5;
          const yPos = isHigh ? GROUND_Y - 80 : GROUND_Y - 30;
          const typeValue = Math.random();
          let pType: 'shield' | 'magnet' | 'double' = 'shield';
          if (typeValue > 0.7) pType = 'double';
          else if (typeValue > 0.35) pType = 'magnet';
          
          state.powerups.push({
            x: dimensions.w,
            y: yPos,
            type: pType,
            w: 16,
            h: 16,
            tickOffset: Math.random() * 100
          });
        }

        // Update active powerup timers
        if (state.activePowerups.magnetTime > 0) {
          state.activePowerups.magnetTime--;
          if (state.activePowerups.magnetTime % 10 === 0) {
            setActivePowerupsHUD(prev => ({ ...prev, magnetTime: state.activePowerups.magnetTime }));
          }
          if (state.activePowerups.magnetTime === 0) {
             setActivePowerupsHUD(prev => ({ ...prev, magnetTime: 0 }));
          }
        }
        
        if (state.activePowerups.doubleTime > 0) {
          state.activePowerups.doubleTime--;
          if (state.activePowerups.doubleTime % 10 === 0) {
            setActivePowerupsHUD(prev => ({ ...prev, doubleTime: state.activePowerups.doubleTime }));
          }
          if (state.activePowerups.doubleTime === 0) {
             setActivePowerupsHUD(prev => ({ ...prev, doubleTime: 0 }));
          }
        }

        // Event Timer
        if (state.event.timer > 0) {
          state.event.timer--;
          if (state.event.timer % 30 === 0) {
            setActiveEventHUD({ type: state.event.type, timer: state.event.timer });
          }
          if (state.event.timer <= 0) {
            state.event.type = 'none';
            setActiveEventHUD({ type: 'none', timer: 0 });
            state.floatingTexts.push({ x: dimensions.w / 2, y: LOGICAL_HEIGHT / 4, text: `EVENT ENDED`, color: '#FFFFFF', life: 80 });
          }
        } else if (Math.random() < 0.001) { // Random chance to start an event (~every 1000 ticks)
          const isTraffic = Math.random() > 0.5;
          state.event.type = isTraffic ? 'heavy_traffic' : 'golden_hour';
          state.event.timer = 600; // ~10 seconds
          setActiveEventHUD({ type: state.event.type, timer: state.event.timer });
          state.floatingTexts.push({ x: dimensions.w / 2, y: LOGICAL_HEIGHT / 4, text: isTraffic ? `HEAVY TRAFFIC!` : `GOLDEN HOUR!`, color: isTraffic ? '#EF4444' : '#F59E0B', life: 100 });
          triggerHaptic([50, 50, 50, 50]);
        }

        const playerHitbox = { x: 54, y: state.playerY + 4, w: 10, h: 26 };

        // Move and cleanup powerups
        for (let i = state.powerups.length - 1; i >= 0; i--) {
          const pu = state.powerups[i];
          pu.x -= state.speed;

          const puHitbox = { x: pu.x, y: pu.y, w: pu.w, h: pu.h };

          if (
            playerHitbox.x < puHitbox.x + puHitbox.w &&
            playerHitbox.x + playerHitbox.w > puHitbox.x &&
            playerHitbox.y < puHitbox.y + puHitbox.h &&
            playerHitbox.y + playerHitbox.h > puHitbox.y
          ) {
            // Powerup collected
            triggerHaptic(50);
            audio.playPowerup();
            let puText = '';
            let puColor = '';
            if (pu.type === 'shield') {
              state.activePowerups.shield = true;
              setActivePowerupsHUD(prev => ({ ...prev, shield: true }));
              puText = 'SHIELD!';
              puColor = '#64C8FF';
            } else if (pu.type === 'magnet') {
              state.activePowerups.magnetTime = 600; // 10 seconds at 60fps
              setActivePowerupsHUD(prev => ({ ...prev, magnetTime: 600 }));
              puText = 'MAGNET!';
              puColor = '#FF6464';
            } else if (pu.type === 'double') {
              state.activePowerups.doubleTime = 600; // 10 seconds
              setActivePowerupsHUD(prev => ({ ...prev, doubleTime: 600 }));
              puText = '2X SCORE!';
              puColor = '#FFD700';
            }
            
            state.floatingTexts.push({
              x: pu.x + pu.w / 2,
              y: pu.y - 10,
              text: puText,
              color: puColor,
              life: 45
            });

            for (let p = 0; p < 10; p++) {
              state.particles.push({
                x: pu.x + pu.w / 2,
                y: pu.y + pu.h / 2,
                vx: (Math.random() - 0.5) * 6,
                vy: (Math.random() - 0.5) * 6 - 2,
                life: 15 + Math.random() * 15,
                type: 'powerup'
              });
            }
            state.powerups.splice(i, 1);
            continue;
          }

          if (pu.x + pu.w < 0) {
            state.powerups.splice(i, 1);
          }
        }

        // Move and cleanup coins
        for (let i = state.coins.length - 1; i >= 0; i--) {
          const coin = state.coins[i];
          
          if (state.activePowerups.magnetTime > 0) {
             const pCenterX = playerHitbox.x + playerHitbox.w / 2;
             const pCenterY = playerHitbox.y + playerHitbox.h / 2;
             const dx = pCenterX - (coin.x + coin.w / 2);
             const dy = pCenterY - (coin.y + coin.h / 2);
             const dist = Math.sqrt(dx*dx + dy*dy);
             
             if (dist < 150) {
                coin.x += dx * 0.1;
                coin.y += dy * 0.1;
             } else {
                coin.x -= state.speed;
             }
          } else {
             coin.x -= state.speed;
          }

          const coinHitbox = { x: coin.x, y: coin.y, w: coin.w, h: coin.h };

          if (
            playerHitbox.x < coinHitbox.x + coinHitbox.w &&
            playerHitbox.x + playerHitbox.w > coinHitbox.x &&
            playerHitbox.y < coinHitbox.y + coinHitbox.h &&
            playerHitbox.y + playerHitbox.h > coinHitbox.y
          ) {
            // Coined collected
            triggerHaptic(30);
            state.floatingTexts.push({
              x: coin.x + coin.w / 2,
              y: coin.y - 10,
              text: '+1',
              color: '#FFD700',
              life: 30
            });
            for (let p = 0; p < 6; p++) {
              state.particles.push({
                x: coin.x + coin.w / 2,
                y: coin.y + coin.h / 2,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4 - 2,
                life: 15 + Math.random() * 15,
                type: 'coin'
              });
            }
            state.coins.splice(i, 1);
            setCoinsCollected(prev => prev + 1);
            state.coinStreak++;
            
            if (state.coinStreak > 1 && state.coinStreak % 5 === 0) {
              state.floatingTexts.push({ x: coin.x, y: coin.y - 20, text: `COIN STREAK x${state.coinStreak}!`, color: '#FFD700', life: 40 });
            }
            
            let currentMultiplier = state.baseMultiplier + Math.floor(state.coinStreak / 5);
            if (state.activePowerups.doubleTime > 0) {
              currentMultiplier *= 2;
            }
            state.score += 10 * currentMultiplier; // Coins grant 10 points * multiplier
            
            audio.playCoin();
          } else if (coin.x + coin.w < 0) {
            state.coinStreak = 0;
            state.coins.splice(i, 1);
          }
        }
        } // End of normal updates
      }

      // Always update particles and visual timers (even on game over)
      for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
        const ft = state.floatingTexts[i];
        if (!isGameOver) {
          ft.x -= state.speed;
        }
        ft.y -= 0.5; // Float upwards
        ft.life--;
        if (ft.life <= 0) {
          state.floatingTexts.splice(i, 1);
        }
      }

      for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        if (!isGameOver) {
          p.x -= state.speed; // Parallax backwards if game running
        }
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.2; // Gravity for particles
        p.life--;
        if (p.life <= 0) {
          state.particles.splice(i, 1);
        }
      }
      
      // Update weather
      if (isPlaying && !isGameOver) {
        state.weather.timer--;
        if (state.weather.timer <= 0) {
          const rand = Math.random();
          state.weather.type = rand > 0.8 ? 'rain' : rand > 0.6 ? 'dust' : 'none';
          state.weather.timer = 600 + Math.random() * 1200; // 10 to 30s
        }
        audio.updateWeather(state.weather.type);
        
        // Spawn weather particles
        if (state.weather.type === 'rain' && state.tick % 2 === 0) {
          for (let i = 0; i < 3; i++) {
            state.weather.particles.push({
              x: Math.random() * dimensions.w * 1.5,
              y: -20,
              vx: -state.speed * 0.2 - 1,
              vy: 12 + Math.random() * 6,
              l: 15 + Math.random() * 10,
              s: 1 + Math.random()
            });
          }
        } else if (state.weather.type === 'dust' && Math.random() < 0.3) {
          state.weather.particles.push({
            x: dimensions.w + 50,
            y: GROUND_Y - 20 - Math.random() * 100,
            vx: -state.speed * 1.5 - Math.random() * 4,
            vy: (Math.random() - 0.5) * 2,
            l: 0,
            s: 2 + Math.random() * 3
          });
        }
      }

      for (let i = state.weather.particles.length - 1; i >= 0; i--) {
        const wp = state.weather.particles[i];
        if (!isGameOver) wp.x -= state.speed * 0.2; // Additional parallax
        wp.x += wp.vx;
        wp.y += wp.vy;
        if (wp.y > GROUND_Y + 50 || wp.x < -50) {
          state.weather.particles.splice(i, 1);
        }
      }

      if (state.screenShake > 0) {
        state.screenShake -= Math.max(0.2, state.screenShake * 0.1);
        if (state.screenShake < 0.2) state.screenShake = 0;
      }
      if (state.hitBlink > 0) {
        state.hitBlink--;
      }

      // --- RENDER ---
      ctx.save();
      
      // Apply screen shake
      if (state.screenShake > 0) {
        const shakeX = (Math.random() - 0.5) * state.screenShake * 2;
        const shakeY = (Math.random() - 0.5) * state.screenShake * 2;
        ctx.translate(shakeX, shakeY);
      }

      ctx.clearRect(0, 0, dimensions.w, LOGICAL_HEIGHT);
      
      drawBackground(ctx, state.distance, dimensions.w, state.tick);

      // Draw Coins
      state.coins.forEach(coin => {
        drawCoin(ctx, Math.round(coin.x), Math.round(coin.y), state.tick, coin.tickOffset);
      });

      // Draw Obstacles
      const cyclePhase = (state.distance % 24000) / 24000;
      const nightFactor = Math.max(0, Math.sin(cyclePhase * Math.PI * 2));

      state.obstacles.forEach(obs => {
        const ox = Math.round(obs.x);
        const oy = Math.round(obs.y);
        if (obs.type === 'auto') drawAuto(ctx, ox, oy, state.tick, nightFactor);
        else if (obs.type === 'dog') drawDog(ctx, ox, oy, state.tick);
        else if (obs.type === 'chai') drawChaiCart(ctx, ox, oy, state.tick, nightFactor);
        else if (obs.type === 'kite') drawKite(ctx, ox, oy, state.tick);
        else if (obs.type === 'bicycle') drawBicycle(ctx, ox, oy, state.tick);
        else if (obs.type === 'pothole') drawPothole(ctx, ox, oy);
        else if (obs.type === 'vendor') drawVendor(ctx, ox, oy, state.tick);
      });

      // Draw Powerups
      state.powerups.forEach(pu => {
        drawPowerup(ctx, Math.round(pu.x), Math.round(pu.y), pu.type, state.tick, pu.tickOffset);
      });

      // Draw Player (with hit blinking effect)
      const isBlinking = (state.invincibleTimer > 0 && Math.floor(state.invincibleTimer / 4) % 2 !== 0) || (state.hitBlink > 0 && Math.floor(state.hitBlink / 4) % 2 !== 0);
      if (!isBlinking) {
        if (state.activePowerups.shield) {
          ctx.beginPath();
          ctx.arc(60, Math.round(state.playerY) + 16, 20, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(100, 200, 255, 0.4)';
          ctx.fill();
        }
        if (state.activePowerups.magnetTime > 0) {
          ctx.beginPath();
          ctx.arc(60, Math.round(state.playerY) + 16, 24 + Math.sin(state.tick * 0.2) * 4, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 100, 100, ${state.activePowerups.magnetTime / 600})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        drawPlayer(ctx, 50, Math.round(state.playerY), state.isJumping, state.tick, shirtColor, playerModel, state.deathTimer > 0);
      }

      // Draw Weather Particles
      state.weather.particles.forEach(wp => {
        ctx.save();
        ctx.translate(wp.x, wp.y);
        if (state.weather.type === 'rain') {
          ctx.strokeStyle = 'rgba(150, 200, 255, 0.4)';
          ctx.lineWidth = wp.s;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-wp.vx * 0.5, -wp.l);
          ctx.stroke();
        } else if (state.weather.type === 'dust') {
          ctx.fillStyle = 'rgba(210, 180, 140, 0.3)';
          ctx.beginPath();
          ctx.arc(0, 0, wp.s, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });

      // Ambient weather tint
      if (state.weather.type === 'rain') {
        ctx.fillStyle = 'rgba(0, 50, 100, 0.1)';
        ctx.fillRect(0, 0, dimensions.w, LOGICAL_HEIGHT);
      } else if (state.weather.type === 'dust') {
        ctx.fillStyle = 'rgba(180, 130, 80, 0.1)';
        ctx.fillRect(0, 0, dimensions.w, LOGICAL_HEIGHT);
      }

      // Draw particles
      state.particles.forEach(p => drawParticle(ctx, p));

      // Draw floating texts
      state.floatingTexts.forEach(ft => drawFloatingText(ctx, ft));

      // Draw game over red flash overlay 
      if (state.hitBlink > 0) {
        // Blink starts at 60, fade out to 0
        ctx.fillStyle = `rgba(255, 0, 0, ${Math.min(0.5, state.hitBlink / 100)})`;
        ctx.fillRect(0, 0, dimensions.w, LOGICAL_HEIGHT);
      }

      ctx.restore();

      animationFrameId = requestAnimationFrame(gameLoop);
    };

    animationFrameId = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying, isGameOver]);

  useEffect(() => {
    return () => {
      audio.stopMusic();
      audio.updateWeather('none');
    };
  }, []);

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-[#3A2E2C] select-none focus:outline-none transition-transform duration-100 ease-linear origin-center" 
      tabIndex={0}
      style={{
        perspective: '800px',
        transform: isPlaying && !isGameOver ? `scale(1.02) rotateX(${Math.min(5, speedHUD * 0.03)}deg) rotateY(${Math.sin(Date.now() / 300) * (speedHUD * 0.015)}deg)` : 'none'
      }}
    >
      <canvas
        ref={canvasRef}
        width={dimensions.w}
        height={dimensions.h}
        className="w-full h-full cursor-pointer"
        onClick={handleCanvasClick}
        onTouchStart={handleCanvasClick}
        style={{ imageRendering: 'pixelated' }}
      />

      {/* UI Overlays */}
      <div className="absolute top-4 left-4 right-4 flex justify-between px-4 z-10 pointer-events-none">
        <div className="flex gap-6 items-center">
          <button 
            type="button"
            className="text-white p-2 bg-black/40 hover:bg-black/60 rounded-full transition-colors focus:outline-none pointer-events-auto"
            onClick={toggleAudio}
            title={audioEnabled ? "Mute sound" : "Enable sound"}
          >
            {audioEnabled ? <Volume2 size={24} /> : <VolumeX size={24} />}
          </button>
          <div className="font-mono text-2xl font-black text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] flex items-center gap-2">
            SCORE: {score.toString().padStart(5, '0')}
            {multiplierHUD > 1 && (
              <span className="text-yellow-400 text-lg animate-pulse ml-2">x{multiplierHUD}</span>
            )}
          </div>
          <div className="font-mono text-2xl font-black text-yellow-400 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] flex items-center gap-1">
            <span className="text-xl">₹</span> {coinsCollected.toString().padStart(3, '0')}
          </div>
          <div className="flex gap-1 ml-4 shadow-black drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
            {[...Array(3)].map((_, i) => (
              <Heart 
                key={i} 
                size={24} 
                className={i < lives ? "fill-red-500 text-red-500" : "text-white/50"} 
              />
            ))}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="font-mono text-xl font-bold text-yellow-300 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
            HI: {highScore.toString().padStart(5, '0')}
          </div>
          {isPlaying && !isGameOver && (
            <div className="flex items-center gap-3 bg-black/40 px-3 py-1.5 rounded-full border border-white/20 backdrop-blur-sm shadow-[0_4px_10px_rgba(0,0,0,0.5)]">
              <div className="font-mono text-lg font-bold text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] w-16 text-right flex items-baseline gap-1">
                {speedHUD} <span className="text-xs text-white/70">km/h</span>
              </div>
              <div className="w-20 h-2.5 bg-black/60 rounded-full overflow-hidden border border-white/10">
                <div 
                  className="h-full bg-gradient-to-r from-blue-400 via-yellow-400 to-red-500 transition-all duration-300 ease-out" 
                  style={{ width: `${Math.min(100, Math.max(0, (speedHUD - 28) / (128 - 28) * 100))}%` }} 
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Power-ups HUD */}
      {(activePowerupsHUD.shield || activePowerupsHUD.magnetTime > 0 || activePowerupsHUD.doubleTime > 0) && (
        <div className="absolute top-16 left-4 flex gap-4 z-10 pointer-events-none">
          {activePowerupsHUD.shield && (
            <div className="flex items-center gap-2 bg-blue-500/80 text-white px-3 py-1.5 rounded-full border-2 border-blue-300 shadow-[0_0_10px_rgba(100,200,255,0.8)] backdrop-blur-sm animate-pulse">
              <Shield size={20} />
              <span className="font-bold font-mono">SHIELD ACTIVE</span>
            </div>
          )}
          {activePowerupsHUD.magnetTime > 0 && (
            <div className="flex items-center gap-2 bg-red-500/80 text-white px-3 py-1.5 rounded-full border-2 border-red-300 shadow-[0_0_10px_rgba(255,100,100,0.8)] backdrop-blur-sm">
              <MagnetIcon size={20} className="animate-bounce" />
              <span className="font-bold font-mono">MAGNET {Math.ceil(activePowerupsHUD.magnetTime / 60)}s</span>
            </div>
          )}
          {activePowerupsHUD.doubleTime > 0 && (
            <div className="flex items-center gap-2 bg-yellow-500/80 text-white px-3 py-1.5 rounded-full border-2 border-yellow-300 shadow-[0_0_10px_rgba(255,215,0,0.8)] backdrop-blur-sm animate-pulse">
              <Zap size={20} />
              <span className="font-bold font-mono">2X MULTIPLIER {Math.ceil(activePowerupsHUD.doubleTime / 60)}s</span>
            </div>
          )}
        </div>
      )}

      {/* Event HUD */}
      {activeEventHUD.type !== 'none' && isPlaying && !isGameOver && (
        <div className="absolute top-32 left-1/2 -translate-x-1/2 z-10 pointer-events-none transition-all duration-300">
          <div className={`px-6 py-2 rounded-full border-2 shadow-[0_0_15px_rgba(0,0,0,0.5)] backdrop-blur-md flex items-center gap-3 animate-pulse ${
            activeEventHUD.type === 'heavy_traffic' 
              ? 'bg-red-500/80 border-red-300 shadow-[0_0_20px_rgba(239,68,68,0.6)]' 
              : 'bg-yellow-500/80 border-yellow-300 shadow-[0_0_20px_rgba(245,158,11,0.6)]'
          }`}>
            <span className="font-black text-white text-xl tracking-widest uppercase">
              {activeEventHUD.type === 'heavy_traffic' ? 'HEAVY TRAFFIC!' : 'GOLDEN HOUR!'}
            </span>
            <span className="font-mono text-white/90 text-lg font-bold">
              {Math.ceil(activeEventHUD.timer / 60)}s
            </span>
          </div>
        </div>
      )}

      {/* Daily Mission Banner */}
      <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none transition-all duration-300 ${(!isPlaying || isGameOver) ? 'opacity-0 translate-y-8' : 'opacity-100 translate-y-0'}`}>
        <div className="bg-black/60 backdrop-blur-md border border-white/10 px-4 py-2.5 rounded-full flex items-center gap-4 shadow-[0_8px_16px_rgba(0,0,0,0.5)]">
          <div className="text-white/90 text-sm font-bold whitespace-nowrap uppercase tracking-wider">
            {dailyMission.description}
          </div>
          <div className="w-40 h-2 bg-black/80 rounded-full overflow-hidden border border-white/20 relative">
            <div 
              className={`h-full transition-all duration-500 ease-out ${missionCompleted ? 'bg-green-400' : 'bg-yellow-400'}`}
              style={{ width: `${missionCompleted ? 100 : Math.min(100, (coinsCollected / dailyMission.target) * 100)}%` }}
            />
          </div>
          <div className={`text-sm font-black font-mono w-14 text-right ${missionCompleted ? 'text-green-400' : 'text-yellow-400'}`}>
            {missionCompleted ? dailyMission.target : Math.min(dailyMission.target, coinsCollected)}/{dailyMission.target}
          </div>
          {missionCompleted && <Zap size={16} className="text-green-400 animate-pulse drop-shadow-[0_0_8px_rgba(74,222,128,1)]" />}
        </div>
      </div>

      {/* Tutorial Overlay */}
      <AnimatePresence>
        {showTutorial && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="absolute inset-0 flex items-center justify-center top-1/3 pointer-events-none z-10"
          >
            <div className="bg-black/70 border border-white/20 text-white px-8 py-4 rounded-3xl backdrop-blur-md flex flex-col items-center gap-2 shadow-[0_10px_30px_rgba(0,0,0,0.5)] animate-bounce">
              <span className="font-black text-xl uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-orange-400 drop-shadow-md">Jump to dodge</span>
              <div className="flex gap-2">
                <span className="bg-white/20 px-3 py-1 rounded font-mono text-sm tracking-widest font-bold">SPACE</span>
                <span className="bg-white/20 px-3 py-1 rounded font-mono text-sm tracking-widest font-bold">TAP</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isPlaying && !isGameOver && !showCustomize && (
        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center p-6 text-center pointer-events-auto">
          <h1 className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-tr from-yellow-400 to-orange-500 font-sans tracking-tight mb-4 drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)]">
            AMDVAAD RUNNER
          </h1>
          <p className="text-white text-lg md:text-xl font-medium max-w-lg mb-6 drop-shadow-md pointer-events-none">
            Help our common man navigate the bustling streets of Ahmedabad! Dodge rickshaws, cows, vendors, and bicycles. Don't jump into flying kites!
          </p>
          <div className="flex gap-2 mb-6 pointer-events-auto">
            {(['Easy', 'Medium', 'Hard'] as Difficulty[]).map(level => (
              <button
                key={level}
                onClick={(e) => { e.stopPropagation(); setDifficulty(level); }}
                className={`px-4 py-1.5 rounded-full font-bold text-sm uppercase tracking-wider transition-all border-2
                  ${difficulty === level 
                    ? 'bg-yellow-400 text-black border-yellow-200 shadow-[0_0_10px_rgba(250,204,21,0.8)] scale-110' 
                    : 'bg-black/50 text-white/70 border-white/20 hover:bg-black/80 hover:text-white'}`}
              >
                {level}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-4">
            <button 
              onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); jump(); }}
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); jump(); }}
              className="animate-pulse hover:animate-none bg-orange-600 hover:bg-orange-500 text-white px-8 py-3 rounded-full font-bold text-xl uppercase tracking-wider shadow-[0_0_20px_rgba(234,88,12,0.8)] border border-orange-400 transition-all">
              Press Space or Tap to Start
            </button>
            <button 
              onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); setShowCustomize(true); }}
              onClick={(e) => { e.stopPropagation(); setShowCustomize(true); }}
              className="bg-purple-600 hover:bg-purple-500 text-white px-8 py-2 rounded-full font-bold text-lg uppercase tracking-wider shadow-[0_0_15px_rgba(147,51,234,0.6)] border border-purple-400 transition-all">
              Customize Character
            </button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {isGameOver && !showHighScores && !showCustomize && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="absolute inset-0 flex flex-col items-center justify-center pointer-events-auto p-6 text-center overflow-hidden z-20"
          >
            {/* Animated Background */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-md z-0"></div>
            <div className="absolute inset-0 z-0 opacity-40 pointer-events-none">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-red-600 rounded-full blur-[120px] animate-pulse"></div>
              {score > 500 && <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-orange-500 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }}></div>}
              {coinsCollected > 20 && <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-yellow-400 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '2s' }}></div>}
            </div>

            <div className="relative z-10 flex flex-col items-center w-full max-w-sm">
              <h2 className="text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-red-400 to-red-600 mb-2 drop-shadow-2xl tracking-widest uppercase transform -skew-y-3">
                Game Over!
              </h2>
            <p className="text-lg md:text-xl text-orange-200 mb-8 max-w-xs font-medium">
              The Amdvad traffic finally caught up to you!
            </p>
            
            <div className="w-full bg-white/10 rounded-2xl backdrop-blur-md border border-white/20 p-6 flex flex-col gap-4 mb-8 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
              <div className="flex flex-col items-center">
                <span className="text-white/70 text-sm uppercase tracking-widest mb-1">Final Score</span>
                <span className="text-4xl font-black text-yellow-400 font-mono tracking-wider drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]">{score}</span>
              </div>
              <div className="w-full h-px bg-white/10"></div>
              <div className="flex justify-between items-center px-4">
                <span className="text-white/80 font-medium">Coins</span>
                <span className="text-2xl font-bold text-yellow-400 font-mono">₹ {coinsCollected}</span>
              </div>
            </div>
            
            <div className="flex flex-col gap-3 w-full">
              <button 
                onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); resetGame(); }}
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); resetGame(); }} 
                className="w-full relative overflow-hidden group bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-400 hover:to-orange-400 text-white px-6 py-4 rounded-xl font-black text-xl uppercase tracking-widest shadow-[0_0_20px_rgba(239,68,68,0.4)] transition-all hover:-translate-y-1">
                <div className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:animate-shimmer"></div>
                Try Again
              </button>
              
              <button 
                onClick={handleShare}
                className="w-full bg-blue-600/80 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold text-lg uppercase tracking-wide border border-blue-400/30 transition-all backdrop-blur-sm">
                {shareText}
              </button>
              
              <div className="flex gap-3 w-full mt-1">
                <button 
                  onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); setShowHighScores(true); }}
                  onClick={(e) => { e.stopPropagation(); setShowHighScores(true); }}
                  className="w-full bg-white/10 hover:bg-white/20 text-white px-4 py-3 rounded-xl font-bold text-sm uppercase tracking-wider border border-white/10 transition-all backdrop-blur-sm">
                  High Scores
                </button>
              </div>
            </div>
          </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showHighScores && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center pointer-events-auto p-6 z-30"
          >
            <h2 className="text-4xl font-black text-yellow-400 mb-6 tracking-widest uppercase">High Scores</h2>
          <div className="bg-white/10 border border-white/20 rounded-xl p-6 w-full max-w-sm mb-8 text-white font-mono text-xl flex flex-col gap-4">
            {highScoresList.length > 0 ? highScoresList.map((s, i) => (
              <div key={i} className="flex justify-between border-b border-white/10 pb-2">
                <span className="text-gray-400">#{i + 1}</span>
                <span className="text-yellow-400 font-bold">{s}</span>
              </div>
            )) : <div className="text-center text-gray-400">No high scores yet!</div>}
          </div>
          <button 
            onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); setShowHighScores(false); }}
            onClick={(e) => { e.stopPropagation(); setShowHighScores(false); }}
            className="bg-white hover:bg-gray-200 text-black px-8 py-3 rounded-full font-bold text-xl uppercase tracking-wider transition-all">
            Back
          </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCustomize && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center pointer-events-auto p-6 z-30"
          >
            <h2 className="text-4xl font-black text-purple-400 mb-6 tracking-widest uppercase">Customize</h2>
          <div className="bg-white/10 border border-white/20 rounded-xl p-8 w-full max-w-sm mb-8 flex flex-col items-center gap-6">
            <div className="w-full">
              <p className="text-white text-lg font-medium text-center mb-4">Select Character</p>
              <div className="flex justify-center gap-4">
                <button
                  onClick={(e) => { e.stopPropagation(); setPlayerModel('male'); }}
                  className={`px-6 py-2 rounded-lg font-bold text-lg transition-all ${playerModel === 'male' ? 'bg-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.8)]' : 'bg-white/20 text-white/80 hover:bg-white/30'}`}
                >
                  Male
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setPlayerModel('female'); }}
                  className={`px-6 py-2 rounded-lg font-bold text-lg transition-all ${playerModel === 'female' ? 'bg-pink-500 text-white shadow-[0_0_15px_rgba(236,72,153,0.8)]' : 'bg-white/20 text-white/80 hover:bg-white/30'}`}
                >
                  Female
                </button>
              </div>
            </div>

            <div className="w-full h-px bg-white/20 my-2"></div>

            <p className="text-white text-lg font-medium">Select Shirt Color</p>
            <div className="flex flex-wrap justify-center gap-4">
              {['#F0F0F0', '#FF3366', '#33CCFF', '#33FF66', '#FF9933', '#CC33FF'].map(color => (
                <button
                  key={color}
                  onClick={(e) => { e.stopPropagation(); setShirtColor(color); }}
                  className={`w-12 h-12 rounded-full border-4 transition-transform ${shirtColor === color ? 'border-white scale-110 shadow-[0_0_15px_rgba(255,255,255,0.8)]' : 'border-black opacity-80 hover:opacity-100 hover:scale-105'}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          <button 
            onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); setShowCustomize(false); }}
            onClick={(e) => { e.stopPropagation(); setShowCustomize(false); }}
            className="bg-white hover:bg-gray-200 text-black px-8 py-3 rounded-full font-bold text-xl uppercase tracking-wider transition-all">
            Done
          </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
