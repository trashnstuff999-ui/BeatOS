// src/components/browse/EditBeatModal.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Edit Beat Modal - Full editing with Apply/Discard
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { X, Save, Loader2 } from "lucide-react";
import { C } from "../../lib/theme";
import { TagPill } from "./TagPill";
import type { Beat, BeatStatus, EditFormState, UpdateBeatParams } from "../../types/browse";
import { beatToEditForm, isFormDirty, stringifyTags } from "../../types/browse";

interface EditBeatModalProps {
  beat: Beat;
  isOpen: boolean;
  onClose: () => void;
  onSave: (params: UpdateBeatParams) => Promise<void>;
}

export function EditBeatModal({ beat, isOpen, onClose, onSave }: EditBeatModalProps) {
  // ─── Form State ────────────────────────────────────────────────────────────
  const [form, setForm] = useState<EditFormState>(beatToEditForm(beat));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newTag, setNewTag] = useState("");

  // Reset form when beat changes
  useEffect(() => {
    setForm(beatToEditForm(beat));
    setError(null);
  }, [beat]);

  const isDirty = isFormDirty(form, beat);

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const updateField = <K extends keyof EditFormState>(key: K, value: EditFormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const addTag = () => {
    const tag = newTag.trim();
    // Normalize: Title-Case with hyphens
    const normalized = tag
      .split(/[-\s]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join("-");
    
    if (normalized && !form.tags.some(t => t.toLowerCase() === normalized.toLowerCase())) {
      updateField("tags", [...form.tags, normalized]);
    }
    setNewTag("");
  };

  const removeTag = (tagToRemove: string) => {
    updateField("tags", form.tags.filter(t => t !== tagToRemove));
  };

  const handleDiscard = () => {
    setForm(beatToEditForm(beat));
    setError(null);
    onClose();
  };

  const handleApply = async () => {
    if (!isDirty) {
      onClose();
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const params: UpdateBeatParams = {
        id: beat.id,
        name: form.name,
        bpm: form.bpm ? parseFloat(form.bpm) : null,
        key: form.key || null,
        tags: stringifyTags(form.tags),
        notes: form.notes,
        sold_to: form.sold_to || null,
      };

      await onSave(params);
      onClose();
    } catch (e) {
      console.error("Failed to save beat:", e);
      setError(String(e));
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Keyboard Handling ─────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      if (e.key === "Escape") {
        e.preventDefault();
        handleDiscard();
      }
      
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleApply();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isDirty]);

  // ─── Styles ────────────────────────────────────────────────────────────────
  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.15em",
    color: C.onSecondaryFixedVar,
    marginBottom: 8,
    display: "block",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: C.surfaceContainerLow,
    border: `1px solid ${C.border10}`,
    borderRadius: 6,
    padding: "10px 14px",
    fontSize: 14,
    fontWeight: 500,
    color: C.onSurface,
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.2s",
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={e => {
        if (e.target === e.currentTarget) handleDiscard();
      }}
    >
      <div style={{
        background: C.surfaceContainerHigh,
        borderRadius: 16,
        width: 520,
        maxWidth: "90vw",
        maxHeight: "85vh",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        border: `1px solid ${C.border20}`,
      }}>
        {/* ═══════════════════════════════════════════════════════════════════
            Header
        ═══════════════════════════════════════════════════════════════════ */}
        <div style={{
          padding: "20px 24px",
          borderBottom: `1px solid ${C.border10}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <div>
            <h2 style={{
              fontSize: 18,
              fontWeight: 700,
              color: C.onSurface,
              margin: 0,
            }}>
              Edit Beat
            </h2>
            <span style={{
              fontSize: 11,
              fontFamily: "monospace",
              color: C.primary,
            }}>
              #{beat.id}
            </span>
          </div>
          <button
            onClick={handleDiscard}
            style={{
              background: C.surfaceContainer,
              border: "none",
              borderRadius: 6,
              padding: 8,
              cursor: "pointer",
              display: "flex",
            }}
          >
            <X size={18} color={C.onSurfaceVariant} />
          </button>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            Form Content
        ═══════════════════════════════════════════════════════════════════ */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}>
          {/* Error Banner */}
          {error && (
            <div style={{
              padding: 12,
              borderRadius: 8,
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              fontSize: 12,
              color: "#ef4444",
            }}>
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label style={labelStyle}>Name</label>
            <input
              value={form.name}
              onChange={e => updateField("name", e.target.value)}
              style={inputStyle}
              onFocus={e => (e.currentTarget.style.borderColor = C.primary)}
              onBlur={e => (e.currentTarget.style.borderColor = C.border10)}
            />
          </div>

          {/* BPM / Key */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={labelStyle}>BPM</label>
              <input
                type="number"
                value={form.bpm}
                onChange={e => updateField("bpm", e.target.value)}
                placeholder="e.g. 140"
                style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderColor = C.primary)}
                onBlur={e => (e.currentTarget.style.borderColor = C.border10)}
              />
            </div>
            <div>
              <label style={labelStyle}>Key</label>
              <input
                value={form.key}
                onChange={e => updateField("key", e.target.value)}
                placeholder="e.g. Cm, F#m"
                style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderColor = C.primary)}
                onBlur={e => (e.currentTarget.style.borderColor = C.border10)}
              />
            </div>
          </div>

          {/* Tags - with category colors */}
          <div>
            <label style={labelStyle}>Tags</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
              {form.tags.map(tag => (
                <TagPill 
                  key={tag} 
                  tag={tag} 
                  onRemove={() => removeTag(tag)} 
                />
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Add tag..."
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={addTag}
                disabled={!newTag.trim()}
                style={{
                  padding: "10px 16px",
                  borderRadius: 6,
                  background: newTag.trim() ? C.primary : C.surfaceContainer,
                  border: "none",
                  cursor: newTag.trim() ? "pointer" : "not-allowed",
                  fontSize: 12,
                  fontWeight: 600,
                  color: newTag.trim() ? "#4e2d00" : C.onSecondaryFixedVar,
                }}
              >
                Add
              </button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>Production Notes</label>
            <textarea
              value={form.notes}
              onChange={e => updateField("notes", e.target.value)}
              placeholder="Add notes about plugins, inspiration, samples used..."
              rows={4}
              style={{
                ...inputStyle,
                resize: "vertical",
                lineHeight: 1.6,
              }}
              onFocus={e => (e.currentTarget.style.borderColor = C.primary)}
              onBlur={e => (e.currentTarget.style.borderColor = C.border10)}
            />
          </div>

          {/* Sold To */}
          <div>
            <label style={labelStyle}>Sold To</label>
            <input
              value={form.sold_to}
              onChange={e => updateField("sold_to", e.target.value)}
              placeholder="Artist / Label name"
              style={inputStyle}
              onFocus={e => (e.currentTarget.style.borderColor = C.primary)}
              onBlur={e => (e.currentTarget.style.borderColor = C.border10)}
            />
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            Footer
        ═══════════════════════════════════════════════════════════════════ */}
        <div style={{
          padding: "16px 24px",
          borderTop: `1px solid ${C.border10}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          {/* Dirty Indicator */}
          <div style={{ fontSize: 11, color: C.onSecondaryFixedVar }}>
            {isDirty && (
              <span style={{ color: C.primary }}>● Unsaved changes</span>
            )}
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleDiscard}
              style={{
                padding: "10px 20px",
                borderRadius: 6,
                background: "transparent",
                border: `1px solid ${C.border30}`,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                color: C.onSurfaceVariant,
              }}
            >
              Discard
            </button>
            <button
              onClick={handleApply}
              disabled={!isDirty || isSaving}
              style={{
                padding: "10px 24px",
                borderRadius: 6,
                background: isDirty ? C.primary : C.surfaceContainer,
                border: "none",
                cursor: isDirty && !isSaving ? "pointer" : "not-allowed",
                fontSize: 12,
                fontWeight: 700,
                color: isDirty ? "#4e2d00" : C.onSecondaryFixedVar,
                display: "flex",
                alignItems: "center",
                gap: 8,
                opacity: isSaving ? 0.7 : 1,
              }}
            >
              {isSaving ? (
                <>
                  <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={14} />
                  Apply Changes
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Spinner Animation */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
