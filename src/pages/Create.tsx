// src/pages/Create.tsx — Full Tag System with Custom Tags DB Support
import { useState, useMemo, useEffect } from "react";
import { RefreshCw, Search, Bell, FolderOpen, Network, FileAudio, Timer, Info, X, ImagePlus, Music, Sparkles, Piano, Tag } from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════
// Import Tag System
// ═══════════════════════════════════════════════════════════════════════════
import {
  type TagCategory,
  type CustomTag,
  getTagColors,
  PRESET_TAGS,
  searchAllTags,
  normalizeTag,
  CATEGORY_LABELS,
  isPresetTag,
  prepareCustomTagForDb,
} from "../lib/tags";

// ═══════════════════════════════════════════════════════════════════════════
// Tauri Imports (für DB-Zugriff)
// ═══════════════════════════════════════════════════════════════════════════
// import { invoke } from "@tauri-apps/api/core";

// ═══════════════════════════════════════════════════════════════════════════
// Design Tokens
// ═══════════════════════════════════════════════════════════════════════════
const C = {
  background:             "#0e0e0e",
  surfaceContainerLow:    "#131313",
  surfaceContainer:       "#1a1919",
  surfaceContainerHigh:   "#201f1f",
  surfaceContainerHighest:"#262626",
  surfaceContainerLowest: "#000000",
  primary:                "#fda124",
  primaryContainer:       "#e48c03",
  tertiary:               "#9492ff",
  mint:                   "#34d399",
  onSurface:              "#ffffff",
  onSurfaceVariant:       "#adaaaa",
  onSecondaryFixedVar:    "#5c5b5b",
  outlineVariant:         "#484847",
  border10:               "rgba(72,72,71,0.10)",
  border15:               "rgba(72,72,71,0.15)",
  border20:               "rgba(72,72,71,0.20)",
  border30:               "rgba(72,72,71,0.30)",
} as const;

// Status button config
const STATUS_ITEMS = [
  { key: "idea",     label: "Idea",     color: C.tertiary },
  { key: "wip",      label: "WIP",      color: C.primary },
  { key: "finished", label: "Finished", color: "#22c55e" },
  { key: "sold",     label: "Sold",     color: "#ff7351" },
] as const;

// Mock source files (wird später durch DB ersetzt)
const SOURCE_FILES = [
  "Midnight_Drift_V3_140BPM.wav",
  "Midnight_Drift_Master_Final.mp3",
  "Midnight_Drift_V1_Sketch.wav",
];

// Category Icons mapping
const CATEGORY_ICONS: Record<TagCategory, React.ReactNode> = {
  genre: <Music size={12} />,
  vibe: <Sparkles size={12} />,
  instrument: <Piano size={12} />,
  other: <Tag size={12} />,
};

