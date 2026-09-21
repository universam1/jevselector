import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/JetBrainsMono";
import scoresData from "./scores.json";
import agentsData from "./agents.json";

const { fontFamily } = loadFont("normal");

// ─── Palette ──────────────────────────────────────────────────────────────────
const BG      = "#0a0c10";
const SURFACE = "#111318";
const BORDER  = "#1f2330";
const ACCENT  = "#6366f1";
const ACCENT2 = "#22d3ee";
const TEXT    = "#e2e8f0";
const DIM     = "#4b5563";
const THRESHOLD = 0.5;
const TOKENS_BEFORE = 5672;

// ─── Per-scene timing constants ───────────────────────────────────────────────
// Scene 1 is a touch slower (viewers learning the pattern).
// Scenes 2-4 are tighter.

interface SceneTiming {
  promptStart: number;
  promptEnd: number;
  gridIn: number;
  scoresStart: number;
  scoresEnd: number;
  dropStart: number;
  dropEnd: number;
  counterStart: number;
  counterEnd: number;
  sceneEnd: number; // exclusive start of next scene / end card
}

// All values are LOCAL frame offsets within each scene.
const SCENE1_T: SceneTiming = {
  promptStart:  0,
  promptEnd:   35,
  gridIn:      40,
  scoresStart: 50,
  scoresEnd:  110,   // 60f for 34 skills → ~1.76f stagger
  dropStart:  118,
  dropEnd:    148,
  counterStart:154,
  counterEnd: 178,
  sceneEnd:   195,   // ~6.5s
};

// Scenes 2-4: faster everywhere
const SCENE_FAST_T: SceneTiming = {
  promptStart:  0,
  promptEnd:   26,
  gridIn:      30,
  scoresStart: 38,
  scoresEnd:   88,   // 50f for 34 skills → ~1.47f stagger
  dropStart:   96,
  dropEnd:    120,
  counterStart:126,
  counterEnd: 148,
  sceneEnd:   162,   // ~5.4s
};

// Scene 5 duration (multi-agent / pinned scene)
const SCENE5_FRAMES = 165; // ~5.5s

// End card duration (frames after last scene ends)
const END_CARD_FRAMES = 80; // ~2.7s

// Compute absolute scene start offsets
const SCENE_STARTS: number[] = [];
const SCENE_TIMINGS: SceneTiming[] = [SCENE1_T, SCENE_FAST_T, SCENE_FAST_T, SCENE_FAST_T];

let cursor = 0;
for (let i = 0; i < 4; i++) {
  SCENE_STARTS.push(cursor);
  cursor += SCENE_TIMINGS[i].sceneEnd;
}
const SCENE5_START = cursor;
cursor += SCENE5_FRAMES;
const END_CARD_START = cursor;
export const TOTAL_FRAMES = cursor + END_CARD_FRAMES;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function scoreColor(score: number): string {
  if (score >= THRESHOLD) {
    if (score >= 0.85) return "#4ade80";
    if (score >= 0.65) return "#86efac";
    return "#bbf7d0";
  }
  if (score >= 0.25) return "#fbbf24";
  return "#6b7280";
}

function scoreBarColor(score: number): string {
  if (score >= THRESHOLD) return "#22c55e";
  if (score >= 0.25) return "#f59e0b";
  return "#374151";
}

