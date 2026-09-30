<script lang="ts">
  import { onMount } from 'svelte'
  import { navigate } from '../routes/router'
  import { SessionService } from '../services/SessionService'
  import { sessionStore } from '../stores/session'
  import { showToast } from '../stores/toast'
  import { config } from '../services/config'

  export let code = ''

  let phase = 'connecting'
  let statusMessage = 'Connecting to signaling service…'
  let error: string | null = null
  let tipIdx = 0

  const tips = [
    'Screens flow directly peer-to-peer — never through our server.',
    'Tip: press F in the viewer for fullscreen.',
    'Low latency? A wired connection beats Wi-Fi.',
    'Your code expires when the host ends the session.'
  ]

  const defaultIce = [{ urls: 'stun:stun.l.google.com:19302' }]

  // Hoisted so the retry button can end a failed session explicitly.
  // The live session itself belongs to sessionStore and must survive
  // navigation to the viewer — never end it in the unmount teardown.
  let service: SessionService | null = null

  function retry(): void {
    service?.endSession()
    service = null
    navigate({ name: 'join' })
  }

  function progressFor(p: string): number {
    if (p === 'connected') return 100
    if (p === 'establishing') return 75
    if (p === 'negotiating') return 45
    return 15
  }

  function stepDone(step: string): boolean {
    if (step === 'connecting') return phase !== 'connecting'
    if (step === 'negotiating') return phase === 'negotiating' || phase === 'establishing' || phase === 'connected'
    if (step === 'secure') return phase === 'establishing' || phase === 'connected'
    return phase === 'connected'
  }

  onMount(() => {
    // rotating tips: coarse 3.5s interval (4 renders total per cycle — cheap)
    const tipTimer = setInterval(() => {
      tipIdx = (tipIdx + 1) % tips.length
    }, 3500)

    const unsubscribeConfig = config.subscribe(($cfg) => {
      if (service || !$cfg) return
      const displayName = localStorage.getItem('sight-display-name') ?? 'Guest'
      service = new SessionService(
        {
          signalingUrl: $cfg.signalingUrl,
          iceServers: $cfg.iceServers,
          platform: window.desktop?.platform ?? 'unknown',
          displayName,
          role: 'guest',
          localStream: null,
          sourceKind: null,
          code
        },
        {
          onPhaseChange: (p) => {
            phase = p
          },
          onMetrics: () => {},
          onVideoReady: () => {},
          onError: (c, m) => {
            error = m
            statusMessage = m
          },
          onStatusMessage: (m) => {
            statusMessage = m
          }
        }
      )
      sessionStore.set({ service, phase: 'connecting', role: 'guest' })
      service.start()

      const unsubPhase = service.phase.subscribe((p) => {
        phase = p
        if (p === 'connected') {
          setTimeout(() => navigate({ name: 'viewer' }), 600)
        }
        if (p === 'disconnected' && !error) {
          error = 'Could not connect to the session.'
        }
      })
      const unsubErr = service.errorStore.subscribe((e) => {
        if (e) error = e.message
      })

      service.__cleanup = () => {
        unsubPhase()
        unsubErr()
      }
    })

    return () => {
      clearInterval(tipTimer)
      unsubscribeConfig()
      service?.__cleanup?.()
    }
  })
</script>

