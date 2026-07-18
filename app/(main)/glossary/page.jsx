import { FullAnalyticsGlossary } from "@/components/AnalyticsGlossary";
import { PageHeader, WarningNote } from "@/components/ui";
export default function GlossaryPage() {
  return (
    <div>
      <PageHeader
        title="Poker and analytics glossary"
        sub="A beginner-friendly guide to every important abbreviation and advanced metric used in QuantPoker. Start with the plain-English line; the advanced note is there when you want more depth."
      />

      <div className="mb-6 max-w-4xl">
        <WarningNote>
          No single statistic proves that a player or strategy is good. Always
          read a percentage together with its sample size and confidence
          interval, and treat simulated profit as evidence about this synthetic
          opponent pool.
        </WarningNote>
      </div>

      <section className="panel px-5 py-4 mb-6 max-w-4xl">
        <h2 className="font-semibold">A quick way to read any stat</h2>
        <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3 text-sm">
          <li className="rounded-lg bg-panel2 px-3 py-3">
            <span className="mono text-accent font-bold">1.</span> What behavior
            does it measure?
          </li>
          <li className="rounded-lg bg-panel2 px-3 py-3">
            <span className="mono text-accent font-bold">2.</span> How many real
            opportunities support it?
          </li>
          <li className="rounded-lg bg-panel2 px-3 py-3">
            <span className="mono text-accent font-bold">3.</span> How wide is
            its uncertainty range?
          </li>
          <li className="rounded-lg bg-panel2 px-3 py-3">
            <span className="mono text-accent font-bold">4.</span> Does the
            context—position, stack, or pool—change the meaning?
          </li>
        </ol>
      </section>

      <FullAnalyticsGlossary />
    </div>
  );
}
