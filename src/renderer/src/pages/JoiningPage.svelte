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
    border: 3px solid rgba(99, 102, 241, 0.15);
    border-top-color: var(--accent);
    animation: spin 0.9s linear infinite;
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
    background: var(--bg-card-hover);
    border: 2px solid var(--border-strong);
    transition: all 0.3s ease;
  }
  .step-dot.done {
    background: var(--success);
    border-color: var(--success);
  }
  .step-label {
    font-size: 12px;
    color: var(--text-faint);
    white-space: nowrap;
  }
  .step-label.done {
    color: var(--text-dim);
  }
  .status-box {
    text-align: center;
    max-width: 420px;
  }
  .status-msg {
    color: var(--text);
    font-size: 15px;
  }
  .status-sub {
    color: var(--text-faint);
    font-size: 13px;
    margin-top: 6px;
    font-family: var(--font-mono);
  }
  .err {
    color: var(--danger);
    font-size: 14px;
    line-height: 1.5;
  }
  .retry-btn {
    margin-top: 16px;
    padding: 11px 22px;
    border-radius: var(--radius-sm);
    background: var(--bg-card-hover);
    border: 1px solid var(--border-strong);
    color: var(--text);
    font-size: 14px;
    font-weight: 500;
    transition: border-color 0.15s ease;
  }
  .retry-btn:hover {
    border-color: var(--accent);
  }
</style>