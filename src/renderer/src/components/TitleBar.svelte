<script lang="ts">
  import { onMount } from 'svelte'
  import { route } from '../routes/router'
  import { settings, saveSettings, resolveTheme } from '../services/config'

  let isMaximized = false
  let effective: 'light' | 'dark' = 'light'

  onMount(async () => {
    if (window.desktop) {
      isMaximized = await window.desktop.window.isMaximized()
    }
    const unsub = settings.subscribe(($s) => {
      effective = resolveTheme($s.general.theme)
    })
    return () => unsub()
  })

  function toggleTheme(): void {
    let current = $settings
    const next = effective === 'dark' ? 'light' : 'dark'
    saveSettings({ ...current, general: { ...current.general, theme: next } })
  }

  function minimize(): void {
    window.desktop?.window.minimize()
  }

  function maximize(): void {
    window.desktop?.window.maximize()
  }

  function close(): void {
    window.desktop?.window.close()
  }
</script>

<header class="titlebar">
  <div class="drag-region"></div>
  <div class="left">
    <div class="logo" onclick={() => route.set({ name: 'home' })}>
      <span class="logo-mark">S</span>
      <span class="logo-name">Sight</span>
    </div>
  </div>
  <div class="controls">
    <button
      class="ctrl theme"
      aria-label={effective === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      title={effective === 'dark' ? 'Light theme' : 'Dark theme'}
      onclick={toggleTheme}
    >
      {#if effective === 'dark'}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      {:else}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
      {/if}
    </button>
    {#if window.desktop?.platform !== 'darwin'}
      <button class="ctrl" aria-label="Minimize" onclick={minimize}>
        <svg width="12" height="12" viewBox="0 0 12 12"><line x1="0" y1="6" x2="12" y2="6" stroke="currentColor" stroke-width="1.2" /></svg>
      </button>
      <button class="ctrl" aria-label="Maximize" onclick={maximize}>
        <svg width="12" height="12" viewBox="0 0 12 12"><rect x="1.5" y="1.5" width="9" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.2" /></svg>
      </button>
      <button class="ctrl close" aria-label="Close" onclick={close}>
        <svg width="12" height="12" viewBox="0 0 12 12"><line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" stroke-width="1.2" /><line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" stroke-width="1.2" /></svg>
      </button>
    {/if}
  </div>
</header>

<style>
  .titlebar {
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--bg-card);
    border-bottom: var(--border-w) solid var(--border);
    -webkit-app-region: drag;
    position: relative;
    z-index: 100;
    flex-shrink: 0;
  }
  .drag-region {
    position: absolute;
    inset: 0;
  }
  .left {
    padding-left: 14px;
    -webkit-app-region: no-drag;
    display: flex;
    align-items: center;
  }
  .logo {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }
  .logo-mark {
    width: 24px;
    height: 24px;
    border-radius: 7px;
    background: var(--accent);
    border: 2.5px solid var(--border);
    box-shadow: var(--shadow-xs);
    transform: rotate(-1.5deg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-logo);
    font-size: 12px;
    color: #fff;
  }
  .logo-name {
    font-family: var(--font-logo);
    font-size: 15px;
    letter-spacing: 0;
    color: var(--text);
  }
  .controls {
    display: flex;
    -webkit-app-region: no-drag;
  }
  .ctrl {
    width: 44px;
    height: 41px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    transition: background 0.13s ease;
  }
  .ctrl:hover {
    background: var(--bg-soft);
    color: var(--text);
  }
  .ctrl.close:hover {
    background: var(--danger);
    color: #fff;
  }
</style>