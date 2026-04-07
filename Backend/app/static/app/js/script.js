  // ── CONFIG ──────────────────────────────────────────────
  // Base URL of the Django backend server (leave empty if served from the same origin)
  const DJANGO_BASE   = '/api/';            // e.g. 'http://localhost:8000'
  // API endpoint for sending raw robot commands
  const API_COMMAND   = 'command/';
  // API endpoint for quick action shortcuts (movement + face)
  const API_QUICK     = 'quick/';
  // API endpoint for fetching the current robot status (IP, face, command, MQTT)
  const API_STATUS    = 'status/';
  // API endpoint for sending text chat messages to the robot
  const API_TEXT      = 'chat/';
  const API_SETTINGS  = 'settings/'
 
  // ── STATE ───────────────────────────────────────────────
  let isRecording   = false;  // Whether the microphone is currently recording audio
  let isSending     = false;  // Whether a network request is in progress (prevents duplicate sends)
  let isTextRequestMode = true;

  let wakeWordEnabled    = false;   // Controlled by the toggle
  let wakeRecognition    = null;    // Dedicated always-on SpeechRecognition for wake word
  let isWakeListening    = false;   // Whether wake listener is currently running
  

  // let mediaRecorder = null;   // MediaRecorder instance used for audio capture
  // let audioChunks   = [];     // Collected audio data chunks during recording

  let recognition   = null; 
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
 
  // Full list of supported robot movement/body commands
  const MOVE_COMMANDS = [
    "stand", "rest", "forward", "backward", "left", "right", 
    "wave", "dance", "swim", "point", "pushup", "bow", "cute", 
    "freaky", "worm", "shake", "shrug", "dead", "crab", "fight", 
    "punch", "kick", "dizzy", "fall", "glitch"
  ];
 
  // Full list of supported robot face/emotion expressions
  const FACE_COMMANDS = [
    'idle', 'idle_blink', 'walk', 'rest', 
    'dance', 'wave', 'happy', 'talk_happy',
    'sad', 'talk_sad', 'angry', 'talk_angry',
    'surprised', 'talk_surprised', 'sleepy',
    'talk_sleepy', 'love', 'talk_love', 'excited',
    'talk_excited', 'confused', 'talk_confused', 
    'thinking', 'talk_thinking', 'dead', 'point', 'shrug'
  ];
 
  // ── INIT ────────────────────────────────────────────────
  // Run setup tasks once the DOM is fully loaded:
  // populate the command list panel, log a ready message, and fetch current robot status
  document.addEventListener('DOMContentLoaded', () => {
    renderCmdList();
    logSystem('OK', 'Backend initialized');
    refreshStatus();
  });
 
  /**
   * Renders the Available Commands panel in the right sidebar.
   * Each movement command is displayed as a clickable pill that triggers
   * a quick action with a default 'happy' face expression.
   */
  function renderCmdList() {
    const el = document.getElementById('cmd-list');
    el.innerHTML = MOVE_COMMANDS.map(c =>
      `<span class="cmd-pill" onclick="quickAction('${c}','happy')" title="Send ${c}">${c},</span>`
    ).join(' ');
  }
 
  // ── SYSTEM LOG ──────────────────────────────────────────
  /**
   * Appends a timestamped system message to the conversation panel.
   * @param {string} type - Message severity: 'OK', 'ERR', or 'WARN'
   * @param {string} text - The message content (supports HTML for bold highlights)
   */
  function logSystem(type, text) {
    const conv = document.getElementById('conversation');
    const ts   = new Date().toTimeString().split(' ')[0];
    const div  = document.createElement('div');
    div.className = 'msg system';
    const cls = type === 'OK' ? 'ok' : type === 'ERR' ? 'err' : 'warn';
    div.innerHTML = `<div class="msg-bubble">[${ts}] [<span class="${cls}">${type}</span>] ${text}</div>`;
    conv.appendChild(div);
    conv.scrollTop = conv.scrollHeight;
  }
 
  /**
   * Appends a user message bubble to the conversation panel.
   * The text is HTML-escaped before rendering to prevent XSS.
   * @param {string} text - The user's message text
   */
  function addUserMsg(text) {
    const conv = document.getElementById('conversation');
    const div  = document.createElement('div');
    div.className = 'msg user';
    div.innerHTML = `<div class="msg-bubble">${escHtml(text)}</div>`;
    conv.appendChild(div);
    conv.scrollTop = conv.scrollHeight;
  }
 
  /**
   * Appends a robot response bubble to the conversation panel.
   * Optionally shows command and face expression tags below the message
   * if the robot response includes them.
   * @param {string} response - The robot's text response
   * @param {string|null} command - The movement command the robot executed (e.g. 'wave')
   * @param {string|null} face    - The face expression the robot used (e.g. 'happy')
   */
  function addRobotMsg(response, command, face) {
    const conv = document.getElementById('conversation');
    const div  = document.createElement('div');
    div.className = 'msg robot';
    const tags = [
      command ? `<span class="msg-cmd">${command}</span>` : '',
      face    ? `<span class="msg-face">${face}</span>`   : '',
    ].filter(Boolean).join('');
    div.innerHTML = `
      <div class="msg-bubble">${escHtml(response)}</div>
      ${tags ? `<div class="msg-meta">${tags}</div>` : ''}
    `;
    conv.appendChild(div);
    conv.scrollTop = conv.scrollHeight;
  }
 
  /**
   * Escapes special HTML characters in a string to prevent XSS injection
   * when inserting user-supplied text into innerHTML.
   * @param {string} t - Raw input string
   * @returns {string} - HTML-safe string
   */
  function escHtml(t) {
    return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
 
  // ── QUICK ACTIONS ───────────────────────────────────────
  /**
   * Triggers a predefined quick action on the robot (e.g. wave, dance, rest).
   * Updates the UI immediately (button highlight, robot info panel, last-command flash, system log),
   * then POSTs the movement and face values to the quick action API endpoint.
   * @param {string} movement - The movement command to send (e.g. 'wave', 'dance')
   * @param {string} face     - The face expression to pair with the movement (e.g. 'happy')
   */
  async function quickAction(movement, face) {
    highlightBtn(movement);
    updateRobotInfo(null, face, movement);
    flashLastCmd(movement, face);
    logSystem('OK', `Quick action → <b>${movement}</b>, face: <b>${face}</b>`);
 
    try {
      const res = await fetch(DJANGO_BASE + API_QUICK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',
                   'X-CSRFToken': getCookie('csrftoken') },
        body: JSON.stringify({ movement, face })
      });
      if (!res.ok) logSystem('ERR', `Quick action failed: ${res.status}`);
    } catch(e) {
      logSystem('ERR', `Network error: ${e.message}`);
    }
  }
 
  /**
   * Briefly highlights the sidebar action button matching the given movement.
   * Matches by button text or its onclick attribute, adds 'active' class,
   * then automatically removes it after 1.2 seconds.
   * @param {string} movement - The movement name to match against sidebar buttons
   */
  function highlightBtn(movement) {
    document.querySelectorAll('.action-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.action-btn').forEach(b => {
      if (b.textContent.trim().toLowerCase() === movement ||
          b.getAttribute('onclick')?.includes(`'${movement}'`)) {
        b.classList.add('active');
        setTimeout(() => b.classList.remove('active'), 1200);
      }
    });
  }
 
  // ── TEXT SEND ───────────────────────────────────────────
  /**
   * Reads the text input field and sends the message to the robot's chat API.
   * - Clears the input and shows the user bubble immediately for responsiveness.
   * - Displays a typing indicator while waiting for the backend response.
   * - On success, renders the robot's reply with optional command/face metadata.
   * - Guards against duplicate sends with the `isSending` flag.
   */ 
  async function sendText() {
    const input = document.getElementById('text-input');
    const text  = input.value.trim();
    if (!text || isSending) return;
 
    input.value = '';
    addUserMsg(text);
    setTyping(true);
    setSending(true);
    isTextRequestMode = true;
 
    try {
      const res = await fetch(DJANGO_BASE + API_TEXT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',
                   'X-CSRFToken': getCookie('csrftoken') },
        body: JSON.stringify({ message: text, TextMode: isTextRequestMode})
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const data = await res.json();
      setTyping(false);
 
      addRobotMsg(
        data.response  || '...',
        data.command   || null,
        data.face      || null
      );
 
      if (data.command || data.face) {
        updateRobotInfo(null, data.face, data.command);
        flashLastCmd(data.command || '', data.face || '');
      }
    } catch(e) {
      setTyping(false);
      logSystem('ERR', `Chat error: ${e.message}`);
      input.value = text;
      input.focus();
    } finally {
      isTextRequestMode = false;
      setSending(false);
    }
  }
 
  // ── MIC ─────────────────────────────────────────────────
  /**
   * Toggles the microphone on or off.
   * If voice mode is disabled, warns the user and does nothing.
   * If currently recording, stops and submits the audio.
   * If idle, starts a new recording session.
   */
  async function toggleMic() {
 
    if (isRecording) {
      stopRecording();
    } else {
      await startRecording();
    }
  }
 
  /**
   * Requests microphone access and begins recording audio via MediaRecorder.
   * - Collects audio data in `audioChunks` as it arrives.
   * - On stop, automatically calls `sendAudio()` to process the recording.
   * - Updates the UI to show the recording state (button label, input highlight).
   */
  async function startRecording() {
    if (!SpeechRecognition) {
      logSystem('ERR', 'Web Speech API is not supported in this browser.');
      return;
    }

    if (wakeWordEnabled && isWakeListening) pauseWakeWord();

    try {
      recognition = new SpeechRecognition();
      recognition.lang = 'en-US';

      recognition.interimResults = false; // Only returns the final, stable transcript.
      recognition.continuous = false;    // Stops automatically after the speaker finishes a sentence.
 
      recognition.onstart = () => {
      isRecording = true;
      document.getElementById('mic-btn').classList.add('recording');
      document.getElementById('mic-btn').textContent = '■ STOP';
      document.getElementById('text-input').disabled = true;
      document.getElementById('text-input').classList.add('listening');
      document.getElementById('text-input').placeholder = 'Listening for a full sentence...';
      document.getElementById('send-btn').disabled = true;
      logSystem('OK', 'Microphone active - Speak your sentence.');
    };
    recognition.onresult = (event) => {
      // This triggers ONLY when the browser is confident the sentence is complete.
      const transcript = event.results[0][0].transcript;
      sendAudio(transcript);
    };
    recognition.onerror = (event) => {
      logSystem('ERR', `Speech error: ${event.error}`);
      stopRecording();
    };

    recognition.onend = () => {
      // Auto-cleanup after the sentence is captured and continuous mode ends.
      stopRecording();
      if (wakeWordEnabled) resumeWakeWord();
    };

    recognition.start();
    } catch(e) {
      logSystem('ERR', `Mic error: ${e.message}`);
      if (wakeWordEnabled) resumeWakeWord();
    }
  }
 
  /**
   * Stops an active recording session and releases the microphone track.
   * Resets the mic button label and input field placeholder back to default state.
   */
  function stopRecording() {
    if (recognition) {
    recognition.stop();
    }
    isRecording = false;
    document.getElementById('mic-btn').classList.remove('recording');
    document.getElementById('mic-btn').textContent = 'MIC';
    document.getElementById('text-input').classList.remove('listening');
    document.getElementById('text-input').placeholder = 'Type a message or command...';
    document.getElementById('text-input').disabled  = false;
    document.getElementById('send-btn').disabled = false;
  }
 
