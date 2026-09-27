<script lang="ts">
  import { onMount } from 'svelte'
  import { navigate } from '../routes/router'
  import { ScreenCaptureService } from '../services/ScreenCaptureService'
  import { showToast } from '../stores/toast'
  import { settings } from '../services/config'
  import type { CaptureSource } from '@shared/types/models'

  const capture = new ScreenCaptureService(window.desktop?.platform ?? 'unknown')
  const isDesktopApp = typeof window !== 'undefined' && !!window.desktop

  let sources: CaptureSource[] = []
  let loading = true
  let filter: 'screen' | 'window' = 'screen'
  let permissionIssue = false
  let permissionMessage = ''
  let selectedId: string | null = null
  let includeAudio = $settings.session.defaultAudio

  onMount(async () => {
    await refreshSources()
  })

  async function refreshSources(): Promise<void> {
    loading = true
    const state = await capture.permissionState()
    if (state.restricted) {
      permissionIssue = true
      permissionMessage =
        window.desktop?.platform === 'darwin'
          ? 'Screen recording permission is required.\n\nOpen System Settings → Privacy & Security → Screen Recording and allow Sight, then restart the app.'
          : 'Screen recording permission is required. Check your system settings.'
    }
    sources = await capture.listSources(filter)
    loading = false
  }

  function setFilter(kind: 'screen' | 'window'): void {
    filter = kind
    refreshSources()
  }

  function selectSource(source: CaptureSource): void {
    selectedId = source.id
  }

  async function startSharing(): Promise<void> {
    if (!selectedId) {
      showToast('Choose a screen or window to share.', 'error')
      return
    }
    try {
      const stream = await capture.captureSource(selectedId)
      if (!stream) {
        showToast('Could not capture the selected source.', 'error')
        return
      }
      sessionStorage.setItem('sight-pending-stream', '1')
      sessionStorage.setItem('sight-audio', includeAudio ? '1' : '0')
      window.__sightPendingStream = stream
      navigate({ name: 'host', sessionId: '' })
    } catch (err) {
      showToast(`Could not start capture: ${(err as Error).message}`, 'error')
    }
  }

  function goBack(): void {
    navigate({ name: 'home' })
  }
</script>

