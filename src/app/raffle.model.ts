export interface RaffleEntry { id:string; name:string; instagram:string; designUrl:string; won:boolean; }
export interface WinnerRecord { id:string; entry:RaffleEntry; drawnAt:string; }