// ─── Root composition ─────────────────────────────────────────────────────────
export const JevSelectorDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Determine active scene
  let activeScene = 3;
  for (let i = 0; i < 4; i++) {
    const nextStart = i < 3 ? SCENE_STARTS[i + 1] : SCENE5_START;
    if (frame < nextStart) {
      activeScene = i;
      break;
    }
  }
  const showScene5 = frame >= SCENE5_START && frame < END_CARD_START;
  const showEndCard = frame >= END_CARD_START;

  const endOpacity = interpolate(
    frame,
    [END_CARD_START, END_CARD_START + 18],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill style={{ background: BG, fontFamily, overflow: "hidden" }}>
      <GridTexture />

      {!showScene5 && !showEndCard && (
        <SceneView
          key={activeScene}
          sceneIndex={activeScene}
          localFrame={frame - SCENE_STARTS[activeScene]}
          fps={fps}
        />
      )}

      {showScene5 && (
        <Scene5MultiAgent
          localFrame={frame - SCENE5_START}
          fps={fps}
        />
      )}

      {showEndCard && <EndCard opacity={endOpacity} frame={frame} fps={fps} />}
    </AbsoluteFill>
  );
};

// ─── Grid texture ─────────────────────────────────────────────────────────────
const GridTexture: React.FC = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      backgroundImage: `linear-gradient(${BORDER} 1px, transparent 1px), linear-gradient(90deg, ${BORDER} 1px, transparent 1px)`,
      backgroundSize: "40px 40px",
      opacity: 0.25,
      pointerEvents: "none",
    }}
  />
);

// ─── Scene view (parameterized) ───────────────────────────────────────────────
const SceneView: React.FC<{
  sceneIndex: number;
  localFrame: number;
  fps: number;
}> = ({ sceneIndex, localFrame, fps }) => {
  const T = SCENE_TIMINGS[sceneIndex];
  const data = scoresData.requests[sceneIndex];

  const contentOpacity = interpolate(localFrame, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const showGrid    = localFrame >= T.gridIn;
  const showDrop    = localFrame >= T.dropStart;
  const showCounter = localFrame >= T.counterStart;

  // Scene number indicator
  const sceneLabel = `${sceneIndex + 1} / 4`;

  return (
    <AbsoluteFill
      style={{
        padding: "28px 48px",
        display: "flex",
        flexDirection: "column",
        gap: 20,
        opacity: contentOpacity,
      }}
    >
      {/* Scene counter pill */}
      <div
        style={{
          position: "absolute",
          top: 28,
          right: 48,
          fontSize: 10,
          color: DIM,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          background: SURFACE,
          border: `1px solid ${BORDER}`,
          borderRadius: 4,
          padding: "3px 8px",
        }}
      >
        request {sceneLabel}
      </div>

      {/* Prompt */}
      <PromptBar localFrame={localFrame} T={T} prompt={data.request} />

      {/* Skills grid */}
      {showGrid && (
        <SkillsGrid
          localFrame={localFrame}
          T={T}
          skills={data.scores}
          showDrop={showDrop}
        />
      )}

      {/* Token counter */}
      {showCounter && (
        <TokenCounter
          localFrame={localFrame}
          fps={fps}
          T={T}
          afterTokens={data.afterTokens}
          savedTokens={data.savedTokens}
          pct={data.pct}
          keptCount={data.keptCount}
          totalSkills={data.scores.length}
        />
      )}
    </AbsoluteFill>
  );
};

// ─── Prompt bar ───────────────────────────────────────────────────────────────
const PromptBar: React.FC<{
  localFrame: number;
  T: SceneTiming;
  prompt: string;
}> = ({ localFrame, T, prompt }) => {
  const charCount = Math.floor(
    interpolate(
      localFrame,
      [T.promptStart + 4, T.promptEnd],
      [0, prompt.length],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) }
    )
  );
  const cursorBlink =
    Math.floor(localFrame / 7) % 2 === 0 && localFrame < T.gridIn + 8;

  const labelOpacity = interpolate(
    localFrame,
    [T.promptStart, T.promptStart + 8],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, opacity: labelOpacity }}>
      <div
        style={{ fontSize: 10, color: DIM, letterSpacing: "0.12em", textTransform: "uppercase" }}
      >
        User request
      </div>
      <div
        style={{
          background: SURFACE,
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          padding: "11px 18px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span style={{ color: ACCENT, fontSize: 13, opacity: 0.7 }}>›</span>
        <span style={{ color: ACCENT2, fontSize: 17, fontWeight: 500, letterSpacing: "-0.3px" }}>
          {prompt.slice(0, charCount)}
          {cursorBlink && <span style={{ color: ACCENT, opacity: 0.8 }}>▌</span>}
        </span>
      </div>
    </div>
  );
};

