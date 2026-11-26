/**
 * presentation-only effects: glow particles, rings, floating text, screen shake and flash
 * nothing in here is read by the simulation, so Math.random is fine
 */

import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../config/gameplayConfig.js";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  life: number;
  maxLife: number;
  color: string;
  gravity: number;
  /** velocity kept per 1/60 s, 1 means no drag */
  drag: number;
}

interface Ring {
  x: number;
  y: number;
  from: number;
  to: number;
  life: number;
  maxLife: number;
  color: string;
  width: number;
}

interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export const FX = {
  gold: "#FFD45E",
  goldPale: "#FFE89A",
  cyan: "#5EEBFF",
  white: "#FFFFFF",
  purple: "#A855F7",
  flame: "#B9E3F3",
  flameDeep: "#7FB8D8",
  danger: "#FF5A6E",
  dust: "#8E86B8",
};

const MAX_PARTICLES = 420;
const rand = (min: number, max: number): number => min + Math.random() * (max - min);

export class Effects {
  /** drawn under the player: exhaust, dust, trails */
  private back: Particle[] = [];
  /** drawn over the world: pickups, sparks, impacts */
  private front: Particle[] = [];
  private rings: Ring[] = [];
  private texts: FloatingText[] = [];
  private glows = new Map<string, HTMLCanvasElement>();

  /** 0..1, decays on its own; shake offset grows with its square */
  private trauma = 0;
  private flashAlpha = 0;
  private flashColor = "#ffffff";
  shakeX = 0;
  shakeY = 0;

  clear(): void {
    this.back.length = 0;
    this.front.length = 0;
    this.rings.length = 0;
    this.texts.length = 0;
    this.trauma = 0;
    this.flashAlpha = 0;
    this.shakeX = 0;
    this.shakeY = 0;
  }

  // spawners

