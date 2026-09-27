<script lang="ts">
  import { onMount } from 'svelte'
  import { navigate } from '../routes/router'
  import { sessionStore } from '../stores/session'
  import type { ConnectionMetrics, ConnectionPhase } from '@shared/types/models'

  let phase: ConnectionPhase = 'idle'
  let signalingStatus = 'idle'
  let metrics: ConnectionMetrics | null = null
  let active = false
  let iceCandidates: Array<{ type: string; protocol: string; address: string; port: number; priority: number }> = []

  onMount(() => {
    const service = getService()
    const unsubPhase = sessionStore.subscribe((s) => {
      phase = s.phase
      signalingStatus = s.service?.getSignalingStatus?.() ?? 'idle'
      active = !!s.service
    })
    const unsubMetrics = service?.metrics.subscribe((m) => {
      metrics = m
    })
    refreshCandidates()

    const timer = setInterval(refreshCandidates, 4000)
    return () => {
      unsubPhase()
      unsubMetrics?.()
      clearInterval(timer)
    }
  })

  function getService() {
    let value: { service: unknown } | null = null
    sessionStore.subscribe((s) => {
      value = s
    })()
    return value?.service as {
      metrics: { subscribe: (fn: (m: ConnectionMetrics | null) => void) => () => void }
      getSignalingStatus: () => string
      getPeerConnection: () => RTCPeerConnection | null
    } | null
  }

  async function refreshCandidates(): Promise<void> {
    const service = getService()
    const pc = service?.getPeerConnection()
    if (!pc) return
    try {
      const stats = await pc.getStats()
      const list: Array<{ type: string; protocol: string; address: string; port: number; priority: number }> = []
      stats.forEach((report) => {
        if (report.type === 'local-candidate') {
          const r = report as unknown as {
            candidateType?: string
            protocol?: string
            address?: string
            port?: number
            priority?: number
          }
          if (r.candidateType) {
            list.push({
              type: r.candidateType,
              protocol: r.protocol ?? 'udp',
              address: r.address ?? '?',
              port: r.port ?? 0,
              priority: r.priority ?? 0
            })
          }
        }
      })
      iceCandidates = list
    } catch {
      // ignore
    }
  }

  function goBack(): void {
    navigate({ name: 'settings' })
  }
</script>

<main class="diag animate-in">
  <div class="header">
    <button class="back-btn" onclick={goBack}>← Back</button>
    <h1>Connection Diagnostics</h1>
    <span class="advanced-badge">Advanced</span>
  </div>

  {#if !active}
    <div class="empty">
      <p>No active session. Start or join a session to see live diagnostics.</p>
      <button class="btn" onclick={() => navigate({ name: 'home' })}>Go to Home</button>
    </div>
  {:else}
    <div class="grid">
      <div class="card">
        <span class="label">Signaling</span>
        <b class={signalingStatus === 'connected' ? 'ok' : 'warn'}>{signalingStatus === 'connected' ? 'Connected' : signalingStatus === 'connecting' ? 'Connecting…' : 'Disconnected'}</b>
      </div>
      <div class="card">
        <span class="label">Connection phase</span>
        <b>{phase}</b>
      </div>
      <div class="card">
        <span class="label">Connection type</span>
        <b class={metrics?.connectionType === 'relay' ? 'warn' : 'ok'}>
          {metrics?.connectionType === 'relay' ? 'Relay (TURN)' : metrics?.connectionType === 'direct' ? 'Direct (P2P)' : 'Unknown'}
        </b>
      </div>
      <div class="card">
        <span class="label">RTT</span>
        <b>{metrics?.rtt ?? '—'} ms</b>
      </div>
      <div class="card">
        <span class="label">Bitrate</span>
        <b>{metrics?.bitrate ? `${(metrics.bitrate / 1_000_000).toFixed(2)} Mbps` : '—'}</b>
      </div>
      <div class="card">
        <span class="label">Frame rate</span>
        <b>{metrics?.frameRate ?? '—'} FPS</b>
      </div>
      <div class="card">
        <span class="label">Packets lost</span>
        <b>{metrics?.packetLoss != null ? `${metrics.packetLoss}%` : '—'}</b>
      </div>
      <div class="card">
        <span class="label">Codec</span>
        <b>{metrics?.codec ?? '—'}</b>
      </div>
    </div>

    <div class="section">
      <h2>ICE Candidates</h2>
      <div class="cand-list">
        {#if iceCandidates.length === 0}
          <p class="hint">No candidates yet.</p>
        {:else}
          {#each iceCandidates as c (c.address + c.port + c.type + c.priority)}
            <div class="cand-row">
              <span class="cand-type">{c.type}</span>
              <span class="mono">{c.address}:{c.port}</span>
              <span class="mono">{c.protocol}</span>
              <span class="mono">{c.priority}</span>
            </div>
          {/each}
        {/if}
      </div>
    </div>

    <div class="section">
      <h2>Local candidates vs remote</h2>
      <p class="hint">
        Local: <b class="mono">{metrics?.localCandidateType ?? '—'}</b> ·
        Remote: <b class="mono">{metrics?.remoteCandidateType ?? '—'}</b>
      </p>
    </div>
  {/if}
</main>

<style>
  .diag {
    flex: 1;
    overflow-y: auto;
    padding: 28px 36px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .back-btn {
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 8px 12px;
    border-radius: 8px;
    border: 2px solid transparent;
    transition: all 0.13s ease;
  }
  .back-btn:hover {
    background: var(--bg-card);
    border-color: var(--border);
    box-shadow: var(--shadow-xs);
    color: var(--text);
  }
  h1 {
    font-family: var(--font-logo);
    font-size: 22px;
    letter-spacing: 0;
  }
  .advanced-badge {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--mustard);
    border: 2px solid var(--border);
    box-shadow: var(--shadow-xs);
    color: var(--text);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 14px;
  }
  .card {
    background: #fff;
    border: 2.5px solid var(--border);
    border-radius: 12px;
    box-shadow: var(--shadow-xs);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .label {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .card b {
    font-size: 18px;
    font-weight: 800;
    font-family: var(--font-mono);
  }
  .card b.ok {
    color: var(--success);
  }
  .card b.warn {
    color: var(--warning);
  }
  .section h2 {
    font-family: var(--font-logo);
    font-size: 14px;
    margin-bottom: 12px;
  }
  .cand-list {
    background: #fff;
    border: 2.5px solid var(--border);
    border-radius: 12px;
    box-shadow: var(--shadow-xs);
    padding: 12px;
  }
  .cand-row {
    display: flex;
    gap: 16px;
    padding: 7px 0;
    font-size: 12px;
    border-bottom: 2px dashed rgba(37, 40, 66, 0.15);
  }
  .cand-row:last-child {
    border-bottom: none;
  }
  .cand-type {
    min-width: 60px;
    font-weight: 800;
    font-family: var(--font-mono);
    color: var(--accent);
  }
  .mono {
    font-family: var(--font-mono);
    font-weight: 700;
    color: var(--text-muted);
  }
  .hint {
    color: var(--text-faint);
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 700;
    line-height: 1.6;
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 60px;
    color: var(--text-muted);
    text-align: center;
    background: var(--bg-card);
    border: var(--border-w) solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    font-family: var(--font-mono);
    font-weight: 700;
  }
  .btn {
    padding: 11px 24px;
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
  .btn:hover {
    background: var(--accent-hover);
    transform: translate(-1px, -1px);
    box-shadow: 5px 5px 0 var(--border);
  }
</style>