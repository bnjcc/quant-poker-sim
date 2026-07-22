"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getStore } from "@/lib/storage/store";
import { normalizeUsername, usernameError } from "@/lib/social/usernames";
import { PageHeader, WarningNote } from "@/components/ui";

export default function FriendsPage() {
  const [graph, setGraph] = useState(undefined);
  const [calibrations, setCalibrations] = useState([]);
  const [username, setUsername] = useState("");
  const [friendUsername, setFriendUsername] = useState("");
  const [strategyId, setStrategyId] = useState("");
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const store = getStore();
    if (store.mode !== "supabase") {
      setGraph(null);
      return;
    }
    try {
      const [socialGraph, savedStrategies] = await Promise.all([
        store.getSocialGraph(),
        store.listCalibrations(),
      ]);
      setGraph(socialGraph);
      setCalibrations(savedStrategies);
      setUsername(socialGraph?.profile?.username ?? "");
      setStrategyId(
        socialGraph?.publishedStrategy?.calibrationId ??
          savedStrategies[0]?.id ??
          "",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load friends.");
      setGraph(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const perform = async (action, successMessage) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage(successMessage);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The change could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  if (graph === undefined) return <div className="text-sm text-muted">Loading…</div>;

  if (graph === null) {
    return (
      <div>
        <PageHeader
          title="Friends & multiplayer"
          sub="Connect strategy profiles and run shared simulations."
        />
        <WarningNote>
          Friends and usernames need cloud mode because browser-only storage has
          no accounts to connect. Your solo simulations still work normally.
        </WarningNote>
      </div>
    );
  }

  const sharedCount = graph.eligiblePlayers.filter((player) => player.strategy).length;
  return (
    <div>
      <PageHeader
        title="Friends & multiplayer"
        sub="Connect by username, share one strategy, and simulate with direct friends or friends of friends."
        right={
          <Link href="/experiments/new" className="btn btn-primary">
            New multiplayer experiment
          </Link>
        }
      />

      {message && <div className="panel px-4 py-3 text-sm mb-4 max-w-5xl">{message}</div>}

      <div className="grid lg:grid-cols-2 gap-4 max-w-5xl">
        <section className="panel px-5 py-4">
          <h2 className="font-semibold">Your username</h2>
          <p className="text-xs text-muted mt-1 mb-3">
            This is the public name other signed-in players use to find you.
          </p>
          <div className="flex gap-2">
            <div className="field flex items-center flex-1">
              <span className="text-muted">@</span>
              <input
                className="bg-transparent outline-none min-w-0 flex-1"
                value={username}
                minLength={3}
                maxLength={24}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
            <button
              className="btn"
              disabled={busy || username === graph.profile.username}
              onClick={() => {
                const normalized = normalizeUsername(username);
                const validation = usernameError(normalized);
                if (validation) return setMessage(validation);
                perform(
                  () => getStore().changeUsername(normalized),
                  `Username changed to @${normalized}.`,
                );
              }}
            >
              Save
            </button>
          </div>
        </section>

        <section className="panel px-5 py-4">
          <h2 className="font-semibold">Add a friend</h2>
          <p className="text-xs text-muted mt-1 mb-3">
            Username searches ignore capitalization. If they already requested
            you, the connection is accepted immediately.
          </p>
          <div className="flex gap-2">
            <div className="field flex items-center flex-1">
              <span className="text-muted">@</span>
              <input
                className="bg-transparent outline-none min-w-0 flex-1"
                value={friendUsername}
                placeholder="River_Reader"
                onChange={(event) => setFriendUsername(event.target.value)}
              />
            </div>
            <button
              className="btn btn-primary"
              disabled={busy || !friendUsername.trim()}
              onClick={() => {
                const requested = normalizeUsername(friendUsername);
                perform(
                  () => getStore().requestFriend(requested),
                  `Friend request sent to @${requested}.`,
                );
                setFriendUsername("");
              }}
            >
              Send request
            </button>
          </div>
        </section>

        <section className="panel px-5 py-4 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Multiplayer strategy</h2>
              <p className="text-xs text-muted mt-1 max-w-2xl">
                Publish one learned policy for your two-hop friend network. This
                shares the simulation policy, not your raw calibration decisions
                or private experiment history.
              </p>
            </div>
            {graph.publishedStrategy && (
              <button
                className="btn btn-danger text-xs"
                disabled={busy}
                onClick={() =>
                  perform(
                    () => getStore().unpublishMultiplayerStrategy(),
                    "Your strategy is no longer available for new multiplayer experiments.",
                  )
                }
              >
                Stop sharing
              </button>
            )}
          </div>
          {calibrations.length === 0 ? (
            <div className="text-sm text-muted mt-4">
              Create a saved strategy before sharing.{" "}
              <Link href="/range-calibrate" className="text-accent hover:underline">
                Start calibration
              </Link>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 mt-4">
              <select
                className="field flex-1 min-w-56"
                value={strategyId}
                onChange={(event) => setStrategyId(event.target.value)}
              >
                {calibrations.map((calibration) => (
                  <option key={calibration.id} value={calibration.id}>
                    {calibration.name} · {calibration.handsPlayed} hands
                  </option>
                ))}
              </select>
              <button
                className="btn btn-primary"
                disabled={busy || !strategyId}
                onClick={() => {
                  const calibration = calibrations.find((item) => item.id === strategyId);
                  if (!calibration) return;
                  perform(
                    () => getStore().publishMultiplayerStrategy(calibration),
                    `“${calibration.name}” is now your multiplayer strategy.`,
                  );
                }}
              >
                {graph.publishedStrategy ? "Update shared strategy" : "Share strategy"}
              </button>
            </div>
          )}
          {graph.publishedStrategy && (
            <div className="text-xs text-muted mt-2">
              Currently shared: <span className="text-ink">{graph.publishedStrategy.name}</span>
            </div>
          )}
        </section>

        {graph.incoming.length > 0 && (
          <section className="panel px-5 py-4">
            <h2 className="font-semibold mb-2">Friend requests</h2>
            <div className="divide-y divide-line">
              {graph.incoming.map((request) => (
                <div key={request.friendshipId} className="py-2 flex items-center gap-2">
                  <span className="text-sm font-semibold">@{request.username}</span>
                  <button
                    className="btn btn-primary text-xs ml-auto"
                    disabled={busy}
                    onClick={() =>
                      perform(
                        () => getStore().respondToFriendRequest(request.friendshipId, true),
                        `You and @${request.username} are now friends.`,
                      )
                    }
                  >
                    Accept
                  </button>
                  <button
                    className="btn text-xs"
                    disabled={busy}
                    onClick={() =>
                      perform(
                        () => getStore().respondToFriendRequest(request.friendshipId, false),
                        "Friend request declined.",
                      )
                    }
                  >
                    Decline
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="panel px-5 py-4">
          <h2 className="font-semibold mb-2">Direct friends</h2>
          {graph.friends.length === 0 ? (
            <div className="text-sm text-muted">No accepted friends yet.</div>
          ) : (
            <div className="divide-y divide-line">
              {graph.friends.map((friend) => (
                <div key={friend.friendshipId} className="py-2 flex items-center gap-2">
                  <span className="text-sm">@{friend.username}</span>
                  <button
                    className="text-xs text-muted hover:text-loss ml-auto"
                    disabled={busy}
                    onClick={() =>
                      perform(
                        () => getStore().removeFriend(friend.friendshipId),
                        `Removed @${friend.username} from your friends.`,
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          {graph.outgoing.length > 0 && (
            <div className="text-xs text-muted mt-3">
              Pending: {graph.outgoing.map((request) => `@${request.username}`).join(", ")}
            </div>
          )}
        </section>

        <section className="panel px-5 py-4 lg:col-span-2">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-semibold">Available player network</h2>
            <span className="mono text-xs text-muted">{sharedCount} ready to simulate</span>
          </div>
          <p className="text-xs text-muted mt-1 mb-3">
            Direct friends and friends of friends can join the same experiment;
            the selected players do not need to be friends with one another.
          </p>
          {graph.eligiblePlayers.length === 0 ? (
            <div className="text-sm text-muted">Your network is empty.</div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {graph.eligiblePlayers.map((player) => (
                <div key={player.userId} className="rounded-md border border-line bg-panel2 px-3 py-3">
                  <div className="font-semibold text-sm">@{player.username}</div>
                  <div className="text-[11px] text-muted mt-0.5">
                    {player.relationshipDegree === 1 ? "Direct friend" : "Friend of a friend"}
                  </div>
                  <div className="text-xs mt-2">
                    {player.strategy ? (
                      <span style={{ color: "var(--gain)" }}>
                        Ready · {player.strategy.name}
                      </span>
                    ) : (
                      <span className="text-muted">No strategy shared</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
