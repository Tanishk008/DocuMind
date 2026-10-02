// Ambient hero backdrop: a graph-paper grid (the "Docu" half) washed over by slow-drifting
// glow orbs (the "Mind" half). Purely decorative and purely CSS — it never captures pointer
// events, and the grid is masked to fade out behind the headline so copy stays legible.
export function HeroBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="hero-grid absolute inset-0" />

      <div className="hero-orb hero-orb-a absolute -left-24 -top-32 h-[28rem] w-[28rem] rounded-full bg-blue-400/25 blur-3xl dark:bg-blue-500/10" />
      <div className="hero-orb hero-orb-b absolute -bottom-40 -right-24 h-[32rem] w-[32rem] rounded-full bg-violet-400/25 blur-3xl dark:bg-violet-500/10" />
      <div className="hero-orb hero-orb-c absolute left-1/2 top-1/3 h-[24rem] w-[24rem] rounded-full bg-sky-300/25 blur-3xl dark:bg-indigo-500/10" />
    </div>
  )
}

export default HeroBackground
