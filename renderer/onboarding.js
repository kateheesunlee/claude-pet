// Claude Pet — Onboarding flow
// Simple step navigation + copy-to-clipboard + finish callback hook.

(function () {
  const steps = document.querySelectorAll('.step');
  const dots  = document.querySelectorAll('.progress .dot');
  const total = steps.length;
  let current = 0;

  function show(idx) {
    if (idx < 0 || idx >= total) return;
    steps[current].classList.remove('active');
    steps[idx].classList.add('active');

    dots.forEach((d, i) => {
      d.classList.toggle('active', i === idx);
      d.classList.toggle('done', i < idx);
    });

    current = idx;
  }

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.matches('[data-next]'))   show(current + 1);
    if (t.matches('[data-prev]'))   show(current - 1);
    if (t.matches('[data-skip]'))   finish();
    if (t.matches('[data-finish]')) finish();
  });

  // Allow clicking a dot to jump (only to already-seen steps)
  dots.forEach((d, i) => {
    d.addEventListener('click', () => {
      if (i <= current) show(i);
    });
  });

  // Keyboard nav (← →)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' && current < total - 1) show(current + 1);
    if (e.key === 'ArrowLeft'  && current > 0)         show(current - 1);
  });

  // ===== Hook installer wiring (step 2) =====
  const hookStatus    = document.getElementById('hookStatus');
  const installGlobal = document.getElementById('installGlobalBtn');
  const hooksApi      = window.claudePet?.hooks;

  function setStatus(state, icon, text) {
    if (!hookStatus) return;
    hookStatus.dataset.state = state;
    hookStatus.querySelector('.hook-status-icon').textContent = icon;
    hookStatus.querySelector('.hook-status-text').textContent = text;
  }

  async function refreshStatus() {
    if (!hooksApi) {
      setStatus('error', '❌', "Not running in Electron — use manual setup.");
      installGlobal && (installGlobal.disabled = true);
      return;
    }
    const r = await hooksApi.check('global');
    if (r.error) {
      setStatus('error', '⚠️', `Couldn't read settings: ${r.error}`);
    } else if (r.installed) {
      setStatus('installed', '✅', `Hooks installed — ${r.path}`);
      installGlobal.textContent = '✓ Already installed';
      installGlobal.disabled = true;
    } else {
      setStatus('missing', '⚠️', "Hooks aren't connected yet. Click the button below to set them up.");
      installGlobal.textContent = '✨ Auto-install';
      installGlobal.disabled = false;
    }
  }

  installGlobal?.addEventListener('click', async () => {
    if (!hooksApi) return;
    installGlobal.disabled = true;
    installGlobal.textContent = 'Installing…';
    const r = await hooksApi.install('global');
    if (r.ok) {
      setStatus('installed', '🎉', `Done! Added ${r.added} hooks — ${r.path}`);
      installGlobal.textContent = '✓ Installed';
    } else {
      setStatus('error', '❌', r.error || 'Unknown error');
      installGlobal.disabled = false;
      installGlobal.textContent = 'Try again';
    }
  });

  // Initial status check
  refreshStatus();

  // Copy snippet on step 2 (advanced section)
  const copyBtn = document.getElementById('copyBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const code = document.querySelector('.code-block code')?.innerText || '';
      try {
        await navigator.clipboard.writeText(code);
        copyBtn.textContent = '✓ Copied';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
          copyBtn.classList.remove('copied');
        }, 1600);
      } catch {
        copyBtn.textContent = 'Copy failed';
      }
    });
  }

  function finish() {
    // Hand off to the main app. If running inside Electron with a preload
    // that exposes window.claudePet.onboardingDone(), call that. Otherwise
    // just close/redirect — the renderer can decide.
    if (window.claudePet?.onboardingDone) {
      window.claudePet.onboardingDone();
    } else if (window.location.pathname.endsWith('onboarding.html')) {
      window.location.href = 'index.html';
    }
  }
})();
