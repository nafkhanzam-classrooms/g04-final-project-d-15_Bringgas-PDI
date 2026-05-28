// --- Custom Network Protocol - Client Implementation ---
const MagicNumber = 0xCAFE;
const Version = 0x01;

// Message Types
const MsgCreateClass = 0x0001;
const MsgJoinClass = 0x0002;
const MsgClassState = 0x0003;
const MsgSendQuestion = 0x0010;
const MsgSubmitAnswer = 0x0011;
const MsgQuizResult = 0x0012;
const MsgSlideChange = 0x0020;
const MsgSlideBroadcast = 0x0021;
const MsgLeaderboard = 0x0030;
const MsgHeartbeat = 0x00F0;
const MsgError = 0x00FF;

// CRC32 Calculation (IEEE Standard matching Go's ChecksumIEEE)
const makeCRCTable = () => {
  let c;
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
    }
    crcTable[n] = c;
  }
  return crcTable;
};

const crcTable = makeCRCTable();
const calculateCRC32 = (bytes) => {
  let crc = 0 ^ (-1);
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
};

// Encode Packet into custom binary frame
const encodePacket = (msgType, seq, payloadObj) => {
  const jsonStr = JSON.stringify(payloadObj);
  const payloadBytes = new TextEncoder().encode(jsonStr);
  const payloadLen = payloadBytes.length;
  
  // Total size = Header (13 bytes) + Payload + Checksum (4 bytes)
  const buffer = new ArrayBuffer(13 + payloadLen + 4);
  const view = new DataView(buffer);
  
  // Write Header
  view.setUint16(0, MagicNumber, false); // Magic (2B)
  view.setUint8(2, Version);            // Version (1B)
  view.setUint16(3, msgType, false);     // MsgType (2B)
  view.setUint32(5, seq, false);         // SeqNum (4B)
  view.setUint32(9, payloadLen, false);  // Length (4B)
  
  // Write Payload
  const arrayBytes = new Uint8Array(buffer, 13, payloadLen);
  arrayBytes.set(payloadBytes);
  
  // Calculate Checksum of Payload
  const checksum = calculateCRC32(payloadBytes);
  view.setUint32(13 + payloadLen, checksum, false); // Checksum (4B)
  
  return buffer;
};

// Decode Packet from custom binary frame
const decodePacket = (buffer) => {
  const view = new DataView(buffer);
  
  if (buffer.byteLength < 17) {
    throw new Error("Frame too short");
  }
  
  const magic = view.getUint16(0, false);
  if (magic !== MagicNumber) {
    throw new Error("Invalid magic number");
  }
  
  const version = view.getUint8(2);
  if (version !== Version) {
    throw new Error("Unsupported protocol version");
  }
  
  const msgType = view.getUint16(3, false);
  const seq = view.getUint32(5, false);
  const payloadLen = view.getUint32(9, false);
  
  if (buffer.byteLength < 13 + payloadLen + 4) {
    throw new Error("Payload size mismatch");
  }
  
  const payloadBytes = new Uint8Array(buffer, 13, payloadLen);
  const checksum = view.getUint32(13 + payloadLen, false);
  
  // Validate Checksum
  const expectedChecksum = calculateCRC32(payloadBytes);
  if (checksum !== expectedChecksum) {
    throw new Error("Checksum verification failed");
  }
  
  const jsonStr = new TextDecoder().decode(payloadBytes);
  const payload = JSON.parse(jsonStr);
  
  return { msgType, seq, payload };
};