/**
  This function take transcript and send to API_TEXT for response ..  
 **/


  async function sendAudio(text) {
    if (!text || isSending) return;
    
    addUserMsg(`🎙 ${text}`);
    isTextRequestMode = false;
    setTyping(true);
    setSending(true);
    logSystem('OK', 'Processing voice...');
 
    try {
      const res  = await fetch(DJANGO_BASE + API_TEXT, {
        method: 'POST',
        headers: { 'X-CSRFToken': getCookie('csrftoken') },
        body: JSON.stringify({ message: text, TextMode: isTextRequestMode})
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const data = await res.json();
      setTyping(false);
 
      
      addRobotMsg(data.response || '...', data.command, data.face);
 
      if (data.command || data.face) {
        updateRobotInfo(null, data.face, data.command);
        flashLastCmd(data.command || '', data.face || '');
      }
    } catch(e) {
      setTyping(false);
      logSystem('ERR', `Voice error: ${e.message}`);
    } finally {
      isTextRequestMode = true;
      setSending(false);
    }
  }


  // ── WAKE WORD ────────────────────────────────────────────
  /**
   * Starts an always-on, continuous SpeechRecognition instance that listens for
   * the wake word "hey pepper". Once detected, it automatically opens the mic for
   * the user's next utterance (the actual command/conversation input).
   *
   * Architecture:
   *  - wakeRecognition  → continuous, low-priority listener, only checks for wake word
   *  - After wake word detected → pause wakeRecognition, call startRecording() for real input
   *  - After real input finishes → resume wakeRecognition (handled in startRecording onend)
   */

    function startWakeWordListener() {
    if (!SpeechRecognition) {
      logSystem('WARN', 'Wake word not available: Web Speech API unsupported.');
      return;
    }
 
    if (isWakeListening) return; // already running
 
    wakeRecognition = new SpeechRecognition();
    wakeRecognition.lang           = 'en-US';
    wakeRecognition.continuous     = true;   // Keep listening indefinitely
    wakeRecognition.interimResults = true;   // Check partial results for wake word
 
    wakeRecognition.onresult = (event) => {
      // Scan every result (interim + final) for the wake word
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript.trim().toLowerCase();
        if (transcript.includes(WAKE_WORD)) {
          logSystem('OK', `🎙 Wake word detected: "<b>${WAKE_WORD}</b>" — listening...`);
          pauseWakeWord();         // Stop background listener
          startRecording();        // Open mic for user's real message
          break;
        }
      }
    };
 
    wakeRecognition.onerror = (event) => {
      // 'no-speech' and 'aborted' are normal; only log actual errors
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        logSystem('WARN', `Wake word listener error: ${event.error}`);
      }
      isWakeListening = false;
      // Auto-restart unless disabled
      if (wakeWordEnabled) {
        setTimeout(resumeWakeWord, 500);
      }
    };
 
    wakeRecognition.onend = () => {
      isWakeListening = false;
      // Chrome stops continuous recognition after ~60s silence; restart automatically
      if (wakeWordEnabled && !isRecording) {
        setTimeout(resumeWakeWord, 300);
      }
    };
 
    try {
      wakeRecognition.start();
      isWakeListening = true;
    } catch(e) {
      logSystem('WARN', `Wake word start error: ${e.message}`);
    }
  }



    /** Pause wake word listener (e.g. while manual mic is active). */
  function pauseWakeWord() {
    if (wakeRecognition && isWakeListening) {
      try { wakeRecognition.abort(); } catch(_) {}
      isWakeListening = false;
    }
  }
 
  /** Resume wake word listener after pause. */
  function resumeWakeWord() {
    if (!wakeWordEnabled || isRecording) return;
    startWakeWordListener();
  }
 
  /** Stop and tear down the wake word listener permanently. */
  function stopWakeWordListener() {
    wakeWordEnabled = false;
    if (wakeRecognition) {
      try { wakeRecognition.abort(); } catch(_) {}
      wakeRecognition = null;
    }
    isWakeListening = false;
  }

  

    // ── SETTINGS ─────────────────────────────────────────────
  /**
   * Toggle handler for the "Wake Word (hey Pepper)" switch.
   * Enables/disables the always-on background wake word listener.
   */
  function toggleWakeWord(cb) {
    wakeWordEnabled = cb.checked;
    logSystem('OK', `Wake word ${cb.checked ? '<b>enabled</b> — say "hey pepper"' : 'disabled'}`);
 
    if (wakeWordEnabled) {
      startWakeWordListener();
    } else {
      stopWakeWordListener();
    }
 
    // Persist preference to backend
    fetch(DJANGO_BASE + API_SETTINGS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
      body: JSON.stringify({ wake_word: cb.checked })
    }).catch(() => {});
  }



    // ── TTS (Text-to-Speech) ─────────────────────────────────
  /**
   * Speak the robot's response aloud using the Web Speech Synthesis API.
   * Only fires during voice mode (isTextRequestMode = false).
   */
  function speakResponse(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel(); // Cancel any ongoing speech
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate   = 1.1;
    utter.pitch  = 1.3;  // Slightly higher pitch for robot character
    utter.volume = 1.0;
    window.speechSynthesis.speak(utter);
  }
 
  // ── STATUS ───────────────────────────────────────────────
  /**
   * Fetches the latest robot status from the backend API and updates the UI.
   * Populates the IP, face, and command fields in the Robot Info panel,
   * and reflects the MQTT broker connection state in the header badge.
   * 
   * response that content {ip, face, command, mqtt_connection_status}
   * 
   */
  async function refreshStatus() {
    try {
      const res  = await fetch(DJANGO_BASE + API_STATUS);
      const data = await res.json();
      updateRobotInfo(data.ip, data.face, data.command);
      setConnected(data.mqtt_connected);
      document.getElementById('mqtt-status-text').textContent =
        data.mqtt_connected ? 'online' : 'offline';
      logSystem('OK', 'Status refreshed');
    } catch(e) {
      logSystem('ERR', `Status fetch failed: ${e.message}`);
      setConnected(false);
    }
  }
 
  /**
   * Logs a check message and delegates to refreshStatus() to verify
   * whether the MQTT broker is reachable and connected.
   */
  async function checkMQTT() {
    logSystem('OK', 'Checking MQTT broker...');
    await refreshStatus();
  }
 
  /**
   * Updates the Robot Info panel with the latest values from the backend.
   * Only updates fields whose values are provided (non-null/undefined).
   * The IP field gets a 'highlight' class to visually stand out when set.
   * @param {string|null} ip   - Robot's IP address
   * @param {string|null} face - Current face expression
   * @param {string|null} cmd  - Last executed movement command
   */
  function updateRobotInfo(ip, face, cmd) {
    if (ip)  { document.getElementById('robot-ip').textContent   = ip;   document.getElementById('robot-ip').className = 'info-val highlight'; }
    if (face){ document.getElementById('robot-face').textContent = face; document.getElementById('robot-face').className = 'info-val'; }
    if (cmd) { document.getElementById('robot-cmd').textContent  = cmd;  document.getElementById('robot-cmd').className  = 'info-val'; }
  }
 
  /**
   * Updates the connection status badge in the header.
   * Shows a green glowing dot and "[+] Connected" when connected,
   * or a red dot and "[-] Disconnected" when not.
   * @param {boolean} connected - Whether the MQTT broker is currently connected
   */
  function setConnected(connected) {
    const dot   = document.getElementById('conn-dot');
    const label = document.getElementById('conn-label');

    if (dot) {
      if (connected) {
      dot.classList.add('connected');
      label.textContent = '[+] Connected';
      label.className = 'status-label connected';
    } else {
      dot.classList.remove('connected');
      label.textContent = '[-] Disconnected';
      label.className = 'status-label disconnected';
    }
    }
  }
 
  /**
   * Updates the "Last Command" display box with the most recently sent command payload.
   * Triggers a brief orange flash animation to draw attention to the new value.
   * @param {string} movement - The movement component of the sent command
   * @param {string} face     - The face expression component of the sent command
   */
  function flashLastCmd(movement, face) {
    const el = document.getElementById('last-cmd');
    el.innerHTML = `<span class="cmd-topic">Pepper8697803647/control8697803647  →  </span><span class="cmd-sent">"${movement},${face}"</span>`;
    el.classList.remove('flash');
    void el.offsetWidth; // Force reflow to restart the CSS animation
    el.classList.add('flash');
  }
 
  // ── UI HELPERS ──────────────────────────────────────────
  /**
   * Shows or hides the animated typing indicator below the conversation.
   * Also scrolls the conversation to the bottom so the indicator is always visible.
   * @param {boolean} show - True to show the indicator, false to hide it
   */
  function setTyping(show) {
    document.getElementById('typing').classList.toggle('visible', show);
    const conv = document.getElementById('conversation');
    conv.scrollTop = conv.scrollHeight;
  }
 
  /**
   * Sets the sending lock state and disables/enables the Send button accordingly.
   * Prevents the user from submitting multiple messages while one is in flight.
   * @param {boolean} val - True to lock (disable send), false to unlock
   */
  function setSending(val) {
    isSending = val;
    document.getElementById('mic-btn').disabled = val;
    document.getElementById('send-btn').disabled = val;

  }

  

 
  

 
  /**
   * Retrieves the value of a browser cookie by name.
   * Used primarily to read the Django CSRF token required for POST requests.
   * @param {string} name - Cookie name to look up
   * @returns {string} - Cookie value, or empty string if not found
   */
  function getCookie(name) {
    const v = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return v ? v.pop() : '';
  }