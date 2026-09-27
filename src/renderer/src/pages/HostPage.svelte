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
    max-width: 460px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 32px;
    backdrop-filter: blur(12px);
  }
  .card-header {
    text-align: center;
    margin-bottom: 24px;
  }
  .icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: var(--accent-soft);
    color: var(--accent-hover);
    margin-bottom: 12px;
  }
  h1 {
    font-size: 20px;
    font-weight: 650;
    letter-spacing: -0.01em;
  }
  .sub {
    color: var(--text-dim);
    font-size: 13px;
    margin-top: 6px;
  }
  .code-box {
    text-align: center;
    padding: 20px;
    border-radius: var(--radius);
    background: rgba(0, 0, 0, 0.3);
    border: 1px dashed var(--border-strong);
  }
  .code {
    display: block;
    font-family: var(--font-mono);
    font-size: 38px;
    font-weight: 700;
    letter-spacing: 0.18em;
    background: linear-gradient(120deg, var(--accent), #a855f7);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .copy-hint {
    color: var(--text-faint);
    font-size: 12px;
    margin-top: 6px;
    display: block;
  }
  .divider {
    height: 1px;
    background: var(--border);
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
    border-radius: var(--radius-sm);
    background: var(--bg-card-hover);
    border: 1px solid var(--border);
    font-size: 13px;
    font-weight: 500;
    color: var(--text);
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .copy-btn:hover:not(:disabled) {
    border-color: var(--accent);
    background: rgba(99, 102, 241, 0.12);
  }
  .copy-btn:disabled {
    opacity: 0.4;
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
    font-size: 13px;
    color: var(--text-dim);
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
    max-width: 460px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border-radius: var(--radius);
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid rgba(34, 197, 94, 0.3);
    color: var(--text);
    font-size: 13px;
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
    font-weight: 600;
    font-size: 13px;
    white-space: nowrap;
  }
  .viewer-link:hover {
    text-decoration: underline;
  }
  .end-btn {
    padding: 12px 28px;
    border-radius: var(--radius);
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.35);
    color: var(--danger);
    font-size: 14px;
    font-weight: 600;
    transition: background 0.15s ease;
  }
  .end-btn:hover {
    background: rgba(239, 68, 68, 0.2);
  }
</style>