// --- Mock Slide Presentation Dataset ---
const SlideDataset = [
  {
    title: "Selamat Datang di Lopyta!",
    body: "Lopyta adalah platform kelas interaktif terdistribusi. Dibuat menggunakan Golang Fiber, Nginx, dan sinkronisasi state cluster TCP."
  },
  {
    title: "Arsitektur Distributed Cluster",
    body: "Node-1 (port 8789) dan Node-2 (port 8790) dihubungkan dengan tunnel VPN (WireGuard) secara aman. State direplikasi menggunakan TCP sync privat melintasi port 8889/8890."
  },
  {
    title: "Bagaimana Concurrency Go Bekerja?",
    body: "Go menggunakan model CSP (Communicating Sequential Processes) dengan goroutine yang berjalan secara asinkron di atas thread OS minimal secara efisien."
  },
  {
    title: "Keuntungan Fiber (Fasthttp)",
    body: "Fiber dibangun di atas Fasthttp, engine HTTP tercepat di Go. Menawarkan penanganan request zero-memory-allocation yang mengagumkan."
  },
  {
    title: "Demo & Pengujian Jaringan",
    body: "Sekarang, mari kita jalankan simulasi 5 siswa terhubung bersamaan melintasi Nginx Load Balancer! Buka index siswa di siswa.lopyta.org."
  }
];

// --- Global WebSocket State ---
let ws;
let isHost = false;
let sessionCode = "";
let studentName = "";
let heartbeatInterval;
let seqNum = 1;
let currentQuestionEndTime = null;
let timerInterval = null;

// Initialize WebSocket Connection
const initSocket = (onOpenCallback) => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  
  ws = new WebSocket(wsUrl);
  ws.binaryType = 'arraybuffer'; // Enforce binary frames
  
  ws.onopen = () => {
    document.getElementById('statusBadge').style.display = 'flex';
    document.getElementById('statusBadge').querySelector('.status-dot').style.backgroundColor = 'var(--success)';
    
    // Start Heartbeat ping every 10 seconds
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(encodePacket(MsgHeartbeat, seqNum++, { status: "ping" }));
      }
    }, 10000);
    
    if (onOpenCallback) onOpenCallback();
  };
  
  ws.onclose = () => {
    document.getElementById('statusBadge').querySelector('.status-dot').style.backgroundColor = 'var(--error)';
    document.getElementById('nodeName').textContent = 'Terputus (Mencoba menghubungkan...)';
    
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    
    // Auto-reconnect after 3 seconds
    setTimeout(() => {
      initSocket(() => {
        // If student was inside a class, try to re-join automatically
        if (!isHost && sessionCode !== "" && studentName !== "") {
          ws.send(encodePacket(MsgJoinClass, seqNum++, { code: sessionCode, name: studentName }));
        }
      });
    }, 3000);
  };
  
  ws.onerror = (err) => {
    console.error("Socket error:", err);
  };
  
  ws.onmessage = (event) => {
    try {
      const { msgType, seq, payload } = decodePacket(event.data);
      handleIncomingPacket(msgType, seq, payload);
    } catch (e) {
      console.error("Failed to process binary packet:", e);
    }
  };
};

// Handle packets received from the server
const handleIncomingPacket = (msgType, seq, payload) => {
  switch (msgType) {
    case MsgClassState:
      updateUIWithState(payload);
      break;
      
    case MsgQuizResult:
      if (!isHost) {
        showQuizFeedback(payload);
      }
      break;
      
    case MsgHeartbeat:
      // Pong received, update status badge with node indication if supplied
      document.getElementById('nodeName').textContent = 'Terhubung';
      break;
      
    case MsgError:
      alert(`Error: ${payload.message}`);
      break;
  }
};

