import { Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RaffleEntry } from './raffle.model';
import { RaffleService } from './raffle.service';

type StageState = 'idle' | 'countdown' | 'spinning' | 'reveal';

interface ConfettiPiece {
  x: number;
  y: number;
  speed: number;
  size: number;
  rotation: number;
  spin: number;
  hue: number;
}

@Component({
  selector: 'app-root',
  imports: [FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  readonly raffle = inject(RaffleService);
  readonly stageState = signal<StageState>('idle');
  readonly stageOpen = signal(false);
  readonly activeEntry = signal<RaffleEntry | null>(null);
  readonly countdown = signal(3);
  readonly confetti = signal(Array.from({ length: 70 }, (_, i) => i));
  readonly canDraw = computed(() => this.raffle.eligible().length > 0 && this.stageState() === 'idle');
  readonly exportingWinnerId = signal<string | null>(null);
  readonly exportMessage = signal('');

  name = '';
  instagram = '';
  readonly designUrl = signal('');
  readonly fileName = signal('');

  @ViewChild('stage') stage?: ElementRef<HTMLElement>;

  onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.fileName.set(file.name);
    const reader = new FileReader();
    reader.onload = () => this.designUrl.set(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  }

  addEntry() {
    const name = this.name.trim();
    const designUrl = this.designUrl();
    if (!name || !designUrl) return;

    this.raffle.add({
      name,
      instagram: this.instagram.trim().replace(/^@/, ''),
      designUrl
    });

    this.name = '';
    this.instagram = '';
    this.designUrl.set('');
    this.fileName.set('');
  }

  openStage() {
    if (!this.raffle.entries().length) return;

    this.stageOpen.set(true);
    this.activeEntry.set(this.raffle.eligible()[0] ?? this.raffle.entries()[0]);
  }

  closeStage() {
    this.stageState.set('idle');
    this.stageOpen.set(false);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    }
  }

  async drawWinner() {
    if (!this.canDraw()) return;

    const winner = this.raffle.selectWinner();
    if (!winner) return;

    const pool = this.raffle.entries().filter(entry => entry.id !== winner.id);

    this.stageState.set('countdown');
    for (const number of [3, 2, 1]) {
      this.countdown.set(number);
      await this.sleep(900);
    }

    this.stageState.set('spinning');
    const started = performance.now();
    let lastSwitch = 0;

    await new Promise<void>(resolve => {
      const frame = (now: number) => {
        const progress = Math.min((now - started) / 4800, 1);
        const interval = 55 + Math.pow(progress, 3) * 520;

        if (now - lastSwitch >= interval) {
          const candidates = pool.length ? pool : this.raffle.entries();
          this.activeEntry.set(
            candidates[Math.floor(Math.random() * candidates.length)] ?? winner
          );
          lastSwitch = now;
        }

        if (progress < 1) {
          requestAnimationFrame(frame);
        } else {
          resolve();
        }
      };

      requestAnimationFrame(frame);
    });

    this.activeEntry.set(winner);
    await this.sleep(320);
    this.stageState.set('reveal');
  }

  async drawNext() {
    this.stageState.set('idle');
    await this.sleep(250);
    await this.drawWinner();
  }

  resetStage() {
    this.stageState.set('idle');
    this.activeEntry.set(
      this.raffle.eligible()[0] ?? this.raffle.entries()[0] ?? null
    );
  }

  startNewRaffle() {
    this.raffle.resetWinners();
    this.stageState.set('idle');
    this.activeEntry.set(this.raffle.entries()[0] ?? null);
  }

  async exportWinner(winner: RaffleEntry) {
    if (this.exportingWinnerId()) return;

    if (typeof MediaRecorder === 'undefined') {
      this.exportMessage.set('Video export is not supported in this browser.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;

    const context = canvas.getContext('2d');
    if (!context || typeof canvas.captureStream !== 'function') {
      this.exportMessage.set('Canvas video export is not supported in this browser.');
      return;
    }

    this.exportingWinnerId.set(winner.id);
    this.exportMessage.set('Rendering 9:16 winner video…');

    try {
      const allEntries = this.raffle.entries();
      const pool = allEntries.filter(entry => entry.id !== winner.id);
      const displayPool = pool.length ? pool : allEntries;
      const images = new Map<string, HTMLImageElement>();

      const [brandBackground, brandLogo] = await Promise.all([
        this.loadImage('/kora-stage-bg.svg'),
        this.loadImage('/kora-logo.png')
      ]);

      await Promise.all(
        allEntries.map(async entry => {
          images.set(entry.id, await this.loadImage(entry.designUrl));
        })
      );

      const rouletteSequence = Array.from({ length: 52 }, (_, index) => {
        if (!displayPool.length) return winner;
        return displayPool[(index * 17 + 7) % displayPool.length];
      });

      const confetti = this.createExportConfetti();
      const stream = canvas.captureStream(30);
      const mimeType = this.pickRecordingMimeType();

      const recorder = new MediaRecorder(
        stream,
        mimeType
          ? { mimeType, videoBitsPerSecond: 8_000_000 }
          : { videoBitsPerSecond: 8_000_000 }
      );

      const chunks: BlobPart[] = [];
      recorder.ondataavailable = event => {
        if (event.data.size) chunks.push(event.data);
      };

      const finished = new Promise<Blob>(resolve => {
        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }));
        };
      });

      recorder.start(250);

      const totalDuration = 10_800;
      const started = performance.now();

      await new Promise<void>(resolve => {
        const drawFrame = (now: number) => {
          const elapsed = now - started;

          let phase: StageState = 'countdown';
          let countdownValue = 3;
          let entry = winner;

          if (elapsed < 2700) {
            countdownValue = 3 - Math.floor(elapsed / 900);
          } else if (elapsed < 7500) {
            phase = 'spinning';
            const spinProgress = (elapsed - 2700) / 4800;
            const eased = 1 - Math.pow(1 - spinProgress, 2.4);
            const sequenceIndex = Math.min(
              rouletteSequence.length - 1,
              Math.floor(eased * rouletteSequence.length)
            );
            entry = rouletteSequence[sequenceIndex] ?? winner;
          } else {
            phase = 'reveal';
            entry = winner;
          }

          this.renderExportFrame(
            context,
            canvas,
            phase,
            countdownValue,
            entry,
            images.get(entry.id) ?? images.get(winner.id)!,
            Math.max(0, elapsed - 7500),
            confetti,
            brandBackground,
            brandLogo
          );

          if (elapsed < totalDuration) {
            requestAnimationFrame(drawFrame);
          } else {
            resolve();
          }
        };

        requestAnimationFrame(drawFrame);
      });

      recorder.stop();
      const blob = await finished;
      stream.getTracks().forEach(track => track.stop());

      const extension = (recorder.mimeType || '').includes('mp4') ? 'mp4' : 'webm';
      const safeName = winner.name
        .trim()
        .replace(/[^a-z0-9-_]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || 'winner';

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `raffle-${safeName}-9x16.${extension}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      window.setTimeout(() => URL.revokeObjectURL(url), 5000);

      this.exportMessage.set(
        extension === 'mp4'
          ? 'Instagram-ready 9:16 clip exported.'
          : '9:16 clip exported as WebM. Convert to MP4 if Instagram does not accept it.'
      );
    } catch (error) {
      console.error('Winner export failed', error);
      this.exportMessage.set('Could not export this winner video.');
    } finally {
      this.exportingWinnerId.set(null);
    }
  }

  private renderExportFrame(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    phase: StageState,
    countdownValue: number,
    entry: RaffleEntry,
    image: HTMLImageElement,
    revealElapsed: number,
    confetti: ConfettiPiece[],
    brandBackground: HTMLImageElement,
    brandLogo: HTMLImageElement
  ) {
    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    this.drawImageCover(ctx, brandBackground, 0, 0, width, height);

    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.filter = 'invert(1)';
    ctx.drawImage(brandLogo, 390, 92, 300, 64);
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 24px sans-serif';
    ctx.fillText('OFFICIAL GIVEAWAY', width / 2, 245);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 70px sans-serif';
    const title = phase === 'reveal' ? 'WE HAVE A WINNER' : 'WHO TAKES IT?';
    ctx.fillText(title, width / 2, 340);

    if (phase === 'countdown') {
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(225,6,0,.95)';
      ctx.shadowBlur = 60;
      ctx.font = '700 360px sans-serif';
      ctx.fillText(String(countdownValue), width / 2, 1120);
      ctx.shadowBlur = 0;
      return;
    }

    const centerX = width / 2;
    const centerY = 900;
    const radius = phase === 'reveal' ? 330 : 300;

    if (phase === 'reveal') {
      const pulse = 1 + Math.sin(revealElapsed / 180) * 0.015;
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.scale(pulse, pulse);
      ctx.translate(-centerX, -centerY);

      const winnerGlow = ctx.createRadialGradient(
        centerX, centerY, 180,
        centerX, centerY, 470
      );
      winnerGlow.addColorStop(0, 'rgba(225,6,0,.28)');
      winnerGlow.addColorStop(1, 'rgba(225,6,0,0)');
      ctx.fillStyle = winnerGlow;
      ctx.beginPath();
      ctx.arc(centerX, centerY, 470, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.10)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.clip();
    this.drawImageCover(ctx, image, centerX - radius, centerY - radius, radius * 2, radius * 2);
    ctx.restore();

    ctx.lineWidth = phase === 'reveal' ? 8 : 4;
    ctx.strokeStyle = phase === 'reveal' ? '#e10600' : 'rgba(255,255,255,.34)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 8, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = phase === 'reveal' ? '#e10600' : '#ffffff';
    ctx.font = '700 28px sans-serif';
    ctx.fillText(phase === 'reveal' ? 'WINNER' : 'IN THE DRAW', centerX, 1340);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 78px sans-serif';
    this.drawFittedText(ctx, entry.name, centerX, 1445, 900, 78);

    ctx.fillStyle = '#a8b0bf';
    ctx.font = '500 36px sans-serif';
    ctx.fillText(entry.instagram ? '@' + entry.instagram : 'Design entry', centerX, 1515);

    if (phase === 'reveal') {
      this.drawExportConfetti(ctx, revealElapsed, confetti, width, height);
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 32px sans-serif';
      ctx.fillText('CONGRATULATIONS!', centerX, 1700);
    } else {
      ctx.fillStyle = '#a8b0bf';
      ctx.font = '500 28px sans-serif';
      ctx.fillText('Randomizing entries…', centerX, 1700);
    }

    ctx.fillStyle = 'rgba(255,255,255,.72)';
    ctx.font = '600 22px sans-serif';
    ctx.fillText('KORA · 9:16 INSTAGRAM RAFFLE', centerX, 1830);
  }

  private drawExportConfetti(
    ctx: CanvasRenderingContext2D,
    elapsed: number,
    pieces: ConfettiPiece[],
    width: number,
    height: number
  ) {
    const seconds = elapsed / 1000;

    for (const piece of pieces) {
      const y = (piece.y + seconds * piece.speed * 330) % (height + 180) - 90;
      const x = piece.x + Math.sin(seconds * 2 + piece.x) * 28;
      const rotation = piece.rotation + seconds * piece.spin;

      ctx.save();
      ctx.translate(x * width, y);
      ctx.rotate(rotation);
      ctx.fillStyle = `hsl(${piece.hue} 88% 68%)`;
      ctx.fillRect(-piece.size / 2, -piece.size, piece.size, piece.size * 2.2);
      ctx.restore();
    }
  }

  private createExportConfetti(): ConfettiPiece[] {
    return Array.from({ length: 90 }, (_, index) => ({
      x: ((index * 37) % 100) / 100,
      y: -((index * 71) % 900),
      speed: 0.65 + ((index * 13) % 70) / 100,
      size: 8 + (index % 8),
      rotation: ((index * 29) % 360) * Math.PI / 180,
      spin: 2 + (index % 5),
      hue: (index * 41) % 360
    }));
  }

  private drawImageCover(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    x: number,
    y: number,
    width: number,
    height: number
  ) {
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    const drawX = x + (width - drawWidth) / 2;
    const drawY = y + (height - drawHeight) / 2;

    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  }

  private drawFittedText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    startingSize: number
  ) {
    let fontSize = startingSize;
    while (fontSize > 38) {
      ctx.font = `700 ${fontSize}px sans-serif`;
      if (ctx.measureText(text).width <= maxWidth) break;
      fontSize -= 2;
    }
    ctx.fillText(text, x, y);
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Could not load raffle image'));
      image.src = url;
    });
  }

  private pickRecordingMimeType(): string {
    const candidates = [
      'video/mp4;codecs=avc1.42E01E',
      'video/mp4',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ];

    return candidates.find(type => MediaRecorder.isTypeSupported(type)) ?? '';
  }

  private sleep(ms: number) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
  }
}
