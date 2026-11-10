// Fundstücke: Songs im Altbestand, gegen das Archiv gehalten (scan_fundstuecke).

export type Ampel = "gruen" | "gelb" | "rot" | "grau";

export interface FundDatei {
  path: string;
  size: number;
  /** Sekunden seit 1970 */
  modified: number;
  flp: boolean;
  im_archiv: boolean;
  /** Was der Dateiname hergibt: zum Aufteilen gemischter Einträge */
  titel: string | null;
  key: string | null;
  bpm: number | null;
  /** Archiv-Beat, in dem diese Datei schon liegt */
  archiv: string | null;
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
  /** Ältester Export (JJJJ-MM-TT) */
  fertig: string | null;
  /** Exporte zuerst, neueste zuerst */
  dateien: FundDatei[];
  /** Als „Weg“ markiert: bleibt im Altbestand */
  weg: boolean;
}

export interface EinsammelEintrag {
  id: number | null;
  titel: string;
  key: string | null;
  bpm: number | null;
  dateien: string[];
  /** Bei Grau: Archivordner für die Reste */
  archiv?: string | null;
}

/** archiv = Grün ins Archiv, remix = Rot nach 07_REMIXES, reste = Grau nach 02_OLD */
export type EinsammelArt = "archiv" | "remix" | "reste" | "sample";

export interface EinsammelErgebnis {
  fertig: { beat_id: string; ordner: string; dateien: [string, number][] }[];
  /** „Titel: Grund" */
  ausgelassen: string[];
  fehler: string | null;
  protokoll: string | null;
}
