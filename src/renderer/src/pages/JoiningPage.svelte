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

  onMount(() => {
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
      unsubscribeConfig()
      service?.__cleanup?.()
    }
  })
</script>

<main class="joining animate-in">
  <div class="spinner-wrap">
    <div class="spinner"></div>
  </div>

  <div class="steps">
    <div class="step">
      <span class="step-dot" class:done={phase !== 'connecting'}></span>
      <span class="step-label" class:done={phase !== 'connecting'}>Connecting</span>
    </div>
    <div class="step">
      <span class="step-dot" class:done={phase === 'negotiating' || phase === 'establishing' || phase === 'connected'}></span>
      <span class="step-label" class:done={phase === 'negotiating' || phase === 'establishing' || phase === 'connected'}>Negotiating</span>
    </div>
    <div class="step">
      <span class="step-dot" class:done={phase === 'establishing' || phase === 'connected'}></span>
      <span class="step-label" class:done={phase === 'establishing' || phase === 'connected'}>Secure connection</span>
    </div>
    <div class="step">
      <span class="step-dot" class:done={phase === 'connected'}></span>
      <span class="step-label" class:done={phase === 'connected'}>Connected</span>
    </div>
  </div>

  <div class="status-box">
    {#if error}
      <p class="err">{error}</p>
      <button class="retry-btn" onclick={retry}>Try another code</button>
    {:else}
      <p class="status-msg">{statusMessage}</p>
      <p class="status-sub">Joining session {code}</p>
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
    gap: 36px;
    padding: 32px;
  }
  .spinner-wrap {
    display: flex;
    justify-content: center;
  }
  .spinner {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: #fff;
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
    background: #fff;
    border: 2.5px solid var(--border);
    transition: all 0.3s ease;
  }
  .step-dot.done {
    background: var(--success);
    border-color: var(--border);
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
    max-width: 440px;
    background: var(--bg-card);
    border: var(--border-w) solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 24px 28px;
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
    background: #fff;
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
</style>