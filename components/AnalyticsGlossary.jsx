import Link from "next/link";
export const GLOSSARY_GROUPS = [
  {
    id: "poker",
    title: "Playing-style statistics",
    intro:
      "These describe what a player tends to do. They are frequencies, not grades: higher is not automatically better.",
    entries: [
      {
        term: "VPIP",
        full: "Voluntarily Put Money In Pot",
        plain:
          "How often you choose to invest chips before the flop, excluding forced blinds.",
        example:
          "VPIP 25% means you voluntarily played about 25 of every 100 starting hands.",
        advanced:
          "Useful for measuring range width. Interpret it with position, table size, and PFR—not by itself.",
      },
      {
        term: "PFR",
        full: "Preflop Raise",
        plain: "How often you raise before the flop.",
        example: "PFR 18% means you raised about 18 of every 100 dealt hands.",
        advanced:
          "The gap between VPIP and PFR shows how much calling or limping you do preflop.",
      },
      {
        term: "3-bet",
        full: "Preflop re-raise",
        plain:
          "A raise after someone has already raised. It does not mean three times the bet size.",
        example:
          "Player A raises to 6; Player B raises to 18. Player B made a 3-bet.",
        advanced:
          "The big blind counts as the first bet, the opening raise as the second, and the re-raise as the third.",
      },
      {
        term: "Fold to 3-bet",
        full: "Fold after facing a preflop re-raise",
        plain:
          "After you raise, how often you fold when another player re-raises.",
        example:
          "60% means you folded 6 out of 10 times that your raise was 3-bet.",
        advanced:
          "This is opportunity-based: only hands where you raised and then faced a 3-bet count.",
      },
      {
        term: "C-bet",
        full: "Continuation bet",
        plain:
          "Betting the flop after you were the last raiser before the flop.",
        example:
          "You raise preflop, get called, then bet the flop: that flop bet is a c-bet.",
        advanced:
          "C-bet frequency depends heavily on board texture, number of opponents, and position.",
      },
      {
        term: "Open-limp",
        full: "First-in call before the flop",
        plain:
          "Entering an unraised pot by only calling the big blind instead of raising.",
        example:
          "Blinds are 1/2 and you are first in for 2 chips: that is an open-limp.",
        advanced:
          "A limp behind another limper is different; this statistic tracks first-in opportunities.",
      },
      {
        term: "AF",
        full: "Aggression factor",
        plain: "How many bets and raises you make for every call.",
        example: "AF 2.0 means two bets or raises for each call in the sample.",
        advanced:
          "AF ignores checks and folds. Aggression frequency includes all decisions, so the two can tell different stories.",
      },
      {
        term: "SD / Showdown",
        full: "Showdown",
        plain:
          "The hand reaches the end and remaining players reveal cards to determine the winner.",
        example: "A hand marked SD in the hand list reached showdown.",
        advanced:
          "Showdown and non-showdown results separate value realization from pots won or lost before cards are revealed.",
      },
      {
        term: "SPR",
        full: "Stack-to-Pot Ratio",
        plain: "Your effective remaining stack divided by the current pot.",
        example: "A 20-chip pot with 100 chips behind has an SPR of 5.",
        advanced:
          "Low SPRs make stacks easier to commit; high SPRs leave more room for multi-street decisions.",
      },
      {
        term: "bb / BB",
        full: "Big blind",
        plain:
          "The larger forced blind and the standard unit used to compare games at different stakes.",
        example:
          "At 1/2 blinds, 1 bb equals 2 chips and a 100bb stack equals 200 chips.",
        advanced:
          "Lowercase bb usually means the measurement unit; BB can also refer to the player in the big-blind seat.",
      },
    ],
  },
  {
    id: "positions",
    title: "Table positions",
    intro:
      "Position describes when you act. Acting later gives you more information about what opponents did first.",
    entries: [
      {
        term: "BTN",
        full: "Button",
        plain:
          "The dealer position. It usually acts last after the flop and is the most advantageous seat.",
        example:
          "Ranges are normally widest on the BTN because fewer players remain and you act late.",
        advanced: "The button moves one active seat after every hand.",
      },
      {
        term: "SB",
        full: "Small Blind",
        plain:
          "The seat posting the smaller forced bet, immediately left of the button in games with 3+ players.",
        example: "At 1/2 blinds, the SB posts 1 chip.",
        advanced:
          "The SB acts early after the flop, which makes it a difficult position despite its discount preflop.",
      },
      {
        term: "BB",
        full: "Big Blind",
        plain: "The seat posting the full forced blind.",
        example:
          "At 1/2 blinds, the BB posts 2 chips and can check if nobody raises.",
        advanced:
          "The BB closes the action preflop in an unraised pot but acts early after the flop.",
      },
      {
        term: "UTG",
        full: "Under the Gun",
        plain: "The first player to act before the flop at a full table.",
        example:
          "UTG generally plays fewer hands because every other player still has a chance to act.",
        advanced:
          "At short-handed tables, position labels compress because some seats do not exist.",
      },
      {
        term: "UTG+1",
        full: "Under the Gun plus one",
        plain:
          "The player immediately after UTG at an eight- or nine-player table.",
        example:
          "UTG+1 can play slightly wider than UTG, but most of the table still acts afterward.",
        advanced: "This position is omitted at shorter tables.",
      },
      {
        term: "MP",
        full: "Middle Position",
        plain: "An early-middle seat used at seven- to nine-player tables.",
        example:
          "MP acts after the earliest seats but before LJ, HJ, CO, and BTN at a full table.",
        advanced:
          "Opening ranges usually widen gradually as positions move toward the button.",
      },
      {
        term: "LJ",
        full: "Lojack",
        plain: "The seat immediately before the hijack at a nine-player table.",
        example:
          "LJ has fewer players behind than UTG, but HJ, CO, and BTN can still apply pressure.",
        advanced:
          "The lojack is omitted when the table has eight or fewer players.",
      },
      {
        term: "HJ",
        full: "Hijack",
        plain: "The seat two places to the right of the button in 6-max poker.",
        example: "HJ acts after UTG but before CO and BTN preflop.",
        advanced:
          "It is a middle position: ranges can widen, but two strong late positions remain.",
      },
      {
        term: "CO",
        full: "Cutoff",
        plain: "The seat immediately to the right of the button.",
        example:
          "CO is a strong late position and often opens a fairly wide range.",
        advanced:
          "Only the BTN has guaranteed position over the CO after the flop.",
      },
    ],
  },
  {
    id: "analytics",
    title: "Results and risk analytics",
    intro:
      "These measure performance and uncertainty. The uncertainty measures matter as much as the headline win rate.",
    entries: [
      {
        term: "Win rate %",
        full: "Average return measured in big blinds",
        plain:
          "A stake-neutral percentage showing how quickly the strategy won or lost. Positive is winning; negative is losing.",
        example:
          "+4% means an average profit of 4 big blinds per 100 hands in this simulation.",
        advanced:
          "It normalizes both stake size and sample length, but converges slowly because poker variance is large.",
      },
      {
        term: "95% CI",
        full: "95% Confidence Interval",
        plain:
          "A plausible range around the estimated win rate, showing how uncertain the estimate is.",
        example:
          "A result of +4 with a CI of −3 to +11 is still too uncertain to separate winning from losing.",
        advanced:
          "If the interval includes zero, this run does not establish a non-zero win rate at the displayed confidence level.",
      },
      {
        term: "σ / Std dev",
        full: "Standard deviation",
        plain:
          "How swingy the results are. Larger values mean outcomes jump around more.",
        example:
          "Two strategies can both average +3%, while one has much larger up-and-down swings.",
        advanced:
          "Standard deviation drives confidence-interval width and the bankroll risk estimate.",
      },
      {
        term: "Max drawdown",
        full: "Largest fall from a previous bankroll peak",
        plain:
          "The worst downswing between a high point and the low point that followed it.",
        example:
          "A bankroll peaks at 300bb and later falls to 180bb: that is a 120bb drawdown.",
        advanced:
          "It is path-dependent and tends to grow as the simulated sample gets longer.",
      },
      {
        term: "Profit factor",
        full: "Gross wins divided by gross losses",
        plain:
          "How many chips were won for each chip lost across winning and losing hands.",
        example:
          "1.20 means 1.20 chips were won for every 1 chip lost before netting them together.",
        advanced:
          "Above 1 is profitable in-sample; it does not account for uncertainty or guarantee future performance.",
      },
      {
        term: "Risk of ruin",
        full: "Estimated chance of losing the chosen bankroll",
        plain:
          "A model-based estimate of whether normal swings could exhaust your bankroll.",
        example:
          "A smaller bankroll and a swingier strategy produce a higher estimated risk.",
        advanced:
          "This app uses a diffusion approximation and assumes win rate and variance remain stable—an important simplification.",
      },
      {
        term: "Rake",
        full: "Fee taken from pots",
        plain: "The amount the poker room removes from eligible pots.",
        example:
          "A 5% rake on a 100-chip pot is 5 chips, unless a cap or no-flop rule lowers it.",
        advanced:
          "Small strategy edges can disappear after rake, so compare experiments under the same rake structure.",
      },
      {
        term: "Statistically significant",
        full: "The displayed confidence interval excludes zero",
        plain:
          "The run has enough evidence to distinguish its result from break-even under the model’s assumptions.",
        example: "A CI of +1 to +7 is significant; −2 to +8 is not.",
        advanced:
          "Significance is not the same as practical importance, correctness, or real-world profitability.",
      },
    ],
  },
  {
    id: "model",
    title: "Model and confidence terms",
    intro:
      "These explain how much the simulation learned from you versus filling gaps with conservative defaults.",
    entries: [
      {
        term: "Model confidence",
        full: "Observed-data weight",
        plain:
          "How much a simulated choice came from your recorded decisions instead of the default poker model.",
        example:
          "20% confidence means the model relied mostly on its prior because few matching examples existed.",
        advanced:
          "It is a shrinkage weight, not the probability that the chosen action is correct or profitable.",
      },
      {
        term: "Prior",
        full: "Default behavior before enough personal data exists",
        plain:
          "A sensible starting pattern the model uses when it has not seen you play a similar spot often enough.",
        example:
          "With one river decision recorded, the result stays close to the prior instead of copying that one action exactly.",
        advanced:
          "The policy blends data and prior with weight n/(n+8), reducing small-sample overfitting.",
      },
      {
        term: "Wilson interval",
        full: "Small-sample confidence interval for a percentage",
        plain:
          "A safer uncertainty range for stats such as VPIP when only a few opportunities were observed.",
        example:
          "VPIP 30% from 10 hands gets a much wider interval than VPIP 30% from 1,000 hands.",
        advanced:
          "It behaves better near 0% and 100% than the simple normal approximation.",
      },
      {
        term: "Sample size",
        full: "Number of relevant observations",
        plain: "How many hands or actual opportunities support a statistic.",
        example:
          "You may play 100 hands but face only three 3-bets, so fold-to-3-bet still has a sample of three.",
        advanced:
          "Opportunity counts—not just total hands—determine reliability for conditional poker statistics.",
      },
      {
        term: "Seed",
        full: "Reproducible random starting value",
        plain:
          "A code that makes the simulator repeat the same random sequence when settings and version are unchanged.",
        example:
          "Use the same seed to compare two opponent pools while keeping the random deal sequence controlled.",
        advanced:
          "Reproducibility holds only within the same simulation version and configuration.",
      },
    ],
  },
];
function GlossaryContents({ groups }) {
  const selected = GLOSSARY_GROUPS.filter((group) => groups.includes(group.id));
  return (
    <div className="space-y-6">
      {selected.map((group) => (
        <section key={group.id}>
          <h2 className="font-semibold text-lg">{group.title}</h2>
          <p className="text-sm text-muted mt-1 mb-3 max-w-4xl">
            {group.intro}
          </p>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {group.entries.map((entry) => (
              <article
                key={entry.term}
                className="rounded-lg border border-line bg-panel2/45 px-4 py-3"
              >
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <h3 className="mono font-bold text-accent">{entry.term}</h3>
                  <span className="text-xs text-muted">{entry.full}</span>
                </div>
                <p className="text-sm mt-2 leading-relaxed">{entry.plain}</p>
                <p className="text-xs text-muted mt-2">
                  <span className="text-ink font-semibold">Example:</span>{" "}
                  {entry.example}
                </p>
                <p className="text-xs text-info mt-2">
                  <span className="font-semibold">Advanced:</span>{" "}
                  {entry.advanced}
                </p>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
export function AnalyticsGlossary({
  groups,
  title = "New to poker stats? Start here",
}) {
  return (
    <details className="panel px-5 py-4 mb-6 group">
      <summary className="cursor-pointer list-none flex items-center gap-3">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-accent text-accent font-bold">
          ?
        </span>
        <span>
          <span className="font-semibold">{title}</span>
          <span className="block text-xs text-muted mt-0.5">
            Plain-English definitions, examples, and advanced interpretation.
          </span>
        </span>
        <span className="ml-auto text-xs text-accent group-open:hidden">
          Open guide
        </span>
        <span className="ml-auto text-xs text-accent hidden group-open:inline">
          Close guide
        </span>
      </summary>
      <div className="border-t border-line mt-4 pt-4">
        <GlossaryContents groups={groups} />
        <div className="mt-5 text-sm">
          <Link href="/glossary" className="text-accent hover:underline">
            See the complete poker and analytics glossary →
          </Link>
        </div>
      </div>
    </details>
  );
}
export function FullAnalyticsGlossary() {
  return (
    <GlossaryContents groups={["poker", "positions", "analytics", "model"]} />
  );
}
