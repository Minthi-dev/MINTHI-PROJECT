// Segnale acustico generato (nessun file audio): due toni brevi.
let ctx: AudioContext | null = null

export function playChime() {
  try {
    ctx ??= new AudioContext()
    const now = ctx.currentTime
    for (const [i, f] of [880, 1320].entries()) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = f
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.0001, now + i * 0.18)
      gain.gain.exponentialRampToValueAtTime(0.3, now + i * 0.18 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.3)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + i * 0.18)
      osc.stop(now + i * 0.18 + 0.32)
    }
  } catch { /* audio non disponibile */ }
}

export function unlockAudio() {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch { /* ignora */ }
}