// Updates UI elements dynamically based on full replication state
const updateUIWithState = (state) => {
  sessionCode = state.code;
  
  // Set global names
  document.getElementById('classNameDisplay').textContent = state.className;
  document.getElementById('hostNameDisplay').textContent = state.hostName;
  
  if (isHost) {
    document.getElementById('classCodeDisplay').textContent = state.code;
  }
  
  // 1. Sync Presentation Slides
  const slideIndex = state.activeSlide - 1;
  if (SlideDataset[slideIndex]) {
    const slide = SlideDataset[slideIndex];
    document.getElementById('slideTitle').textContent = slide.title;
    document.getElementById('slideBody').textContent = slide.body;
    document.getElementById('slideIndicator').textContent = `Halaman ${state.activeSlide} / ${state.totalSlides}`;
  }
  
  // 2. Render Leaderboard
  renderLeaderboard(state.leaderboard);
  
  // 3. Render Active Question / Stats
  if (state.currentQuestion) {
    const q = state.currentQuestion;
    
    // Set active question title in stats block
    if (isHost) {
      document.getElementById('activeQuestionDisplay').textContent = `Soal: "${q.questionText}"`;
      updateLiveStats(q.answers);
    }
    
    // Handle countdown timer
    currentQuestionEndTime = new Date(q.endTime);
    startTimerCountdown();
    
    if (!isHost) {
      // Check if student has already answered this question
      const hasAnswered = q.answers && q.answers.hasOwnProperty(studentName);
      
      if (hasAnswered) {
        document.getElementById('quizWaitingState').style.display = 'none';
        document.getElementById('quizActiveState').style.display = 'none';
        document.getElementById('quizSubmittedState').style.display = 'flex';
        document.getElementById('quizResultState').style.display = 'none';
      } else {
        // Show active answering buttons
        document.getElementById('quizQuestionText').textContent = q.questionText;
        document.getElementById('lblOptA').textContent = q.options[0] || "";
        document.getElementById('lblOptB').textContent = q.options[1] || "";
        document.getElementById('lblOptC').textContent = q.options[2] || "";
        document.getElementById('lblOptD').textContent = q.options[3] || "";
        
        // Reset buttons disabled states
        document.querySelectorAll('.option-btn').forEach(btn => {
          btn.disabled = false;
          btn.classList.remove('selected');
        });
        
        document.getElementById('quizWaitingState').style.display = 'none';
        document.getElementById('quizActiveState').style.display = 'flex';
        document.getElementById('quizSubmittedState').style.display = 'none';
        document.getElementById('quizResultState').style.display = 'none';
      }
    }
  } else {
    // No active question
    if (isHost) {
      document.getElementById('activeQuestionDisplay').textContent = "Tidak ada kuis aktif";
      document.getElementById('timerDisplay').textContent = "--:--";
      clearLiveStats();
    } else {
      document.getElementById('quizWaitingState').style.display = 'flex';
      document.getElementById('quizActiveState').style.display = 'none';
      document.getElementById('quizSubmittedState').style.display = 'none';
      document.getElementById('quizResultState').style.display = 'none';
    }
    
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }
  
  // 4. Update individual student score display
  if (!isHost && state.participants && state.participants[studentName]) {
    const me = state.participants[studentName];
    document.getElementById('studentScoreDisplay').textContent = `Skor: ${me.score} poin`;
  }
};

// Countdown Timer Loop
const startTimerCountdown = () => {
  if (timerInterval) clearInterval(timerInterval);
  
  const updateTimer = () => {
    const now = new Date();
    const diffMs = currentQuestionEndTime - now;
    
    if (diffMs <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      document.getElementById('timerDisplay' + (isHost ? '' : 'Val')).textContent = "0";
      if (!isHost) {
        // Disable choices
        document.querySelectorAll('.option-btn').forEach(btn => btn.disabled = true);
      }
      return;
    }
    
    const remainingSec = Math.ceil(diffMs / 1000);
    
    if (isHost) {
      document.getElementById('timerDisplay').textContent = `Sisa Waktu: ${remainingSec}s`;
    } else {
      document.getElementById('studentTimerVal').textContent = remainingSec;
      
      const timerElement = document.getElementById('studentTimer');
      if (remainingSec <= 5) {
        timerElement.classList.add('warning');
      } else {
        timerElement.classList.remove('warning');
      }
    }
  };
  
  updateTimer();
  timerInterval = setInterval(updateTimer, 1000);
};

