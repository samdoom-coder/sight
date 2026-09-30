<script lang="ts">
  import { onMount } from 'svelte'
  import { route } from './routes/router'
  import { loadSettings, settings, applyTheme } from './services/config'
  import { sessionStore } from './stores/session'
  import Home from './pages/Home.svelte'
  import HostPicker from './pages/HostPicker.svelte'
  import HostPage from './pages/HostPage.svelte'
  import JoinPage from './pages/JoinPage.svelte'
  import JoiningPage from './pages/JoiningPage.svelte'
  import ViewerPage from './pages/ViewerPage.svelte'
  import SettingsPage from './pages/SettingsPage.svelte'
  import DiagnosticsPage from './pages/DiagnosticsPage.svelte'
  import TitleBar from './components/TitleBar.svelte'
  import Toast from './components/Toast.svelte'

  let currentRoute = route

  onMount(() => {
    loadSettings()
    // Apply theme now + on every settings change (Settings page saves into
    // the same store, so the whole app flips instantly).
    const unsub = settings.subscribe(($s) => applyTheme($s.general.theme))
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const onSystem = (): void => {
      let mode: string = 'system'
      settings.subscribe(($s) => (mode = $s.general.theme))()
      if (mode === 'system') applyTheme('system')
    }
    mq?.addEventListener?.('change', onSystem)
    return () => {
      unsub()
      mq?.removeEventListener?.('change', onSystem)
    }
  })
</script>

<svelte:head>
  <title>Sight</title>
</svelte:head>

<TitleBar />

<div class="app-body">
  {#if $route.name === 'home'}
    <Home />
  {:else if $route.name === 'host-picker'}
    <HostPicker />
  {:else if $route.name === 'host'}
    <HostPage sessionId={$route.sessionId} />
  {:else if $route.name === 'join'}
    <JoinPage />
  {:else if $route.name === 'joining'}
    <JoiningPage code={$route.code} />
  {:else if $route.name === 'viewer'}
    <ViewerPage />
  {:else if $route.name === 'settings'}
    <SettingsPage />
  {:else if $route.name === 'diagnostics'}
    <DiagnosticsPage />
  {/if}
</div>

<Toast />

<style>
  .app-body {
    height: 100vh;
    display: flex;
    flex-direction: column;
  }
</style>
