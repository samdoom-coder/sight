<script lang="ts">
  import { onMount } from 'svelte'
  import { navigate } from '../routes/router'
  import { getSessionService, clearActiveSession } from '../stores/session'
  import { showToast } from '../stores/toast'
  import type { ConnectionMetrics, ConnectionPhase, Participant } from '@shared/types/models'

  let videoEl: HTMLVideoElement
  let containerEl: HTMLDivElement
  let sparkEl: HTMLCanvasElement
  let service: ReturnType<typeof getSessionService> = null
  let isHost = false
  let phase: ConnectionPhase = 'connecting'
  let signalingStatus = 'idle'
  let metrics: ConnectionMetrics | null = null
  let participants: Participant[] = []
  let cursorsVisible = true
  let audioMuted = true
  let fitMode: 'fit' | 'actual' = 'fit'
  let fullscreen = false
  let showDiagnostics = false
  let videoDimensions = { width: 0, height: 0 }

  // RTT ring buffer — plain (non-reactive) so pushes never re-render.
  // Drawn by a single throttled rAF (~10fps), paused when hidden/reduced.
  const rttHistory: number[] = []

  function drawSpark(): void {
    if (!sparkEl) return
    const ctx = sparkEl.getContext('2d')
    if (!ctx) return
    const w = sparkEl.width
    const h = sparkEl.height
    ctx.clearRect(0, 0, w, h)
    if (rttHistory.length < 2) return
    const max = Math.max(120, ...rttHistory)
    ctx.lineWidth = 1.5
    ctx.strokeStyle = qualityHex(metrics)
    ctx.beginPath()
    rttHistory.forEach((v, i) => {
      const x = (i / (59)) * w
      const y = h - 3 - (Math.min(v, max) / max) * (h - 6)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
    // last-point dot
    const last = rttHistory[rttHistory.length - 1]
    const lx = ((rttHistory.length - 1) / 59) * w
    const ly = h - 3 - (Math.min(last, max) / max) * (h - 6)
    ctx.fillStyle = ctx.strokeStyle
    ctx.beginPath()
    ctx.arc(lx, ly, 2.2, 0, 6.2832)
    ctx.fill()
  }

  function takeSnapshot(): void {
    if (!videoEl || videoEl.videoWidth === 0) {
      showToast('No video frame to capture yet.', 'error')
      return
    }
    try {
      const c = document.createElement('canvas')
      c.width = videoEl.videoWidth
      c.height = videoEl.videoHeight
      const ctx = c.getContext('2d')
      if (!ctx) return
      ctx.drawImage(videoEl, 0, 0)
      const url = c.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url
      a.download = `sight-${new Date().toISOString().replace(/[:.]/g, '-')}.png`
      a.click()
      showToast('Snapshot saved.', 'success')
    } catch {
      showToast('Could not capture snapshot.', 'error')
    }
  }

  onMount(() => {
    const activeService = getSessionService()
    if (!activeService) {
      navigate({ name: 'home' })
      return
    }
    service = activeService
    isHost = activeService.getRole() === 'host'

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let sparkRaf = 0
    let lastSpark = 0
    let visible = true
    const onVis = (): void => {
      visible = !document.hidden
    }
    document.addEventListener('visibilitychange', onVis)
    function sparkLoop(now: number): void {
      sparkRaf = requestAnimationFrame(sparkLoop)
      if (reduced || !visible || document.hidden) return
      if (now - lastSpark < 100) return
      lastSpark = now
      drawSpark()
    }
    if (!reduced) sparkRaf = requestAnimationFrame(sparkLoop)

    // The service is the source of truth for phase. sessionStore.phase is only
    // a snapshot from the page that created the session and goes stale.
    const unsubPhase = activeService.phase.subscribe((p) => {
      phase = p
    })
    const unsubSignaling = activeService.signalingStatus.subscribe((s) => {
      signalingStatus = s
    })
    const unsubMetrics = activeService.metrics.subscribe((m) => {
      metrics = m
      if (m?.rtt != null) {
        rttHistory.push(m.rtt)
        if (rttHistory.length > 60) rttHistory.shift()
      }
    })
    const unsubParticipants = activeService.participants.subscribe((list) => {
      participants = list
    })
    const unsubCursors = activeService.cursorsVisible.subscribe((v) => {
      cursorsVisible = v
    })
    const unsubAudio = activeService.audioMuted.subscribe((v) => {
      audioMuted = v
    })
    const unsubStream = activeService.remoteStreamStore.subscribe((stream) => {
      const playback = stream ?? (activeService.getRole() === 'host' ? activeService.getLocalStream() : null)
      if (!videoEl) return
      videoEl.srcObject = playback
      videoEl.muted = playback !== null && playback === activeService.getLocalStream()
      if (playback) videoEl.play().catch(() => {})
    })

    function onFullscreenChange(): void {
      fullscreen = !!document.fullscreenElement
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    window.addEventListener('keydown', onKeydown)

    return () => {
      cancelAnimationFrame(sparkRaf)
      document.removeEventListener('visibilitychange', onVis)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      window.removeEventListener('keydown', onKeydown)
      unsubPhase()
      unsubSignaling()
      unsubMetrics()
      unsubParticipants()
      unsubCursors()
      unsubAudio()
      unsubStream()
    }
  })

  function onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (event.key === 'f' || event.key === 'F') toggleFullscreen()
    if (event.key === 'Escape' && fullscreen) exitFullscreen()
    if (event.key === 's' || event.key === 'S') takeSnapshot()
    if (event.key === '1') fitMode = 'fit'
    if (event.key === '2') fitMode = 'actual'
    if (event.key === 'd' || event.key === 'D') toggleDiagnostics()
  }

  function toggleFullscreen(): void {
    if (!document.fullscreenElement) {
      containerEl?.requestFullscreen().catch(() => {})
    } else {
      exitFullscreen()
    }
  }

  function exitFullscreen(): void {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    }
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

  function qualityHex(m: ConnectionMetrics | null): string {
    if (!m || m.rtt == null) return '#9a9ec0'
    if (m.rtt < 60) return '#0eb07a'
    if (m.rtt < 150) return '#84cc16'
    if (m.rtt < 300) return '#e6b800'
    return '#e11d48'
  }

  function cursorScreenPosition(p: Participant): { x: number; y: number } | null {
    if (!p.cursor || !videoEl || videoDimensions.width === 0 || videoDimensions.height === 0) return null
    const rect = videoEl.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null

    // The video uses object-fit: contain, so the rendered frame is usually
    // smaller than the element. Map normalized cursor coordinates into the
    // actual letterboxed video rect instead of the whole container.
    const videoAspect = videoDimensions.width / videoDimensions.height
    const boxAspect = rect.width / rect.height
    let displayW: number
    let displayH: number
    let offsetX: number
    let offsetY: number
    if (videoAspect > boxAspect) {
      displayW = rect.width
      displayH = rect.width / videoAspect
      offsetX = 0
      offsetY = (rect.height - displayH) / 2
    } else {
      displayH = rect.height
      displayW = rect.height * videoAspect
      offsetX = (rect.width - displayW) / 2
      offsetY = 0
    }

    return {
      x: rect.left + offsetX + p.cursor.x * displayW,
      y: rect.top + offsetY + p.cursor.y * displayH
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
      <button class="btn-primary" onclick={endSession}>Back to Home</button>
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
        {#if isHost}
          <button class="icon-btn" aria-label="Mute or unmute shared audio" title="Mute / unmute audio" onclick={() => service?.toggleAudio()}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              {#if audioMuted}
                <path d="M11 5 6 9H2v6h4l5 4V5z" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
              {:else}
                <path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              {/if}
            </svg>
          </button>
        {/if}
        <button class="icon-btn" class:active={cursorsVisible} aria-label="Show or hide remote cursors" title="Show / hide cursors" onclick={() => service?.toggleCursors()}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /></svg>
        </button>
        <button class="icon-btn" aria-label="Toggle fit or actual size" title="Fit / actual size (1/2)" onclick={toggleFitMode}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></svg>
        </button>
        <button class="icon-btn" aria-label="Save a snapshot" title="Snapshot (S)" onclick={takeSnapshot}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
        </button>
        <button class="icon-btn" aria-label="Toggle fullscreen" title="Fullscreen (F)" onclick={toggleFullscreen}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
        </button>
        <button class="icon-btn" aria-label="Toggle diagnostics" title="Diagnostics (D)" onclick={toggleDiagnostics}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" /></svg>
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
        {#if participants.length > 0 && cursorsVisible}
          {#each participants.filter((p) => !p.isSelf) as p (p.id)}
            {#if p.cursor}
              {@const pos = cursorScreenPosition(p)}
              {#if pos}
                <div
                  class="remote-cursor"
                  style="left: {pos.x}px; top: {pos.y}px; color: {p.color}"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 2l15 8-7 2-3 7-5-17z" /></svg>
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
        <canvas class="spark" bind:this={sparkEl} width="120" height="30" aria-hidden="true" title="RTT history"></canvas>
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
        <div class="diag-row"><span>Signaling</span><b>{signalingStatus === 'connected' ? 'Connected' : signalingStatus === 'connecting' ? 'Connecting…' : 'Disconnected'}</b></div>
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
    background: var(--bg-card);
    border-bottom: var(--border-w) solid var(--border);
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
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 800;
    padding: 2px 7px;
    border-radius: 999px;
    background: var(--mustard);
    border: 2px solid var(--border);
    color: var(--text);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .relay-badge.direct {
    background: var(--success);
    color: #fff;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .icon-btn {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    border: 2px solid transparent;
    transition: all 0.13s ease;
  }
  .icon-btn:hover {
    background: var(--bg-soft);
    border-color: var(--border);
    box-shadow: var(--shadow-xs);
    color: var(--text);
  }
  .icon-btn.active {
    color: var(--text-inverse);
    background: var(--border);
  }
  .end-btn {
    margin-left: 8px;
    padding: 8px 18px;
    border-radius: 8px;
    background: var(--surface);
    border: 2.5px solid var(--danger);
    color: var(--danger);
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.05em;
    transition: all 0.13s ease;
  }
  .end-btn:hover {
    background: var(--danger);
    color: #fff;
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
    position: fixed;
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
    background: var(--bg-card);
    border-top: var(--border-w) solid var(--border);
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
    background: var(--surface);
    border: 2px solid var(--border);
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 700;
    color: var(--text-muted);
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
  .spark {
    width: 120px;
    height: 30px;
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: 8px;
    box-shadow: var(--shadow-xs);
  }
  .overlay-banner {
    position: absolute;
    top: 60px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 50;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 18px;
    border-radius: 12px;
    background: var(--mustard);
    border: 2.5px solid var(--border);
    box-shadow: var(--shadow-xs);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 800;
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
    font-family: var(--font-logo);
    font-size: 24px;
  }
  .disconnect-screen p {
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 700;
  }
  .btn-primary {
    margin-top: 10px;
    padding: 12px 26px;
    border-radius: 12px;
    background: var(--accent);
    border: 2.5px solid var(--border);
    box-shadow: var(--shadow-sm);
    color: #fff;
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .btn-primary:hover {
    background: var(--accent-hover);
    transform: translate(-1px, -1px);
    box-shadow: 5px 5px 0 var(--border);
  }
  .diagnostics-panel {
    position: absolute;
    right: 16px;
    top: 60px;
    width: 260px;
    background: var(--bg-card);
    border: var(--border-w) solid var(--border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow);
    padding: 14px;
    z-index: 40;
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