// Render rankings lists
const renderLeaderboard = (rankings) => {
  const container = document.getElementById('leaderboardList');
  const placeholder = document.getElementById('leaderboardPlaceholder');
  
  if (!rankings || rankings.length === 0) {
    if (placeholder) placeholder.style.display = 'flex';
    container.style.display = 'none';
    return;
  }
  
  if (placeholder) placeholder.style.display = 'none';
  container.style.display = 'flex';
  
  container.innerHTML = '';
  rankings.forEach((entry) => {
    const isGoldSilverBronze = entry.rank <= 3 ? `top-${entry.rank}` : '';
    
    let changeHTML = '';
    if (entry.change > 0) {
      changeHTML = `<span class="rank-change up">▲ ${entry.change}</span>`;
    } else if (entry.change < 0) {
      changeHTML = `<span class="rank-change down">▼ ${Math.abs(entry.change)}</span>`;
    } else {
      changeHTML = `<span class="rank-change no-change">═</span>`;
    }
    
    const streakHTML = entry.streak > 1 
      ? `<span class="streak-indicator">🔥 Streak x${entry.streak}</span>` 
      : '';
      
    const item = document.createElement('div');
    item.className = `leaderboard-entry ${isGoldSilverBronze}`;
    item.innerHTML = `
      <div style="display: flex; align-items: center;">
        <span class="rank-badge">${entry.rank}</span>
        <div class="participant-info">
          <span class="participant-name">${entry.name} ${entry.name === studentName ? '(Anda)' : ''}</span>
          ${streakHTML}
        </div>
      </div>
      <div style="display: flex; align-items: center;">
        ${changeHTML}
        <span class="participant-score">${entry.score} pts</span>
      </div>
    `;
    container.appendChild(item);
  });
};

// Live Quiz Stats calculations
const updateLiveStats = (answers) => {
  let a = 0, b = 0, c = 0, d = 0;
  let total = 0;
  
  if (answers) {
    Object.values(answers).forEach(val => {
      total++;
      if (val === 'A') a++;
      if (val === 'B') b++;
      if (val === 'C') c++;
      if (val === 'D') d++;
    });
  }
  
  document.getElementById('totalAnswersDisplay').textContent = total;
  
  const percent = (val) => total > 0 ? (val / total) * 100 : 0;
  
  document.getElementById('statBarA').style.width = `${percent(a)}%`;
  document.getElementById('statCountA').textContent = a;
  
  document.getElementById('statBarB').style.width = `${percent(b)}%`;
  document.getElementById('statCountB').textContent = b;
  
  document.getElementById('statBarC').style.width = `${percent(c)}%`;
  document.getElementById('statCountC').textContent = c;
  
  document.getElementById('statBarD').style.width = `${percent(d)}%`;
  document.getElementById('statCountD').textContent = d;
};

const clearLiveStats = () => {
  document.getElementById('totalAnswersDisplay').textContent = "0";
  ['A', 'B', 'C', 'D'].forEach(opt => {
    document.getElementById(`statBar${opt}`).style.width = '0%';
    document.getElementById(`statCount${opt}`).textContent = "0";
  });
};

// Show response feedback to participants (Instant feedback)
const showQuizFeedback = (result) => {
  document.getElementById('quizWaitingState').style.display = 'none';
  document.getElementById('quizActiveState').style.display = 'none';
  document.getElementById('quizSubmittedState').style.display = 'none';
  document.getElementById('quizResultState').style.display = 'flex';
  
  const title = document.getElementById('feedbackTitle');
  const text = document.getElementById('feedbackText');
  const pts = document.getElementById('feedbackPoints');
  const streak = document.getElementById('feedbackStreak');
  
  if (result.isCorrect) {
    title.textContent = "BENAR! 🎯";
    title.className = "feedback-title correct";
    text.textContent = `Hebat! Pilihan Anda (${result.correct}) benar.`;
    pts.textContent = `+${result.pointsEarned} Poin`;
    pts.style.display = 'block';
    
    // Fetch streak from updated states dynamically
    streak.style.display = 'inline-block';
    streak.textContent = `Jawaban Benar Beruntun!`;
  } else {
    title.textContent = "SALAH! ❌";
    title.className = "feedback-title incorrect";
    text.textContent = `Jawaban yang benar adalah Opsi ${result.correct}.`;
    pts.style.display = 'none';
    streak.style.display = 'none';
  }
};

