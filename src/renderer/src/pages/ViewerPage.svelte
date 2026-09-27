<script lang="ts">
  import { onMount } from 'svelte'
  import { navigate } from '../routes/router'
  import { sessionStore, clearActiveSession } from '../stores/session'
  import { showToast } from '../stores/toast'
  import type { ConnectionMetrics, Participant } from '@shared/types/models'
  import { denormalizeCoordinates } from '@shared/lib/cursor'

  let videoEl: HTMLVideoElement
  let containerEl: HTMLDivElement
  let phase = 'connecting'
  let metrics: ConnectionMetrics | null = null
  let participants: Participant[] = []
  let cursorsVisible = true
  let fitMode: 'fit' | 'actual' = 'fit'
  let fullscreen = false
  let showDiagnostics = false
  let remoteStream: MediaStream | null = null
  let videoDimensions = { width: 0, height: 0 }

  onMount(async () => {
    const service = getService()
    const unsubPhase = sessionStore.subscribe((s) => {
      phase = s.phase
    })
    const unsubMetrics = service?.metrics.subscribe((m) => {
      metrics = m
    })
    const unsubParticipants = service?.participants.subscribe((list) => {
      participants = list
    })
    const unsubCursors = service?.cursorsVisible.subscribe((v) => {
      cursorsVisible = v
    })
    const unsubStream = service?.remoteStreamStore.subscribe((stream) => {
      remoteStream = stream
      if (stream && videoEl) {
        videoEl.srcObject = stream
        videoEl.play().catch(() => {})
      }
    })

    window.addEventListener('keydown', onKeydown)

    return () => {
      unsubPhase()
      unsubMetrics?.()
      unsubParticipants?.()
      unsubCursors?.()
      unsubStream?.()
      window.removeEventListener('keydown', onKeydown)
    }
  })

  function getService() {
    let value: { service: unknown } | null = null
    sessionStore.subscribe((s) => {
      value = s
    })()
    return value?.service as {
      metrics: { subscribe: (fn: (m: ConnectionMetrics | null) => void) => () => void }
      participants: { subscribe: (fn: (p: Participant[]) => void) => () => void }
      cursorsVisible: { subscribe: (fn: (v: boolean) => void) => () => void }
      remoteStreamStore: { subscribe: (fn: (s: MediaStream | null) => void) => () => void }
      toggleAudio: () => Promise<void>
      toggleCursors: () => void
      endSession: () => void
      getRole: () => 'host' | 'guest'
      audioMuted: { subscribe: (fn: (v: boolean) => void) => () => void }
    } | null
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'f' || event.key === 'F') toggleFullscreen()
    if (event.key === 'Escape' && fullscreen) exitFullscreen()
  }

  function toggleFullscreen(): void {
    if (!fullscreen) {
      containerEl?.requestFullscreen()
      fullscreen = true
    } else {
      exitFullscreen()
    }
  }

  function exitFullscreen(): void {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    }
    fullscreen = false
  }

  function toggleFitMode(): void {
    fitMode = fitMode === 'fit' ? 'actual' : 'fit'
  }

  function toggleDiagnostics(): void {
    showDiagnostics = !showDiagnostics
  }

  function endSession(): void {
    clearActiveSession()
    navigate({ name: 'home' })
    showToast('Session ended.', 'info')
  }

  function muted(): boolean {
    let m = false
    getService()?.audioMuted.subscribe((v) => (m = v))()
    return m
  }

  function qualityLabel(m: ConnectionMetrics | null): string {
    if (!m || m.rtt == null) return '—'
    if (m.rtt < 60) return 'Excellent'
    if (m.rtt < 150) return 'Good'
    if (m.rtt < 300) return 'Fair'
    return 'Poor'
  }

  function qualityColor(m: ConnectionMetrics | null): string {
    if (!m || m.rtt == null) return 'var(--text-faint)'
    if (m.rtt < 60) return 'var(--success)'
    if (m.rtt < 150) return '#84cc16'
    if (m.rtt < 300) return 'var(--warning)'
    return 'var(--danger)'
  }

  function cursorScreenPosition(p: Participant): { x: number; y: number } | null {
    if (!p.cursor || videoDimensions.width === 0) return null
    const display = document.querySelector('.video-frame')
    if (!display) return null
    const rect = (display as HTMLElement).getBoundingClientRect()
    const pos = denormalizeCoordinates(p.cursor, videoDimensions.width, videoDimensions.height)
    return {
      x: rect.left + (pos.x / videoDimensions.width) * rect.width,
      y: rect.top + (pos.y / videoDimensions.height) * rect.height
    }
  }

  function setVideoDimensions(): void {
    if (videoEl && videoEl.videoWidth > 0) {
      videoDimensions = { width: videoEl.videoWidth, height: videoEl.videoHeight }
    }
  }

  function handleVideoEvent(): void {
    setVideoDimensions()
  }
</script>

