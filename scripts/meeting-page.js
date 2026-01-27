// Google Meet - Meeting Page Controller
// Run this on meet.google.com/xxx-xxxx-xxx (pre-join page)

(function meetingPageController() {
  const config = {
    micEnabled: false,    // true = on, false = off (muted)
    cameraEnabled: false, // true = on, false = off
    autoJoin: false,      // automatically click join button
    joinDelay: 1000       // delay before clicking join (ms)
  };

  console.log('=== Meeting Page Controller ===\n');

  // Detect if we're on a meeting page
  const meetingCodeMatch = window.location.pathname.match(/^\/([a-z]{3}-[a-z]{4}-[a-z]{3})$/);
  if (!meetingCodeMatch) {
    console.log('Not on a meeting page. Expected URL: meet.google.com/xxx-xxxx-xxx');
    return null;
  }
  console.log(`Meeting code: ${meetingCodeMatch[1]}`);

  // ========== Mic/Camera Control ==========
  // Based on: https://github.com/burkybang/Google-Meet-Auto-Disable-Mic-Cam

  // Find mic/camera toggle buttons using data-is-muted attribute
  function findMediaButtons() {
    const buttons = document.querySelectorAll('[role="button"][data-is-muted]');
    // index 0 = mic, index 1 = camera
    return {
      micBtn: buttons[0] || null,
      camBtn: buttons[1] || null
    };
  }

  // Check if button is muted/off
  function isMuted(btn) {
    if (!btn) return null;
    return btn.dataset.isMuted === 'true';
  }

  function setMic(enabled) {
    const { micBtn } = findMediaButtons();
    if (!micBtn) {
      console.log('Mic button not found');
      return false;
    }

    const currentlyMuted = isMuted(micBtn);
    console.log(`Mic: currently ${currentlyMuted ? 'OFF' : 'ON'}, want ${enabled ? 'ON' : 'OFF'}`);

    // If we want it OFF (muted) and it's not muted, click to mute
    // If we want it ON and it's muted, click to unmute
    if ((!enabled && !currentlyMuted) || (enabled && currentlyMuted)) {
      console.log('Clicking mic button to toggle');
      micBtn.click();
    } else {
      console.log('Mic already in desired state');
    }

    return true;
  }

  function setCamera(enabled) {
    const { camBtn } = findMediaButtons();
    if (!camBtn) {
      console.log('Camera button not found');
      return false;
    }

    const currentlyOff = isMuted(camBtn);
    console.log(`Camera: currently ${currentlyOff ? 'OFF' : 'ON'}, want ${enabled ? 'ON' : 'OFF'}`);

    if ((!enabled && !currentlyOff) || (enabled && currentlyOff)) {
      console.log('Clicking camera button to toggle');
      camBtn.click();
    } else {
      console.log('Camera already in desired state');
    }

    return true;
  }

  // ========== Join Button ==========

  function findJoinButton() {
    // Join button text patterns (multi-language)
    const joinPatterns = [
      // Chinese
      '立即加入',
      '仍要加入',
      '加入会议',
      '请求加入',
      // English
      'Join now',
      'Join anyway',
      'Ask to join',
      // Japanese
      '今すぐ参加',
      '参加をリクエスト',
      '参加'
    ];

    const buttons = document.querySelectorAll('button');

    for (const btn of buttons) {
      const text = btn.textContent?.trim() || '';

      for (const pattern of joinPatterns) {
        if (text.includes(pattern)) {
          console.log(`  Found join button by text: "${pattern}"`);
          return btn;
        }
      }
    }

    console.log('  Join button not found');
    return null;
  }

  function clickJoin() {
    const joinBtn = findJoinButton();
    if (!joinBtn) {
      console.log('Join button not found');
      return false;
    }

    console.log('Clicking join button...');
    joinBtn.click();

    // Also dispatch a proper mouse event
    joinBtn.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window
    }));

    return true;
  }

  // ========== Auto Setup ==========

  function applySettings() {
    console.log('\nApplying settings...');
    setMic(config.micEnabled);
    setCamera(config.cameraEnabled);

    if (config.autoJoin) {
      console.log(`Will click join in ${config.joinDelay}ms`);
      setTimeout(clickJoin, config.joinDelay);
    }
  }

  // Wait for page to load before applying
  function waitAndApply() {
    // Check if media buttons exist
    const { micBtn, camBtn } = findMediaButtons();
    if (micBtn && camBtn) {
      applySettings();
    } else {
      console.log('Waiting for media buttons to load...');
      setTimeout(waitAndApply, 500);
    }
  }

  // ========== Exports ==========

  window.meetPage = {
    config: (newConfig) => {
      Object.assign(config, newConfig);
      console.log('Config updated:', config);
    },

    setMic,
    setCamera,

    join: clickJoin,

    apply: applySettings,

    auto: () => {
      config.autoJoin = true;
      waitAndApply();
    },

    status: () => {
      const { micBtn, camBtn } = findMediaButtons();
      const joinBtn = findJoinButton();
      console.log('Mic button:', micBtn ? 'found' : 'not found');
      console.log('Camera button:', camBtn ? 'found' : 'not found');
      console.log('Join button:', joinBtn ? 'found' : 'not found');
      console.log('Mic muted:', isMuted(micBtn));
      console.log('Camera off:', isMuted(camBtn));
    }
  };

  // ========== Auto-load config from localStorage ==========

  function loadSavedConfig() {
    try {
      const saved = localStorage.getItem('autoMeet_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Only use config if it's recent (within 5 minutes)
        if (Date.now() - parsed.timestamp < 5 * 60 * 1000) {
          console.log('📥 Loaded config from auto-join:', parsed);
          config.micEnabled = parsed.micEnabled ?? config.micEnabled;
          config.cameraEnabled = parsed.cameraEnabled ?? config.cameraEnabled;
          config.autoJoin = parsed.autoClickJoin ?? config.autoJoin;
          // Clear after reading
          localStorage.removeItem('autoMeet_config');
          return true;
        }
      }
    } catch (e) {
      console.log('No saved config found');
    }
    return false;
  }

  const hasAutoConfig = loadSavedConfig();

  console.log('Commands:');
  console.log('  meetPage.status()                    - Show button status');
  console.log('  meetPage.config({micEnabled: false}) - Configure settings');
  console.log('  meetPage.setMic(false)               - Mute mic');
  console.log('  meetPage.setCamera(false)            - Turn off camera');
  console.log('  meetPage.join()                      - Click join button');
  console.log('  meetPage.auto()                      - Apply all & join');
  console.log('');
  console.log('Current config:', config);

  // Auto-apply if launched from auto-join script
  if (hasAutoConfig && config.autoJoin) {
    console.log('\n🤖 Auto-mode activated from launcher');
    waitAndApply();
  }

  return window.meetPage;
})();
