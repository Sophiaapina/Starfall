
export interface CoinPickupPosition {
  x: number;
  y: number;
  amount: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
}

interface EnergyRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
}

export class CoinPickupEffect {
  private particles: Particle[] = [];
  private rings: EnergyRing[] = [];
  private floatingTexts: FloatingText[] = [];

  private readonly particleColors = [
    "#FFD45E",
    "#FFE89A",
    "#5EEBFF",
    "#FFFFFF",
    "#F6B93B",
  ];

  /**
   * Creates the visual effect at the position where a coin was collected.
   * amount = 1 normally, amount = 2 with Double Coins.
   */
  spawn(x: number, y: number, amount: number): void {
    this.spawnParticles(x, y);
    this.spawnRing(x, y);
    this.spawnFloatingText(x, y, amount);
  }

  private spawnParticles(x: number, y: number): void {
    const particleCount = 12;

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 65 + Math.random() * 145;
      const life = 0.35 + Math.random() * 0.35;

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 2 + Math.random() * 3,
        life,
        maxLife: life,
        color: this.particleColors[
          Math.floor(Math.random() * this.particleColors.length)
        ],
      });
    }
  }

  private spawnRing(x: number, y: number): void {
    this.rings.push({
      x,
      y,
      radius: 5,
      maxRadius: 48,
      life: 0.32,
      maxLife: 0.32,
    });
  }

  private spawnFloatingText(
    x: number,
    y: number,
    amount: number,
  ): void {
    this.floatingTexts.push({
      x,
      y: y - 12,
      text: `+${amount}`,
      life: 0.75,
      maxLife: 0.75,
    });
  }

  /**
   * Updates every effect using fixed simulation time.
   */
  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];

      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;

      // Slight drag and gravity.
      particle.vx *= Math.pow(0.96, dt * 60);
      particle.vy *= Math.pow(0.96, dt * 60);
      particle.vy += 90 * dt;

      particle.life -= dt;

      if (particle.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];

      ring.life -= dt;

      const progress = 1 - Math.max(0, ring.life) / ring.maxLife;
      ring.radius = 5 + (ring.maxRadius - 5) * progress;

      if (ring.life <= 0) {
        this.rings.splice(i, 1);
      }
    }

    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const text = this.floatingTexts[i];

      text.y -= 55 * dt;
      text.life -= dt;

      if (text.life <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }
  }

  /**
   * Draws all active effects.
   * This method does not modify the simulation.
   */
  draw(ctx: CanvasRenderingContext2D): void {
    this.drawRings(ctx);
    this.drawParticles(ctx);
    this.drawFloatingTexts(ctx);
  }

  private drawRings(ctx: CanvasRenderingContext2D): void {
    for (const ring of this.rings) {
      const alpha = Math.max(0, ring.life / ring.maxLife);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = "#5EEBFF";
      ctx.lineWidth = 3;
      ctx.shadowColor = "#5EEBFF";
      ctx.shadowBlur = 14;

      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const particle of this.particles) {
      const alpha = Math.max(0, particle.life / particle.maxLife);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.shadowColor = particle.color;
      ctx.shadowBlur = 9;

      ctx.beginPath();
      ctx.arc(
        particle.x,
        particle.y,
        particle.size * alpha,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      ctx.restore();
    }
  }

  private drawFloatingTexts(ctx: CanvasRenderingContext2D): void {
    for (const text of this.floatingTexts) {
      const alpha = Math.max(0, text.life / text.maxLife);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = "bold 20px Menlo, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#FFD45E";
      ctx.shadowColor = "#FFD45E";
      ctx.shadowBlur = 12;

      ctx.fillText(text.text, text.x, text.y);

      ctx.restore();
    }
  }

  clear(): void {
    this.particles.length = 0;
    this.rings.length = 0;
    this.floatingTexts.length = 0;
  }
}