// --- Student Control Methods ---
const submitAnswer = (choice) => {
  // Highlight choice
  document.querySelectorAll('.option-btn').forEach(btn => {
    btn.disabled = true;
    btn.classList.remove('selected');
  });
  
  const selectedBtn = document.getElementById(`btnOpt${choice}`);
  selectedBtn.classList.add('selected');
  
  // Transmit answer biner
  ws.send(encodePacket(MsgSubmitAnswer, seqNum++, {
    code: sessionCode,
    name: studentName,
    answer: choice
  }));
  
  // Transition UI
  setTimeout(() => {
    document.getElementById('quizActiveState').style.display = 'none';
    document.getElementById('quizSubmittedState').style.display = 'flex';
  }, 300);
};

// Initialize teacher dashboards bindings
const initHostLogic = () => {
  isHost = true;
  let activeSlideIndex = 1;
  
  const createBtn = document.getElementById('createBtn');
  const nextBtn = document.getElementById('nextSlideBtn');
  const prevBtn = document.getElementById('prevSlideBtn');
  const launchQuizBtn = document.getElementById('launchQuizBtn');
  
  createBtn.addEventListener('click', () => {
    const cName = document.getElementById('classNameInput').value.trim();
    const hName = document.getElementById('hostNameInput').value.trim();
    
    if (cName === "" || hName === "") {
      alert("Isi Nama Kelas dan Nama Pengajar!");
      return;
    }
    
    // Connect socket and create session
    initSocket(() => {
      ws.send(encodePacket(MsgCreateClass, seqNum++, { className: cName, hostName: hName }));
      
      document.getElementById('createScreen').style.display = 'none';
      document.getElementById('dashboardScreen').style.display = 'grid';
    });
  });
  
  nextBtn.addEventListener('click', () => {
    if (activeSlideIndex < SlideDataset.length) {
      activeSlideIndex++;
      ws.send(encodePacket(MsgSlideChange, seqNum++, { code: sessionCode, slide: activeSlideIndex }));
    }
  });
  
  prevBtn.addEventListener('click', () => {
    if (activeSlideIndex > 1) {
      activeSlideIndex--;
      ws.send(encodePacket(MsgSlideChange, seqNum++, { code: sessionCode, slide: activeSlideIndex }));
    }
  });
  
  launchQuizBtn.addEventListener('click', () => {
    const qText = document.getElementById('quizQuestionInput').value.trim();
    const optA = document.getElementById('optA').value.trim();
    const optB = document.getElementById('optB').value.trim();
    const optC = document.getElementById('optC').value.trim();
    const optD = document.getElementById('optD').value.trim();
    const correct = document.getElementById('correctOptionInput').value;
    const duration = parseInt(document.getElementById('durationInput').value, 10);
    
    if (qText === "" || optA === "" || optB === "") {
      alert("Pertanyaan dan minimal Opsi A & B wajib diisi!");
      return;
    }
    
    ws.send(encodePacket(MsgSendQuestion, seqNum++, {
      code: sessionCode,
      questionText: qText,
      options: [optA, optB, optC, optD],
      correctOption: correct,
      durationSeconds: duration
    }));
  });
};

// Initialize student dashboards bindings
const initStudentLogic = () => {
  isHost = false;
  
  const joinBtn = document.getElementById('joinBtn');
  
  joinBtn.addEventListener('click', () => {
    const code = document.getElementById('classCodeInput').value.trim().toUpperCase();
    const name = document.getElementById('studentNameInput').value.trim();
    
    if (code === "" || name === "") {
      alert("Isi Kode Kelas dan Nama Lengkap!");
      return;
    }
    
    studentName = name;
    document.getElementById('studentNameDisplay').textContent = name;
    
    initSocket(() => {
      ws.send(encodePacket(MsgJoinClass, seqNum++, { code: code, name: name }));
      
      document.getElementById('joinScreen').style.display = 'none';
      document.getElementById('classScreen').style.display = 'grid';
    });
  });
};
