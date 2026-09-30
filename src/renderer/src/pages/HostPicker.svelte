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
  let search = ''

  function visibleSources(): CaptureSource[] {
    const q = search.trim().toLowerCase()
    if (!q) return sources
    return sources.filter((s) => s.name.toLowerCase().includes(q))
  }

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
    // keep selection if it still exists, else auto-select first for speed
    if (!sources.some((s) => s.id === selectedId)) {
      selectedId = sources[0]?.id ?? null
    }
    loading = false
  }

  function setFilter(kind: 'screen' | 'window'): void {
    if (filter === kind) return
    filter = kind
    search = ''
    selectedId = null
    refreshSources()
  }

  function selectSource(source: CaptureSource): void {
    selectedId = source.id
  }

  function moveSelection(dir: 1 | -1): void {
    const list = visibleSources()
    if (list.length === 0) return
    const idx = list.findIndex((s) => s.id === selectedId)
    const next = idx < 0 ? (dir === 1 ? 0 : list.length - 1) : (idx + dir + list.length) % list.length
    selectedId = list[next].id
    // keep selected card in view (native, no animation lib)
    document.querySelector(`[data-source-id="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: 'nearest' })
  }

  function onGridKeydown(e: KeyboardEvent): void {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      moveSelection(1)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      moveSelection(-1)
    } else if (e.key === 'Enter' && selectedId) {
      e.preventDefault()
      startSharing()
    }
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

<main class="picker animate-in" onkeydown={onGridKeydown}>
  <button class="back-btn" onclick={goBack}>← Back</button>
  <div class="heading">
    <h1>Share your screen</h1>
    <p class="sub">Pick what you want to share. <span class="kbd-hint">←→ navigate · Enter to share</span></p>
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

  <div class="toolbar">
    <div class="tabs">
      <button class:active={filter === 'screen'} onclick={() => setFilter('screen')}>Screens</button>
      <button class:active={filter === 'window'} onclick={() => setFilter('window')}>Windows</button>
    </div>
    <div class="search-wrap">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      <input
        class="search"
        type="search"
        placeholder="Filter by name…"
        aria-label="Filter sources by name"
        bind:value={search}
      />
      {#if search}
        <button class="clear" onclick={() => (search = '')} aria-label="Clear search">✕</button>
      {/if}
    </div>
    {#if !loading}
      <span class="count" aria-live="polite">{visibleSources().length} of {sources.length}</span>
    {/if}
  </div>

  {#if loading}
    <div class="grid" aria-hidden="true">
      {#each [0, 1, 2, 3, 4, 5] as i (i)}
        <div class="skeleton-card">
          <div class="skeleton-thumb"></div>
          <div class="skeleton-name"></div>
        </div>
      {/each}
    </div>
  {:else if visibleSources().length === 0}
    <div class="empty">
      {#if sources.length === 0}
        No {filter === 'screen' ? 'screens' : 'windows'} found.
      {:else}
        No match for “{search}”.
        <button class="link" onclick={() => (search = '')}>Clear filter</button>
      {/if}
    </div>
  {:else}
    <div class="grid" role="listbox" aria-label="Capture sources">
      {#each visibleSources() as source (source.id)}
        <button
          class:selected={selectedId === source.id}
          class="source-card"
          data-source-id={source.id}
          role="option"
          aria-selected={selectedId === source.id}
          onclick={() => selectSource(source)}
          ondblclick={startSharing}
          aria-label={source.name}
          title="{source.name} — double-click to share"
        >
          <span class="thumb">
            {#if source.thumbnailDataUrl}
              <img src={source.thumbnailDataUrl} alt="" loading="lazy" />
            {:else}
              <div class="thumb-placeholder">{source.name}</div>
            {/if}
            {#if selectedId === source.id}
              <span class="check-badge" aria-hidden="true">✓</span>
            {/if}
          </span>
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
      Start sharing →
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
  .kbd-hint {
    color: var(--text-faint);
    background: var(--surface);
    border: 1.5px solid var(--border);
    border-radius: 6px;
    padding: 1px 7px;
    margin-left: 6px;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
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
    color: var(--text-inverse);
  }
  .search-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--surface);
    border: 2.5px solid var(--border);
    border-radius: 12px;
    padding: 8px 12px;
    box-shadow: var(--shadow-xs);
    min-width: 220px;
    flex: 1;
    max-width: 320px;
    color: var(--text-faint);
  }
  .search-wrap:focus-within {
    border-color: var(--accent);
    box-shadow: var(--shadow-xs), 0 0 0 3px var(--accent-soft);
  }
  .search {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    font-family: var(--font-mono);
    font-size: 12.5px;
    font-weight: 700;
    color: var(--text);
    min-width: 0;
  }
  .clear {
    color: var(--text-faint);
    font-size: 12px;
    padding: 2px 6px;
    border-radius: 6px;
  }
  .clear:hover {
    background: var(--bg-soft);
    color: var(--text);
  }
  .count {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 800;
    color: var(--text-faint);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 14px;
  }
  .source-card {
    border-radius: var(--radius-sm);
    overflow: hidden;
    background: var(--surface);
    border: 2.5px solid var(--border);
    box-shadow: var(--shadow-xs);
    transition: transform 0.13s ease, box-shadow 0.13s ease, border-color 0.13s ease;
    text-align: left;
    display: flex;
    flex-direction: column;
    padding: 0;
  }
  .source-card:hover {
    transform: translate(-2px, -2px) scale(1.01);
    box-shadow: var(--shadow-sm);
  }
  .source-card.selected {
    border-color: var(--accent);
    box-shadow: var(--shadow-sm), 0 0 0 3px var(--accent-soft);
    transform: translate(-1px, -1px);
  }
  .thumb {
    position: relative;
    display: block;
  }
  .source-card img {
    width: 100%;
    aspect-ratio: 16/9;
    object-fit: cover;
    background: #000;
    display: block;
    transition: transform 0.2s ease;
  }
  .source-card:hover img {
    transform: scale(1.03);
  }
  .check-badge {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--accent);
    color: #fff;
    font-weight: 800;
    font-size: 14px;
    border: 2.5px solid var(--border);
    box-shadow: var(--shadow-xs);
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
  .skeleton-card {
    border-radius: var(--radius-sm);
    overflow: hidden;
    background: var(--surface);
    border: 2.5px solid var(--border);
    box-shadow: var(--shadow-xs);
  }
  .skeleton-thumb,
  .skeleton-name {
    background: linear-gradient(100deg, var(--bg-soft) 40%, var(--surface-2) 50%, var(--bg-soft) 60%);
    background-size: 200% 100%;
    animation: shimmer 1.4s linear infinite;
  }
  .skeleton-thumb { aspect-ratio: 16/9; }
  .skeleton-name { height: 38px; border-top: 2px solid var(--border); }
  @keyframes shimmer {
    from { background-position: 180% 0; }
    to { background-position: -20% 0; }
  }
  .permission-card {
    display: flex;
    gap: 12px;
    padding: 16px;
    border-radius: var(--radius-sm);
    background: var(--surface);
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
  .empty {
    color: var(--text-faint);
    font-size: 14px;
    text-align: center;
    padding: 40px;
  }
  .empty .link {
    display: inline-block;
    margin-left: 8px;
    color: var(--accent);
    font-weight: 800;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .skeleton-thumb, .skeleton-name { animation: none; }
    .source-card, .source-card img { transition: none; }
  }
</style>