// ─── Skills grid ──────────────────────────────────────────────────────────────
const COLS = 5;

const SkillsGrid: React.FC<{
  localFrame: number;
  T: SceneTiming;
  skills: { id: string; noul: number }[];
  showDrop: boolean;
}> = ({ localFrame, T, skills, showDrop }) => {
  const gridReveal = interpolate(localFrame, [T.gridIn, T.gridIn + 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const statusText =
    localFrame >= T.scoresEnd
      ? "· scoring complete"
      : localFrame >= T.scoresStart
      ? "· scoring…"
      : "";

  return (
    <div style={{ flex: 1, opacity: gridReveal }}>
      <div
        style={{
          fontSize: 10,
          color: DIM,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        Skills · {skills.length} loaded {statusText}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gap: "5px 7px",
        }}
      >
        {skills.map((skill, i) => (
          <SkillCell
            key={skill.id}
            skill={skill}
            index={i}
            localFrame={localFrame}
            T={T}
            showDrop={showDrop}
          />
        ))}
      </div>
    </div>
  );
};

// ─── Skill cell ───────────────────────────────────────────────────────────────
const SkillCell: React.FC<{
  skill: { id: string; noul: number };
  index: number;
  localFrame: number;
  T: SceneTiming;
  showDrop: boolean;
}> = ({ skill, index, localFrame, T, showDrop }) => {
  const kept = skill.noul >= THRESHOLD;
  const scoreDuration = T.scoresEnd - T.scoresStart;
  const staggerStep = scoreDuration / 34;
  const scoreDelay = T.scoresStart + Math.floor(index * staggerStep);

  const scoreProgress = interpolate(
    localFrame,
    [scoreDelay, scoreDelay + 12],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.back(1.3)),
    }
  );

  const dropProgress = showDrop
    ? interpolate(
        localFrame,
        [Math.min(T.dropStart + (kept ? 0 : index * 1.2), T.dropEnd - 1), T.dropEnd],
        [0, 1],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.quad) }
      )
    : 0;

  const cellOpacity = kept
    ? 1
    : interpolate(dropProgress, [0, 0.15, 1], [1, 0.5, 0]);

  const cellScale = kept ? 1 : interpolate(dropProgress, [0, 1], [1, 0.88]);

  const borderColor =
    localFrame >= T.dropEnd
      ? kept
        ? "#22c55e55"
        : "transparent"
      : localFrame >= T.scoresStart
      ? `${scoreBarColor(skill.noul)}44`
      : BORDER;

  const bgColor = localFrame >= T.dropEnd && kept ? "#0f2a1a" : SURFACE;
  const barWidth = interpolate(scoreProgress, [0, 1], [0, skill.noul * 100]);

  return (
    <div
      style={{
        opacity: cellOpacity,
        transform: `scale(${cellScale})`,
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        padding: "6px 9px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color:
            localFrame >= T.dropEnd && kept
              ? "#86efac"
              : localFrame >= T.scoresEnd
              ? scoreColor(skill.noul)
              : TEXT,
          fontWeight: kept && localFrame >= T.dropEnd ? 600 : 400,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          letterSpacing: "-0.2px",
        }}
      >
        {skill.id}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <div
          style={{
            flex: 1,
            height: 3,
            background: BORDER,
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${barWidth}%`,
              height: "100%",
              background: scoreBarColor(skill.noul),
              borderRadius: 2,
            }}
          />
        </div>
        <div
          style={{
            fontSize: 9,
            color: scoreColor(skill.noul),
            opacity: scoreProgress,
            transform: `scale(${interpolate(scoreProgress, [0, 1], [0.5, 1])})`,
            minWidth: 24,
            textAlign: "right",
            fontWeight: 600,
          }}
        >
          {skill.noul.toFixed(2)}
        </div>
      </div>
    </div>
  );
};

// ─── Token counter ────────────────────────────────────────────────────────────
const TokenCounter: React.FC<{
  localFrame: number;
  fps: number;
  T: SceneTiming;
  afterTokens: number;
  savedTokens: number;
  pct: number;
  keptCount: number;
  totalSkills: number;
}> = ({ localFrame, fps, T, afterTokens, savedTokens, pct, keptCount, totalSkills }) => {
  const progress = interpolate(
    localFrame,
    [T.counterStart, T.counterEnd],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }
  );

  const currentTokens = Math.round(
    interpolate(progress, [0, 1], [TOKENS_BEFORE, afterTokens])
  );

  const pctProgress = interpolate(
    localFrame,
    [T.counterStart + 6, T.counterEnd],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }
  );

  const labelOpacity = interpolate(
    localFrame,
    [T.counterStart, T.counterStart + 8],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const pulseScale = spring({
    frame: localFrame - T.counterEnd,
    fps,
    config: { damping: 8, stiffness: 200 },
    from: 0.85,
    to: 1,
  });
  const counterScale = localFrame < T.counterEnd ? 1 : pulseScale;
  const done = localFrame >= T.counterEnd;

  return (
    <div
      style={{
        opacity: labelOpacity,
        display: "flex",
        alignItems: "center",
        gap: 20,
        background: SURFACE,
        border: `1px solid ${BORDER}`,
        borderRadius: 10,
        padding: "12px 22px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {done && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(90deg, #22c55e08 0%, #22c55e18 50%, #22c55e08 100%)",
            pointerEvents: "none",
          }}
        />
      )}

      {/* Token count */}
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <div style={{ fontSize: 10, color: DIM, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          System prompt
        </div>
        <div
          style={{
            fontSize: 38,
            fontWeight: 700,
            color: done ? "#4ade80" : TEXT,
            letterSpacing: "-1.5px",
            lineHeight: 1,
            transform: `scale(${counterScale})`,
            transformOrigin: "left center",
          }}
        >
          {currentTokens.toLocaleString()}
          <span style={{ fontSize: 16, color: DIM, marginLeft: 5, fontWeight: 400 }}>tokens</span>
        </div>
      </div>

      <div style={{ width: 1, height: 48, background: BORDER }} />

      {/* Savings */}
      <div style={{ display: "flex", flexDirection: "column", gap: 1, opacity: pctProgress }}>
        <div style={{ fontSize: 10, color: DIM, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Saved
        </div>
        <div style={{ fontSize: 38, fontWeight: 700, color: "#4ade80", letterSpacing: "-1.5px", lineHeight: 1 }}>
          −{pct}%
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 1, opacity: pctProgress }}>
        <div style={{ fontSize: 10, color: DIM, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Tokens removed
        </div>
        <div style={{ fontSize: 26, fontWeight: 600, color: "#86efac", letterSpacing: "-0.8px", lineHeight: 1 }}>
          −{savedTokens.toLocaleString()}
        </div>
      </div>

      {/* Skills kept */}
      <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end" }}>
        <div style={{ fontSize: 10, color: DIM, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Skills kept
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, color: ACCENT2, letterSpacing: "-0.8px" }}>
          {keptCount} / {totalSkills}
        </div>
      </div>
    </div>
  );
};

// ─── Scene 5: OMO multi-agent / pinned ────────────────────────────────────────
// Timing constants (local frames)
const S5 = {
  fadeIn:        0,   // scene fades in
  requestEnd:   22,   // request finishes typing
  col0In:       28,   // orchestrator column slides in
  col1In:       36,   // librarian column slides in
  col2In:       44,   // fixer column slides in
  skillsStart:  50,   // skills start cascading in
  skillsEnd:   122,   // all skills visible
  captionIn:   130,   // pinned caption fades in
  captionEnd:  148,
  sceneEnd:    165,
};

// Colour accents per agent column
const COL_ACCENTS = ["#6366f1", "#22d3ee", "#f472b6"]; // indigo, cyan, pink
const COL_HINTS   = ["plans & delegates", "researches docs", "writes & fixes code"];

// Build set of skill IDs per agent for divergence highlighting
type AgentEntry = { agent: string; keptCount: number; kept: { id: string; noul: number; pinned?: boolean }[] };

function buildSkillSets(agents: AgentEntry[]) {
  const sets = agents.map(a => new Set(a.kept.map(k => k.id)));
  // shared = present in all 3
  const shared = new Set([...sets[0]].filter(id => sets[1].has(id) && sets[2].has(id)));
  return { sets, shared };
}

const Scene5MultiAgent: React.FC<{ localFrame: number; fps: number }> = ({ localFrame, fps }) => {
  const agents = agentsData.agents as AgentEntry[];
  const { shared } = buildSkillSets(agents);

  const sceneOpacity = interpolate(localFrame, [S5.fadeIn, S5.fadeIn + 10], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  // Typed request
  const request = agentsData.request;
  const charCount = Math.floor(
    interpolate(localFrame, [4, S5.requestEnd], [0, request.length], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
      easing: Easing.out(Easing.quad),
    })
  );
  const cursorBlink = Math.floor(localFrame / 7) % 2 === 0 && localFrame < S5.col0In + 6;

  const colInFrames = [S5.col0In, S5.col1In, S5.col2In];

  return (
    <AbsoluteFill
      style={{
        padding: "24px 40px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        opacity: sceneOpacity,
      }}
    >
      {/* Scene badge */}
      <div style={{
        position: "absolute", top: 24, right: 40,
        fontSize: 10, color: DIM, letterSpacing: "0.14em", textTransform: "uppercase",
        background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 4, padding: "3px 8px",
      }}>
        omo-slim · multi-agent
      </div>

      {/* Request bar */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ fontSize: 10, color: DIM, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          same request → different agents
        </div>
        <div style={{
          background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8,
          padding: "10px 18px", display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ color: ACCENT, fontSize: 13, opacity: 0.7 }}>›</span>
          <span style={{ color: ACCENT2, fontSize: 17, fontWeight: 500, letterSpacing: "-0.3px" }}>
            {request.slice(0, charCount)}
            {cursorBlink && <span style={{ color: ACCENT, opacity: 0.8 }}>▌</span>}
          </span>
        </div>
      </div>

      {/* Three agent columns */}
      <div style={{ flex: 1, display: "flex", gap: 10, minHeight: 0 }}>
        {agents.map((agent, colIdx) => (
          <AgentColumn
            key={agent.agent}
            agent={agent}
            colIdx={colIdx}
            localFrame={localFrame}
            fps={fps}
            colInFrame={colInFrames[colIdx]}
            accent={COL_ACCENTS[colIdx]}
            roleHint={COL_HINTS[colIdx]}
            sharedSkills={shared}
          />
        ))}
      </div>

      {/* Pinned caption */}
      <PinnedCaption localFrame={localFrame} />
    </AbsoluteFill>
  );
};

// ─── Agent column ─────────────────────────────────────────────────────────────
const AgentColumn: React.FC<{
  agent: AgentEntry;
  colIdx: number;
  localFrame: number;
  fps: number;
  colInFrame: number;
  accent: string;
  roleHint: string;
  sharedSkills: Set<string>;
}> = ({ agent, colIdx, localFrame, fps, colInFrame, accent, roleHint, sharedSkills }) => {
  // Column slide-in spring
  const colSpring = spring({
    frame: localFrame - colInFrame,
    fps,
    config: { damping: 14, stiffness: 160 },
    from: 0,
    to: 1,
  });
  const colY = interpolate(colSpring, [0, 1], [32, 0]);
  const colOpacity = interpolate(localFrame, [colInFrame, colInFrame + 10], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  // Per-skill stagger: distribute across skillsStart..skillsEnd, offset by column
  const skillsPerCol = agent.kept.length;
  const staggerWindow = S5.skillsEnd - S5.skillsStart;
  const colOffset = colIdx * 4; // slight column phase offset

  return (
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      gap: 0,
      opacity: colOpacity,
      transform: `translateY(${colY}px)`,
      minWidth: 0,
    }}>
      {/* Column header */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        marginBottom: 8,
        paddingBottom: 8,
        borderBottom: `1px solid ${accent}44`,
      }}>
        <div style={{
          fontSize: 13,
          fontWeight: 700,
          color: accent,
          letterSpacing: "-0.2px",
        }}>
          {agent.agent}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 9, color: DIM, letterSpacing: "0.08em" }}>
            {roleHint}
          </div>
          <div style={{
            fontSize: 9, color: accent, fontWeight: 700,
            background: `${accent}18`, border: `1px solid ${accent}44`,
            borderRadius: 3, padding: "1px 5px",
          }}>
            {agent.keptCount} kept
          </div>
        </div>
      </div>

      {/* Skills list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, overflowY: "hidden" }}>
        {agent.kept.map((skill, skillIdx) => {
          const delay = S5.skillsStart + colOffset + Math.floor(skillIdx * (staggerWindow / (skillsPerCol + 1)));
          const isShared = sharedSkills.has(skill.id);
          const isPinned = !!skill.pinned;
          return (
            <AgentSkillRow
              key={skill.id}
              skill={skill}
              delay={delay}
              localFrame={localFrame}
              fps={fps}
              accent={accent}
              isShared={isShared}
              isPinned={isPinned}
            />
          );
        })}
      </div>
    </div>
  );
};

// ─── Agent skill row ──────────────────────────────────────────────────────────
const AgentSkillRow: React.FC<{
  skill: { id: string; noul: number; pinned?: boolean };
  delay: number;
  localFrame: number;
  fps: number;
  accent: string;
  isShared: boolean;
  isPinned: boolean;
}> = ({ skill, delay, localFrame, fps, accent, isShared, isPinned }) => {
  const rowSpring = spring({
    frame: localFrame - delay,
    fps,
    config: { damping: 16, stiffness: 200 },
    from: 0,
    to: 1,
  });
  const rowOpacity = interpolate(localFrame, [delay, delay + 8], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const rowY = interpolate(rowSpring, [0, 1], [10, 0]);

  // Bar width animates in alongside opacity
  const barProgress = interpolate(localFrame, [delay, delay + 16], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const barWidth = barProgress * skill.noul * 100;

  // Pinned badge glows amber
  const PINNED_COLOR = "#f59e0b";

  const bgColor = isPinned
    ? "#1a140a"
    : isShared
    ? "#0e1420"
    : SURFACE;

  const borderColor = isPinned
    ? `${PINNED_COLOR}66`
    : isShared
    ? `${accent}33`
    : BORDER;

  const nameColor = isPinned
    ? PINNED_COLOR
    : isShared
    ? accent
    : scoreColor(skill.noul);

  return (
    <div style={{
      opacity: rowOpacity,
      transform: `translateY(${rowY}px)`,
      background: bgColor,
      border: `1px solid ${borderColor}`,
      borderRadius: 5,
      padding: "4px 7px",
      display: "flex",
      alignItems: "center",
      gap: 5,
      minWidth: 0,
    }}>
      {/* Pin indicator */}
      {isPinned && (
        <div style={{
          fontSize: 8,
          lineHeight: 1,
          color: PINNED_COLOR,
          flexShrink: 0,
          opacity: 0.9,
        }}>
          📌
        </div>
      )}
      {/* Shared indicator: faint "=" dot */}
      {isShared && !isPinned && (
        <div style={{
          width: 4, height: 4, borderRadius: "50%",
          background: accent,
          opacity: 0.5,
          flexShrink: 0,
        }} />
      )}
      {/* Skill name */}
      <div style={{
        fontSize: 9,
        color: nameColor,
        fontWeight: isPinned ? 700 : isShared ? 600 : 400,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        flex: 1,
        letterSpacing: "-0.1px",
      }}>
        {skill.id}
      </div>
      {/* Score bar + value */}
      <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
        <div style={{ width: 28, height: 2, background: BORDER, borderRadius: 1, overflow: "hidden" }}>
          <div style={{
            width: `${barWidth}%`, height: "100%",
            background: isPinned ? PINNED_COLOR : scoreBarColor(skill.noul),
            borderRadius: 1,
          }} />
        </div>
        <div style={{
          fontSize: 8,
          color: isPinned ? PINNED_COLOR : scoreColor(skill.noul),
          fontWeight: 600,
          minWidth: 22,
          textAlign: "right",
        }}>
          {skill.noul.toFixed(2)}
        </div>
      </div>
    </div>
  );
};

// ─── Pinned caption ───────────────────────────────────────────────────────────
const PinnedCaption: React.FC<{ localFrame: number }> = ({ localFrame }) => {
  const captionOpacity = interpolate(
    localFrame,
    [S5.captionIn, S5.captionIn + 14],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }
  );
  const captionY = interpolate(
    localFrame,
    [S5.captionIn, S5.captionIn + 14],
    [8, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }
  );

  return (
    <div style={{
      opacity: captionOpacity,
      transform: `translateY(${captionY}px)`,
      display: "flex",
      alignItems: "center",
      gap: 10,
      background: "#1a140a",
      border: "1px solid #f59e0b44",
      borderRadius: 7,
      padding: "8px 16px",
    }}>
      <span style={{ fontSize: 12 }}>📌</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b", letterSpacing: "-0.1px" }}>
          pinned orchestration skills always survive
        </div>
        <div style={{ fontSize: 9, color: DIM, letterSpacing: "0.04em" }}>
          oh-my-opencode-slim · deepwork · verification-planning · worktrees — kept regardless of noul score
        </div>
      </div>
      {/* Legend */}
      <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#6366f1", opacity: 0.7 }} />
          <span style={{ fontSize: 8, color: DIM }}>shared</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 9 }}>📌</span>
          <span style={{ fontSize: 8, color: DIM }}>pinned</span>
        </div>
      </div>
    </div>
  );
};

// ─── End card ─────────────────────────────────────────────────────────────────
const EndCard: React.FC<{ opacity: number; frame: number; fps: number }> = ({
  opacity,
  frame,
  fps,
}) => {
  const localF = frame - END_CARD_START;

  const lineY1 = interpolate(localF, [2, 18], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const lineY2 = interpolate(localF, [8, 24], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill
      style={{
        opacity,
        background: `${BG}ee`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        backdropFilter: "blur(6px)",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 560,
          height: 200,
          borderRadius: "50%",
          background: `radial-gradient(ellipse, ${ACCENT}22 0%, transparent 70%)`,
          filter: "blur(50px)",
        }}
      />
      <div
        style={{
          transform: `translateY(${lineY1}px)`,
          fontSize: 38,
          fontWeight: 700,
          color: TEXT,
          letterSpacing: "-0.8px",
          textAlign: "center",
        }}
      >
        stop paying for skills{" "}
        <span style={{ color: ACCENT2 }}>you're not using.</span>
      </div>
      <div
        style={{
          transform: `translateY(${lineY2}px)`,
          fontSize: 16,
          color: DIM,
          letterSpacing: "0.02em",
        }}
      >
        github.com/universam1/jevselector
      </div>
    </AbsoluteFill>
  );
};
