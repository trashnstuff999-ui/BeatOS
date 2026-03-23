// src/components/create/SourceFilesCard.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Source Files Card - Audio and FLP file selection
// ═══════════════════════════════════════════════════════════════════════════════

import { FileAudio, FileCode, Timer, CheckCircle, Star, FolderOpen } from "lucide-react";
import { C, commonStyles } from "../../lib/theme";
import { Card, Label } from "../ui";
import type { AudioFileInfo, FlpFileInfo } from "../../types/create";

interface SourceFilesCardProps {
  audioFiles: AudioFileInfo[];
  selectedFile: string;
  setSelectedFile: (v: string) => void;
  flpFiles: FlpFileInfo[];
  selectedFlp: string;
  setSelectedFlp: (v: string) => void;
  editMode: boolean;
}

export function SourceFilesCard({
  audioFiles,
  selectedFile,
  setSelectedFile,
  flpFiles,
  selectedFlp,
  setSelectedFlp,
  editMode,
}: SourceFilesCardProps) {
  const getInputStyle = (base: React.CSSProperties): React.CSSProperties => ({
    ...base,
    opacity: editMode ? 1 : 0.6,
    cursor: editMode ? "pointer" : "not-allowed",
  });

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const hasFiles = audioFiles.length > 0 || flpFiles.length > 0;

  return (
    <Card accent={C.onSecondaryFixedVar}>
      <Label>Source Files</Label>

      {hasFiles ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          
          {/* Audio Selection */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <FileAudio size={14} color={C.mint} />
              <span style={{ fontSize: 10, fontWeight: 700, color: C.onSecondaryFixedVar, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Source Audio {audioFiles.length > 0 && `(${audioFiles.length})`}
              </span>
            </div>
            {audioFiles.length > 0 ? (
              <>
                <select
                  value={selectedFile}
                  onChange={e => setSelectedFile(e.target.value)}
                  disabled={!editMode}
                  style={getInputStyle({ ...commonStyles.input, width: "100%", padding: 12, fontSize: 13, appearance: "none" })}
                >
                  {audioFiles.map(f => (
                    <option key={f.path} value={f.path}>
                      {f.name} {f.is_untagged && "★"}
                    </option>
                  ))}
                </select>
                {selectedFile && (() => {
                  const file = audioFiles.find(f => f.path === selectedFile);
                  if (!file) return null;
                  return (
                    <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <Badge icon={<FileAudio size={10} />} text={file.extension.toUpperCase()} />
                      <Badge icon={<Timer size={10} />} text={formatFileSize(file.size)} />
                      {file.is_untagged && (
                        <Badge icon={<CheckCircle size={10} />} text="UNTAGGED" highlight />
                      )}
                    </div>
                  );
                })()}
              </>
            ) : (
              <span style={{ fontSize: 11, color: C.onSecondaryFixedVar, fontStyle: "italic" }}>No audio files found</span>
            )}
          </div>

          {/* FLP Selection */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <FileCode size={14} color={C.primary} />
              <span style={{ fontSize: 10, fontWeight: 700, color: C.onSecondaryFixedVar, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Source FLP {flpFiles.length > 0 && `(${flpFiles.length})`}
              </span>
            </div>
            {flpFiles.length > 0 ? (
              <>
                <select
                  value={selectedFlp}
                  onChange={e => setSelectedFlp(e.target.value)}
                  disabled={!editMode}
                  style={getInputStyle({ ...commonStyles.input, width: "100%", padding: 12, fontSize: 13, appearance: "none" })}
                >
                  {flpFiles.map(f => (
                    <option key={f.path} value={f.path}>
                      {f.name} {f.is_newest && "● NEWEST"} {f.is_master && "◆ MASTER"}
                    </option>
                  ))}
                </select>
                {selectedFlp && (() => {
                  const file = flpFiles.find(f => f.path === selectedFlp);
                  if (!file) return null;
                  return (
                    <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <Badge icon={<FileCode size={10} />} text="FLP" />
                      {file.size > 0 && <Badge icon={<Timer size={10} />} text={formatFileSize(file.size)} />}
                      {file.is_newest && <Badge icon={<CheckCircle size={10} />} text="NEWEST" highlight />}
                      {file.is_master && <Badge icon={<Star size={10} />} text="MASTER" />}
                    </div>
                  );
                })()}
              </>
            ) : (
              <span style={{ fontSize: 11, color: C.onSecondaryFixedVar, fontStyle: "italic" }}>No FLP files found in root</span>
            )}
          </div>
        </div>
      ) : (
        <div style={{
          padding: 24, borderRadius: 8,
          background: C.surfaceContainerLowest,
          border: `1px dashed ${C.border30}`,
          textAlign: "center",
        }}>
          <FolderOpen size={24} color={C.onSecondaryFixedVar} style={{ opacity: 0.5, marginBottom: 8 }} />
          <p style={{ margin: 0, fontSize: 12, color: C.onSecondaryFixedVar }}>
            Select a folder to detect source files
          </p>
        </div>
      )}
    </Card>
  );
}

// ─── Badge Helper ───────────────────────────────────────────────────────────

function Badge({ icon, text, highlight }: { icon: React.ReactNode; text: string; highlight?: boolean }) {
  return (
    <span style={{
      padding: "4px 8px",
      background: highlight ? "rgba(52,211,153,0.15)" : C.surfaceContainerHighest,
      borderRadius: 4,
      fontSize: 9, fontWeight: 700,
      color: highlight ? C.mint : C.onSurfaceVariant,
      display: "flex", alignItems: "center", gap: 4,
    }}>
      {icon} {text}
    </span>
  );
}
