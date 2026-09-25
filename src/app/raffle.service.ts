import { Injectable, computed, signal } from '@angular/core';
import { RaffleEntry, WinnerRecord } from './raffle.model';

const STORAGE_KEY = 'raffle-studio-v1';

@Injectable({ providedIn: 'root' })
export class RaffleService {
  readonly entries = signal<RaffleEntry[]>(this.load().entries);
  readonly winners = signal<WinnerRecord[]>(this.load().winners);
  readonly eligible = computed(() => this.entries().filter(e => !e.won));

  add(entry: Omit<RaffleEntry, 'id' | 'won'>) {
    this.entries.update(items => [...items, { ...entry, id: crypto.randomUUID(), won: false }]);
    this.persist();
  }
  remove(id:string) {
    this.entries.update(items => items.filter(e => e.id !== id));
    this.winners.update(items => items.filter(w => w.entry.id !== id));
    this.persist();
  }
  resetWinners() { this.entries.update(items => items.map(e => ({...e,won:false}))); this.winners.set([]); this.persist(); }
  clearAll() { this.entries.set([]); this.winners.set([]); this.persist(); }
  selectWinner(): RaffleEntry | null {
    const pool=this.eligible(); if(!pool.length) return null;
    const winner=pool[this.secureRandomIndex(pool.length)];
    this.entries.update(items => items.map(e => e.id===winner.id ? {...e,won:true}:e));
    const record:WinnerRecord={id:crypto.randomUUID(),entry:{...winner,won:true},drawnAt:new Date().toISOString()};
    this.winners.update(items=>[...items,record]); this.persist(); return record.entry;
  }
  private secureRandomIndex(max:number):number {
    if(max<=1) return 0; const range=0x100000000; const limit=range-(range%max); const values=new Uint32Array(1);
    do crypto.getRandomValues(values); while(values[0]>=limit); return values[0]%max;
  }
  private load():{entries:RaffleEntry[];winners:WinnerRecord[]} {
    try { const raw=localStorage.getItem(STORAGE_KEY); if(!raw) return {entries:[],winners:[]}; const parsed=JSON.parse(raw); return {entries:parsed.entries??[],winners:parsed.winners??[]}; }
    catch { return {entries:[],winners:[]}; }
  }
  private persist() { try { localStorage.setItem(STORAGE_KEY,JSON.stringify({entries:this.entries(),winners:this.winners()})); } catch(error){ console.warn('Raffle Studio could not persist data.',error); } }
}