  coinPickup(x: number, y: number, amount: number): void {
    const colors = [FX.gold, FX.goldPale, FX.cyan, FX.white];
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = rand(65, 210);
      this.add(this.front, {
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: rand(3, 6),
        life: rand(0.3, 0.6),
        color: colors[i % colors.length],
        gravity: 90,
        drag: 0.95,
      });
    }
    this.ring(x, y, 5, 44, 0.3, FX.cyan, 3);
    this.text(x, y - 12, `+${amount}`, FX.gold, 20);
  }

  /** one frame's worth of jetpack exhaust; dirX/dirY is the unit direction the gas leaves in */
  exhaust(x: number, y: number, dirX: number, dirY: number, worldSpeed: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const speed = rand(150, 300);
      const spread = rand(-0.28, 0.28);
      const cos = Math.cos(spread);
      const sin = Math.sin(spread);
      this.add(this.back, {
        x: x + rand(-2, 2),
        y: y + rand(-2, 2),
        vx: (dirX * cos - dirY * sin) * speed - worldSpeed * 0.45,
        vy: (dirX * sin + dirY * cos) * speed,
        radius: rand(3, 6.5),
        life: rand(0.16, 0.34),
        color: Math.random() < 0.3 ? FX.white : Math.random() < 0.6 ? FX.flame : FX.flameDeep,
        gravity: 0,
        drag: 0.9,
      });
    }
  }

  /** low puff along the ground, for takeoff and landing */
  dust(x: number, y: number, worldSpeed: number, strength: number): void {
    const count = Math.round(5 + strength * 7);
    for (let i = 0; i < count; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      this.add(this.back, {
        x: x + rand(-8, 8),
        y: y - rand(0, 3),
        vx: side * rand(30, 140) * (0.6 + strength) - worldSpeed * 0.5,
        vy: -rand(10, 70) * (0.5 + strength),
        radius: rand(4, 9),
        life: rand(0.25, 0.5),
        color: FX.dust,
        gravity: 160,
        drag: 0.9,
      });
    }
  }

  boosterTrail(x: number, y: number): void {
    this.add(this.back, {
      x, y,
      vx: -rand(140, 320),
      vy: rand(-45, 45),
      radius: rand(5, 11),
      life: rand(0.35, 0.65),
      color: Math.random() < 0.35 ? "#22D3EE" : FX.purple,
      gravity: 0,
      drag: 0.97,
    });
  }

  /** a short spray of sparks, for near misses and impacts */
  sparks(x: number, y: number, color: string, count: number, speed = 260): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const v = rand(speed * 0.35, speed);
      this.add(this.front, {
        x, y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        radius: rand(2.5, 5),
        life: rand(0.2, 0.5),
        color,
        gravity: 300,
        drag: 0.93,
      });
    }
  }

  ring(x: number, y: number, from: number, to: number, life: number, color: string, width = 3): void {
    this.rings.push({ x, y, from, to, life, maxLife: life, color, width });
  }

  text(x: number, y: number, text: string, color: string, size = 18, rise = 55, life = 0.75): void {
    this.texts.push({ x, y, vy: -rise, text, life, maxLife: life, color, size });
  }

  /** adds screen shake; 0.3 is a nudge, 1 is the hardest hit */
  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  flash(color: string, alpha: number): void {
    this.flashColor = color;
    this.flashAlpha = Math.max(this.flashAlpha, alpha);
  }

  // per frame

  update(dt: number): void {
    this.step(this.back, dt);
    this.step(this.front, dt);

    for (let i = this.rings.length - 1; i >= 0; i--) {
      this.rings[i].life -= dt;
      if (this.rings[i].life <= 0) this.rings.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.y += t.vy * dt;
      t.life -= dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }

    this.trauma = Math.max(0, this.trauma - dt * 1.9);
    const power = this.trauma * this.trauma * 14;
    this.shakeX = (Math.random() * 2 - 1) * power;
    this.shakeY = (Math.random() * 2 - 1) * power;
    this.flashAlpha = Math.max(0, this.flashAlpha - dt * 3.2);
  }

  drawBack(ctx: CanvasRenderingContext2D): void {
    this.drawParticles(ctx, this.back);
  }

  drawFront(ctx: CanvasRenderingContext2D): void {
    for (const ring of this.rings) {
      const k = 1 - ring.life / ring.maxLife;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = ring.width * (1 - k * 0.6);
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.from + (ring.to - ring.from) * (1 - (1 - k) * (1 - k)), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    this.drawParticles(ctx, this.front);

    for (const t of this.texts) {
      const k = t.life / t.maxLife;
      const pop = 1 + Math.max(0, k - 0.8) * 2.2; // a quick overshoot when it appears
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 2.2);
      ctx.font = `bold ${Math.round(t.size * pop)}px Menlo, Consolas, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(8, 8, 26, 0.85)";
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    }
  }

  /** full-screen flash, drawn last and outside the shake transform */
  drawFlash(ctx: CanvasRenderingContext2D): void {
    if (this.flashAlpha <= 0.004) return;
    ctx.save();
    ctx.globalAlpha = this.flashAlpha;
    ctx.fillStyle = this.flashColor;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.restore();
  }

  private add(list: Particle[], p: Omit<Particle, "maxLife">): void {
    if (list.length >= MAX_PARTICLES) list.shift();
    list.push({ ...p, maxLife: p.life });
  }

  private step(list: Particle[], dt: number): void {
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) {
        list.splice(i, 1);
        continue;
      }
      const keep = Math.pow(p.drag, dt * 60);
      p.vx *= keep;
      p.vy = p.vy * keep + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D, list: Particle[]): void {
    if (!list.length) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of list) {
      const k = p.life / p.maxLife;
      const r = p.radius * (0.35 + 0.65 * k) * 2.2; // the glow image is mostly soft edge
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.drawImage(this.glow(p.color), p.x - r, p.y - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  /** a soft dot per colour, drawn once; much cheaper than a canvas shadow per particle */
  glow(color: string): HTMLCanvasElement {
    let canvas = this.glows.get(color);
    if (canvas) return canvas;
    canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const g = canvas.getContext("2d")!;
    const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.22, color);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    g.globalAlpha = 1;
    g.fillStyle = gradient;
    g.fillRect(0, 0, 64, 64);
    // fade the colour stop out toward the edge
    g.globalCompositeOperation = "destination-in";
    const fade = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    fade.addColorStop(0, "rgba(0, 0, 0, 1)");
    fade.addColorStop(0.3, "rgba(0, 0, 0, 0.75)");
    fade.addColorStop(1, "rgba(0, 0, 0, 0)");
    g.fillStyle = fade;
    g.fillRect(0, 0, 64, 64);
    this.glows.set(color, canvas);
    return canvas;
  }
}
