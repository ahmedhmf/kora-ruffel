export type RaffleMediaType = 'image' | 'video';

export interface RaffleEntry {
  id:string;
  name:string;
  instagram:string;
  designUrl:string;
  mediaType?:RaffleMediaType;
  won:boolean;
}

export interface WinnerRecord {
  id:string;
  entry:RaffleEntry;
  drawnAt:string;
}
