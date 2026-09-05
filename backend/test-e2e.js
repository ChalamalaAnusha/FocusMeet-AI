// End-to-end Automated Verification Script for FocusMeet AI
import { io } from 'socket.io-client';

const API_BASE = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';

async function runVerification() {
  console.log('====================================================');
  console.log('🧪 STARTING COMPREHENSIVE FOCUSMEET AI SYSTEM TESTS');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // ----------------------------------------------------
    // TEST 1: Health & Demo Seeding
    // ----------------------------------------------------
      console.log('👉 Test 1: Verifying Health...');
    const healthRes = await fetch(`${API_BASE}/health`).then((r) => r.json());
    assert(healthRes.status === 'healthy', 'Backend health check returns healthy');

      // Removed demo seeding endpoint

    // ----------------------------------------------------
    // TEST 2: User Authentication & JWT
    // ----------------------------------------------------
      console.log('\n👉 Test 2: Registering and authenticating real test users...');
      const testPrefix = `e2e_${Date.now()}`;
    const hostLogin = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: `${testPrefix}_host`,
          email: `${testPrefix}_host@test.local`,
          password: 'password123',
          displayName: 'E2E Host',
        }),
    }).then((r) => r.json());

    assert(!!hostLogin.token, 'Host registered and authenticated, token received');
    const hostToken = hostLogin.token;
    const hostId = hostLogin.user.id;

    const attendeeLogin = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: `${testPrefix}_student`,
        email: `${testPrefix}_student@test.local`,
        password: 'password123',
        displayName: 'E2E Student',
        studentId: `${testPrefix}_101`,
      }),
    }).then((r) => r.json());

    assert(!!attendeeLogin.token, 'Student registered and authenticated, token received');
    const attendeeToken = attendeeLogin.token;
    const attendeeId = attendeeLogin.user.id;

    // ----------------------------------------------------
    // TEST 3: User Directory Search
    // ----------------------------------------------------
    console.log('\n👉 Test 3: User Search for Zero-Link Direct Invites...');
    const searchRes = await fetch(`${API_BASE}/users/search?q=${encodeURIComponent(attendeeLogin.user.username)}`, {
      headers: { Authorization: `Bearer ${hostToken}` },
    }).then((r) => r.json());

     assert(
      searchRes.some((u) => u.username === attendeeLogin.user.username),
      `Host searched and located attendee @${attendeeLogin.user.username} in directory`
    );

    // ----------------------------------------------------
    // TEST 4: Zero-Link Meeting Creation
    // ----------------------------------------------------
    console.log('\n👉 Test 4: Creating Zero-Link Meeting (Direct Invites Only)...');
    const meetingRes = await fetch(`${API_BASE}/meetings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hostToken}`,
      },
      body: JSON.stringify({
        title: 'AI Product Strategy & Focus Architecture',
        description: 'Review of real-time attention detection and abuse moderation',
        invitedUserIds: [attendeeId],
        settings: {
          allowChat: true,
          aiFocusTracking: true,
          toxicityModeration: true,
        },
      }),
    }).then((r) => r.json());

    assert(!!meetingRes.meeting?._id, 'Meeting created without public link');
    assert(meetingRes.invitationsSent === 1, 'Direct invitation dispatched to invited attendee');
    const meetingId = meetingRes.meeting._id;

    // ----------------------------------------------------
    // TEST 5: Strict Access Control Barrier
    // ----------------------------------------------------
    console.log('\n👉 Test 5: Verifying Security Gatekeeper (Unauthorized User Access)...');
    // Register uninvited user
    const uninvitedUsername = `intruder_${Date.now()}`;
    const uninvitedUser = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: uninvitedUsername,
        email: `${uninvitedUsername}@test.com`,
        password: 'password123',
        displayName: 'Uninvited User',
      }),
    }).then((r) => r.json());

    const intruderToken = uninvitedUser.token;

    const uninvitedAccess = await fetch(`${API_BASE}/meetings/${meetingId}`, {
      headers: { Authorization: `Bearer ${intruderToken}` },
    });
    assert(
      uninvitedAccess.status === 403,
      'Uninvited user is strictly blocked (HTTP 403 Forbidden: Invitation-only meeting)'
    );

    const preAcceptAccess = await fetch(`${API_BASE}/meetings/${meetingId}`, {
      headers: { Authorization: `Bearer ${attendeeToken}` },
    });
    assert(preAcceptAccess.status === 403, 'Invited user must accept before access (HTTP 403 Forbidden)');

    const pendingInvitations = await fetch(`${API_BASE}/invitations/pending`, {
      headers: { Authorization: `Bearer ${attendeeToken}` },
    }).then((r) => r.json());
    const invitation = pendingInvitations.find((item) => item.meeting?._id === meetingId);
    const acceptedInvitation = await fetch(`${API_BASE}/invitations/${invitation._id}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${attendeeToken}` },
      body: JSON.stringify({ status: 'accepted' }),
    });
    assert(acceptedInvitation.status === 200, 'Student accepted the meeting invitation');

    const authorizedAccess = await fetch(`${API_BASE}/meetings/${meetingId}`, {
      headers: { Authorization: `Bearer ${attendeeToken}` },
    });
    assert(authorizedAccess.status === 200, 'Accepted student granted access (HTTP 200 OK)');

    // ----------------------------------------------------
    // TEST 6: Real-time WebSockets, Signaling & Room Joining
    // ----------------------------------------------------
    console.log('\n👉 Test 6: Connecting Real-time Sockets for Host and Attendee...');
    const hostSocket = io(SOCKET_URL, {
      auth: { token: hostToken },
      transports: ['websocket'],
    });

    const attendeeSocket = io(SOCKET_URL, {
      auth: { token: attendeeToken },
      transports: ['websocket'],
    });

    await new Promise((resolve) => {
      let connected = 0;
      const check = () => {
        connected++;
        if (connected === 2) resolve(true);
      };
      hostSocket.on('connect', check);
      attendeeSocket.on('connect', check);
    });
    assert(hostSocket.connected && attendeeSocket.connected, 'Both sockets authenticated and connected');

    // Host joins meeting
    hostSocket.emit('meeting:join', { meetingId, cameraBroadcast: true, micEnabled: true });

    // Attendee joins and waits for confirmation
    const attendeeJoinedPromise = new Promise((resolve) => {
      attendeeSocket.on('meeting:joined-success', (data) => resolve(data));
    });
    attendeeSocket.emit('meeting:join', { meetingId, cameraBroadcast: false, micEnabled: true });
    const joinData = await attendeeJoinedPromise;
    assert(joinData.meetingId === meetingId, 'Attendee successfully joined meeting room');

    // ----------------------------------------------------
    // TEST 7: Privacy Camera Mode Signaling
    // ----------------------------------------------------
    console.log('\n👉 Test 7: Testing Privacy Camera Mode Broadcast Toggle...');
    const cameraTogglePromise = new Promise((resolve) => {
      hostSocket.on('meeting:peer-camera-broadcast-changed', (evt) => {
        resolve(evt);
      });
    });

    attendeeSocket.emit('meeting:toggle-camera-broadcast', {
      meetingId,
      cameraBroadcast: true,
    });
    const cameraEvt = await cameraTogglePromise;
    assert(cameraEvt.cameraBroadcast === true, 'Host received Privacy Camera broadcast state update');

    // ----------------------------------------------------
    // TEST 8: AI Focus Telemetry & > 50% Distraction Alert
    // ----------------------------------------------------
    console.log('\n👉 Test 8: Testing AI Focus Telemetry & Distraction Alert Trigger...');
    let alertReceived = null;
    hostSocket.on('focus:distraction-alert', (alert) => {
      alertReceived = alert;
    });

    // Repeated low samples overcome the server smoothing and sustain the alert window.
    for (let sample = 0; sample < 8; sample += 1) {
      attendeeSocket.emit('focus:telemetry', {
        meetingId,
        score: 25,
        category: 'distracted',
        details: { faceDetected: true, headYaw: 45, headPitch: -30, gazeDirection: 'away' },
      });
      if (sample < 7) await new Promise((r) => setTimeout(r, 2000));
    }

    await new Promise((r) => setTimeout(r, 500));

    assert(
      alertReceived !== null && alertReceived.distractionRate >= 50,
      `Distraction alert received by Host: "${alertReceived?.message}" (Distraction Rate: ${alertReceived?.distractionRate}%)`
    );

    // ----------------------------------------------------
    // TEST 9: Real-time Chat Abuse Moderation
    // ----------------------------------------------------
    console.log('\n👉 Test 9: Testing Chat Toxicity Interceptor...');
    let blockedReceived = null;
    attendeeSocket.on('chat:blocked', (data) => {
      blockedReceived = data;
    });

    // Send prohibited abusive message
    attendeeSocket.emit('chat:send', {
      meetingId,
      message: 'You are so stupid and trash at this meeting!',
    });

    await new Promise((r) => setTimeout(r, 1000));
    assert(
      blockedReceived !== null,
      `Abusive chat intercepted and blocked: "${blockedReceived?.reason}"`
    );

    // Send clean chat message
    let cleanMessageReceived = null;
    hostSocket.on('chat:message', (msg) => {
      cleanMessageReceived = msg;
    });

    attendeeSocket.emit('chat:send', {
      meetingId,
      message: 'Great presentation on attention tracking!',
    });

    await new Promise((r) => setTimeout(r, 1000));
    assert(
      cleanMessageReceived !== null && cleanMessageReceived.message.includes('Great presentation'),
      'Clean professional chat delivered successfully to room'
    );

    // ----------------------------------------------------
    // TEST 10: Real-time Voice Speech-to-Text Abuse Moderation
    // ----------------------------------------------------
    console.log('\n👉 Test 10: Testing Voice Speech-to-Text Abuse Moderation...');
    let voiceWarningReceived = null;
    attendeeSocket.on('moderation:voice-warning', (data) => {
      voiceWarningReceived = data;
    });

    attendeeSocket.emit('voice:transcription', {
      meetingId,
      transcript: 'shut up and get out of here idiot',
    });

    await new Promise((r) => setTimeout(r, 1000));
    assert(
      voiceWarningReceived !== null,
      `Voice abuse detected via speech-to-text: "${voiceWarningReceived?.message}"`
    );

    // ----------------------------------------------------
    // TEST 11: Host Moderation Console Action
    // ----------------------------------------------------
    console.log('\n👉 Test 11: Host Moderation Actions (Mute & Warn)...');
    let hostActionReceived = null;
    attendeeSocket.on('moderation:host-action', (action) => {
      hostActionReceived = action;
    });

    await fetch(`${API_BASE}/moderation/action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hostToken}`,
      },
      body: JSON.stringify({
        meetingId,
        targetUserId: attendeeId,
        action: 'mute',
        reason: 'Repeated inappropriate language',
      }),
    });

    await new Promise((r) => setTimeout(r, 1000));
    assert(
      hostActionReceived !== null && hostActionReceived.action === 'mute',
      'Host remotely muted the abusive participant via moderation console'
    );

    // ----------------------------------------------------
    // TEST 12: Post-Meeting Analytics & Audit Trail
    // ----------------------------------------------------
    console.log('\n👉 Test 12: Verifying Post-Meeting Analytics & Incident Audit Log...');
    const analytics = await fetch(`${API_BASE}/meetings/${meetingId}/analytics`, {
      headers: { Authorization: `Bearer ${hostToken}` },
    }).then((r) => r.json());

    assert(typeof analytics.averageFocusScore === 'number', `Average Focus Score computed: ${analytics.averageFocusScore}%`);
    assert(analytics.distractionAlertsCount >= 1, `Distraction alerts logged: ${analytics.distractionAlertsCount}`);
    assert(analytics.moderationViolations && analytics.moderationViolations.length >= 1, `Moderation audit trail contains ${analytics.moderationViolations.length} recorded incidents`);

    // Disconnect sockets
    hostSocket.disconnect();
    attendeeSocket.disconnect();

    console.log('\n====================================================');
    console.log(`🏁 TESTS COMPLETED: ${passed} Passed, ${failed} Failed`);
    console.log('====================================================');

    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('Test execution error:', error);
    process.exit(1);
  }
}

runVerification();
