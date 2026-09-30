<script lang="ts">
  import { onMount } from 'svelte'
  import { navigate } from '../routes/router'
  import { normalizeSessionCode, formatSessionCode, isValidSessionCode } from '@shared/lib/session-code'

  let codeInput = ''
  let codeError = ''
  let animatedPlaceholder = '8K4-X9P'
  let inputFocused = false
  let logoSpinning = false
  let cardEl: HTMLElement
  let homeEl: HTMLElement
  let glowEl: HTMLDivElement
  let primaryBtn: HTMLButtonElement
  let joinBtn: HTMLButtonElement
  let inputEl: HTMLInputElement
  let canvasEl: HTMLCanvasElement
  let previewEl: HTMLElement
  let shakeKey = 0

  // NOTE: tilt/glow/magnetic values are intentionally NOT Svelte reactive state.
  // They update every mousemove/frame — keeping them in plain locals inside
  // onMount avoids 60fps component re-renders. Only rarely-changing UI state
  // (code input, preview ticker, theme) stays reactive.

  const demoCodes = ['8K4-X9P', 'M2Q-Z7W', '7T1-K6D', 'Q9X-2MA', '4F8-H3K']
  let previewCode = demoCodes[0]
  let liveRtt = 38
  let liveMbps = 5.4
  let liveFps = 60
  let connectStat = 0

  const themes = [
    { name: 'iris', accent: '#5b5bd6', hover: '#4848bd', soft: '#ecebfb' },
    { name: 'coral', accent: '#f2665c', hover: '#cf4f44', soft: '#ffe9e6' },
    { name: 'ocean', accent: '#0ea5e9', hover: '#0284c7', soft: '#e0f2fe' },
    { name: 'mint', accent: '#0eb07a', hover: '#0a8a60', soft: '#dcf5e9' }
  ]
  let activeTheme = 0

  function setTheme(i: number): void {
    activeTheme = i
    const t = themes[i]
    homeEl?.style.setProperty('--accent', t.accent)
    homeEl?.style.setProperty('--accent-hover', t.hover)
    homeEl?.style.setProperty('--accent-soft', t.soft)
    try {
      localStorage.setItem('sight-accent', t.name)
    } catch {
      /* ignore */
    }
  }

  function startSession(): void {
    burstFrom(primaryBtn)
    setTimeout(() => navigate({ name: 'host-picker' }), 140)
  }

  function onCodeInput(event: Event): void {
    const raw = (event.currentTarget as HTMLInputElement).value
    const normalized = normalizeSessionCode(raw)
    codeInput = normalized
    codeError = ''
    if (normalized.length > 0) {
      const el = event.currentTarget as HTMLInputElement
      el.value = formatSessionCode(normalized)
    }
  }

  function joinSession(): void {
    const normalized = normalizeSessionCode(codeInput)
    if (!isValidSessionCode(normalized)) {
      codeError = 'Enter a valid session code like 8K4-X9P.'
      shakeKey += 1
      inputEl?.focus()
      return
    }
    burstFrom(joinBtn)
    setTimeout(() => navigate({ name: 'joining', code: formatSessionCode(normalized) }), 140)
  }

  function openSettings(): void {
    navigate({ name: 'settings' })
  }

  function onLogoClick(): void {
    if (logoSpinning) return
    logoSpinning = true
    setTimeout(() => (logoSpinning = false), 700)
  }

  // Small confetti burst on primary actions only (click-driven, not per-frame).
  function burstFrom(el: HTMLElement | null): void {
    if (!el || !homeEl) return
    const rect = el.getBoundingClientRect()
    const host = homeEl.getBoundingClientRect()
    const cx = rect.left - host.left + rect.width / 2
    const cy = rect.top - host.top + rect.height / 2
    const colors = ['#5b5bd6', '#f2665c', '#7cc4ff', '#0eb07a']
    for (let i = 0; i < 12; i++) {
      const p = document.createElement('span')
      p.className = 'burst-particle'
      const angle = (i / 12) * Math.PI * 2 + Math.random() * 0.4
      const dist = 44 + Math.random() * 52
      p.style.setProperty('--bx', `${Math.cos(angle) * dist}px`)
      p.style.setProperty('--by', `${Math.sin(angle) * dist - 20}px`)
      p.style.background = colors[i % colors.length]
      p.style.left = `${cx}px`
      p.style.top = `${cy}px`
      homeEl.appendChild(p)
      setTimeout(() => p.remove(), 700)
    }
  }

  onMount(() => {
    // restore theme
    try {
      const saved = localStorage.getItem('sight-accent')
      const idx = themes.findIndex((t) => t.name === saved)
      if (idx >= 0) {
        // defer until homeEl bound
        setTimeout(() => setTheme(idx), 0)
      }
    } catch {
      /* ignore */
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let cancelled = false

    // --- typewriter placeholder ---
    let codeIdx = 0
    let charIdx = demoCodes[0].length
    let deleting = true
    let timer: ReturnType<typeof setTimeout>
    function tickPlaceholder(): void {
      if (cancelled) return
      const current = demoCodes[codeIdx]
      if (deleting) {
        charIdx -= 1
        if (charIdx <= 0) {
          charIdx = 0
          deleting = false
          codeIdx = (codeIdx + 1) % demoCodes.length
          animatedPlaceholder = ''
          timer = setTimeout(tickPlaceholder, 420)
          return
        }
        animatedPlaceholder = current.slice(0, charIdx)
        timer = setTimeout(tickPlaceholder, 55)
      } else {
        const next = demoCodes[codeIdx]
        charIdx += 1
        if (charIdx >= next.length) {
          animatedPlaceholder = next
          deleting = true
          timer = setTimeout(tickPlaceholder, 1600)
          return
        }
        animatedPlaceholder = next.slice(0, charIdx)
        timer = setTimeout(tickPlaceholder, 110)
      }
    }
    timer = setTimeout(tickPlaceholder, 1600)

    // --- live preview ticker ---
    let previewIdx = 0
    const previewTimer = setInterval(() => {
      if (cancelled) return
      previewIdx = (previewIdx + 1) % demoCodes.length
      previewCode = demoCodes[previewIdx]
      liveRtt = Math.round(28 + Math.random() * 26)
      liveMbps = Math.round((4.2 + Math.random() * 2.6) * 10) / 10
      liveFps = Math.random() > 0.15 ? 60 : 30
    }, 2200)

    // --- count-up stat: coarse 80ms interval (15 renders total) instead of
    // per-frame reactive writes which would re-render 70+ times.
    connectStat = 0
    let statStep = 0
    const statTimer = setInterval(() => {
      if (cancelled) {
        clearInterval(statTimer)
        return
      }
      statStep += 1
      const t = Math.min(1, statStep / 15)
      const eased = 1 - Math.pow(1 - t, 3)
      connectStat = Math.round(eased * 18) / 10
      if (t >= 1) clearInterval(statTimer)
    }, 80)

    // --- canvas P2P network (optimized) ---
    // Before: 60fps, DPR 2, ~70 nodes, per-line strokeStyle strings + Math.hypot
    //   => ~1200 strokes/sec + string GC churn.
    // After: 30fps throttle, DPR<=1.25, <=42 nodes, squared distances,
    //   Path2D batching (3 strokes + 1 fill per frame), setTransform once,
    //   trail drawn in-canvas (zero DOM churn), pause when hidden/offscreen.
    const canvas = canvasEl
    const ctx = canvas?.getContext('2d')
    interface NetNode {
      x: number
      y: number
      vx: number
      vy: number
      r: number
    }
    let nodes: NetNode[] = []
    let cw = 0
    let ch = 0
    const dpr = Math.min(1.25, window.devicePixelRatio || 1)
    // cached viewport-space rects — refreshed on resize/scroll/interval,
    // NEVER per-mousemove (avoids forced sync layout on every pointer event)
    const cache = {
      hostLeft: 0,
      hostTop: 0,
      cardLeft: 0,
      cardTop: 0,
      cardW: 1,
      cardH: 1,
      cardCX: 0,
      cardCY: 0,
      prevCX: 0,
      prevCY: 0,
      prevW: 1,
      prevH: 1,
      btnPX: 0,
      btnPY: 0,
      btnJX: 0,
      btnJY: 0
    }
    let isVisible = true
    // mouse in viewport coords (no DOM reads in handler)
    let mouseVX = -9999
    let mouseVY = -9999
    let hasMouse = false
    // canvas-space trail ring (replaces DOM .trail-dot nodes)
    interface TrailPt {
      x: number
      y: number
      age: number
    }
    const trail: TrailPt[] = []
    let lastTrailPush = 0
    let lastTrailLX = 0
    let lastTrailLY = 0

    function updateRects(): void {
      if (!homeEl) return
      const h = homeEl.getBoundingClientRect()
      cache.hostLeft = h.left
      cache.hostTop = h.top
      if (cardEl) {
        const r = cardEl.getBoundingClientRect()
        cache.cardLeft = r.left
        cache.cardTop = r.top
        cache.cardW = Math.max(1, r.width)
        cache.cardH = Math.max(1, r.height)
        cache.cardCX = r.left + r.width / 2
        cache.cardCY = r.top + r.height / 2
      }
      if (previewEl) {
        const pr = previewEl.getBoundingClientRect()
        cache.prevCX = pr.left + pr.width / 2
        cache.prevCY = pr.top + pr.height / 2
        cache.prevW = Math.max(1, pr.width)
        cache.prevH = Math.max(1, pr.height)
      }
      if (primaryBtn) {
        const b = primaryBtn.getBoundingClientRect()
        cache.btnPX = b.left + b.width / 2
        cache.btnPY = b.top + b.height / 2
      }
      if (joinBtn) {
        const b = joinBtn.getBoundingClientRect()
        cache.btnJX = b.left + b.width / 2
        cache.btnJY = b.top + b.height / 2
      }
    }

    function resizeCanvas(): void {
      if (!canvas || !homeEl || !ctx) return
      const rect = homeEl.getBoundingClientRect()
      cw = rect.width
      ch = rect.height
      canvas.width = Math.max(1, Math.floor(cw * dpr))
      canvas.height = Math.max(1, Math.floor(ch * dpr))
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    function seedNodes(): void {
      if (cw <= 0 || ch <= 0) return
      const count = Math.min(42, Math.max(24, Math.floor((cw * ch) / 32000)))
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * cw,
        y: Math.random() * ch,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: 1.3 + Math.random() * 1.6
      }))
    }

    const LINK2 = 130 * 130
    const STRONG2 = 65 * 65
    const MOUSE2 = 170 * 170

    function drawNet(mouseLX: number, mouseLY: number): void {
      if (!ctx || cw <= 0) return
      // move
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]
        a.x += a.vx
        a.y += a.vy
        if (a.x < 0 || a.x > cw) a.vx *= -1
        if (a.y < 0 || a.y > ch) a.vy *= -1
        if (hasMouse) {
          const mdx = mouseLX - a.x
          const mdy = mouseLY - a.y
          const md2 = mdx * mdx + mdy * mdy
          if (md2 < 25600 && md2 > 1) {
            const md = Math.sqrt(md2)
            a.x += (mdx / md) * 0.3
            a.y += (mdy / md) * 0.3
          }
        }
      }
      ctx.clearRect(0, 0, cw, ch)
      ctx.lineWidth = 1
      // batch all links into 3 strokes total (was: 1 stroke per line)
      const weak = new Path2D()
      const strong = new Path2D()
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const d2 = dx * dx + dy * dy
          if (d2 < LINK2) {
            const path = d2 < STRONG2 ? strong : weak
            path.moveTo(a.x, a.y)
            path.lineTo(b.x, b.y)
          }
        }
      }
      ctx.strokeStyle = 'rgba(129,140,248,0.12)'
      ctx.stroke(weak)
      ctx.strokeStyle = 'rgba(129,140,248,0.25)'
      ctx.stroke(strong)
      if (hasMouse && mouseLX > 0 && mouseLY > 0) {
        const mp = new Path2D()
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i]
          const dx = n.x - mouseLX
          const dy = n.y - mouseLY
          if (dx * dx + dy * dy < MOUSE2) {
            mp.moveTo(n.x, n.y)
            mp.lineTo(mouseLX, mouseLY)
          }
        }
        ctx.strokeStyle = 'rgba(242,102,92,0.20)'
        ctx.stroke(mp)
      }
      // nodes: single fill
      const dots = new Path2D()
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]
        dots.moveTo(n.x + n.r, n.y)
        dots.arc(n.x, n.y, n.r, 0, 6.2832)
      }
      ctx.fillStyle = 'rgba(129,140,248,0.50)'
      ctx.fill(dots)
      // trail in-canvas (no DOM)
      for (let i = 0; i < trail.length; i++) {
        const t = trail[i]
        const alpha = Math.max(0, 0.32 * (1 - t.age / 12))
        if (alpha <= 0) continue
        ctx.fillStyle = `rgba(129,140,248,${alpha.toFixed(3)})`
        ctx.beginPath()
        ctx.arc(t.x, t.y, 3.2, 0, 6.2832)
        ctx.fill()
      }
      if (hasMouse && mouseLX > 0 && mouseLY > 0) {
        ctx.fillStyle = 'rgba(242,102,92,0.9)'
        ctx.beginPath()
        ctx.arc(mouseLX, mouseLY, 3, 0, 6.2832)
        ctx.fill()
      }
    }

    updateRects()
    resizeCanvas()
    seedNodes()
    if (reduced && ctx) {
      // one static frame for reduced-motion, then no loop at all
      drawNet(-9999, -9999)
    }

    // --- single unified rAF loop (was: 3 loops) ---
    // Before: drawNet loop (60fps) + glow loop (60fps) + stat loop + direct
    //   style writes + getBoundingClientRect on EVERY mousemove (layout thrash).
    // After: ONE loop, mousemove only stores coords (zero DOM reads),
    //   all DOM reads from cache, all writes lerped + change-gated,
    //   canvas throttled to ~30fps, skipped when hidden/offscreen.
    let raf = 0
    let glowX = -400
    let glowY = -400
    let tiltRX = 0
    let tiltRY = 0
    let prevRX = 0
    let prevRY = 0
    let magPX = 0
    let magPY = 0
    let magJX = 0
    let magJY = 0
    let lastDraw = 0
    let glowOn = false
    let lastTiltApplied = ''
    let lastPrevApplied = ''
    let resizeQueued = false

    function onMouseMove(e: MouseEvent): void {
      // zero layout work here — just store coords, rAF does the rest
      mouseVX = e.clientX
      mouseVY = e.clientY
      hasMouse = true
      if (!glowOn) {
        glowOn = true
        glowEl?.classList.add('on')
      }
    }

    function onLeave(): void {
      hasMouse = false
      mouseVX = -9999
      mouseVY = -9999
      glowOn = false
      glowEl?.classList.remove('on')
      trail.length = 0
      if (cardEl) cardEl.classList.remove('tilting')
    }

    function onResize(): void {
      if (resizeQueued) return
      resizeQueued = true
      requestAnimationFrame(() => {
        resizeQueued = false
        if (cancelled) return
        updateRects()
        resizeCanvas()
        seedNodes()
      })
    }

    function loop(now: number): void {
      if (cancelled) return
      raf = requestAnimationFrame(loop)
      if (document.hidden || !isVisible || reduced) return
      const mouseLX = mouseVX - cache.hostLeft
      const mouseLY = mouseVY - cache.hostTop

      // glow (lerped, translate3d = GPU only)
      if (glowEl && hasMouse) {
        glowX += (mouseLX - glowX) * 0.16
        glowY += (mouseLY - glowY) * 0.16
        glowEl.style.transform = `translate3d(${glowX.toFixed(1)}px,${glowY.toFixed(1)}px,0) translate(-50%,-50%)`
      }

      // tilt targets from CACHE (no getBoundingClientRect here)
      let tRX = 0
      let tRY = 0
      let inside = false
      let gx = 50
      let gy = 50
      if (hasMouse && cardEl) {
        const px = (mouseVX - cache.cardCX) / cache.cardW
        const py = (mouseVY - cache.cardCY) / cache.cardH
        inside =
          mouseVX > cache.cardLeft - 70 &&
          mouseVX < cache.cardLeft + cache.cardW + 70 &&
          mouseVY > cache.cardTop - 70 &&
          mouseVY < cache.cardTop + cache.cardH + 70
        if (inside) {
          const cx = Math.max(-1, Math.min(1, px))
          const cy = Math.max(-1, Math.min(1, py))
          tRY = cx * 7
          tRX = -cy * 7
          gx = ((cx + 0.5) * 100 + 50) / 2
          gy = ((cy + 0.5) * 100 + 50) / 2
        }
      }
      tiltRX += (tRX - tiltRX) * 0.18
      tiltRY += (tRY - tiltRY) * 0.18
      if (cardEl && (Math.abs(tiltRX) > 0.02 || Math.abs(tiltRY) > 0.02 || inside)) {
        const key = `${tiltRX.toFixed(2)}|${tiltRY.toFixed(2)}|${gx.toFixed(0)}|${gy.toFixed(0)}`
        if (key !== lastTiltApplied) {
          lastTiltApplied = key
          cardEl.style.setProperty('--rx', `${tiltRX.toFixed(2)}deg`)
          cardEl.style.setProperty('--ry', `${tiltRY.toFixed(2)}deg`)
          cardEl.style.setProperty('--gx', `${gx.toFixed(1)}%`)
          cardEl.style.setProperty('--gy', `${gy.toFixed(1)}%`)
        }
        cardEl.classList.toggle('tilting', inside)
      } else if (cardEl && lastTiltApplied !== 'zero') {
        lastTiltApplied = 'zero'
        cardEl.style.setProperty('--rx', '0deg')
        cardEl.style.setProperty('--ry', '0deg')
        cardEl.classList.remove('tilting')
      }

      // preview parallax (lerped)
      if (previewEl && hasMouse) {
        const px = (mouseVX - cache.prevCX) / cache.prevW
        const py = (mouseVY - cache.prevCY) / cache.prevH
        const wantRX = Math.max(-1, Math.min(1, -py)) * 5
        const wantRY = Math.max(-1, Math.min(1, px)) * 6
        prevRX += (wantRX - prevRX) * 0.12
        prevRY += (wantRY - prevRY) * 0.12
        const pkey = `${prevRX.toFixed(2)}|${prevRY.toFixed(2)}`
        if (pkey !== lastPrevApplied) {
          lastPrevApplied = pkey
          previewEl.style.transform = `perspective(1000px) rotateX(${prevRX.toFixed(2)}deg) rotateY(${prevRY.toFixed(2)}deg) translateY(-4px)`
        }
      }

      // magnetic buttons (lerped, from cache — no rect reads)
      if (primaryBtn) {
        const dx = mouseVX - cache.btnPX
        const dy = mouseVY - cache.btnPY
        const d2 = dx * dx + dy * dy
        let tx = 0
        let ty = 0
        if (hasMouse && d2 < 14400) {
          const dist = Math.sqrt(d2) || 1
          const pull = (1 - dist / 120) * 9
          tx = (dx / dist) * pull
          ty = (dy / dist) * pull
        }
        magPX += (tx - magPX) * 0.2
        magPY += (ty - magPY) * 0.2
        if (Math.abs(magPX) > 0.1 || Math.abs(magPY) > 0.1) {
          primaryBtn.style.transform = `translate3d(${magPX.toFixed(1)}px,${magPY.toFixed(1)}px,0)`
        } else if (primaryBtn.style.transform) {
          primaryBtn.style.transform = ''
        }
      }
      if (joinBtn) {
        const dx = mouseVX - cache.btnJX
        const dy = mouseVY - cache.btnJY
        const d2 = dx * dx + dy * dy
        let tx = 0
        let ty = 0
        if (hasMouse && d2 < 14400) {
          const dist = Math.sqrt(d2) || 1
          const pull = (1 - dist / 120) * 9
          tx = (dx / dist) * pull
          ty = (dy / dist) * pull
        }
        magJX += (tx - magJX) * 0.2
        magJY += (ty - magJY) * 0.2
        if (Math.abs(magJX) > 0.1 || Math.abs(magJY) > 0.1) {
          joinBtn.style.transform = `translate3d(${magJX.toFixed(1)}px,${magJY.toFixed(1)}px,0)`
        } else if (joinBtn.style.transform) {
          joinBtn.style.transform = ''
        }
      }

      // trail: push in-loop (throttled), age out
      if (hasMouse) {
        const moved = (mouseLX - lastTrailLX) * (mouseLX - lastTrailLX) + (mouseLY - lastTrailLY) * (mouseLY - lastTrailLY)
        if (moved > 25 && now - lastTrailPush > 90 && trail.length < 10) {
          lastTrailPush = now
          lastTrailLX = mouseLX
          lastTrailLY = mouseLY
          trail.push({ x: mouseLX, y: mouseLY, age: 0 })
        }
      }
      for (let i = trail.length - 1; i >= 0; i--) {
        trail[i].age += 1
        if (trail[i].age > 12) trail.splice(i, 1)
      }

      // canvas at ~30fps, skipped when tab hidden or offscreen
      if (ctx && now - lastDraw > 33) {
        lastDraw = now
        drawNet(mouseLX, mouseLY)
      }
    }

    window.addEventListener('mousemove', onMouseMove, { passive: true })
    window.addEventListener('resize', onResize, { passive: true })
    window.addEventListener('scroll', onResize, { passive: true, capture: true })
    homeEl?.addEventListener('mouseleave', onLeave)
    const rectTimer = setInterval(() => {
      if (!cancelled) updateRects()
    }, 1000)
    let observer: IntersectionObserver | null = null
    if (typeof IntersectionObserver !== 'undefined' && homeEl) {
      observer = new IntersectionObserver(
        (entries) => {
          isVisible = entries[0]?.isIntersecting ?? true
        },
        { threshold: 0 }
      )
      observer.observe(homeEl)
    }
    if (!reduced) {
      raf = requestAnimationFrame(loop)
    }

    return () => {
      cancelled = true
      clearTimeout(timer)
      clearInterval(previewTimer)
      clearInterval(statTimer)
      clearInterval(rectTimer)
      cancelAnimationFrame(raf)
      observer?.disconnect()
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize)
      homeEl?.removeEventListener('mouseleave', onLeave)
    }
  })
