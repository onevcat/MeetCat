// Google Meet Auto Join v2
// Monitors meetings and auto-joins at the right time

(function autoJoinSetup() {
  const config = {
    // Join X minutes before meeting starts (negative = after start)
    joinBeforeMinutes: 1,
    // Only auto-join meetings matching this title (null = any)
    titleFilter: null,
    // Check interval in seconds
    checkInterval: 30,
    // Open in new tab vs current tab
    openInNewTab: true,
    // Media settings for meeting page
    micEnabled: false,
    cameraEnabled: false,
    // Auto click join button on meeting page
    autoClickJoin: true
  };

  let intervalId = null;
  let joinedMeetings = new Set();

  function getMeetings() {
    const cards = document.querySelectorAll('[data-call-id]');
    return [...cards].map(card => ({
      callId: card.getAttribute('data-call-id'),
      url: `https://meet.google.com/${card.getAttribute('data-call-id')}`,
      title: card.querySelector('.mobgod')?.textContent?.trim() || '',
      beginTime: parseInt(card.getAttribute('data-begin-time'), 10),
      endTime: parseInt(card.getAttribute('data-end-time'), 10)
    }));
  }

  function checkAndJoin() {
    const meetings = getMeetings();
    const now = Date.now();
    const joinThreshold = config.joinBeforeMinutes * 60 * 1000;

    for (const m of meetings) {
      // Skip if already joined
      if (joinedMeetings.has(m.callId)) continue;

      // Skip if doesn't match filter
      if (config.titleFilter && !m.title.includes(config.titleFilter)) continue;

      // Check if it's time to join
      const timeUntilStart = m.beginTime - now;
      const shouldJoin = timeUntilStart <= joinThreshold && timeUntilStart > -30 * 60 * 1000;

      if (shouldJoin) {
        console.log(`🚀 Auto-joining: ${m.title}`);
        console.log(`   URL: ${m.url}`);
        joinedMeetings.add(m.callId);

        // Save config for meeting page script to read
        localStorage.setItem('autoMeet_config', JSON.stringify({
          micEnabled: config.micEnabled,
          cameraEnabled: config.cameraEnabled,
          autoClickJoin: config.autoClickJoin,
          timestamp: Date.now()
        }));

        if (config.openInNewTab) {
          window.open(m.url, '_blank');
        } else {
          window.location.href = m.url;
        }
        return; // Join one at a time
      }
    }

    // Log next meeting
    const upcoming = meetings
      .filter(m => m.beginTime > now && !joinedMeetings.has(m.callId))
      .sort((a, b) => a.beginTime - b.beginTime)[0];

    if (upcoming) {
      const mins = Math.round((upcoming.beginTime - now) / 60000);
      console.log(`⏳ Next: "${upcoming.title}" in ${mins} min`);
    }
  }

  // Control functions
  window.autoJoin = {
    start: () => {
      if (intervalId) {
        console.log('Already running');
        return;
      }
      console.log('🟢 Auto-join started');
      console.log(`   Will join ${config.joinBeforeMinutes} min before meeting`);
      checkAndJoin();
      intervalId = setInterval(checkAndJoin, config.checkInterval * 1000);
    },

    stop: () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        console.log('🔴 Auto-join stopped');
      }
    },

    config: (newConfig) => {
      Object.assign(config, newConfig);
      console.log('Config updated:', config);
    },

    status: () => {
      console.log('Running:', !!intervalId);
      console.log('Joined meetings:', [...joinedMeetings]);
      console.log('Config:', config);
    },

    reset: () => {
      joinedMeetings.clear();
      console.log('Joined history cleared');
    }
  };

  console.log('=== Auto Join v2 Ready ===');
  console.log('');
  console.log('Commands:');
  console.log('  autoJoin.start()              - Start monitoring');
  console.log('  autoJoin.stop()               - Stop monitoring');
  console.log('  autoJoin.config({...})        - Update config');
  console.log('  autoJoin.status()             - Show status');
  console.log('');
  console.log('Config options:');
  console.log('  joinBeforeMinutes: 1          - Join 1 min before');
  console.log('  titleFilter: "LAD"            - Only join meetings with "LAD"');
  console.log('  checkInterval: 30             - Check every 30 sec');

  return window.autoJoin;
})();
