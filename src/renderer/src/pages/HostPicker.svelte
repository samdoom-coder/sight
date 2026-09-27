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
  .heading h1 {
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .sub {
    color: var(--text-dim);
    font-size: 14px;
    margin-top: 4px;
  }
  .tabs {
    display: flex;
    gap: 6px;
    background: var(--bg-card);
    padding: 4px;
    border-radius: var(--radius-sm);
    width: fit-content;
  }
  .tabs button {
    padding: 8px 18px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-dim);
    transition: all 0.15s ease;
  }
  .tabs button.active {
    background: rgba(255, 255, 255, 0.1);
    color: var(--text);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 14px;
  }
  .source-card {
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--bg-card);
    border: 2px solid transparent;
    transition: border-color 0.15s ease, transform 0.15s ease, background 0.15s ease;
    text-align: left;
    display: flex;
    flex-direction: column;
  }
  .source-card:hover {
    background: var(--bg-card-hover);
    transform: translateY(-2px);
  }
  .source-card.selected {
    border-color: var(--accent);
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
    background: #16161e;
    color: var(--text-faint);
    font-size: 12px;
    padding: 10px;
    overflow: hidden;
  }
  .name {
    padding: 10px 12px;
    font-size: 12px;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .permission-card {
    display: flex;
    gap: 12px;
    padding: 16px;
    border-radius: var(--radius);
    background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.3);
  }
  .perm-icon {
    font-size: 22px;
  }
  .perm-text {
    color: var(--text-dim);
    font-size: 13px;
  }
  .perm-text strong {
    color: var(--text);
    display: block;
    margin-bottom: 4px;
  }
  .perm-text pre {
    white-space: pre-wrap;
    font-family: inherit;
    font-size: 12px;
    color: var(--text-faint);
    line-height: 1.5;
  }
  .footer-bar {
    position: sticky;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 0;
    background: var(--bg);
    gap: 16px;
    border-top: 1px solid var(--border);
    margin-top: auto;
  }
  .audio-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text-dim);
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
    border-radius: var(--radius);
    background: linear-gradient(120deg, var(--accent), #7c3aed);
    color: #fff;
    font-size: 15px;
    font-weight: 600;
    transition: opacity 0.15s ease, transform 0.15s ease;
    box-shadow: 0 4px 20px rgba(99, 102, 241, 0.3);
  }
  .share-btn:hover:not(:disabled) {
    transform: translateY(-1px);
  }
  .share-btn:disabled {
    opacity: 0.4;
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