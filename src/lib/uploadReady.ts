// src/lib/uploadReady.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Was steht bei diesem Beat als Nächstes an? Eine Antwort statt einer
// Checkliste — der Kopf des Upload-Tabs zeigt sie rechts, mit einem Knopf,
// der genau dorthin führt.
//
// Vorher zählte hier eine Liste von Schritten („Es fehlt Infos, Files · 2/4").
// Die sagte, WAS fehlt, aber nicht, was man jetzt tun soll — und stand
// doppelt mit der Status-Karte darunter.
// ═══════════════════════════════════════════════════════════════════════════════

import type { UploadData } from "../types/upload";

export type NaechsterSchritt =
  | { art: "infos" }
  | { art: "audio" }
  | { art: "cover" }
  /** Bereit, aber für die offenen Plattformen noch kein Datum. */
  | { art: "termin" }
  /** Frühester Termin unter den noch offenen Plattformen. */
  | { art: "geplant"; datum: string }
  /** Alles hochgeladen; `datum` = letzter Upload, falls bekannt. */
  | { art: "fertig"; datum: string | null };

/** Die Reihenfolge ist die des Ablaufs: erst Infos, dann Dateien, dann Termin. */
export function naechsterSchritt({ beat, assets, uploads }: UploadData): NaechsterSchritt {
  const offen = uploads.filter(u => u.status !== "uploaded");
  if (offen.length === 0) {
    const daten = uploads.map(u => u.uploaded_at).filter((d): d is string => !!d).sort();
    return { art: "fertig", datum: daten[daten.length - 1] ?? null };
  }
  if (!beat.type_beat_main?.trim() || !beat.genre_tags?.trim()) return { art: "infos" };
  if (!assets.mp3 && !assets.wav) return { art: "audio" };
  if (!assets.cover) return { art: "cover" };
  const termine = offen.map(u => u.scheduled_at).filter((d): d is string => !!d).sort();
  return termine.length ? { art: "geplant", datum: termine[0] } : { art: "termin" };
}

/** Der Kopf löst Aktionen in anderen Karten aus (Asset-Picker, Release-
 *  Assistent), ohne deren Zustand quer durch die Seite zu reichen. */
export const UPLOAD_AKTION = "beatos:upload-aktion";
export type UploadAktion = { art: "cover" } | { art: "release" };

export function uploadAktion(a: UploadAktion) {
  window.dispatchEvent(new CustomEvent<UploadAktion>(UPLOAD_AKTION, { detail: a }));
}
