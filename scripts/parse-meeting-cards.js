// Google Meet Meeting Card Parser v2
// Targets the specific data attributes in meeting cards

(function parseMeetingCards() {
  console.log('=== Google Meet Card Parser v2 ===\n');

  // Find all meeting cards by data-call-id attribute
  const cards = document.querySelectorAll('[data-call-id]');

  if (cards.length === 0) {
    console.log('No meeting cards found.');
    console.log('Make sure you are on meet.google.com and signed in.');
    return [];
  }

  const meetings = [...cards].map((card, idx) => {
    const callId = card.getAttribute('data-call-id');
    const beginTime = parseInt(card.getAttribute('data-begin-time'), 10);
    const endTime = parseInt(card.getAttribute('data-end-time'), 10);
    const eventId = card.getAttribute('data-event-id');
    const ariaLabel = card.getAttribute('aria-label') || '';

    // Extract title from DOM
    const titleEl = card.querySelector('.mobgod');
    const title = titleEl?.textContent?.trim() || ariaLabel.split('。')[1]?.trim() || 'Unknown';

    // Extract display time
    const timeEl = card.querySelector('.AKhouc');
    const displayTime = timeEl?.textContent?.trim() || '';

    // Calculate time until meeting
    const now = Date.now();
    const startsIn = beginTime - now;
    const startsInMinutes = Math.round(startsIn / 60000);

    const meeting = {
      callId,
      url: `https://meet.google.com/${callId}`,
      title,
      displayTime,
      beginTime: new Date(beginTime),
      endTime: new Date(endTime),
      eventId,
      startsInMinutes,
      element: card
    };

    // Log meeting info
    const status = startsInMinutes < 0
      ? `🔴 Started ${-startsInMinutes} min ago`
      : startsInMinutes < 5
        ? `🟢 Starting in ${startsInMinutes} min`
        : `⏳ In ${startsInMinutes} min`;

    console.log(`Meeting ${idx + 1}: ${title}`);
    console.log(`  Time: ${displayTime} (${meeting.beginTime.toLocaleTimeString()})`);
    console.log(`  URL: ${meeting.url}`);
    console.log(`  Status: ${status}`);
    console.log('');

    return meeting;
  });

  // Sort by start time
  meetings.sort((a, b) => a.beginTime - b.beginTime);

  // Helper functions
  window.getMeetings = () => meetings;

  window.joinMeeting = (index = 0) => {
    const m = meetings[index];
    if (m) {
      console.log(`Opening: ${m.title}`);
      window.open(m.url, '_blank');
    }
  };

  window.getNextMeeting = () => {
    const now = Date.now();
    return meetings.find(m => m.beginTime.getTime() > now - 5 * 60000);
  };

  console.log('=== Summary ===');
  console.log(`Found ${meetings.length} meeting(s)`);
  console.log('');
  console.log('💡 Commands:');
  console.log('  getMeetings()     - Get all meetings');
  console.log('  joinMeeting(0)    - Open first meeting in new tab');
  console.log('  getNextMeeting()  - Get the next upcoming meeting');

  return meetings;
})();