<main class="viewer">
  {#if phase === 'reconnecting'}
    <div class="overlay-banner reconnect">
      <span class="spinner-sm"></span>
      Connection interrupted. Reconnecting…
    </div>
  {/if}

  {#if phase === 'disconnected'}
    <div class="disconnect-screen">
      <h2>Session ended</h2>
      <p>The host ended the session or the connection was lost.</p>
      <button class="btn-primary" onclick={() => navigate({ name: 'home' })}>Back to Home</button>
    </div>
  {:else}
    <div class="viewer-bar">
      <div class="left">
        <span class="conn-dot" class:connected={phase === 'connected'}></span>
        <span class="conn-label">{phase === 'connected' ? 'Connected' : phase === 'connecting' ? 'Connecting…' : phase === 'negotiating' ? 'Negotiating…' : phase === 'establishing' ? 'Establishing…' : phase === 'reconnecting' ? 'Reconnecting…' : 'Disconnected'}</span>
        <span class="latency" style="color: {qualityColor(metrics)}">{metrics?.rtt != null ? `${metrics.rtt} ms` : ''}</span>
        {#if metrics?.connectionType === 'relay'}
          <span class="relay-badge">relay</span>
        {:else if metrics?.connectionType === 'direct'}
          <span class="relay-badge direct">direct</span>
        {/if}
      </div>
      <div class="controls">
        <button class="icon-btn" title="Mute / unmute audio" onclick={() => getService()?.toggleAudio()}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            {#if muted()}
              <path d="M11 5 6 9H2v6h4l5 4V5z" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
            {:else}
              <path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            {/if}
          </svg>
        </button>
        <button class="icon-btn" class:active={cursorsVisible} title="Show / hide cursors" onclick={() => getService()?.toggleCursors()}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /></svg>
        </button>
        <button class="icon-btn" title="Fit / actual size" onclick={toggleFitMode}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></svg>
        </button>
        <button class="icon-btn" title="Fullscreen (F)" onclick={toggleFullscreen}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
        </button>
        <button class="icon-btn" title="Diagnostics" onclick={toggleDiagnostics}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" /></svg>
        </button>
        <button class="end-btn" onclick={endSession}>End</button>
      </div>
    </div>

    <div class="video-area" class:fit={fitMode === 'fit'} class:actual={fitMode === 'actual'} bind:this={containerEl}>
      <div class="video-frame">
        <video
          bind:this={videoEl}
          autoplay
          playsinline
          onloadedmetadata={handleVideoEvent}
          onresize={handleVideoEvent}
        ></video>
        {#if participants.filter((p) => !p.isSelf && !p.isHost).length > 0 || cursorsVisible}
          {#each participants.filter((p) => !p.isSelf) as p (p.id)}
            {#if p.cursor && cursorsVisible}
              {#if cursorScreenPosition(p)}
                <div
                  class="remote-cursor"
                  style="left: {cursorScreenPosition(p).x}px; top: {cursorScreenPosition(p).y}px; color: {p.color}"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M4 2l15 8-7 2-3 7-5-17z" /></svg>
                  <span class="cursor-name">{p.displayName}</span>
                </div>
              {/if}
            {/if}
          {/each}
        {/if}
      </div>
    </div>

    <div class="status-bar">
      <div class="participants">
        {#each participants as p (p.id)}
          <div class="participant-chip">
            <span class="p-dot" style="background: {p.color}"></span>
            <span class="p-name">{p.displayName}</span>
            {#if p.isHost && !p.isSelf}
              <span class="host-badge">host</span>
            {/if}
            {#if !p.audioState}
              <span class="muted-badge">muted</span>
            {/if}
          </div>
        {/each}
      </div>
      <div class="right">
        <span class="quality" style="color: {qualityColor(metrics)}">
          <span class="q-dot" style="background: {qualityColor(metrics)}"></span>
          {qualityLabel(metrics)}
        </span>
        {#if metrics?.rtt != null}
          <span class="stat">{metrics.rtt} ms</span>
        {/if}
        {#if metrics?.bitrate}
          <span class="stat">{(metrics.bitrate / 1_000_000).toFixed(1)} Mbps</span>
        {/if}
        {#if metrics?.frameRate}
          <span class="stat">{metrics.frameRate} FPS</span>
        {/if}
      </div>
    </div>

    {#if showDiagnostics}
      <div class="diagnostics-panel">
        <div class="diag-row"><span>Signaling</span><b>{phase === 'disconnected' ? 'Disconnected' : 'Connected'}</b></div>
        <div class="diag-row"><span>Connection</span><b>{metrics?.connectionType === 'relay' ? 'Relay (TURN)' : metrics?.connectionType === 'direct' ? 'Direct (P2P)' : 'Unknown'}</b></div>
        <div class="diag-row"><span>RTT</span><b>{metrics?.rtt ?? '—'} ms</b></div>
        <div class="diag-row"><span>Bitrate</span><b>{metrics?.bitrate ? `${(metrics.bitrate / 1_000_000).toFixed(1)} Mbps` : '—'}</b></div>
        <div class="diag-row"><span>Frame rate</span><b>{metrics?.frameRate ?? '—'} FPS</b></div>
        <div class="diag-row"><span>Packet loss</span><b>{metrics?.packetLoss ?? '—'} %</b></div>
        <div class="diag-row"><span>Codec</span><b>{metrics?.codec ?? '—'}</b></div>
        <div class="diag-row"><span>Local / remote</span><b>{metrics?.localCandidateType ?? '—'} / {metrics?.remoteCandidateType ?? '—'}</b></div>
        <div class="diag-row"><span>Resolution</span><b>{videoDimensions.width > 0 ? `${videoDimensions.width}×${videoDimensions.height}` : '—'}</b></div>
      </div>
    {/if}
  {/if}
</main>

<style>
  .viewer {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: #000;
  }
  .viewer-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    z-index: 20;
    flex-shrink: 0;
  }
  .left {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .conn-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--warning);
  }
  .conn-dot.connected {
    background: var(--success);
  }
  .conn-label {
    font-size: 13px;
    color: var(--text);
    font-weight: 500;
  }
  .latency {
    font-size: 12px;
    font-family: var(--font-mono);
  }
  .relay-badge {
    font-size: 10px;
    padding: 2px 7px;
    border-radius: 999px;
    background: rgba(245, 158, 11, 0.15);
    color: var(--warning);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .relay-badge.direct {
    background: rgba(34, 197, 94, 0.15);
    color: var(--success);
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .icon-btn {
    width: 34px;
    height: 34px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-dim);
    transition: background 0.15s ease, color 0.15s ease;
  }
  .icon-btn:hover {
    background: var(--bg-card-hover);
    color: var(--text);
  }
  .icon-btn.active {
    color: var(--accent);
  }
  .end-btn {
    margin-left: 8px;
    padding: 8px 18px;
    border-radius: var(--radius-sm);
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.35);
    color: var(--danger);
    font-size: 13px;
    font-weight: 600;
    transition: background 0.15s ease;
  }
  .end-btn:hover {
    background: rgba(239, 68, 68, 0.22);
  }
  .video-area {
    flex: 1;
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
  }
  .video-area.fit .video-frame {
    width: 100%;
    height: 100%;
  }
  .video-area.fit video {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .video-area.actual .video-frame {
    width: fit-content;
    height: fit-content;
  }
  .video-frame {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  video {
    display: block;
    max-width: 100%;
    max-height: 100%;
  }
  .remote-cursor {
    position: absolute;
    transform: translate(-2px, -2px);
    pointer-events: none;
    z-index: 10;
  }
  .cursor-name {
    position: absolute;
    top: -20px;
    left: 10px;
    font-size: 11px;
    color: #fff;
    background: rgba(0, 0, 0, 0.6);
    padding: 2px 7px;
    border-radius: 6px;
    white-space: nowrap;
  }
  .status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    background: var(--bg);
    border-top: 1px solid var(--border);
    flex-shrink: 0;
    z-index: 20;
  }
  .participants {
    display: flex;
    gap: 8px;
    align-items: center;
    overflow-x: auto;
  }
  .participant-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-radius: 999px;
    background: var(--bg-card);
    font-size: 12px;
    color: var(--text-dim);
    white-space: nowrap;
  }
  .p-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .host-badge {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-faint);
    background: var(--bg-card-hover);
    padding: 1px 5px;
    border-radius: 4px;
  }
  .muted-badge {
    font-size: 9px;
    color: var(--warning);
  }
  .right {
    display: flex;
    gap: 14px;
    align-items: center;
  }
  .quality {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
  }
  .q-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }
  .stat {
    font-size: 12px;
    color: var(--text-dim);
    font-family: var(--font-mono);
  }
  .overlay-banner {
    position: absolute;
    top: 56px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 50;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 18px;
    border-radius: var(--radius);
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid rgba(245, 158, 11, 0.4);
    color: var(--text);
    font-size: 13px;
  }
  .spinner-sm {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid rgba(245, 158, 11, 0.3);
    border-top-color: var(--warning);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .disconnect-screen {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    background: var(--bg);
  }
  .disconnect-screen h2 {
    font-size: 24px;
    font-weight: 700;
  }
  .disconnect-screen p {
    color: var(--text-dim);
    font-size: 14px;
  }
  .btn-primary {
    margin-top: 10px;
    padding: 12px 26px;
    border-radius: var(--radius);
    background: linear-gradient(120deg, var(--accent), #7c3aed);
    color: #fff;
    font-size: 14px;
    font-weight: 600;
  }
  .diagnostics-panel {
    position: absolute;
    right: 16px;
    top: 56px;
    width: 260px;
    background: rgba(20, 20, 28, 0.95);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    padding: 14px;
    z-index: 40;
    backdrop-filter: blur(12px);
  }
  .diag-row {
    display: flex;
    justify-content: space-between;
    padding: 5px 0;
    font-size: 12px;
    color: var(--text-dim);
  }
  .diag-row b {
    color: var(--text);
    font-weight: 500;
    font-family: var(--font-mono);
  }
</style>