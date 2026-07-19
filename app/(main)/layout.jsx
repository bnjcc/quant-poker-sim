import { Nav } from "@/components/Nav";
import { FaultyTerminalBackground } from "@/components/reactbits/FaultyTerminal";
export default function MainLayout({ children }) {
  return (
    <>
      <FaultyTerminalBackground />
      <div className="app-shell flex min-h-screen flex-col md:flex-row">
        <div className="ambient-orb ambient-orb-one" aria-hidden="true" />
        <div className="ambient-orb ambient-orb-two" aria-hidden="true" />
        <Nav />
        <main className="app-main flex-1 min-w-0 px-4 pt-5 pb-28 sm:px-6 md:py-6 lg:px-10 lg:py-8 max-w-[1440px]">
          {children}
        </main>
      </div>
    </>
  );
}
