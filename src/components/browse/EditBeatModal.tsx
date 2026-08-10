// src/components/browse/EditBeatModal.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Edit Beat Modal - Full editing with Apply/Discard
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { Save, Pencil } from "lucide-react";
import { C, radius } from "../../lib/theme";
import { Modal, Button } from "../ui";
import { TagPill } from "../Tagpill";
import type { Beat, EditFormState, UpdateBeatParams } from "../../types/browse";
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
  // Esc liegt bei <Modal>. Hier bleibt nur Strg+Enter zum Speichern.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
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
    borderRadius: radius.control,
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
    <Modal
      icon={Pencil}
      title="Beat bearbeiten"
      subtitle={<span style={{ fontFamily: "monospace", color: C.primary }}>#{beat.id}</span>}
      onClose={handleDiscard}
      footerLeft={isDirty && <span style={{ color: C.primary }}>● Ungespeicherte Änderungen</span>}
      footer={
        <>
          <Button variant="secondary" onClick={handleDiscard}>
            Verwerfen
          </Button>
          <Button
            variant="primary"
            icon={Save}
            loading={isSaving}
            disabled={!isDirty}
            onClick={handleApply}
          >
            {isSaving ? "Speichern …" : "Änderungen übernehmen"}
          </Button>
        </>
      }
    >
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
                placeholder="z.B. 140"
                style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderColor = C.primary)}
                onBlur={e => (e.currentTarget.style.borderColor = C.border10)}
              />
            </div>
            <div>
              <label style={labelStyle}>Tonart</label>
              <input
                value={form.key}
                onChange={e => updateField("key", e.target.value)}
                placeholder="z.B. Cm, F#m"
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
                  removable
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
                placeholder="Tag hinzufügen …"
                style={{ ...inputStyle, flex: 1 }}
              />
              <Button variant="primary" onClick={addTag} disabled={!newTag.trim()}>
                Hinzufügen
              </Button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>Notizen</label>
            <textarea
              value={form.notes}
              onChange={e => updateField("notes", e.target.value)}
              placeholder="Notizen zu Plugins, Inspiration, verwendeten Samples …"
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
            <label style={labelStyle}>Verkauft an</label>
            <input
              value={form.sold_to}
              onChange={e => updateField("sold_to", e.target.value)}
              placeholder="Artist / Label"
              style={inputStyle}
              onFocus={e => (e.currentTarget.style.borderColor = C.primary)}
              onBlur={e => (e.currentTarget.style.borderColor = C.border10)}
            />
          </div>
    </Modal>
  );
}