// Anzahl der Quick-Add Tags pro Kategorie
const QUICK_ADD_LIMIT = 10;

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════
export default function Create() {
  // ─── Mode State ────────────────────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);

  // ─── Form State ────────────────────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [key, setKey] = useState("");
  const [bpm, setBpm] = useState("");
  const [catalogId, setCatalogId] = useState("");
  const [status, setStatus] = useState<string>("idea");
  const [notes, setNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState(SOURCE_FILES[0]);

  // ─── Tags State ────────────────────────────────────────────────────────────
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // ─── Custom Tags from DB ───────────────────────────────────────────────────
  const [customTags, setCustomTags] = useState<CustomTag[]>([]);
  const [pendingCustomTags, setPendingCustomTags] = useState<string[]>([]);

  // ─── Cover Image State ─────────────────────────────────────────────────────
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // ─── Live Preview Values ───────────────────────────────────────────────────
  const previewTitle = title || "MIDNIGHT DRIFT";
  const previewKey = key || "C min";
  const previewBpm = bpm || "140";
  const previewId = catalogId || "#8241";

  // ─── Load Custom Tags from DB on Mount ─────────────────────────────────────
  useEffect(() => {
    // TODO: Uncomment when Rust command is ready
    // async function loadCustomTags() {
    //   try {
    //     const tags = await invoke<CustomTag[]>("get_custom_tags");
    //     setCustomTags(tags);
    //   } catch (err) {
    //     console.error("Failed to load custom tags:", err);
    //   }
    // }
    // loadCustomTags();
  }, []);

  // ─── Tag Suggestions (filtered by input, includes custom tags) ─────────────
  const tagSuggestions = useMemo(() => {
    if (!tagInput.trim()) return [];
    return searchAllTags(tagInput, customTags)
      .filter(preset => !tags.includes(preset.tag))
      .slice(0, 8);
  }, [tagInput, tags, customTags]);

  // ─── Quick-Add Tags (Presets + Custom, not already selected) ───────────────
  const quickAddTags = useMemo(() => {
    const result: Record<TagCategory, string[]> = {
      genre: [],
      vibe: [],
      instrument: [],
      other: [],
    };
    
    // Erst Presets hinzufügen
    for (const [category, presetTags] of Object.entries(PRESET_TAGS)) {
      result[category as TagCategory] = presetTags
        .filter(t => !tags.includes(t))
        .slice(0, QUICK_ADD_LIMIT);
    }
    
    // Custom Tags hinzufügen (sortiert nach usage_count)
    const sortedCustom = [...customTags].sort((a, b) => b.usage_count - a.usage_count);
    for (const ct of sortedCustom) {
      const cat = ct.category;
      if (!tags.includes(ct.display_name) && result[cat].length < QUICK_ADD_LIMIT) {
        // Nur hinzufügen wenn nicht bereits ein Preset
        if (!PRESET_TAGS[cat].includes(ct.display_name)) {
          result[cat].push(ct.display_name);
        }
      }
    }
    
    return result;
  }, [tags, customTags]);

  // ─── Cover Drop Handlers ───────────────────────────────────────────────────
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (editMode) setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (!editMode) return;

    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCoverImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // ─── Tag Handlers ──────────────────────────────────────────────────────────
  const addTag = (tagToAdd?: string) => {
    const newTag = normalizeTag(tagToAdd || tagInput);
    if (newTag && !tags.includes(newTag)) {
      setTags([...tags, newTag]);
      setTagInput("");
      setShowSuggestions(false);
      
      // Prüfen ob es ein Custom Tag ist (nicht in Presets)
      if (!isPresetTag(newTag)) {
        // Merken für späteren DB-Insert beim Archivieren
        if (!pendingCustomTags.includes(newTag)) {
          setPendingCustomTags([...pendingCustomTags, newTag]);
        }
      }
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
    // Auch aus pending entfernen
    setPendingCustomTags(pendingCustomTags.filter(t => t !== tagToRemove));
  };

  // ─── Save Custom Tags to DB (called during archive) ────────────────────────
  const saveCustomTagsToDb = async () => {
    for (const tag of pendingCustomTags) {
      const prepared = prepareCustomTagForDb(tag);
      // TODO: Uncomment when Rust command is ready
      // try {
      //   await invoke("save_custom_tag", {
      //     tag: prepared.tag,
      //     displayName: prepared.display_name,
      //     category: prepared.category,
      //   });
      // } catch (err) {
      //   console.error("Failed to save custom tag:", err);
      // }
      console.log("Would save custom tag:", prepared);
    }
    setPendingCustomTags([]);
  };

  // ─── Input Style Helper ────────────────────────────────────────────────────
  const getInputStyle = (baseStyle: React.CSSProperties): React.CSSProperties => ({
    ...baseStyle,
    opacity: editMode ? 1 : 0.6,
    cursor: editMode ? "text" : "not-allowed",
  });

  // ─── Tag Pill Component (inline) ───────────────────────────────────────────
  const TagPill = ({ tag, removable = false }: { tag: string; removable?: boolean }) => {
    const colors = getTagColors(tag);
    const isCustom = !isPresetTag(tag);
    
    return (
      <span
        style={{
          padding: "5px 10px",
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          borderRadius: 9999,
          fontSize: 11,
          fontWeight: 600,
          color: colors.text,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          transition: "all 0.15s",
        }}
      >
        {/* Custom Tag Indicator */}
        {isCustom && (
          <span style={{ opacity: 0.6, fontSize: 9 }}>✦</span>
        )}
        {tag}
        {removable && editMode && (
          <button
            onClick={() => removeTag(tag)}
            style={{
              background: "none",
              border: "none",
              color: colors.text,
              cursor: "pointer",
              padding: 0,
              display: "flex",
              opacity: 0.7,
              transition: "opacity 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = "1"; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = "0.7"; }}
          >
            <X size={12} />
          </button>
        )}
      </span>
    );
  };

  // ─── Quick Add Button Component (inline) ───────────────────────────────────
  const QuickAddButton = ({ tag }: { tag: string }) => {
    const colors = getTagColors(tag);
    const isCustom = !isPresetTag(tag);
    
    return (
      <button
        onClick={() => addTag(tag)}
        style={{
          padding: "4px 10px",
          background: "transparent",
          border: `1px solid ${colors.border}`,
          borderRadius: 9999,
          fontSize: 10,
          fontWeight: 600,
          color: colors.text,
          cursor: "pointer",
          transition: "all 0.15s",
          opacity: 0.7,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = colors.bg;
          e.currentTarget.style.opacity = "1";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.opacity = "0.7";
        }}
      >
        {isCustom && <span style={{ fontSize: 8 }}>✦</span>}
        + {tag}
      </button>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", background: C.background }}>

      {/* ═══════════════════════════════════════════════════════════════════════
          TopNavBar — Edit/View Toggle + ARCHIVE PORTAL
      ═══════════════════════════════════════════════════════════════════════ */}
      <header style={{
        height: 64, flexShrink: 0,
        background: "rgba(14,14,14,0.7)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "0 32px",
        borderBottom: `1px solid ${C.border15}`,
        zIndex: 40,
      }}>
        {/* Left: Edit/View Toggle + Title */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* Segmented Control */}
          <div style={{
            display: "flex",
            background: C.surfaceContainerHighest,
            borderRadius: 6,
            padding: 3,
            gap: 2,
          }}>
            {(["VIEW", "EDIT"] as const).map((mode) => {
              const isActive = (mode === "EDIT") === editMode;
              return (
                <button
                  key={mode}
                  onClick={() => setEditMode(mode === "EDIT")}
                  style={{
                    padding: "8px 20px",
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    border: "none",
                    cursor: "pointer",
                    transition: "all 0.2s ease-out",
                    transform: "scale(1)",
                    background: isActive ? C.primary : "transparent",
                    color: isActive ? "#4e2d00" : C.onSurfaceVariant,
                    fontFamily: "Inter, sans-serif",
                  }}
                  onMouseDown={(e) => {
                    e.currentTarget.style.transform = "scale(0.97)";
                  }}
                  onMouseUp={(e) => {
                    e.currentTarget.style.transform = "scale(1)";
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = "#2a2a2a";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.transform = "scale(1)";
                  }}
                >
                  {mode}
                </button>
              );
            })}
          </div>

          {/* Title */}
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: C.onSurfaceVariant }}>
            Archive Portal
          </span>
        </div>

        {/* Right: Icons + Avatar */}
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, color: C.onSurfaceVariant }}>
            {[RefreshCw, Search].map((Icon, i) => (
              <Icon
                key={i} size={18} strokeWidth={1.5}
                style={{ cursor: "pointer", transition: "color 0.15s" }}
                onMouseEnter={e => (e.currentTarget.style.color = C.primary)}
                onMouseLeave={e => (e.currentTarget.style.color = C.onSurfaceVariant)}
              />
            ))}
            {/* Bell with orange dot */}
            <div style={{ position: "relative" }}>
              <Bell size={18} strokeWidth={1.5} style={{ cursor: "pointer" }} />
              <span style={{ position: "absolute", top: 0, right: 0, width: 8, height: 8, background: C.primary, borderRadius: "50%", border: `2px solid ${C.background}` }} />
            </div>
          </div>

          {/* Avatar */}
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: C.surfaceContainerHighest,
            border: `1px solid ${C.border30}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden",
          }}>
            <span style={{ fontSize: 13, color: C.onSurfaceVariant, fontWeight: 700 }}>U</span>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════════
          Scrollable Main Content
      ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{ flex: 1, overflowY: "auto", padding: "32px 48px", paddingBottom: 100 }}>
        <div style={{ maxWidth: 1400, display: "flex", gap: 40 }}>

          {/* ── Left Column: 60% ─────────────────────────────────────────────── */}
          <div style={{ flex: "0 0 58%", display: "flex", flexDirection: "column", gap: 24 }}>

            {/* ─────────────────────────────────────────────────────────────────
                Card 1: Beat Information — Primary Accent
            ───────────────────────────────────────────────────────────────── */}
            <section style={{
              background: C.surfaceContainerLow, borderRadius: 12, padding: 24,
              borderRight: `4px solid ${C.primary}`,
              boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
              display: "flex", flexDirection: "column", gap: 24,
            }}>
              {/* Track Title */}
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: C.onSecondaryFixedVar, textTransform: "uppercase", letterSpacing: "0.15em", display: "block", marginBottom: 8 }}>
                  Track Title
                </label>
                <div style={{
                  display: "flex", alignItems: "center",
                  background: C.surfaceContainerLowest, borderRadius: 8,
                  border: `1px solid ${C.border20}`,
                  paddingRight: 16, transition: "border-color 0.2s",
                }}>
                  <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="ENTER BEAT NAME..."
                    disabled={!editMode}
                    style={getInputStyle({
                      flex: 1, background: "transparent", border: "none", outline: "none",
                      padding: 16, fontSize: 20, fontWeight: 500, letterSpacing: "-0.02em",
                      color: C.onSurface, fontFamily: "Inter, sans-serif",
                    })}
                    onFocus={e => { if (editMode) e.currentTarget.parentElement!.style.borderColor = C.primary; }}
                    onBlur={e => { e.currentTarget.parentElement!.style.borderColor = C.border20; }}
                  />
                </div>
              </div>

              {/* Key / BPM / Catalog ID */}
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-end", gap: 16 }}>
                {[
                  { label: "Key",        value: key,       set: setKey,       placeholder: "C min", w: 80,  mono: false },
                  { label: "BPM",        value: bpm,       set: setBpm,       placeholder: "140",   w: 80,  mono: false },
                  { label: "Catalog ID", value: catalogId, set: setCatalogId, placeholder: "#8241", w: 96,  mono: true  },
                ].map(({ label, value, set, placeholder, w, mono }) => (
                  <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    <label style={{ fontSize: 9, fontWeight: 700, color: C.onSecondaryFixedVar, textTransform: "uppercase", letterSpacing: "-0.02em" }}>
                      {label}
                    </label>
                    <input
                      value={value}
                      onChange={e => set(e.target.value)}
                      placeholder={placeholder}
                      disabled={!editMode}
                      style={getInputStyle({
                        width: w, background: C.surfaceContainerLowest,
                        border: `1px solid ${C.border20}`, borderRadius: 6,
                        padding: "8px 8px", fontSize: 14,
                        textAlign: "center", textTransform: "uppercase",
                        letterSpacing: "0.15em", outline: "none",
                        color: C.onSurface, fontFamily: mono ? "monospace" : "Inter, sans-serif",
                        transition: "border-color 0.2s",
                      })}
                      onFocus={e => { if (editMode) e.currentTarget.style.borderColor = C.primary; }}
                      onBlur={e => { e.currentTarget.style.borderColor = C.border20; }}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* ─────────────────────────────────────────────────────────────────
                Card 2: Production Status — Tertiary Accent
            ───────────────────────────────────────────────────────────────── */}
            <section style={{
              background: C.surfaceContainerLow, borderRadius: 12, padding: 24,
              borderRight: `4px solid ${C.tertiary}`,
            }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: C.onSecondaryFixedVar, textTransform: "uppercase", letterSpacing: "0.15em", display: "block", marginBottom: 16 }}>
                Production Status
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {STATUS_ITEMS.map(({ key: k, label, color }) => {
                  const isActive = status === k;
                  return (
                    <button
                      key={k}
                      onClick={() => { if (editMode) setStatus(k); }}
                      disabled={!editMode}
                      style={{
                        padding: "12px 8px", borderRadius: 6,
                        fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase",
                        border: "none", borderBottom: `2px solid ${isActive ? color : "transparent"}`,
                        background: isActive ? C.surfaceContainerHighest : C.surfaceContainer,
                        color: isActive ? color : C.onSurfaceVariant,
                        cursor: editMode ? "pointer" : "not-allowed",
                        opacity: editMode ? 1 : 0.6,
                        transition: "all 0.15s",
                        fontFamily: "Inter, sans-serif",
                      }}
                      onMouseEnter={e => { if (editMode && !isActive) e.currentTarget.style.background = C.surfaceContainerHighest; }}
                      onMouseLeave={e => { if (editMode && !isActive) e.currentTarget.style.background = C.surfaceContainer; }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* ─────────────────────────────────────────────────────────────────
                Card 3: Tags — Mint Accent — FULL TAG SYSTEM
            ───────────────────────────────────────────────────────────────── */}
            <section style={{
              background: C.surfaceContainerLow, borderRadius: 12, padding: 24,
              borderRight: `4px solid ${C.mint}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <label style={{ fontSize: 10, fontWeight: 700, color: C.onSecondaryFixedVar, textTransform: "uppercase", letterSpacing: "0.15em" }}>
                  Tags
                </label>
                {/* Pending Custom Tags Indicator */}
                {pendingCustomTags.length > 0 && (
                  <span style={{ 
                    fontSize: 9, 
                    color: C.mint, 
                    background: "rgba(52,211,153,0.1)",
                    padding: "2px 8px",
                    borderRadius: 9999,
                  }}>
                    ✦ {pendingCustomTags.length} new tag{pendingCustomTags.length > 1 ? "s" : ""} will be saved
                  </span>
                )}
              </div>

              {/* Selected Tags */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: tags.length > 0 ? 20 : 0 }}>
                {tags.map((tag) => (
                  <TagPill key={tag} tag={tag} removable />
                ))}
              </div>

              {/* Edit Mode: Tag Input + Quick Add */}
              {editMode && (
                <>
                  {/* Custom Tag Input with Suggestions */}
                  <div style={{ position: "relative", marginBottom: 20 }}>
                    <input
                      value={tagInput}
                      onChange={(e) => {
                        setTagInput(e.target.value);
                        setShowSuggestions(true);
                      }}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => {
                        setTimeout(() => setShowSuggestions(false), 150);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addTag();
                        }
                      }}
                      placeholder="Type to search or add custom tag..."
                      style={{
                        width: "100%",
                        background: C.surfaceContainerLowest,
                        border: `1px solid ${C.border20}`,
                        borderRadius: 8,
                        padding: "12px 16px",
                        fontSize: 13,
                        color: C.onSurface,
                        outline: "none",
                        transition: "border-color 0.2s",
                        boxSizing: "border-box",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = C.mint; }}
                      onMouseLeave={e => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderColor = C.border20; }}
                    />

                    {/* Suggestions Dropdown */}
                    {showSuggestions && tagSuggestions.length > 0 && (
                      <div style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        marginTop: 4,
                        background: C.surfaceContainerHighest,
                        border: `1px solid ${C.border30}`,
                        borderRadius: 8,
                        overflow: "hidden",
                        zIndex: 50,
                        boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
                      }}>
                        {tagSuggestions.map((preset) => {
                          const colors = getTagColors(preset.tag);
                          const isCustom = !isPresetTag(preset.tag);
                          return (
                            <button
                              key={preset.tag}
                              onClick={() => addTag(preset.tag)}
                              style={{
                                width: "100%",
                                padding: "10px 16px",
                                background: "transparent",
                                border: "none",
                                borderBottom: `1px solid ${C.border10}`,
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                cursor: "pointer",
                                transition: "background 0.1s",
                                textAlign: "left",
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = C.surfaceContainerHigh; }}
                              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                            >
                              <span style={{ color: colors.text }}>{CATEGORY_ICONS[preset.category]}</span>
                              <span style={{ color: C.onSurface, fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
                                {isCustom && <span style={{ opacity: 0.6, fontSize: 10 }}>✦</span>}
                                {preset.tag}
                              </span>
                              <span style={{ color: C.onSecondaryFixedVar, fontSize: 10, marginLeft: "auto", textTransform: "uppercase" }}>
                                {CATEGORY_LABELS[preset.category]}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* "Press Enter to add" hint when input has value but no exact match */}
                    {tagInput.trim() && !tagSuggestions.some(s => s.tag.toLowerCase() === tagInput.toLowerCase()) && (
                      <div style={{
                        position: "absolute",
                        right: 12,
                        top: "50%",
                        transform: "translateY(-50%)",
                        fontSize: 10,
                        color: C.onSecondaryFixedVar,
                        pointerEvents: "none",
                      }}>
                        Press Enter to add "{normalizeTag(tagInput)}"
                      </div>
                    )}
                  </div>

                  {/* Quick Add Section */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: C.onSecondaryFixedVar, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      Quick Add
                    </span>

                    {/* Category Rows */}
                    {(["genre", "vibe", "instrument"] as TagCategory[]).map((category) => {
                      const categoryTags = quickAddTags[category];
                      if (categoryTags.length === 0) return null;

                      const colors = getTagColors(categoryTags[0] || "");
                      
                      return (
                        <div key={category}>
                          {/* Category Label */}
                          <div style={{ 
                            display: "flex", 
                            alignItems: "center", 
                            gap: 6, 
                            marginBottom: 8,
                            color: colors.text,
                          }}>
                            {CATEGORY_ICONS[category]}
                            <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                              {CATEGORY_LABELS[category]}
                            </span>
                          </div>
                          
                          {/* Tags */}
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {categoryTags.map(tag => (
                              <QuickAddButton key={tag} tag={tag} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* View Mode: Empty State */}
              {!editMode && tags.length === 0 && (
                <span style={{ fontSize: 12, color: C.onSecondaryFixedVar, fontStyle: "italic" }}>
                  No tags added
                </span>
              )}
            </section>

            {/* ─────────────────────────────────────────────────────────────────
                Card 4: Source Files — Outline Accent
            ───────────────────────────────────────────────────────────────── */}
            <section style={{
              background: C.surfaceContainerLow, borderRadius: 12, padding: 24,
              borderRight: `4px solid ${C.outlineVariant}`,
            }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: C.onSecondaryFixedVar, textTransform: "uppercase", letterSpacing: "0.15em", display: "block", marginBottom: 16 }}>
                Source Files (Detected)
              </label>

              <div style={{ position: "relative" }}>
                <select
                  value={selectedFile}
                  onChange={e => setSelectedFile(e.target.value)}
                  disabled={!editMode}
                  style={getInputStyle({
                    width: "100%", background: C.surfaceContainerLowest,
                    border: `1px solid ${C.border20}`, borderRadius: 8,
                    padding: "16px 48px 16px 16px",
                    fontSize: 14, color: C.onSurfaceVariant,
                    appearance: "none", outline: "none",
                    fontFamily: "Inter, sans-serif",
                    transition: "border-color 0.2s",
                  })}
                  onFocus={e => { if (editMode) e.currentTarget.style.borderColor = C.primary; }}
                  onBlur={e => { e.currentTarget.style.borderColor = C.border20; }}
                >
                  {SOURCE_FILES.map(f => <option key={f} style={{ background: C.surfaceContainerHighest }}>{f}</option>)}
                </select>
                <div style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: C.onSurfaceVariant }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
              </div>

              <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                {[
                  { icon: <FileAudio size={12} />, text: "24-bit PCM" },
                  { icon: <Timer size={12} />,     text: "03:42" },
                ].map(({ icon, text }) => (
                  <span key={text} style={{
                    padding: "4px 8px", background: C.surfaceContainerHighest, borderRadius: 4,
                    fontSize: 9, fontWeight: 700, color: C.onSurfaceVariant,
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    {icon} {text}
                  </span>
                ))}
              </div>
            </section>

            {/* ─────────────────────────────────────────────────────────────────
                Card 5: Notes — Outline Accent
            ───────────────────────────────────────────────────────────────── */}
            <section style={{
              background: C.surfaceContainerLow, borderRadius: 12, padding: 24,
              borderRight: `4px solid ${C.outlineVariant}`,
            }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: C.onSecondaryFixedVar, textTransform: "uppercase", letterSpacing: "0.15em", display: "block", marginBottom: 16 }}>
                Internal Production Notes
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Add details about plugins used, inspiration, or intended artists..."
                rows={4}
                disabled={!editMode}
                style={getInputStyle({
                  width: "100%", background: C.surfaceContainerLowest,
                  border: `1px solid ${C.border20}`, borderRadius: 8,
                  padding: 16, fontSize: 14, color: C.onSurface,
                  resize: "none", outline: "none",
                  fontFamily: "Inter, sans-serif", lineHeight: 1.6,
                  transition: "border-color 0.2s",
                  boxSizing: "border-box",
                })}
                onFocus={e => { if (editMode) e.currentTarget.style.borderColor = C.primary; }}
                onBlur={e => { e.currentTarget.style.borderColor = C.border20; }}
              />
            </section>
          </div>

          {/* ── Right Column: 40% — Sticky Preview ───────────────────────────── */}
          <div style={{ flex: "0 0 38%", position: "sticky", top: 0, alignSelf: "flex-start" }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: C.primary, textTransform: "uppercase", letterSpacing: "0.3em", display: "block", marginBottom: 16 }}>
              Registry Preview
            </label>

            {/* Preview Card */}
            <div style={{ background: C.surfaceContainer, borderRadius: 12, overflow: "hidden", boxShadow: "0 25px 50px rgba(0,0,0,0.5)", border: `1px solid ${C.border10}` }}>
              {/* Cover area */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                  position: "relative",
                  paddingBottom: "100%",
                  background: C.surfaceContainerHighest,
                  border: isDragging ? `2px dashed ${C.primary}` : "2px solid transparent",
                  transition: "border-color 0.15s",
                  boxSizing: "border-box",
                }}
              >
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(to top, #000000 0%, transparent 50%, transparent 100%)",
                  zIndex: 2,
                  pointerEvents: "none",
                }} />

                {coverImage ? (
                  <img
                    src={coverImage}
                    alt="Cover"
                    style={{
                      position: "absolute", inset: 0,
                      width: "100%", height: "100%",
                      objectFit: "cover",
                      zIndex: 1,
                    }}
                  />
                ) : (
                  <div style={{
                    position: "absolute", inset: 0,
                    background: "linear-gradient(135deg, #1a1919 0%, #262626 50%, #1a1919 100%)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    zIndex: 1,
                  }}>
                    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="rgba(253,161,36,0.15)" strokeWidth="0.5">
                      <circle cx="12" cy="12" r="10"/>
                      <circle cx="12" cy="12" r="3"/>
                      <line x1="12" y1="2" x2="12" y2="22"/>
                      <line x1="2" y1="12" x2="22" y2="12"/>
                    </svg>
                  </div>
                )}

                {isDragging && (
                  <div style={{
                    position: "absolute", inset: 0,
                    background: "rgba(253,161,36,0.15)",
                    display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center",
                    gap: 8,
                    zIndex: 10,
                  }}>
                    <ImagePlus size={32} color={C.primary} strokeWidth={1.5} />
                    <span style={{ color: C.primary, fontWeight: 700, fontSize: 12, letterSpacing: "0.1em" }}>DROP IMAGE</span>
                  </div>
                )}

                {editMode && !coverImage && !isDragging && (
                  <div style={{
                    position: "absolute", inset: 0,
                    display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center",
                    gap: 8,
                    zIndex: 3,
                    pointerEvents: "none",
                  }}>
                    <ImagePlus size={24} color={C.onSurfaceVariant} strokeWidth={1.5} style={{ opacity: 0.5 }} />
                    <span style={{ color: C.onSurfaceVariant, fontSize: 10, opacity: 0.5 }}>Drag cover image here</span>
                  </div>
                )}

                <div style={{
                  position: "absolute", top: 16, right: 16, zIndex: 4,
                  background: C.primary, color: "#4e2d00",
                  fontSize: 10, fontWeight: 900,
                  padding: "4px 8px", borderRadius: 4,
                }}>
                  {previewId}
                </div>

                <div style={{ position: "absolute", bottom: 16, left: 16, right: 16, zIndex: 4 }}>
                  <h3 style={{ fontSize: 24, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em", color: "#fff", marginBottom: 6, lineHeight: 1 }}>
                    {previewTitle.toUpperCase()}
                  </h3>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 500, color: C.onSurfaceVariant }}>
                    <span>{previewKey}</span>
                    <div style={{ width: 4, height: 4, borderRadius: "50%", background: C.primary }} />
                    <span>{previewBpm} BPM</span>
                  </div>
                </div>
              </div>

              <div style={{ padding: 16, background: C.surfaceContainerLow }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, fontFamily: "monospace", color: C.onSecondaryFixedVar }}>
                  <FolderOpen size={14} strokeWidth={1.5} />
                  <span>/ARCHIVE/2024/TRAP/{previewTitle.toUpperCase().replace(/\s+/g, "_")}/</span>
                </div>
              </div>
            </div>

            <div style={{
              marginTop: 24, padding: 16, borderRadius: 8,
              background: "rgba(148,146,255,0.05)",
              border: `1px solid rgba(148,146,255,0.10)`,
              display: "flex", gap: 16, alignItems: "flex-start",
            }}>
              <Info size={18} color={C.tertiary} strokeWidth={1.5} style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 12, color: C.onSurfaceVariant, lineHeight: 1.6, margin: 0 }}>
                BeatOS will automatically generate standardized subfolders for Stems, MIDI, and Masters once structured.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          Bottom Action Bar — Fixed
      ═══════════════════════════════════════════════════════════════════════ */}
      <footer style={{
        height: 80, flexShrink: 0,
        background: "rgba(19,19,19,0.8)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderTop: `1px solid ${C.border15}`,
        padding: "0 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, color: C.onSurfaceVariant }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/>
          </svg>
          <span style={{ fontSize: 12, fontWeight: 500, letterSpacing: "-0.01em" }}>
            {editMode ? "Edit mode — changes enabled" : "View mode — read only"}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button style={{
            padding: "10px 24px", borderRadius: 8,
            fontSize: 14, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase",
            display: "flex", alignItems: "center", gap: 8,
            color: C.primary, background: "transparent", border: "none",
            cursor: "pointer", transition: "background 0.15s",
            fontFamily: "Inter, sans-serif",
          }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(253,161,36,0.05)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <FolderOpen size={16} strokeWidth={1.5} />
            SELECT FOLDER
          </button>

          <button
            disabled
            style={{
              padding: "10px 32px", borderRadius: 8,
              fontSize: 14, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase",
              display: "flex", alignItems: "center", gap: 8,
              color: C.onSecondaryFixedVar,
              background: C.surfaceContainerHighest,
              border: `1px solid ${C.border10}`,
              cursor: "not-allowed",
              fontFamily: "Inter, sans-serif",
            }}
          >
            <Network size={16} strokeWidth={1.5} />
            CREATE BEATSTRUCTURE
          </button>
        </div>
      </footer>
    </div>
  );
}