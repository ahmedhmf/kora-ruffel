import { Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RaffleEntry } from './raffle.model';
import { RaffleService } from './raffle.service';

type StageState = 'idle' | 'countdown' | 'spinning' | 'reveal';

@Component({selector:'app-root',imports:[FormsModule],templateUrl:'./app.component.html',styleUrl:'./app.component.css'})
export class AppComponent {
  readonly raffle=inject(RaffleService);
  readonly stageState=signal<StageState>('idle');
  readonly stageOpen=signal(false);
  readonly activeEntry=signal<RaffleEntry|null>(null);
  readonly countdown=signal(3);
  readonly confetti=signal(Array.from({length:70},(_,i)=>i));
  readonly canDraw=computed(()=>this.raffle.eligible().length>0&&this.stageState()==='idle');

  name='';
  instagram='';
  readonly designUrl=signal('');
  readonly fileName=signal('');
  @ViewChild('stage') stage?:ElementRef<HTMLElement>;

  onFile(event:Event) {
    const input=event.target as HTMLInputElement; const file=input.files?.[0]; if(!file) return;
    this.fileName.set(file.name);
    const reader=new FileReader();
    reader.onload=()=>this.designUrl.set(String(reader.result??''));
    reader.readAsDataURL(file);
  }
  addEntry() {
    const name=this.name.trim();
    const designUrl=this.designUrl();
    if(!name||!designUrl) return;
    this.raffle.add({name,instagram:this.instagram.trim().replace(/^@/,''),designUrl});
    this.name='';
    this.instagram='';
    this.designUrl.set('');
    this.fileName.set('');
  }
  openStage() {
    if(!this.raffle.entries().length) return; this.stageOpen.set(true);
    this.activeEntry.set(this.raffle.eligible()[0]??this.raffle.entries()[0]);
    requestAnimationFrame(()=>this.stage?.nativeElement.requestFullscreen?.().catch(()=>undefined));
  }
  closeStage() {
    this.stageState.set('idle'); this.stageOpen.set(false);
    if(document.fullscreenElement) document.exitFullscreen().catch(()=>undefined);
  }
  async drawWinner() {
    if(!this.canDraw()) return; const winner=this.raffle.selectWinner(); if(!winner) return;
    const pool=this.raffle.entries().filter(e=>e.id!==winner.id);
    this.stageState.set('countdown');
    for(const n of [3,2,1]) { this.countdown.set(n); await this.sleep(650); }
    this.stageState.set('spinning');
    const started=performance.now(); let lastSwitch=0;
    await new Promise<void>(resolve=>{
      const frame=(now:number)=>{
        const progress=Math.min((now-started)/4800,1); const interval=55+Math.pow(progress,3)*520;
        if(now-lastSwitch>=interval) { const candidates=pool.length?pool:this.raffle.entries(); this.activeEntry.set(candidates[Math.floor(Math.random()*candidates.length)]??winner); lastSwitch=now; }
        if(progress<1) requestAnimationFrame(frame); else resolve();
      }; requestAnimationFrame(frame);
    });
    this.activeEntry.set(winner); await this.sleep(320); this.stageState.set('reveal');
  }
  async drawNext(){ this.stageState.set('idle'); await this.sleep(250); await this.drawWinner(); }
  resetStage(){ this.stageState.set('idle'); this.activeEntry.set(this.raffle.eligible()[0]??this.raffle.entries()[0]??null); }

  startNewRaffle(){
    this.raffle.resetWinners();
    this.stageState.set('idle');
    this.activeEntry.set(this.raffle.entries()[0]??null);
  }
  private sleep(ms:number){ return new Promise(resolve=>window.setTimeout(resolve,ms)); }
}
