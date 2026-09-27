<script lang="ts">
  import { onMount } from 'svelte'
  import { navigate } from '../routes/router'
  import { config, settings } from '../services/config'
  import { SessionService } from '../services/SessionService'
  import { sessionStore, clearActiveSession } from '../stores/session'
  import { showToast } from '../stores/toast'
  import type { ConnectionPhase, ConnectionMetrics } from '@shared/types/models'

  export let sessionId = ''

  let phase: ConnectionPhase = 'idle'
  let metrics: ConnectionMetrics | null = null
  let code = ''
  let guestJoined = false
  let inviteUrl = ''
  let signalingStatus = 'idle'

  let displayName = localStorage.getItem('sight-display-name') ?? 'Host'

  const defaultIce = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]

  onMount(() => {
    const stream = window.__sightPendingStream
    if (!stream) {
      showToast('No capture stream found. Please pick a source again.', 'error')
      navigate({ name: 'home' })
      return
    }

    const service = new SessionService(
      {
        signalingUrl: $config?.signalingUrl ?? 'ws://localhost:8787/ws',
        iceServers: $config?.iceServers ?? defaultIce,
        platform: window.desktop?.platform ?? 'unknown',
        displayName,
        role: 'host',
        localStream: stream,
        sourceKind: null
      },
      {
        onPhaseChange: (p) => (phase = p),
        onMetrics: (m) => (metrics = m),
        onVideoReady: () => {},
        onError: (code, message) => {
          showToast(message, 'error')
        },
        onStatusMessage: () => {}
      }
    )

    sessionStore.set({ service, phase: 'idle', role: 'host' })
    service.start()

    const unsubscribePhase = service.phase.subscribe((p) => {
      phase = p
      if (
        p === 'connected' &&
        sessionStorage.getItem('sight-audio') === '1' &&
        window.desktop?.platform !== 'linux'
      ) {
        sessionStorage.setItem('sight-audio', '0')
        service.toggleAudio().catch(() => {})
      }
    })
    const unsubscribeSig = service.signalingStatus.subscribe((s) => {
      signalingStatus = s
    })
    const unsubscribeCode = service.sessionCodeStore.subscribe((c) => {
      if (c) {
        code = c
        inviteUrl = `https://sight.app/join/${c}`
      }
    })
    const unsubscribeParticipants = service.participants.subscribe((list) => {
      guestJoined = list.some((p) => !p.isSelf && !p.isHost)
    })
    const unsubscribeMetrics = service.metrics.subscribe((m) => {
      metrics = m
    })

    return () => {
      // Unsubscribe only: the live session belongs to sessionStore and must
      // survive navigation (e.g. "Open viewer"). Ending is explicit via endSession().
      unsubscribePhase()
      unsubscribeSig()
      unsubscribeCode()
      unsubscribeParticipants()
      unsubscribeMetrics()
    }
  })

  function copyCode(): void {
    if (!code) return
    navigator.clipboard.writeText(code)
    showToast('Session code copied.', 'success')
  }

  function copyInviteLink(): void {
    if (!inviteUrl) return
    navigator.clipboard.writeText(inviteUrl)
    showToast('Invite link copied.', 'success')
  }

  function goToViewer(): void {
    navigate({ name: 'viewer' })
  }

  function endSession(): void {
    clearActiveSession()
    navigate({ name: 'home' })
    showToast('Session ended.', 'info')
  }
</script>