</script>

<main class="home" bind:this={homeEl}>
  <canvas class="net" bind:this={canvasEl} aria-hidden="true"></canvas>
  <div class="blob blob-a"></div>
  <div class="blob blob-b"></div>
  <div class="blob blob-c"></div>
  <div class="mesh" aria-hidden="true"></div>
  <div class="glow" bind:this={glowEl}></div>

  <div class="hero">
    <!-- LEFT: headline + action card -->
    <div class="hero-left">
      <div class="eyebrow animate-in">
        <span class="pulse"></span>
        instant p2p · no accounts · e2e encrypted
        <span class="themes" role="group" aria-label="Accent theme">
          {#each themes as t, i}
            <button
              class="theme-dot"
              class:active={i === activeTheme}
              style="background:{t.accent}"
              title={t.name}
              aria-label="Theme {t.name}"
              onclick={() => setTheme(i)}
            ></button>
          {/each}
        </span>
      </div>

      <h1 class="hero-title">
        <span class="line l1">See any screen</span>
        <span class="line l2 grad">in 2 seconds<span class="caret-blink" aria-hidden="true">_</span></span>
      </h1>
      <p class="hero-sub">
        Sight opens a direct, encrypted tunnel between two devices.
        Share with a <b>6-letter code</b> — video never touches our server.
      </p>

      <div class="stat-row" aria-hidden="true">
        <div class="stat"><b>{connectStat.toFixed(1)}s</b><span>median connect</span></div>
        <div class="stat"><b>0 B</b><span>via server</span></div>
        <div class="stat"><b>256-bit</b><span>E2E media</span></div>
      </div>

      <section class="card" bind:this={cardEl}>
        <div class="card-glare" aria-hidden="true"></div>
        <header class="brand">
          <button class="logo" class:spin={logoSpinning} onclick={onLogoClick} title="Click me!" aria-label="Sight logo">
            S
            <span class="logo-ring" aria-hidden="true"></span>
            <span class="logo-ring r2" aria-hidden="true"></span>
          </button>
          <div class="brand-text">
            <h2><span>Sight</span><span class="live-pill"><span class="live-dot"></span>p2p live</span></h2>
            <p class="tagline">Direct screen-to-screen</p>
          </div>
          <div class="code-mini" aria-hidden="true" title="Live preview code">{previewCode}</div>
        </header>

        <button class="btn btn-primary magnetic" bind:this={primaryBtn} onclick={startSession}>
          <span class="btn-shine" aria-hidden="true"></span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          <span>Create a session</span>
          <span class="kbd" aria-hidden="true">↵</span>
        </button>

        <div class="divider"><span>or join with a code</span></div>

        <div class="receive-row">
          <div class="input-wrap" class:error={!!codeError} class:focused={inputFocused}>
            <input
              bind:this={inputEl}
              class="code-input"
              class:shake={shakeKey > 0}
              key={shakeKey}
              placeholder={animatedPlaceholder}
              value={codeInput}
              oninput={onCodeInput}
              onfocus={() => (inputFocused = true)}
              onblur={() => (inputFocused = false)}
              onkeydown={(e) => {
                if (e.key === 'Enter') joinSession()
              }}
              maxlength="7"
              aria-label="Session code"
              spellcheck={false}
              autocomplete="off"
            />
            {#if !codeInput && !inputFocused}
              <span class="typing-caret" aria-hidden="true"></span>
            {/if}
            <span class="input-glow" aria-hidden="true"></span>
          </div>
          <button class="btn btn-ghost magnetic" bind:this={joinBtn} onclick={joinSession}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 12h14" />
              <path d="M12 5l7 7-7 7" />
            </svg>
            <span>Join</span>
          </button>
        </div>
        {#if codeError}
          <p class="error">{codeError}</p>
        {:else}
          <p class="hint">Try <button class="hint-code" onclick={() => { codeInput = '8K4X9P'; inputEl.value = '8K4-X9P'; }}>8K4-X9P</button> — it types itself above. Hover the preview →</p>
        {/if}

        <div class="marquee" aria-hidden="true">
          <div class="marquee-track">
            <span>WebRTC</span><i>•</i><span>STUN / TURN</span><i>•</i><span>multi-cursor</span><i>•</i><span>60 fps</span><i>•</i><span>data-channel</span><i>•</i><span>ICE restart</span><i>•</i>
            <span>WebRTC</span><i>•</i><span>STUN / TURN</span><i>•</i><span>multi-cursor</span><i>•</i><span>60 fps</span><i>•</i><span>data-channel</span><i>•</i><span>ICE restart</span><i>•</i>
          </div>
        </div>

        <button class="foot-note" onclick={openSettings}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span>Settings</span>
        </button>
      </section>
    </div>

    <!-- RIGHT: live interactive preview -->
    <div class="hero-right">
      <div class="preview" bind:this={previewEl}>
        <div class="preview-bar">
          <span class="dots"><i></i><i></i><i></i></span>
          <span class="url">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            sight.app/join/<b>{previewCode}</b>
          </span>
          <span class="live-mini"><span class="live-dot"></span>LIVE</span>
        </div>
        <div class="screen">
          <div class="screen-grid" aria-hidden="true"></div>
          <div class="fake-win w1" aria-hidden="true"><span class="fw-bar"></span><span class="fw-line long"></span><span class="fw-line"></span><span class="fw-line short"></span></div>
          <div class="fake-win w2" aria-hidden="true"><span class="fw-bar coral"></span><span class="fw-line long"></span><span class="fw-line short"></span></div>
          <div class="beam" aria-hidden="true"></div>
          <div class="pcursor p1" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M4 2l15 8-7 2-3 7-5-17z" /></svg>
            <span>you</span>
          </div>
          <div class="pcursor p2" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#0eb07a"><path d="M4 2l15 8-7 2-3 7-5-17z" /></svg>
            <span>guest</span>
          </div>
          <div class="scan" aria-hidden="true"></div>
          <div class="screen-hud">
            <span class="hud-chip"><span class="hdot" style="background:#0eb07a"></span>{liveRtt} ms · direct</span>
            <span class="hud-chip">{liveMbps} Mbps · {liveFps} fps</span>
          </div>
        </div>
        <div class="preview-foot">
          <div class="avatars" aria-hidden="true">
            <span class="av" style="background:#5b5bd6">S</span>
            <span class="av" style="background:#f2665c">P</span>
            <span class="av more">+1</span>
          </div>
          <span class="foot-label">2 watching · cursors on</span>
          <span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        </div>
        <div class="float-chip fc-top" aria-hidden="true">
          <span class="hdot" style="background:#0eb07a"></span> Direct P2P · {liveRtt} ms
        </div>
        <div class="float-chip fc-bottom" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          E2E encrypted
        </div>
      </div>
      <p class="preview-hint" aria-hidden="true">live mock — move your mouse, the network reacts</p>
    </div>
  </div>
</main>

<style>
  .home {
    --rx: 0deg;
    --ry: 0deg;
    --gx: 50%;
    --gy: 50%;
    flex: 1;
    display: flex;
    /* NOTE: align-items:center + justify-content:center on a scrolling flex
       container clips the top when content overflows (classic flexbox bug).
       margin:auto on the child centers when it fits AND scrolls correctly
       when it doesn't — so the preview is never cut off at the top. */
    align-items: flex-start;
    justify-content: center;
    padding: 28px 22px 30px;
    overflow-y: auto;
    overflow-x: hidden;
    position: relative;
    perspective: 1200px;
  }
  .net {
    position: absolute;
    inset: 0;
    z-index: 0;
    opacity: 0.9;
    pointer-events: none;
    contain: strict;
  }
  .mesh {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background:
      radial-gradient(600px 300px at 15% 0%, rgba(124,196,255,0.35), transparent 70%),
      radial-gradient(500px 320px at 90% 20%, rgba(242,102,92,0.18), transparent 70%),
      radial-gradient(700px 400px at 50% 110%, rgba(129,140,248,0.22), transparent 70%);
  }
  .blob {
    position: absolute;
    border-radius: 50%;
    filter: blur(60px);
    opacity: 0.4;
    pointer-events: none;
    z-index: 0;
    /* isolate expensive blur repaints + promote to GPU layer */
    contain: strict;
    will-change: transform;
    transform: translateZ(0);
  }
  .blob-a { width: 420px; height: 420px; left: -120px; top: -120px; background: radial-gradient(circle, #7cc4ff 0%, transparent 70%); animation: drift-a 11s ease-in-out infinite alternate; }
  .blob-b { width: 380px; height: 380px; right: -100px; top: 20%; background: radial-gradient(circle, #f2665c55 0%, transparent 70%); animation: drift-b 13s ease-in-out infinite alternate; }
  .blob-c { width: 300px; height: 300px; left: 30%; bottom: -140px; background: radial-gradient(circle, #5b5bd655 0%, transparent 70%); animation: drift-a 15s ease-in-out infinite alternate-reverse; }
  @keyframes drift-a { from { transform: translate(0, 0) scale(1); } to { transform: translate(46px, 30px) scale(1.12); } }
  @keyframes drift-b { from { transform: translate(0, 0) scale(1.05); } to { transform: translate(-40px, -34px) scale(0.94); } }
  .glow {
    position: absolute; left: 0; top: 0;
    width: 340px; height: 340px; border-radius: 50%;
    background: radial-gradient(circle, rgba(129,140,248,0.22) 0%, rgba(124,196,255,0.14) 40%, transparent 70%);
    pointer-events: none; opacity: 0; transition: opacity 0.35s; z-index: 1;
    will-change: transform;
    contain: strict;
  }
  .glow.on { opacity: 1; }

  .hero {
    position: relative;
    z-index: 2;
    width: 100%;
    max-width: 1240px;
    min-width: 0;
    margin: auto;
    display: grid;
    grid-template-columns: 1.18fr 0.82fr;
    gap: 36px;
    align-items: center;
  }
  .hero-left,
  .hero-right {
    min-width: 0;
    max-width: 100%;
  }
  @media (max-width: 920px) {
    .hero { grid-template-columns: 1fr; max-width: 580px; }
    .hero-right { order: -1; }
    .preview { max-width: 520px; margin: 0 auto; }
  }

  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: 999px;
    padding: 6px 8px 6px 12px;
    box-shadow: 2px 2px 0 var(--border);
    color: var(--text-dim);
    margin-bottom: 14px;
  }
  .pulse { width: 8px; height: 8px; border-radius: 50%; background: var(--success); animation: pulse-dot 1.4s ease infinite; }
  .themes { display: inline-flex; gap: 5px; margin-left: 4px; background: var(--bg-soft); border-radius: 999px; padding: 3px 6px; }
  .theme-dot {
    width: 14px; height: 14px; border-radius: 50%;
    border: 2px solid var(--border);
    transition: transform 0.15s;
  }
  .theme-dot:hover { transform: scale(1.2); }
  .theme-dot.active { box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--border); transform: scale(1.1); }

  .hero-title {
    font-family: var(--font-logo);
    font-size: clamp(38px, 4.2vw, 60px);
    line-height: 0.95;
    letter-spacing: -0.01em;
    color: var(--text);
    margin-bottom: 10px;
  }
  .hero-title .line { display: block; overflow: hidden; }
  .l1 { animation: rise 0.7s cubic-bezier(0.16, 1, 0.3, 1) both; }
  .l2 { animation: rise 0.7s 0.1s cubic-bezier(0.16, 1, 0.3, 1) both; }
  @keyframes rise { from { transform: translateY(110%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  .grad {
    background: linear-gradient(90deg, var(--accent), #f2665c, #e6b800, var(--accent));
    background-size: 250% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: rise 0.7s 0.1s cubic-bezier(0.16, 1, 0.3, 1) both, grad-slide 5s linear infinite;
  }
  @keyframes grad-slide { from { background-position: 0% 0; } to { background-position: 250% 0; } }
  .caret-blink { animation: blink 1.1s steps(1) infinite; }
  @keyframes blink { 50% { opacity: 0; } }

  .hero-sub {
    font-size: 15.5px;
    line-height: 1.6;
    color: var(--text-muted);
    font-weight: 500;
    max-width: 52ch;
    margin-bottom: 16px;
  }
  .hero-sub b { color: var(--text); background: var(--accent-soft); padding: 1px 6px; border-radius: 6px; border: 1.5px solid var(--border); }

  .stat-row { display: flex; gap: 12px; margin-bottom: 20px; }
  .stat {
    flex: 1;
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: 12px;
    padding: 10px 12px;
    box-shadow: 2px 2px 0 var(--border);
    display: flex;
    flex-direction: column;
    transition: transform 0.15s;
  }
  .stat:hover { transform: translateY(-2px); }
  .stat b { font-family: var(--font-mono); font-size: 17px; }
  .stat span { font-family: var(--font-mono); font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-faint); }

  .card {
    position: relative;
    width: 100%;
    background: var(--bg-card);
    border: var(--border-w) solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 0 34px 30px;
    overflow: hidden;
    transform: rotateX(var(--rx)) rotateY(var(--ry));
    transition: transform 0.18s ease-out, box-shadow 0.18s ease-out;
    will-change: transform;
  }
  .card.tilting { transition: transform 0.06s linear; box-shadow: 8px 10px 0 var(--border); }
  .card-glare {
    position: absolute; inset: 0;
    background: radial-gradient(circle at var(--gx) var(--gy), rgba(255,255,255,0.55) 0%, transparent 55%);
    opacity: 0; pointer-events: none; transition: opacity 0.2s;
  }
  .card.tilting .card-glare { opacity: 1; }
  .card::before {
    content: ''; display: block; height: 10px; margin: 0 -34px;
    background: linear-gradient(90deg, var(--accent), var(--teal), var(--mustard), var(--accent));
    background-size: 300% 100%;
    animation: bar-slide 6s linear infinite;
    border-bottom: var(--border-w) solid var(--border);
  }
  @keyframes bar-slide { from { background-position: 0% 0; } to { background-position: 300% 0; } }

  .brand { display: flex; align-items: center; gap: 14px; margin: 20px 0 16px; }
  .logo {
    position: relative; width: 54px; height: 54px; flex-shrink: 0;
    display: grid; place-items: center;
    background: var(--accent); border: var(--border-w) solid var(--border);
    border-radius: 14px; box-shadow: var(--shadow-xs);
    color: #fff; font-family: var(--font-logo); font-size: 22px;
    transform: rotate(-1.5deg);
    transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.25s;
  }
  .logo:hover { transform: rotate(-1.5deg) scale(1.08) translateY(-1px); }
  .logo.spin { animation: logo-spin 0.68s cubic-bezier(0.34, 1.3, 0.64, 1); }
  @keyframes logo-spin { 0% { transform: rotate(-1.5deg) scale(1); } 45% { transform: rotate(178deg) scale(1.15); } 100% { transform: rotate(358.5deg) scale(1); } }
  .logo-ring { position: absolute; inset: -7px; border: 2px solid var(--accent); border-radius: 15px; opacity: 0; pointer-events: none; }
  .logo:hover .logo-ring { animation: ping 1.3s ease-out infinite; }
  .logo-ring.r2 { animation-delay: 0.35s !important; }
  @keyframes ping { 0% { transform: scale(0.92); opacity: 0.7; } 100% { transform: scale(1.18); opacity: 0; } }
  .brand-text { display: flex; flex-direction: column; }
  .brand h2 { font-family: var(--font-logo); font-size: 24px; line-height: 0.95; color: var(--text); display: flex; align-items: center; gap: 8px; }
  .live-pill {
    display: inline-flex; align-items: center; gap: 5px;
    font-family: var(--font-mono); font-size: 8.5px; font-weight: 800;
    letter-spacing: 0.1em; text-transform: uppercase;
    background: #e8f8f0; border: 2px solid var(--border); color: #0a7a54;
    padding: 2px 7px; border-radius: 999px;
  }
  .live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--success); animation: pulse-dot 1.5s ease infinite; }
  .tagline {
    font-family: var(--font-mono); font-size: 10px; font-weight: 700;
    letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-inverse);
    background: var(--text); display: inline-block; padding: 3px 7px 3.5px;
    border-radius: 6px; margin-top: 4px; width: fit-content; line-height: 1; transform: rotate(-0.3deg);
  }
  .code-mini {
    margin-left: auto;
    font-family: var(--font-mono); font-size: 15px; font-weight: 800; letter-spacing: 0.14em;
    background: var(--surface); border: 2px dashed var(--border); border-radius: 10px; padding: 8px 12px;
    animation: mini-pop 2.2s ease infinite;
  }
  @keyframes mini-pop { 0%, 100% { transform: rotate(-1deg) scale(1); } 10% { transform: rotate(1deg) scale(1.06); } 20% { transform: rotate(-1deg) scale(1); } }

  .btn {
    position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 10px;
    border: 2.5px solid var(--border); border-radius: 12px; padding: 16px 20px;
    font-family: var(--font-mono); font-size: 14px; font-weight: 800;
    letter-spacing: 0.07em; text-transform: uppercase; cursor: pointer;
    box-shadow: var(--shadow-sm); user-select: none; overflow: hidden; will-change: transform;
    transition: box-shadow 0.13s, background 0.25s;
  }
  .magnetic { transition: box-shadow 0.13s, background 0.25s, transform 0.12s ease-out; }
  .btn-primary { background: var(--accent); color: #fff; width: 100%; }
  .btn-primary:hover { background: var(--accent-hover); box-shadow: 5px 5px 0 var(--border); }
  .btn-shine {
    position: absolute; top: 0; left: -70%; width: 55%; height: 100%;
    background: linear-gradient(105deg, transparent, rgba(255,255,255,0.45), transparent);
    transform: skewX(-20deg); animation: shine 3.4s ease-in-out infinite; pointer-events: none;
  }
  @keyframes shine { 0%, 55% { left: -70%; } 90%, 100% { left: 130%; } }
  .kbd { margin-left: 2px; font-size: 10px; border: 1.5px solid rgba(255,255,255,0.6); border-radius: 6px; padding: 1px 6px; opacity: 0.85; }
  .btn-ghost { background: var(--surface); color: var(--text); white-space: nowrap; }
  .btn-ghost:hover { background: var(--bg-card-hover); box-shadow: 4px 4px 0 var(--border); }

  .divider {
    display: flex; align-items: center; gap: 12px; margin: 16px 0;
    color: var(--text); font-family: var(--font-mono); font-size: 10px; font-weight: 800;
    text-transform: uppercase; letter-spacing: 0.12em;
  }
  .divider::before, .divider::after { content: ''; flex: 1; height: 2.5px; background: var(--border); opacity: 0.13; border-radius: 999px; }
  .receive-row { display: flex; gap: 10px; }
  .input-wrap { position: relative; flex: 1; min-width: 0; display: flex; }
  .receive-row input {
    flex: 1; min-width: 0; width: 100%; background: var(--surface);
    border: 2.5px solid var(--border); border-radius: 12px; padding: 14px 16px;
    color: var(--text); font-family: var(--font-mono); font-size: 16px; font-weight: 700;
    letter-spacing: 0.15em; text-align: center; box-shadow: var(--shadow-xs);
    transition: border-color 0.13s, box-shadow 0.13s, transform 0.13s;
  }
  .receive-row input::placeholder { color: var(--text-faint); letter-spacing: 0.15em; }
  .input-wrap.focused input { outline: none; border-color: var(--accent); box-shadow: 3px 3px 0 var(--border), 0 0 0 4px rgba(129,140,248,0.25); transform: translate(-1px, -1px); }
  .input-wrap.error input { border-color: var(--danger); box-shadow: 3px 3px 0 var(--danger); }
  .input-glow {
    position: absolute; inset: -3px; border-radius: 14px;
    background: linear-gradient(90deg, var(--accent), var(--teal), var(--mustard));
    filter: blur(12px); opacity: 0; z-index: -1; transition: opacity 0.2s;
  }
  .input-wrap.focused .input-glow { opacity: 0.35; }
  .typing-caret { position: absolute; right: 14px; top: 50%; width: 2px; height: 16px; background: var(--accent); transform: translateY(-50%); animation: blink 1s steps(1) infinite; }
  .code-input.shake { animation: shake 0.4s ease; }
  @keyframes shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-7px); } 40% { transform: translateX(6px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(3px); } }
  .error { color: var(--danger); font-family: var(--font-mono); font-size: 12px; font-weight: 700; margin-top: 10px; text-align: center; }
  .hint { font-family: var(--font-mono); font-size: 11px; color: var(--text-faint); text-align: center; margin-top: 10px; }
  .hint-code { font-weight: 800; color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
  .hint-code:hover { color: var(--accent-hover); }

  .marquee {
    margin-top: 16px; overflow: hidden; white-space: nowrap;
    border: 2px solid var(--border); border-radius: 999px; background: var(--surface);
    padding: 6px 0; box-shadow: 2px 2px 0 var(--border);
  }
  .marquee-track { display: inline-flex; gap: 10px; align-items: center; padding-left: 12px; font-family: var(--font-mono); font-size: 10px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-dim); animation: marquee 16s linear infinite; }
  .marquee-track i { font-style: normal; color: var(--accent); }
  @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }

  .foot-note {
    display: flex; align-items: center; justify-content: center; gap: 7px;
    margin-top: 16px; margin-left: auto; margin-right: auto;
    font-family: var(--font-mono); font-size: 11px; font-weight: 700;
    letter-spacing: 0.06em; text-transform: uppercase; color: var(--on-tint);
    background: var(--mustard); border: 2px solid var(--border); border-radius: 999px;
    padding: 7px 12px; width: fit-content; box-shadow: 2px 2px 0 var(--border);
    transform: rotate(-0.4deg); transition: all 0.13s;
  }
  .foot-note:hover { transform: rotate(-0.4deg) translate(-1px, -1px) scale(1.03); box-shadow: 3px 3px 0 var(--border); }

  /* RIGHT preview */
  .hero-right {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 0;
    width: 100%;
    /* breathing room so the floating chips (positioned outside the
       preview frame) are never clipped by overflow or the viewport edge */
    padding: 20px 12px 22px;
    box-sizing: border-box;
  }
  .preview {
    position: relative; width: 100%; max-width: 432px; margin: 0 auto;
    background: #0f1226; border: 3px solid var(--border); border-radius: 18px;
    box-shadow: 7px 7px 0 var(--border); overflow: visible;
    transition: transform 0.12s ease-out;
    animation: float-y 5.5s ease-in-out infinite;
  }
  @keyframes float-y { 0%, 100% { translate: 0 0; } 50% { translate: 0 -7px; } }
  .preview-bar {
    display: flex; align-items: center; gap: 10px;
    background: var(--bg-card); border-bottom: 3px solid var(--border);
    padding: 10px 12px; border-radius: 15px 15px 0 0;
  }
  .dots { display: flex; gap: 5px; }
  .dots i { width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--border); display: block; }
  .dots i:nth-child(1) { background: #f2665c; } .dots i:nth-child(2) { background: #e6b800; } .dots i:nth-child(3) { background: #0eb07a; }
  .url {
    flex: 1; display: flex; align-items: center; gap: 6px; justify-content: center;
    font-family: var(--font-mono); font-size: 11px; color: var(--text-dim);
    background: var(--surface); border: 2px solid var(--border); border-radius: 999px; padding: 4px 10px;
    overflow: hidden; white-space: nowrap; min-width: 0;
    text-overflow: ellipsis;
  }
  .url b { color: var(--text); letter-spacing: 0.08em; }
  .live-mini {
    display: inline-flex; align-items: center; gap: 5px;
    font-family: var(--font-mono); font-size: 9px; font-weight: 800;
    background: #ffe1de; border: 2px solid var(--border); border-radius: 999px; padding: 3px 8px;
  }
  .screen {
    position: relative; height: 300px; overflow: hidden;
    background: linear-gradient(135deg, #1a1f4b 0%, #2b2f7a 45%, #5b5bd6 100%);
  }
  .screen-grid {
    position: absolute; inset: 0;
    background-image: linear-gradient(rgba(255,255,255,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.09) 1px, transparent 1px);
    background-size: 28px 28px;
    mask-image: radial-gradient(ellipse at center, black 40%, transparent 85%);
  }
  .fake-win {
    position: absolute; background: var(--surface);
    border: 2px solid var(--border); border-radius: 10px; padding: 10px;
    box-shadow: 3px 3px 0 rgba(0,0,0,0.35); width: 150px;
  }
  .w1 { left: 22px; top: 28px; transform: rotate(-2deg); animation: win-float 6s ease-in-out infinite; }
  .w2 { right: 24px; bottom: 62px; transform: rotate(1.5deg); animation: win-float 7s 0.6s ease-in-out infinite; }
  @keyframes win-float { 0%, 100% { translate: 0 0; } 50% { translate: 0 -6px; } }
  .fw-bar { display: block; height: 8px; border-radius: 4px; background: var(--accent); margin-bottom: 8px; }
  .fw-bar.coral { background: #f2665c; }
  .fw-line { display: block; height: 6px; border-radius: 3px; background: #dfe3f0; margin-bottom: 6px; }
  .fw-line.long { width: 100%; } .fw-line.short { width: 55%; }
  .beam {
    position: absolute; left: 12%; right: 12%; top: 46%; height: 2px;
    background: linear-gradient(90deg, transparent, #7cc4ff, #fff, #7cc4ff, transparent);
    box-shadow: 0 0 18px #7cc4ff;
    animation: beam 2.4s ease-in-out infinite;
  }
  @keyframes beam { 0%, 100% { opacity: 0.4; transform: scaleX(0.92); } 50% { opacity: 1; transform: scaleX(1); } }
  .pcursor { position: absolute; display: flex; align-items: center; gap: 5px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4)); }
  .pcursor span { font-family: var(--font-mono); font-size: 10px; font-weight: 800; background: var(--surface); color: var(--text); border: 2px solid var(--border); padding: 1px 7px; border-radius: 999px; }
  .p1 { animation: cur1 7s ease-in-out infinite; }
  .p2 { animation: cur2 9s ease-in-out infinite; }
  @keyframes cur1 { 0%, 100% { left: 18%; top: 58%; } 25% { left: 62%; top: 30%; } 50% { left: 58%; top: 66%; } 75% { left: 30%; top: 40%; } }
  @keyframes cur2 { 0%, 100% { right: 20%; bottom: 30%; } 50% { right: 52%; bottom: 58%; } }
  .scan {
    position: absolute; left: 0; right: 0; top: -30%; height: 30%;
    background: linear-gradient(180deg, transparent, rgba(124,196,255,0.35), transparent);
    animation: scan 3.8s linear infinite;
  }
  @keyframes scan { from { top: -30%; } to { top: 110%; } }
  .screen-hud { position: absolute; left: 12px; bottom: 10px; display: flex; gap: 8px; }
  .hud-chip {
    font-family: var(--font-mono); font-size: 10px; font-weight: 800;
    background: var(--overlay); border: 2px solid var(--border);
    border-radius: 999px; padding: 4px 10px; display: inline-flex; align-items: center; gap: 6px;
  }
  .hdot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
  .preview-foot {
    display: flex; align-items: center; gap: 10px;
    background: var(--bg-card); border-top: 3px solid var(--border);
    padding: 10px 12px; border-radius: 0 0 15px 15px;
  }
  .avatars { display: flex; }
  .av {
    width: 26px; height: 26px; border-radius: 50%; border: 2px solid var(--border);
    display: grid; place-items: center; color: #fff;
    font-family: var(--font-mono); font-size: 11px; font-weight: 800; margin-left: -8px;
  }
  .av:first-child { margin-left: 0; }
  .av.more { background: var(--surface); color: var(--text); font-size: 9px; }
  .foot-label { font-family: var(--font-mono); font-size: 10.5px; font-weight: 700; color: var(--text-muted); }
  .eq { margin-left: auto; display: flex; align-items: flex-end; gap: 3px; height: 16px; }
  .eq i { width: 4px; border-radius: 2px; background: var(--accent); animation: eq 0.9s ease-in-out infinite; }
  .eq i:nth-child(1) { height: 8px; } .eq i:nth-child(2) { height: 14px; animation-delay: 0.15s; }
  .eq i:nth-child(3) { height: 10px; animation-delay: 0.3s; } .eq i:nth-child(4) { height: 15px; animation-delay: 0.45s; }
  @keyframes eq { 0%, 100% { transform: scaleY(0.6); } 50% { transform: scaleY(1); } }

  .float-chip {
    position: absolute; display: inline-flex; align-items: center; gap: 6px;
    font-family: var(--font-mono); font-size: 10.5px; font-weight: 800;
    background: var(--surface); border: 2.5px solid var(--border); border-radius: 999px;
    padding: 7px 12px; box-shadow: 3px 3px 0 var(--border); white-space: nowrap;
    z-index: 3;
    /* never force the column wider than the viewport on tiny windows */
    max-width: calc(100% - 16px);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .fc-top { top: -14px; right: 6px; transform: rotate(2deg); animation: chip-float 4s ease-in-out infinite; }
  .fc-bottom { bottom: -14px; left: 6px; transform: rotate(-2deg); animation: chip-float 5s 0.5s ease-in-out infinite; }
  @keyframes chip-float { 0%, 100% { translate: 0 0; } 50% { translate: 0 -5px; } }
  .preview-hint { margin-top: 12px; font-family: var(--font-mono); font-size: 10px; font-weight: 700; letter-spacing: 0.06em; color: var(--text-faint); text-align: center; }

  :global(.burst-particle) {
    position: absolute; width: 8px; height: 8px; border-radius: 2px;
    pointer-events: none; z-index: 5;
    animation: burst 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    will-change: transform, opacity;
  }
  @keyframes burst {
    0% { transform: translate(0, 0) scale(1) rotate(0deg); opacity: 1; }
    100% { transform: translate(var(--bx), var(--by)) scale(0.2) rotate(220deg); opacity: 0; }
  }
  /* trail-dot removed: trail now renders in-canvas (zero DOM churn) */
  @media (max-width: 920px) {
    /* fewer animated layers on narrow windows */
    .blob-b, .blob-c { display: none; }
  }
  [data-theme='dark'] .blob {
    opacity: 0.6;
  }
  @media (prefers-reduced-motion: reduce) {
    .blob, .btn-shine, .preview, .pcursor, .fake-win, .beam, .scan, .marquee-track, .grad, .fc-top, .fc-bottom { animation: none !important; }
    .card { transform: none !important; }
    .glow, .net { display: none; }
  }
</style>
