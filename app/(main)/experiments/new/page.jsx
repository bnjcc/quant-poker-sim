"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { experimentConfigSchema, SIMULATION_VERSION } from "@/types/experiment";
import { AGENT_PRESETS } from "@/lib/agents/profiles";
import {
  DEFAULT_POOL_SETTINGS,
  DEFAULT_TABLE,
} from "@/lib/simulation/defaults";
import { getStore, newId } from "@/lib/storage/store";
import {
  multiplayerSetupError,
  participantPlayerId,
  PLAY_MODES,
} from "@/lib/social/multiplayer";
import { Empty, PageHeader, WarningNote } from "@/components/ui";
function Num({ label, value, onChange, min, max, step = 1, hint }) {
  return (
    <label className="block" title={hint}>
      <span className="label">{label}</span>
      <input
        type="number"
        className="field mt-1"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
function NewExperimentInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [cals, setCals] = useState(null);
  const [calId, setCalId] = useState("");
  const [socialGraph, setSocialGraph] = useState(undefined);
  const [playMode, setPlayMode] = useState(PLAY_MODES.SOLO);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState([]);
  const [error, setError] = useState(null);
  const [cfg, setCfg] = useState({
    name: "",
    description: "",
    table: DEFAULT_TABLE,
    pool: DEFAULT_POOL_SETTINGS,
    hands: 5000,
    seed: `seed-${Math.floor(Math.random() * 1e9)}`,
    userBuyInBB: 100,
    mode: "detailed",
    sampleEvery: 50,
  });
  useEffect(() => {
    (async () => {
      const store = getStore();
      const [c, graph] = await Promise.all([
        store.listCalibrations(),
        store.mode === "supabase" ? store.getSocialGraph() : Promise.resolve(null),
      ]);
      setCals(c);
      setSocialGraph(graph);
      let selectedId = c[0]?.id ?? "";
      const requestedStrategyId = params.get("strategy");
      if (
        requestedStrategyId &&
        c.some((strategy) => strategy.id === requestedStrategyId)
      ) {
        selectedId = requestedStrategyId;
      }
      // Duplicate an existing experiment (optionally to change one variable).
      const dup = params.get("duplicate");
      if (dup) {
        const e = await store.getExperiment(dup);
        if (e) {
          setCfg({ ...e.config, name: `${e.config.name} (copy)` });
          if (
            e.calibrationId &&
            c.some((strategy) => strategy.id === e.calibrationId)
          ) {
            selectedId = e.calibrationId;
          } else if (e.strategyName || e.calibrationId) {
            setError(
              `The original strategy${e.strategyName ? ` “${e.strategyName}”` : ""} is no longer available. Choose a saved strategy for this copy.`,
            );
          }
        }
      }
      setCalId(selectedId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (cals === null) return <div className="text-muted text-sm">Loading…</div>;
  if (cals.length === 0) {
    return (
      <Empty
        title="You need a calibration first"
        body="Experiments simulate a model learned from your manual play. Play a calibration session to create one."
        action={{ href: "/range-calibrate", label: "Start calibrating" }}
      />
    );
  }
  const setPoolWeight = (id, w) =>
    setCfg((c) => ({
      ...c,
      pool: { ...c.pool, composition: { ...c.pool.composition, [id]: w } },
    }));
  const create = async () => {
    setError(null);
    const strategy = cals.find((calibration) => calibration.id === calId);
    if (!strategy) {
      setError("Choose a saved strategy before creating the experiment.");
      return;
    }
    const selectedPlayers = (socialGraph?.eligiblePlayers ?? []).filter(
      (player) => selectedPlayerIds.includes(player.userId) && player.strategy,
    );
    const participantCount = 1 + selectedPlayers.length;
    const setupError = multiplayerSetupError(
      playMode,
      participantCount,
      cfg.table.maxSeats,
    );
    if (setupError) {
      setError(setupError);
      return;
    }
    if (playMode !== PLAY_MODES.SOLO && !socialGraph?.profile) {
      setError("Multiplayer experiments require a cloud account.");
      return;
    }
    const candidate = {
      ...cfg,
      name: cfg.name || `Experiment ${new Date().toLocaleString()}`,
      mode: cfg.hands > 20000 ? "high-speed" : cfg.mode,
      table: {
        ...cfg.table,
        maxSeats:
          playMode === PLAY_MODES.PLAYERS_ONLY
            ? participantCount
            : cfg.table.maxSeats,
      },
    };
    const parsed = experimentConfigSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(
        parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      );
      return;
    }
    const participants =
      playMode === PLAY_MODES.SOLO
        ? []
        : [
            {
              participantId: socialGraph.profile.userId,
              userId: socialGraph.profile.userId,
              username: socialGraph.profile.username,
              playerId: participantPlayerId(socialGraph.profile.userId),
              relationshipDegree: 0,
              strategyId: strategy.id,
              strategyName: strategy.name,
              strategyMethod: strategy.method,
              policy: strategy.policy,
            },
            ...selectedPlayers.map((player) => ({
              participantId: player.userId,
              userId: player.userId,
              username: player.username,
              playerId: participantPlayerId(player.userId),
              relationshipDegree: player.relationshipDegree,
              strategyId: player.strategy.calibrationId,
              strategyName: player.strategy.name,
              strategyMethod: player.strategy.method,
              policy: player.strategy.policy,
            })),
          ];
    const exp = {
      id: newId("exp"),
      createdAt: new Date().toISOString(),
      config: parsed.data,
      calibrationId: strategy.id,
      strategyName: strategy.name,
      strategyMethod: strategy.method,
      playMode,
      participants,
      simulationVersion: SIMULATION_VERSION,
      status: "pending",
      results: null,
      handIds: [],
      userDecisionLog: [],
      multiplayerResults: [],
    };
    await getStore().saveExperiment(exp);
    router.push(`/experiments/${exp.id}`);
  };
  return (
    <div>
      <PageHeader
        title="New experiment"
        sub="Configure the table, the opponent pool, and the sample size. The same seed always reproduces the same simulation."
      />
      <div className="grid lg:grid-cols-2 gap-4 max-w-5xl">
        <section className="panel px-5 py-4 space-y-3">
          <h2 className="font-semibold">Setup</h2>
          <label className="block">
            <span className="label">Name</span>
            <input
              className="field mt-1"
              value={cfg.name}
              onChange={(e) => setCfg({ ...cfg, name: e.target.value })}
              placeholder="e.g. My style vs loose-passive pool"
            />
          </label>
          <label className="block">
            <span className="label">Description</span>
            <textarea
              className="field mt-1"
              rows={2}
              value={cfg.description}
              onChange={(e) => setCfg({ ...cfg, description: e.target.value })}
              placeholder="What are you testing?"
            />
          </label>
          <label className="block">
            <span className="label">Who plays?</span>
            <select
              className="field mt-1"
              value={playMode}
              onChange={(event) => {
                setPlayMode(event.target.value);
                setError(null);
              }}
            >
              <option value={PLAY_MODES.SOLO}>Your strategy vs bots</option>
              <option value={PLAY_MODES.WITH_BOTS} disabled={!socialGraph}>
                Real users with bots (2+ real users)
              </option>
              <option value={PLAY_MODES.PLAYERS_ONLY} disabled={!socialGraph}>
                Players only — no bots (3+ real users)
              </option>
            </select>
            {!socialGraph && (
              <span className="block text-[11px] text-muted mt-1">
                Multiplayer requires cloud mode and shared friend strategies.
              </span>
            )}
          </label>
          <label className="block">
            <span className="label">
              {playMode === PLAY_MODES.SOLO ? "Saved strategy" : "Your saved strategy"}
            </span>
            <select
              className="field mt-1"
              value={calId}
              onChange={(e) => setCalId(e.target.value)}
            >
              {cals.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.method === "range-first"
                    ? `[Range-first] ${c.name}`
                    : c.name}
                </option>
              ))}
            </select>
            <span className="block text-[11px] text-muted mt-1">
              This strategy stays attached to the experiment and is recorded in
              its history.
            </span>
          </label>
          {playMode !== PLAY_MODES.SOLO && socialGraph && (
            <div className="rounded-md border border-line bg-panel2 px-3 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="label">Add real users</span>
                <Link href="/friends" className="text-xs text-accent hover:underline">
                  Manage friends
                </Link>
              </div>
              <p className="text-[11px] text-muted mt-1 mb-2">
                Direct friends and friends of friends are eligible. Only players
                who published a multiplayer strategy can be selected.
              </p>
              {socialGraph.eligiblePlayers.length === 0 ? (
                <div className="text-xs text-muted">No players are available yet.</div>
              ) : (
                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  {socialGraph.eligiblePlayers.map((player) => (
                    <label
                      key={player.userId}
                      className={`flex items-center gap-2 rounded px-2 py-1.5 ${
                        player.strategy ? "cursor-pointer hover:bg-panel" : "opacity-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={!player.strategy}
                        checked={selectedPlayerIds.includes(player.userId)}
                        onChange={(event) =>
                          setSelectedPlayerIds((current) =>
                            event.target.checked
                              ? [...current, player.userId]
                              : current.filter((id) => id !== player.userId),
                          )
                        }
                      />
                      <span className="text-sm font-semibold">@{player.username}</span>
                      <span className="text-[11px] text-muted">
                        {player.relationshipDegree === 1 ? "friend" : "friend of friend"}
                      </span>
                      <span className="text-[11px] text-muted ml-auto truncate max-w-36">
                        {player.strategy?.name ?? "no shared strategy"}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <div className="text-xs mt-2">
                <span className="mono">{1 + selectedPlayerIds.length}</span> real users selected
                {playMode === PLAY_MODES.PLAYERS_ONLY
                  ? " · minimum 3"
                  : " · minimum 2"}
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Num
              label="Hands"
              value={cfg.hands}
              min={10}
              max={500000}
              step={100}
              onChange={(v) => setCfg({ ...cfg, hands: v })}
            />
            <label className="block">
              <span className="label">Seed</span>
              <input
                className="field mt-1 mono"
                value={cfg.seed}
                onChange={(e) => setCfg({ ...cfg, seed: e.target.value })}
              />
            </label>
            <Num
              label="Small blind"
              value={cfg.table.smallBlind}
              min={0.5}
              max={1000}
              step={0.5}
              onChange={(v) =>
                setCfg({ ...cfg, table: { ...cfg.table, smallBlind: v } })
              }
            />
            <Num
              label="Big blind"
              value={cfg.table.bigBlind}
              min={1}
              max={2000}
              onChange={(v) =>
                setCfg({ ...cfg, table: { ...cfg.table, bigBlind: v } })
              }
            />
            <label className="block">
              <span className="label">Players at table</span>
              <select
                className="field mt-1"
                value={
                  playMode === PLAY_MODES.PLAYERS_ONLY
                    ? Math.max(3, 1 + selectedPlayerIds.length)
                    : cfg.table.maxSeats
                }
                disabled={playMode === PLAY_MODES.PLAYERS_ONLY}
                onChange={(event) =>
                  setCfg({
                    ...cfg,
                    table: {
                      ...cfg.table,
                      maxSeats: Number(event.target.value),
                    },
                  })
                }
              >
                {Array.from({ length: 8 }, (_, index) => index + 2).map(
                  (players) => (
                    <option key={players} value={players}>
                      {players === 2
                        ? "2 players (heads-up)"
                        : players === 6
                          ? "6 players (6-max)"
                          : players === 9
                            ? "9 players (full ring)"
                            : `${players} players`}
                    </option>
                  ),
                )}
              </select>
              {playMode === PLAY_MODES.PLAYERS_ONLY && (
                <span className="block text-[11px] text-muted mt-1">
                  The table size matches the number of selected real users.
                </span>
              )}
            </label>
            <Num
              label="Your buy-in (bb)"
              value={cfg.userBuyInBB}
              min={20}
              max={500}
              onChange={(v) => setCfg({ ...cfg, userBuyInBB: v })}
            />
            <Num
              label="Rake % of pot"
              value={cfg.table.rake.percentage * 100}
              min={0}
              max={20}
              step={0.5}
              onChange={(v) =>
                setCfg({
                  ...cfg,
                  table: {
                    ...cfg.table,
                    rake: { ...cfg.table.rake, percentage: v / 100 },
                  },
                })
              }
            />
            <Num
              label="Rake cap (chips)"
              value={cfg.table.rake.cap}
              min={0}
              max={1000}
              onChange={(v) =>
                setCfg({
                  ...cfg,
                  table: { ...cfg.table, rake: { ...cfg.table.rake, cap: v } },
                })
              }
            />
            <label className="block">
              <span className="label">Storage mode</span>
              <select
                className="field mt-1"
                value={cfg.mode}
                onChange={(e) => setCfg({ ...cfg, mode: e.target.value })}
              >
                <option value="detailed">Detailed — every hand history</option>
                <option value="high-speed">
                  High-speed — aggregates + sampled hands
                </option>
              </select>
            </label>
          </div>
          {cfg.hands > 20000 && (
            <div className="text-xs text-muted">
              Over 20,000 hands the run switches to high-speed storage
              automatically (browser storage limits).
            </div>
          )}
        </section>

        <section className="panel px-5 py-4">
          <h2 className="font-semibold mb-1">Player pool</h2>
          {playMode === PLAY_MODES.PLAYERS_ONLY ? (
            <div className="rounded-md border border-line bg-panel2 px-4 py-4 text-sm text-muted">
              Bot settings are ignored in a players-only experiment. The table
              contains exactly the selected real-user strategy models, with a
              minimum of three players.
            </div>
          ) : (
            <>
              <p className="text-xs text-muted mb-3">
                Relative weights when seating and replacing bot opponents.
                Bots join, leave, rebuy, and get replaced during the run.
              </p>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
            {AGENT_PRESETS.map((p) => (
              <div
                key={p.id}
                className="grid grid-cols-[minmax(0,1fr)_minmax(7rem,1.2fr)_1rem] items-center gap-2 sm:flex sm:gap-3"
                title={p.description}
              >
                <span className="text-sm min-w-0 truncate sm:w-44">{p.name}</span>
                <input
                  type="range"
                  min={0}
                  max={5}
                  step={1}
                  value={cfg.pool.composition[p.id] ?? 0}
                  onChange={(e) => setPoolWeight(p.id, Number(e.target.value))}
                  className="flex-1"
                  aria-label={`${p.name} weight`}
                />
                <span className="mono text-xs w-4 text-right">
                  {cfg.pool.composition[p.id] ?? 0}
                </span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            <Num
              label="Avg session (hands)"
              value={cfg.pool.avgSessionHands}
              min={10}
              max={5000}
              step={10}
              onChange={(v) =>
                setCfg({ ...cfg, pool: { ...cfg.pool, avgSessionHands: v } })
              }
              hint="Mean of the geometric session-length distribution"
            />
            <Num
              label="Turnover rate"
              value={cfg.pool.turnover}
              min={0}
              max={2}
              step={0.1}
              onChange={(v) =>
                setCfg({ ...cfg, pool: { ...cfg.pool, turnover: v } })
              }
              hint="Higher = more churn"
            />
            <Num
              label="Stop-loss (buy-ins)"
              value={cfg.pool.stopLossBuyIns}
              min={0}
              max={10}
              step={1}
              onChange={(v) =>
                setCfg({ ...cfg, pool: { ...cfg.pool, stopLossBuyIns: v } })
              }
              hint="Players tend to leave after losing this many buy-ins (0 = off)"
            />
            <Num
              label="Rebuy probability"
              value={cfg.pool.rebuyProb}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) =>
                setCfg({ ...cfg, pool: { ...cfg.pool, rebuyProb: v } })
              }
            />
            <Num
              label="Skill multiplier"
              value={cfg.pool.skillShift}
              min={0.3}
              max={1.5}
              step={0.05}
              onChange={(v) =>
                setCfg({ ...cfg, pool: { ...cfg.pool, skillShift: v } })
              }
            />
            <Num
              label="Table looseness"
              value={cfg.pool.looseness}
              min={0.5}
              max={1.8}
              step={0.05}
              onChange={(v) =>
                setCfg({ ...cfg, pool: { ...cfg.pool, looseness: v } })
              }
            />
            <Num
              label="Table aggression"
              value={cfg.pool.aggressionShift}
              min={0.5}
              max={1.8}
              step={0.05}
              onChange={(v) =>
                setCfg({ ...cfg, pool: { ...cfg.pool, aggressionShift: v } })
              }
            />
          </div>
            </>
          )}
        </section>
      </div>

      {error && (
        <div className="mt-4 max-w-5xl">
          <WarningNote>{error}</WarningNote>
        </div>
      )}
      <div className="mt-5 flex gap-3">
        <button className="btn btn-primary" onClick={create}>
          Create experiment
        </button>
      </div>
    </div>
  );
}
export default function NewExperimentPage() {
  return (
    <Suspense fallback={<div className="text-muted text-sm">Loading…</div>}>
      <NewExperimentInner />
    </Suspense>
  );
}