<main class="host animate-in">
  {#if phase === 'connected' && guestJoined}
    <div class="connected-banner">
      <span class="live-dot"></span>
      Someone joined your session. Your screen is now being shared.
      <button class="viewer-link" onclick={goToViewer}>Open viewer →</button>
    </div>
  {/if}

  <div class="card">
    <div class="card-header">
      <span class="icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg></span>
      <h1>Your session is ready</h1>
      <p class="sub">Share this code to let someone join.</p>
    </div>

    <div class="code-box">
      <span class="code">{code || '••••–•••'}</span>
      <span class="copy-hint">Copy it below or send the invite link.</span>
    </div>

    <div class="divider"></div>

    <div class="copy-row">
      <button class="copy-btn" onclick={copyCode} disabled={!code}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
        Copy Code
      </button>
      <button class="copy-btn" onclick={copyInviteLink} disabled={!inviteUrl}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
        Copy Invite Link
      </button>
    </div>

    <div class="status-list">
      <div class="status-item">
        <span class="status-dot" class:ok={signalingStatus === 'connected'} class:anim={signalingStatus === 'connecting'}></span>
        <span>{signalingStatus === 'connected' ? 'Signaling connected' : signalingStatus === 'connecting' ? 'Connecting to signaling…' : 'Signaling disconnected'}</span>
      </div>
      <div class="status-item">
        <span class="status-dot" class:ok={guestJoined}></span>
        <span>{guestJoined ? 'Guest connected' : 'Waiting for someone to join…'}</span>
      </div>
      {#if metrics?.rtt != null}
        <div class="status-item">
          <span class="status-dot ok"></span>
          <span>Latency {metrics.rtt} ms · {metrics.connectionType === 'relay' ? 'Relay' : metrics.connectionType === 'direct' ? 'Direct' : 'Connecting'}</span>
        </div>
      {/if}
    </div>
  </div>

  <button class="end-btn" onclick={endSession}>End session</button>
</main>

<style>
  .host {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 20px;
    padding: 32px;
    overflow-y: auto;
  }
  .card {
    width: 100%;
    max-width: 480px;
    background: var(--bg-card);
    border: var(--border-w) solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 0 32px 32px;
    overflow: hidden;
  }
  .card::before {
    content: '';
    display: block;
    height: 12px;
    margin: 0 -32px 24px -32px;
    background: linear-gradient(
      90deg,
      var(--accent) 0 33.333%,
      var(--teal) 33.333% 66.666%,
      var(--mustard) 66.666% 100%
    );
    border-bottom: var(--border-w) solid var(--border);
  }
  .card-header {
    text-align: center;
    margin-bottom: 24px;
  }
  .icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: var(--accent);
    border: var(--border-w) solid var(--border);
    box-shadow: var(--shadow-xs);
    transform: rotate(-2deg);
    color: #fff;
    margin-bottom: 12px;
  }
  h1 {
    font-family: var(--font-logo);
    font-size: 20px;
    letter-spacing: 0;
  }
  .sub {
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 700;
    margin-top: 6px;
  }
  .code-box {
    text-align: center;
    padding: 20px;
    border-radius: 12px;
    background: #fff;
    border: 2.5px dashed var(--border);
  }
  .code {
    display: block;
    font-family: var(--font-mono);
    font-size: 38px;
    font-weight: 800;
    letter-spacing: 0.18em;
    color: var(--text);
  }
  .copy-hint {
    color: var(--text-faint);
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 700;
    margin-top: 6px;
    display: block;
  }
  .divider {
    height: 2.5px;
    background: var(--border);
    opacity: 0.13;
    border-radius: 999px;
    margin: 20px 0;
  }
  .copy-row {
    display: flex;
    gap: 10px;
  }
  .copy-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px;
    border-radius: 12px;
    background: #fff;
    border: 2.5px solid var(--border);
    box-shadow: var(--shadow-xs);
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text);
    transition: all 0.13s ease;
  }
  .copy-btn:hover:not(:disabled) {
    border-color: var(--accent);
    transform: translate(-1px, -1px);
    box-shadow: var(--shadow-sm);
  }
  .copy-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .status-list {
    margin-top: 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .status-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 700;
    color: var(--text-muted);
  }
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-faint);
    flex-shrink: 0;
  }
  .status-dot.ok {
    background: var(--success);
  }
  .status-dot.anim {
    background: var(--accent);
    animation: pulse-dot 1.2s ease infinite;
  }
  .connected-banner {
    width: 100%;
    max-width: 480px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border-radius: 12px;
    background: #fff;
    border: 2.5px solid var(--border);
    border-left: 6px solid var(--success);
    box-shadow: var(--shadow-xs);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 700;
  }
  .live-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--success);
    animation: pulse-dot 1.5s ease infinite;
    flex-shrink: 0;
  }
  .viewer-link {
    margin-left: auto;
    color: var(--success);
    font-weight: 800;
    font-size: 12px;
    white-space: nowrap;
  }
  .viewer-link:hover {
    text-decoration: underline;
  }
  .end-btn {
    padding: 12px 28px;
    border-radius: 12px;
    background: #fff;
    border: 2.5px solid var(--danger);
    box-shadow: var(--shadow-xs);
    color: var(--danger);
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    transition: all 0.13s ease;
  }
  .end-btn:hover {
    background: var(--danger);
    color: #fff;
  }
</style>