<main class="picker animate-in">
  <button class="back-btn" onclick={goBack}>← Back</button>
  <div class="heading">
    <h1>Share your screen</h1>
    <p class="sub">Pick what you want to share.</p>
  </div>

  {#if !isDesktopApp}
    <div class="permission-card">
      <div class="perm-icon">🖥️</div>
      <div class="perm-text">
        <strong>Open this page in the Electron app to share your screen</strong>
        <pre>Browser preview cannot capture screens. Run terminal 1: npm run server, terminal 2: npm run dev, terminal 3: npm run dev:main, then use the desktop window.</pre>
      </div>
    </div>
  {/if}

  {#if permissionIssue}
    <div class="permission-card">
      <div class="perm-icon">🛡</div>
      <div class="perm-text">
        <strong>Screen recording permission required</strong>
        <pre>{permissionMessage}</pre>
      </div>
    </div>
  {/if}

  <div class="tabs">
    <button class:active={filter === 'screen'} onclick={() => setFilter('screen')}>Screens</button>
    <button class:active={filter === 'window'} onclick={() => setFilter('window')}>Windows</button>
  </div>

  {#if loading}
    <div class="loading">Loading available sources…</div>
  {:else if sources.length === 0}
    <div class="empty">No {filter === 'screen' ? 'screens' : 'windows'} found.</div>
  {:else}
    <div class="grid">
      {#each sources as source (source.id)}
        <button
          class:selected={selectedId === source.id}
          class="source-card"
          onclick={() => selectSource(source)}
          aria-label={source.name}
        >
          {#if source.thumbnailDataUrl}
            <img src={source.thumbnailDataUrl} alt="" />
          {:else}
            <div class="thumb-placeholder">{source.name}</div>
          {/if}
          <span class="name">{source.name}</span>
        </button>
      {/each}
    </div>
  {/if}

  <div class="footer-bar">
    <div class="audio-row">
      <label class="check">
        <input type="checkbox" bind:checked={includeAudio} />
        <span>Include system audio</span>
      </label>
      <span class="hint">
        {#if window.desktop?.platform === 'linux'}
          (System audio capture is not supported on Linux)
        {:else}
          (Optional — platform dependent)
        {/if}
      </span>
    </div>
    <button class="share-btn" onclick={startSharing} disabled={!selectedId}>
      Start sharing
    </button>
  </div>
</main>

<style>
  .picker {
    flex: 1;
    overflow-y: auto;
    padding: 32px 40px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .back-btn {
    align-self: flex-start;
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    border: 2px solid transparent;
    transition: all 0.13s ease;
  }
  .back-btn:hover {
    background: var(--bg-card);
    border-color: var(--border);
    box-shadow: var(--shadow-xs);
    color: var(--text);
  }
  .heading h1 {
    font-family: var(--font-logo);
    font-size: 24px;
    letter-spacing: 0;
    color: var(--text);
  }
  .sub {
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 700;
    margin-top: 6px;
  }
  .tabs {
    display: flex;
    gap: 4px;
    background: var(--bg-soft);
    border: 2.5px solid var(--border);
    padding: 4px;
    border-radius: 12px;
    width: fit-content;
    box-shadow: 2px 2px 0 rgba(37, 40, 66, 0.1);
  }
  .tabs button {
    padding: 8px 18px;
    border-radius: 8px;
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-muted);
    border: 2px solid transparent;
    transition: all 0.13s ease;
  }
  .tabs button.active {
    background: var(--border);
    color: #fff;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 14px;
  }
  .source-card {
    border-radius: var(--radius-sm);
    overflow: hidden;
    background: #fff;
    border: 2.5px solid var(--border);
    box-shadow: var(--shadow-xs);
    transition: transform 0.13s ease, box-shadow 0.13s ease;
    text-align: left;
    display: flex;
    flex-direction: column;
  }
  .source-card:hover {
    transform: translate(-1px, -1px);
    box-shadow: var(--shadow-sm);
  }
  .source-card.selected {
    border-color: var(--accent);
    box-shadow: var(--shadow-sm), 0 0 0 3px var(--accent-soft);
  }
  .source-card img {
    width: 100%;
    aspect-ratio: 16/9;
    object-fit: cover;
    background: #000;
  }
  .thumb-placeholder {
    width: 100%;
    aspect-ratio: 16/9;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-soft);
    color: var(--text-faint);
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 700;
    padding: 10px;
    overflow: hidden;
  }
  .name {
    padding: 10px 12px;
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 700;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border-top: 2px solid var(--border);
  }
  .permission-card {
    display: flex;
    gap: 12px;
    padding: 16px;
    border-radius: var(--radius-sm);
    background: #fff;
    border: 2.5px solid var(--border);
    border-left: 6px solid var(--warning);
    box-shadow: var(--shadow-xs);
  }
  .perm-icon {
    font-size: 22px;
  }
  .perm-text {
    color: var(--text-muted);
    font-size: 13px;
  }
  .perm-text strong {
    color: var(--text);
    display: block;
    margin-bottom: 4px;
  }
  .perm-text pre {
    white-space: pre-wrap;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.5;
  }
  .footer-bar {
    position: sticky;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 4px;
    background: var(--bg);
    gap: 16px;
    border-top: 2.5px dashed rgba(37, 40, 66, 0.2);
    margin-top: auto;
  }
  .audio-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 700;
    color: var(--text-muted);
  }
  .check {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }
  .check input {
    accent-color: var(--accent);
  }
  .hint {
    color: var(--text-faint);
    font-size: 12px;
  }
  .share-btn {
    padding: 13px 28px;
    border-radius: 12px;
    background: var(--accent);
    border: 2.5px solid var(--border);
    box-shadow: var(--shadow-sm);
    color: #fff;
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    transition: all 0.13s ease;
  }
  .share-btn:hover:not(:disabled) {
    background: var(--accent-hover);
    transform: translate(-1px, -1px);
    box-shadow: 5px 5px 0 var(--border);
  }
  .share-btn:active:not(:disabled) {
    transform: translate(2px, 2px);
    box-shadow: 1px 1px 0 var(--border);
  }
  .share-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .loading,
  .empty {
    color: var(--text-faint);
    font-size: 14px;
    text-align: center;
    padding: 40px;
  }
</style>