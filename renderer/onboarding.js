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
      setStatus('error', '❌', 'Electron 환경이 아니에요 — 수동 설정을 사용하세요.');
      installGlobal && (installGlobal.disabled = true);
      return;
    }
    const r = await hooksApi.check('global');
    if (r.error) {
      setStatus('error', '⚠️', `설정 파일 읽기 실패: ${r.error}`);
    } else if (r.installed) {
      setStatus('installed', '✅', `훅이 설치되어 있어요 — ${r.path}`);
      installGlobal.textContent = '✓ 이미 설치됨';
      installGlobal.disabled = true;
    } else {
      setStatus('missing', '⚠️', '아직 훅이 연결되지 않았어요. 아래 버튼으로 설정하세요.');
      installGlobal.textContent = '✨ 자동 설정하기';
      installGlobal.disabled = false;
    }
  }

  installGlobal?.addEventListener('click', async () => {
    if (!hooksApi) return;
    installGlobal.disabled = true;
    installGlobal.textContent = '설정 중…';
    const r = await hooksApi.install('global');
    if (r.ok) {
      setStatus('installed', '🎉', `완료! ${r.added}개 훅 추가됨 — ${r.path}`);
      installGlobal.textContent = '✓ 설치됨';
    } else {
      setStatus('error', '❌', r.error || '알 수 없는 오류');
      installGlobal.disabled = false;
      installGlobal.textContent = '다시 시도';
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
        copyBtn.textContent = '✓ 복사됨';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.textContent = '복사';
          copyBtn.classList.remove('copied');
        }, 1600);
      } catch {
        copyBtn.textContent = '복사 실패';
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
