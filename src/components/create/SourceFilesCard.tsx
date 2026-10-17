// src/components/create/SourceFilesCard.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Source Files Card - Audio and FLP file selection
// ═══════════════════════════════════════════════════════════════════════════════

import { FileAudio, FileCode, Timer, CheckCircle, Star, FolderOpen } from "lucide-react";
import { C, commonStyles, alpha, radius } from "../../lib/theme";
import { SectionCard } from "../ui/SectionCard";
import { Select } from "../ui";
import { formatFileSize } from "../../lib/archive";
import type { AudioFileInfo, FlpFileInfo } from "../../types/create";

interface SourceFilesCardProps {
  audioFiles: AudioFileInfo[];
  selectedFile: string;
  setSelectedFile: (v: string) => void;
  flpFiles: FlpFileInfo[];
  selectedFlp: string;
  setSelectedFlp: (v: string) => void;
}

export function SourceFilesCard({
  audioFiles,
  selectedFile,
  setSelectedFile,
  flpFiles,
  selectedFlp,
  setSelectedFlp,
}: SourceFilesCardProps) {
  const hasFiles = audioFiles.length > 0 || flpFiles.length > 0;

  return (
    <SectionCard icon={FolderOpen} title="Quelldateien">

      {hasFiles ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Audio Selection */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <FileAudio size={14} color={C.mint} />
              <span style={{ fontSize: 10, fontWeight: 700, color: C.onSecondaryFixedVar, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Quell-Audio {audioFiles.length > 0 && `(${audioFiles.length})`}
              </span>
            </div>
            {audioFiles.length > 0 ? (
              <>
                <Select
                  value={selectedFile}
                  onChange={setSelectedFile}
                  options={audioFiles.map(f => ({
                    value: f.path,
                    label: f.is_untagged ? `★ ${f.name}` : f.name,
                  }))}
                  triggerStyle={{ ...commonStyles.input, width: "100%", padding: 12, fontSize: 12, display: "flex" }}
                />
                {selectedFile && (() => {
                  const file = audioFiles.find(f => f.path === selectedFile);
                  if (!file) return null;
                  return (
                    <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <Badge icon={<FileAudio size={10} />} text={file.extension.toUpperCase()} />
                      <Badge icon={<Timer size={10} />} text={formatFileSize(file.size)} />
                      {file.is_untagged && (
                        <Badge icon={<CheckCircle size={10} />} text="OHNE TAG" highlight />
                      )}
                    </div>
                  );
                })()}
              </>
            ) : (
              <span style={{ fontSize: 11, color: C.onSecondaryFixedVar, fontStyle: "italic" }}>Keine Audiodateien gefunden</span>
            )}
          </div>

          {/* FLP Selection */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <FileCode size={14} color={C.primary} />
              <span style={{ fontSize: 10, fontWeight: 700, color: C.onSecondaryFixedVar, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Quell-FLP {flpFiles.length > 0 && `(${flpFiles.length})`}
              </span>
            </div>
            {flpFiles.length > 0 ? (
              <>
                <Select
                  value={selectedFlp}
                  onChange={setSelectedFlp}
                  options={flpFiles.map(f => ({
                    value: f.path,
                    label: [f.name, f.is_newest && "● neueste", f.is_master && "◆ Master"]
                      .filter(Boolean).join("  "),
                  }))}
                  triggerStyle={{ ...commonStyles.input, width: "100%", padding: 12, fontSize: 12, display: "flex" }}
                />
                {selectedFlp && (() => {
                  const file = flpFiles.find(f => f.path === selectedFlp);
                  if (!file) return null;
                  return (
                    <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <Badge icon={<FileCode size={10} />} text="FLP" />
                      {file.size > 0 && <Badge icon={<Timer size={10} />} text={formatFileSize(file.size)} />}
                      {file.is_newest && <Badge icon={<CheckCircle size={10} />} text="NEUESTE" highlight />}
                      {file.is_master && <Badge icon={<Star size={10} />} text="MASTER" />}
                    </div>
                  );
                })()}
              </>
            ) : (
              <span style={{ fontSize: 11, color: C.onSecondaryFixedVar, fontStyle: "italic" }}>Keine FLP im Hauptordner gefunden</span>
            )}
          </div>
        </div>
      ) : (
        <div style={{
          padding: 24, borderRadius: radius.control,
          background: C.surfaceContainerLowest,
          border: `1px dashed ${C.border30}`,
          textAlign: "center",
        }}>
          <FolderOpen size={24} color={C.onSecondaryFixedVar} style={{ opacity: 0.5, marginBottom: 8 }} />
          <p style={{ margin: 0, fontSize: 12, color: C.onSecondaryFixedVar }}>
            Ordner wählen, um Quelldateien zu erkennen
          </p>
        </div>
      )}
    </SectionCard>
  );
}

// ─── Badge Helper ───────────────────────────────────────────────────────────

function Badge({ icon, text, highlight }: { icon: React.ReactNode; text: string; highlight?: boolean }) {
  return (
    <span style={{
      padding: "4px 8px",
      background: highlight ? alpha(C.mint, 0.15) : C.surfaceContainerHighest,
      borderRadius: radius.control,
      fontSize: 10, fontWeight: 700,
      color: highlight ? C.mint : C.onSurfaceVariant,
      display: "flex", alignItems: "center", gap: 4,
    }}>
      {icon} {text}
    </span>
  );
}
