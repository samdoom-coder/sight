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
    color: var(--text-dim);
    font-size: 14px;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    transition: background 0.15s ease, color 0.15s ease;
  }
  .back-btn:hover {
    background: var(--bg-card);
    color: var(--text);
  }
  h1 {
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .advanced-badge {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 3px 8px;
    border-radius: 999px;
    background: rgba(245, 158, 11, 0.12);
    border: 1px solid rgba(245, 158, 11, 0.3);
    color: var(--warning);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 14px;
  }
  .card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .label {
    font-size: 12px;
    color: var(--text-faint);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .card b {
    font-size: 18px;
    font-weight: 600;
    font-family: var(--font-mono);
  }
  .card b.ok {
    color: var(--success);
  }
  .card b.warn {
    color: var(--warning);
  }
  .section h2 {
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 12px;
  }
  .cand-list {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px;
  }
  .cand-row {
    display: flex;
    gap: 16px;
    padding: 7px 0;
    font-size: 12px;
    border-bottom: 1px solid var(--border);
  }
  .cand-row:last-child {
    border-bottom: none;
  }
  .cand-type {
    min-width: 60px;
    font-weight: 600;
    color: var(--accent-hover);
  }
  .mono {
    font-family: var(--font-mono);
    color: var(--text-dim);
  }
  .hint {
    color: var(--text-faint);
    font-size: 13px;
    line-height: 1.6;
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 60px;
    color: var(--text-faint);
    text-align: center;
  }
  .btn {
    padding: 11px 24px;
    border-radius: var(--radius-sm);
    background: var(--bg-card-hover);
    border: 1px solid var(--border-strong);
    color: var(--text);
    font-size: 14px;
  }
</style>