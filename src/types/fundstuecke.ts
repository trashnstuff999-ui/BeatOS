// Fundstücke: Songs im Altbestand, gegen das Archiv gehalten (scan_fundstuecke).

export type Ampel = "gruen" | "gelb" | "rot" | "grau";

export interface FundDatei {
  path: string;
  size: number;
  /** Sekunden seit 1970 */
  modified: number;
  flp: boolean;
  im_archiv: boolean;
}

export interface Fund {
  id: number | null;
  titel: string;
  key: string | null;
  bpm: number | null;
  ampel: Ampel;
  grund: string;
  archiv: string | null;
  /** Dateien ohne byte-gleiche Kopie im Archiv */
  nur_hier: number;
  /** Exporte zuerst, neueste zuerst */
  dateien: FundDatei[];
}