<main class="joining animate-in">
  <!-- pipeline: you -> signaling -> host, packets travel via CSS only -->
  <div class="pipe-card" aria-hidden="true">
    <div class="pipe-node">
      <span class="node-dot you"></span>
      <span class="node-label">You</span>
    </div>
    <div class="pipe-track">
      <span class="packet p1"></span>
      <span class="packet p2"></span>
    </div>
    <div class="pipe-node">
      <span class="node-dot server"></span>
      <span class="node-label">Signaling</span>
    </div>
    <div class="pipe-track">
      <span class="packet p3"></span>
      <span class="packet p4"></span>
    </div>
    <div class="pipe-node">
      <span class="node-dot host" class:lit={phase === 'connected'}></span>
      <span class="node-label">Host</span>
    </div>
  </div>

  <div class="spinner-wrap">
    <div class="spinner"></div>
  </div>

  <div class="steps">
    <div class="step">
      <span class="step-dot" class:done={stepDone('connecting')} class:busy={phase === 'connecting' && !error}></span>
      <span class="step-label" class:done={stepDone('connecting')}>Connecting</span>
    </div>
    <div class="step">
      <span class="step-dot" class:done={stepDone('negotiating')} class:busy={phase === 'negotiating' && !error}></span>
      <span class="step-label" class:done={stepDone('negotiating')}>Negotiating</span>
    </div>
    <div class="step">
      <span class="step-dot" class:done={stepDone('secure')} class:busy={phase === 'establishing' && !error}></span>
      <span class="step-label" class:done={stepDone('secure')}>Secure connection</span>
    </div>
    <div class="step">
      <span class="step-dot" class:done={stepDone('connected')}></span>
      <span class="step-label" class:done={stepDone('connected')}>Connected</span>
    </div>
  </div>

  <div class="status-box">
    {#if error}
      <p class="err">{error}</p>
      <button class="retry-btn" onclick={retry}>Try another code</button>
    {:else}
      <div class="progress" role="progressbar" aria-valuenow={progressFor(phase)} aria-valuemin="0" aria-valuemax="100">
        <div class="progress-fill" style="width: {progressFor(phase)}%"></div>
        <div class="progress-shine" aria-hidden="true"></div>
      </div>
      <p class="status-msg">{statusMessage}</p>
      <p class="status-sub">Joining session <b class="code">{code}</b></p>
      <p class="tip">💡 {tips[tipIdx]}</p>
    {/if}
  </div>
</main>

<style>
  .joining {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 26px;
    padding: 32px;
    overflow-y: auto;
  }
  .pipe-card {
    display: flex;
    align-items: center;
    gap: 0;
    background: var(--bg-card);
    border: var(--border-w) solid var(--border);
    border-radius: 16px;
    box-shadow: var(--shadow-xs);
    padding: 14px 20px;
  }
  .pipe-node {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .node-dot {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2.5px solid var(--border);
    background: var(--surface);
  }
  .node-dot.you { background: var(--accent); }
  .node-dot.server { background: var(--mustard); animation: pulse-dot 1.6s ease infinite; }
  .node-dot.host { background: var(--surface); transition: background 0.3s; }
  .node-dot.host.lit { background: var(--success); }
  .node-label {
    font-family: var(--font-mono);
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .pipe-track {
    position: relative;
    width: 74px;
    height: 3px;
    background: var(--bg-soft);
    border-radius: 999px;
    margin: 0 10px 18px;
    overflow: hidden;
  }
  .packet {
    position: absolute;
    top: 50%;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    transform: translate(-50%, -50%);
    animation: travel 1.6s linear infinite;
  }
  .packet.p2 { animation-delay: 0.8s; background: var(--teal); }
  .packet.p3 { animation-delay: 0.4s; }
  .packet.p4 { animation-delay: 1.2s; background: var(--teal); }
  @keyframes travel {
    from { left: -6%; opacity: 0; }
    15% { opacity: 1; }
    85% { opacity: 1; }
    to { left: 106%; opacity: 0; }
  }
  .spinner-wrap {
    display: flex;
    justify-content: center;
  }
  .spinner {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: var(--surface);
    border: 3.5px solid var(--border);
    border-top-color: var(--accent);
    border-right-color: var(--teal);
    border-bottom-color: var(--mustard);
    animation: spin 0.9s linear infinite;
    box-shadow: 2px 2px 0 rgba(37, 40, 66, 0.12);
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .steps {
    display: flex;
    gap: 28px;
    align-items: center;
  }
  .step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .step-dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--surface);
    border: 2.5px solid var(--border);
    transition: background 0.3s ease;
  }
  .step-dot.done {
    background: var(--success);
    border-color: var(--border);
  }
  .step-dot.busy {
    background: var(--accent);
    animation: pulse-dot 1.1s ease infinite;
  }
  .step-label {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-faint);
    white-space: nowrap;
  }
  .step-label.done {
    color: var(--text-dim);
  }
  .status-box {
    text-align: center;
    max-width: 460px;
    width: 100%;
    background: var(--bg-card);
    border: var(--border-w) solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 24px 28px;
  }
  .progress {
    position: relative;
    height: 10px;
    border-radius: 999px;
    background: var(--bg-soft);
    border: 2px solid var(--border);
    overflow: hidden;
    margin-bottom: 16px;
  }
  .progress-fill {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--accent), var(--teal));
    transition: width 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .progress-shine {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 40%;
    background: linear-gradient(105deg, transparent, rgba(255,255,255,0.6), transparent);
    animation: shine-x 1.8s ease-in-out infinite;
  }
  @keyframes shine-x {
    from { left: -40%; }
    to { left: 100%; }
  }
  .status-msg {
    color: var(--text);
    font-size: 15px;
    font-weight: 700;
  }
  .status-sub {
    color: var(--text-muted);
    font-size: 13px;
    margin-top: 6px;
    font-family: var(--font-mono);
    font-weight: 700;
  }
  .status-sub .code {
    color: var(--text);
    letter-spacing: 0.12em;
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: 8px;
    padding: 1px 8px;
  }
  .tip {
    margin-top: 14px;
    font-family: var(--font-mono);
    font-size: 11.5px;
    font-weight: 700;
    color: var(--text-faint);
    line-height: 1.5;
  }
  .err {
    color: var(--danger);
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 700;
    line-height: 1.5;
  }
  .retry-btn {
    margin-top: 16px;
    padding: 11px 22px;
    border-radius: 12px;
    background: var(--surface);
    border: 2.5px solid var(--border);
    box-shadow: var(--shadow-xs);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    transition: all 0.13s ease;
  }
  .retry-btn:hover {
    border-color: var(--accent);
    transform: translate(-1px, -1px);
    box-shadow: var(--shadow-sm);
  }
  @media (prefers-reduced-motion: reduce) {
    .packet, .spinner, .progress-shine, .node-dot.server, .step-dot.busy { animation: none !important; }
  }
</style>
