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

// CRC32 Table & Generator for Go parity
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

const encodePacket = (msgType, seq, payloadObj) => {
  const jsonStr = JSON.stringify(payloadObj);
  const payloadBytes = new TextEncoder().encode(jsonStr);
  const payloadLen = payloadBytes.length;
  
  const buffer = new ArrayBuffer(13 + payloadLen + 4);
  const view = new DataView(buffer);
  
  view.setUint16(0, MagicNumber, false);
  view.setUint8(2, Version);
  view.setUint16(3, msgType, false);
  view.setUint32(5, seq, false);
  view.setUint32(9, payloadLen, false);
  
  const arrayBytes = new Uint8Array(buffer, 13, payloadLen);
  arrayBytes.set(payloadBytes);
  
  const checksum = calculateCRC32(payloadBytes);
  view.setUint32(13 + payloadLen, checksum, false);
  
  return buffer;
};

const decodePacket = (buffer) => {
  const view = new DataView(buffer);
  if (buffer.byteLength < 17) throw new Error("Frame too short");
  
  const magic = view.getUint16(0, false);
  if (magic !== MagicNumber) throw new Error("Invalid magic number");
  
  const version = view.getUint8(2);
  if (version !== Version) throw new Error("Unsupported protocol version");
  
  const msgType = view.getUint16(3, false);
  const seq = view.getUint32(5, false);
  const payloadLen = view.getUint32(9, false);
  
  if (buffer.byteLength < 13 + payloadLen + 4) throw new Error("Payload size mismatch");
  
  const payloadBytes = new Uint8Array(buffer, 13, payloadLen);
  const checksum = view.getUint32(13 + payloadLen, false);
  
  const expectedChecksum = calculateCRC32(payloadBytes);
  if (checksum !== expectedChecksum) throw new Error("Checksum verification failed");
  
  const jsonStr = new TextDecoder().decode(payloadBytes);
  const payload = JSON.parse(jsonStr);
  
  return { msgType, seq, payload };
};

// --- Mock Slide Presentation Dataset ---
const SlideDataset = [
  {
    title: "Selamat Datang di Lopyta!",
    body: "Lopyta adalah platform kelas interaktif terdistribusi. Dibuat menggunakan Golang Fiber, Redis State caching, Nginx, dan MariaDB persistent storage."
  },
  {
    title: "Redis State Clustering",
    body: "Seluruh state server di-sync secara real-time melintasi node load balancer memanfaatkan Redis Caching dan Redis Pub/Sub untuk latensi rendah."
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
    title: "Bank Soal & Code Compiler",
    body: "Sekarang, guru bisa mengambil kuis dari Bank Soal terpusat dan siswa bisa langsung mengetik dan mengompilasi kode program di Layar Siswa!"
  }
];

// --- Global WebSocket & System State ---
let ws;
let isHost = false;
let sessionCode = "";
let studentName = "";
let studentEntryCode = ""; // Kode Khusus
let heartbeatInterval;
let seqNum = 1;
let currentQuestionEndTime = null;
let timerInterval = null;
let currentTeacherID = 0;

// Initialize WebSocket Connection
const initSocket = (onOpenCallback) => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  
  ws = new WebSocket(wsUrl);
  ws.binaryType = 'arraybuffer';
  
  ws.onopen = () => {
    document.getElementById('statusBadge').style.display = 'flex';
    document.getElementById('statusBadge').querySelector('.status-dot').style.backgroundColor = 'var(--success)';
    
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
    
    setTimeout(() => {
      initSocket(() => {
        if (!isHost && sessionCode !== "" && studentName !== "") {
          // Send join including Kode Khusus (entryCode) during auto-reconnect
          ws.send(encodePacket(MsgJoinClass, seqNum++, { code: sessionCode, name: studentName, entryCode: studentEntryCode }));
        }
      });
    }, 3000);
  };
  
  ws.onerror = (err) => console.error("Socket error:", err);
  
  ws.onmessage = (event) => {
    try {
      const { msgType, seq, payload } = decodePacket(event.data);
      handleIncomingPacket(msgType, seq, payload);
    } catch (e) {
      console.error("Failed to process binary packet:", e);
    }
  };
};

const handleIncomingPacket = (msgType, seq, payload) => {
  switch (msgType) {
    case MsgClassState:
      updateUIWithState(payload);
      break;
      
    case MsgQuizResult:
      if (!isHost) showQuizFeedback(payload);
      break;
      
    case MsgHeartbeat:
      document.getElementById('nodeName').textContent = 'Terhubung';
      break;
      
    case MsgError:
      alert(`Pesan: ${payload.message}`);
      break;
  }
};

const updateUIWithState = (state) => {
  sessionCode = state.code;
  
  document.getElementById('classNameDisplay').textContent = state.className;
  document.getElementById('hostNameDisplay').textContent = state.hostName;
  
  if (isHost) {
    document.getElementById('classCodeDisplay').textContent = state.code;
    document.getElementById('studentEntryCodeDisplay').textContent = state.studentEntryCode;
    
    // Update mulai / akhiri status kelas di panel Guru
    const banner = document.getElementById('classStatusBanner');
    const startBtn = document.getElementById('startClassBtn');
    const endBtn = document.getElementById('endClassBtn');
    
    if (state.isActive) {
      banner.className = "class-status-banner active";
      document.getElementById('classStatusText').textContent = "KELAS AKTIF (Siswa bisa bergabung)";
      startBtn.style.display = 'none';
      endBtn.style.display = 'block';
    } else {
      banner.className = "class-status-banner inactive";
      document.getElementById('classStatusText').textContent = "KELAS BELUM DIMULAI (Siswa tidak bisa bergabung)";
      startBtn.style.display = 'block';
      endBtn.style.display = 'none';
    }
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
    
    if (isHost) {
      document.getElementById('activeQuestionDisplay').textContent = `Soal/Tugas: "${q.questionText}"`;
      updateLiveStats(q.answers);
    }
    
    currentQuestionEndTime = new Date(q.endTime);
    startTimerCountdown();
    
    if (!isHost) {
      const hasAnswered = q.answers && q.answers.hasOwnProperty(studentName);
      
      // Check if it's a coding assignment instead of multiple choice
      const isCodeTask = q.options && q.options.length === 0; 
      
      if (isCodeTask) {
        // Show compiler view, hide slide viewer
        document.getElementById('slideViewerCard').style.display = 'none';
        document.getElementById('compilerCard').style.display = 'flex';
        
        // Update problem description inside compiler card
        document.getElementById('compilerCard').querySelector('label').textContent = `TUGAS: ${q.questionText}`;
        
        document.getElementById('quizWaitingState').style.display = 'none';
        document.getElementById('quizActiveState').style.display = 'none';
        
        if (hasAnswered) {
          document.getElementById('quizSubmittedState').style.display = 'flex';
          document.getElementById('quizResultState').style.display = 'none';
          document.getElementById('runCodeBtn').disabled = true;
          document.getElementById('submitCodeBtn').disabled = true;
        } else {
          document.getElementById('quizSubmittedState').style.display = 'none';
          document.getElementById('quizResultState').style.display = 'none';
          document.getElementById('runCodeBtn').disabled = false;
          document.getElementById('submitCodeBtn').disabled = false;
        }
      } else {
        // Standard quiz kuis pg
        document.getElementById('slideViewerCard').style.display = 'flex';
        document.getElementById('compilerCard').style.display = 'none';
        
        if (hasAnswered) {
          document.getElementById('quizWaitingState').style.display = 'none';
          document.getElementById('quizActiveState').style.display = 'none';
          document.getElementById('quizSubmittedState').style.display = 'flex';
          document.getElementById('quizResultState').style.display = 'none';
        } else {
          document.getElementById('quizQuestionText').textContent = q.questionText;
          document.getElementById('lblOptA').textContent = q.options[0] || "";
          document.getElementById('lblOptB').textContent = q.options[1] || "";
          document.getElementById('lblOptC').textContent = q.options[2] || "";
          document.getElementById('lblOptD').textContent = q.options[3] || "";
          
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
    }
  } else {
    // No active question
    if (isHost) {
      document.getElementById('activeQuestionDisplay').textContent = "Tidak ada kuis aktif";
      document.getElementById('timerDisplay').textContent = "--:--";
      clearLiveStats();
    } else {
      document.getElementById('slideViewerCard').style.display = 'flex';
      document.getElementById('compilerCard').style.display = 'none';
      
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
  
  if (!isHost && state.participants && state.participants[studentName]) {
    const me = state.participants[studentName];
    document.getElementById('studentScoreDisplay').textContent = `Skor: ${me.score} poin`;
  }
};

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
        document.querySelectorAll('.option-btn').forEach(btn => btn.disabled = true);
        document.getElementById('runCodeBtn').disabled = true;
        document.getElementById('submitCodeBtn').disabled = true;
      }
      return;
    }
    
    const remainingSec = Math.ceil(diffMs / 1000);
    
    if (isHost) {
      document.getElementById('timerDisplay').textContent = `Sisa Waktu: ${remainingSec}s`;
    } else {
      const studentTimerVal = document.getElementById('studentTimerVal');
      if (studentTimerVal) studentTimerVal.textContent = remainingSec;
      
      const timerElement = document.getElementById('studentTimer');
      if (timerElement) {
        if (remainingSec <= 5) {
          timerElement.classList.add('warning');
        } else {
          timerElement.classList.remove('warning');
        }
      }
    }
  };
  
  updateTimer();
  timerInterval = setInterval(updateTimer, 1000);
};

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

const submitAnswer = (choice) => {
  document.querySelectorAll('.option-btn').forEach(btn => {
    btn.disabled = true;
    btn.classList.remove('selected');
  });
  
  document.getElementById(`btnOpt${choice}`).classList.add('selected');
  
  ws.send(encodePacket(MsgSubmitAnswer, seqNum++, {
    code: sessionCode,
    name: studentName,
    answer: choice
  }));
  
  setTimeout(() => {
    document.getElementById('quizActiveState').style.display = 'none';
    document.getElementById('quizSubmittedState').style.display = 'flex';
  }, 300);
};

// --- Secure Sandbox Compiler API Callers ---
const changeCompilerLanguageTemplate = () => {
  const lang = document.getElementById('compilerLangSelect').value;
  const area = document.getElementById('compilerCodeInput');
  
  if (lang === 'python') {
    area.value = `# Tulis program Python Anda di sini\nprint("Hello, Lopyta!")\n`;
  } else if (lang === 'c') {
    area.value = `#include <stdio.h>\n\nint main() {\n    printf("Hello, Lopyta!\\n");\n    return 0;\n}\n`;
  } else if (lang === 'cpp') {
    area.value = `#include <iostream>\n\nint main() {\n    std::cout << "Hello, Lopyta!" << std::endl;\n    return 0;\n}\n`;
  }
};

const runCompilerCode = async () => {
  const lang = document.getElementById('compilerLangSelect').value;
  const code = document.getElementById('compilerCodeInput').value;
  const input = document.getElementById('compilerStdinInput').value;
  const status = document.getElementById('compilerStatusText');
  const term = document.getElementById('compilerOutputTerminal');
  
  status.textContent = "Sedang mengompilasi...";
  status.style.color = "var(--secondary)";
  term.textContent = "> Compiling and executing source in sandbox...\n";
  
  try {
    const response = await fetch('/api/compiler/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang, code, input })
    });
    const data = await response.json();
    
    if (data.success) {
      status.textContent = "Success";
      status.style.color = "var(--success)";
      term.textContent = data.output || "> Program completed with no stdout output.";
    } else {
      status.textContent = "Execution Failed";
      status.style.color = "var(--error)";
      term.textContent = `[ERROR] ${data.error}\n\n${data.output || ""}`;
    }
  } catch (err) {
    status.textContent = "Error";
    status.style.color = "var(--error)";
    term.textContent = "[SYSTEM ERROR] Gagal menghubungi backend compiler: " + err.message;
  }
};

const submitCodeAssignment = () => {
  const code = document.getElementById('compilerCodeInput').value;
  
  ws.send(encodePacket(MsgSubmitAnswer, seqNum++, {
    code: sessionCode,
    name: studentName,
    answer: code // Transmits full source code as submission
  }));
  
  document.getElementById('runCodeBtn').disabled = true;
  document.getElementById('submitCodeBtn').disabled = true;
  
  document.getElementById('quizSubmittedState').style.display = 'flex';
};

// --- Dynamic Host Dashboard bindings ---
let activeTab = 'classes';

const switchMainTab = (tab) => {
  activeTab = tab;
  document.getElementById('tabClassesBtn').className = `tab-btn ${tab === 'classes' ? 'active' : ''}`;
  document.getElementById('tabBankBtn').className = `tab-btn ${tab === 'bank' ? 'active' : ''}`;
  
  document.getElementById('tabClassesContent').style.display = tab === 'classes' ? 'block' : 'none';
  document.getElementById('tabBankContent').style.display = tab === 'bank' ? 'block' : 'none';
  
  if (tab === 'classes') loadCreatedClasses();
  if (tab === 'bank') loadQuestionBank();
};

const showAddBankForm = () => {
  document.getElementById('addBankPanel').style.display = 'block';
  document.getElementById('openAddBankBtn').style.display = 'none';
};

const hideAddBankForm = () => {
  document.getElementById('addBankPanel').style.display = 'none';
  document.getElementById('openAddBankBtn').style.display = 'block';
};

const toggleBankTypeFields = () => {
  const type = document.getElementById('bankTypeSelect').value;
  const ops = document.getElementById('bankQuizOptions');
  const label = document.getElementById('correctLabel');
  const correct = document.getElementById('bankCorrectSelect');
  
  if (type === 'code') {
    ops.style.display = 'none';
    label.textContent = "Expected Output Kodingan";
    correct.outerHTML = `<input type="text" id="bankCorrectSelect" class="input-field" placeholder="Ketik kata kunci output valid (misal: Hello)">`;
  } else {
    ops.style.display = 'grid';
    label.textContent = "Kunci Jawaban";
    // restore options select
    const input = document.getElementById('bankCorrectSelect');
    if (input) {
      input.outerHTML = `<select id="bankCorrectSelect" class="input-field">
        <option value="A">Opsi A</option>
        <option value="B">Opsi B</option>
        <option value="C">Opsi C</option>
        <option value="D">Opsi D</option>
      </select>`;
    }
  }
};

const loadQuestionBank = async () => {
  const container = document.getElementById('bankListContainer');
  container.innerHTML = "<p style='color: var(--text-muted);'>Memuat Bank Soal...</p>";
  
  try {
    const response = await fetch('/api/bank');
    const data = await response.json();
    
    container.innerHTML = "";
    if (!data || data.length === 0) {
      container.innerHTML = "<p style='text-align: center; padding: 20px; color: var(--text-muted);'>Bank Soal kosong. Tambah soal baru di atas.</p>";
      return;
    }
    
    data.forEach(item => {
      const el = document.createElement('div');
      el.className = "bank-item";
      const badge = item.activityType === 'quiz' ? 'quiz' : 'code';
      const badgeLabel = item.activityType === 'quiz' ? 'Pilihan Ganda' : 'Kodingan';
      
      el.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <h4 style="color: #fff;">${item.title}</h4>
          <span class="badge-type ${badge}">${badgeLabel}</span>
        </div>
        <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 12px;">"${item.questionText}"</p>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.8rem; color: var(--text-muted);">Durasi: ${item.durationSeconds}s | Kunci: ${item.correctOption}</span>
          <button class="btn btn-secondary" onclick="deleteBankItem(${item.id})" style="padding: 4px 10px; font-size: 0.75rem; border-color: var(--error); color: var(--error);">Hapus</button>
        </div>
      `;
      container.appendChild(el);
    });
  } catch (err) {
    container.innerHTML = "<p style='color: var(--error);'>Gagal memuat bank soal.</p>";
  }
};

const deleteBankItem = async (id) => {
  if (!confirm("Hapus soal ini dari Bank Soal?")) return;
  try {
    await fetch(`/api/bank/${id}`, { method: 'DELETE' });
    loadQuestionBank();
  } catch (err) {
    alert("Gagal menghapus soal");
  }
};

const saveToQuestionBank = async () => {
  const title = document.getElementById('bankTitleInput').value.trim();
  const text = document.getElementById('bankTextInput').value.trim();
  const actType = document.getElementById('bankTypeSelect').value;
  const duration = parseInt(document.getElementById('bankDurationInput').value, 10);
  const correct = document.getElementById('bankCorrectSelect').value;
  
  let options = [];
  if (actType === 'quiz') {
    options = [
      document.getElementById('bankOptA').value.trim(),
      document.getElementById('bankOptB').value.trim(),
      document.getElementById('bankOptC').value.trim(),
      document.getElementById('bankOptD').value.trim()
    ];
  }
  
  if (!title || !text || (actType === 'quiz' && (!options[0] || !options[1]))) {
    alert("Lengkapi semua field wajib!");
    return;
  }
  
  try {
    const response = await fetch('/api/bank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        questionText: text,
        options,
        correctOption: correct,
        durationSeconds: duration,
        activityType: actType
      })
    });
    
    if (response.ok) {
      hideAddBankForm();
      loadQuestionBank();
      // Reset inputs
      document.getElementById('bankTitleInput').value = "";
      document.getElementById('bankTextInput').value = "";
    }
  } catch (err) {
    alert("Gagal menyimpan ke Bank Soal");
  }
};

const loadCreatedClasses = async () => {
  const container = document.getElementById('classesListContainer');
  container.innerHTML = "<p style='color: var(--text-muted);'>Memuat kelas Anda...</p>";
  
  try {
    const response = await fetch('/api/teacher/classes');
    const data = await response.json();
    
    // Update dashboard metrics class count if element exists
    const metricCountEl = document.getElementById('metricClassesCount');
    if (metricCountEl) {
      metricCountEl.textContent = data ? data.length : 0;
    }
    
    container.innerHTML = "";
    if (!data || data.length === 0) {
      container.innerHTML = "<p style='text-align: center; padding: 20px; color: var(--text-muted);'>Belum ada kelas yang dibuat.</p>";
      return;
    }
    
    data.forEach(cls => {
      const card = document.createElement('div');
      card.className = "class-card-item";
      card.innerHTML = `
        <div>
          <h4 style="color: #fff; font-size: 1.1rem; margin-bottom: 2px;">${cls.className}</h4>
          <p style="font-size: 0.8rem; color: var(--text-muted);">Kode Sesi: <strong style="color: var(--secondary);">${cls.code}</strong> | Kode Siswa: <strong style="color: var(--success);">${cls.studentEntryCode}</strong></p>
        </div>
        <button class="btn" onclick="restoreClassDashboard('${cls.code}')" style="padding: 6px 14px; font-size: 0.85rem;">Buka Panel</button>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    container.innerHTML = "<p style='color: var(--error);'>Gagal memuat kelas.</p>";
  }
};

const restoreClassDashboard = (code) => {
  sessionCode = code;
  isHost = true;
  
  initSocket(() => {
    // Re-link host to WS session
    ws.send(encodePacket(MsgCreateClass, seqNum++, { code: code, className: "", hostName: "", teacherId: currentTeacherID, studentEntryCode: "" }));
    
    if (document.getElementById('overviewScreen')) document.getElementById('overviewScreen').style.display = 'none';
    document.getElementById('createScreen').style.display = 'none';
    document.getElementById('dashboardScreen').style.display = 'grid';
  });
};

// Quick Select from Bank Soal drawer triggers
const openQuickSelectDrawer = async () => {
  const drawer = document.getElementById('bankDrawer');
  const list = document.getElementById('drawerList');
  drawer.style.display = 'flex';
  list.innerHTML = "<p style='color: var(--text-muted);'>Memuat Bank Soal...</p>";
  
  try {
    const response = await fetch('/api/bank');
    const data = await response.json();
    list.innerHTML = "";
    
    if (!data || data.length === 0) {
      list.innerHTML = "<p style='color: var(--text-muted);'>Bank Soal kosong.</p>";
      return;
    }
    
    data.forEach(item => {
      const el = document.createElement('div');
      el.className = "bank-item";
      const isQuiz = item.activityType === 'quiz';
      
      el.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <strong style="color: #fff;">${item.title}</strong>
          <span class="badge-type ${isQuiz ? 'quiz':'code'}">${isQuiz ? 'Quiz':'Code'}</span>
        </div>
        <p style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.4;">"${item.questionText}"</p>
      `;
      el.addEventListener('click', () => {
        // Load bank item into fields
        document.getElementById('quizQuestionInput').value = item.questionText;
        document.getElementById('durationInput').value = item.durationSeconds;
        
        if (isQuiz) {
          document.getElementById('hostQuestionOptionsPanel').style.display = 'block';
          document.getElementById('optA').value = item.options[0] || "";
          document.getElementById('optB').value = item.options[1] || "";
          document.getElementById('optC').value = item.options[2] || "";
          document.getElementById('optD').value = item.options[3] || "";
          document.getElementById('correctInputLabel').textContent = "Kunci Jawaban";
          
          const sel = document.getElementById('correctOptionInput');
          sel.outerHTML = `<select id="correctOptionInput" class="input-field">
            <option value="A" ${item.correctOption === 'A' ? 'selected':''}>Opsi A</option>
            <option value="B" ${item.correctOption === 'B' ? 'selected':''}>Opsi B</option>
            <option value="C" ${item.correctOption === 'C' ? 'selected':''}>Opsi C</option>
            <option value="D" ${item.correctOption === 'D' ? 'selected':''}>Opsi D</option>
          </select>`;
        } else {
          // Coding task
          document.getElementById('hostQuestionOptionsPanel').style.display = 'none';
          document.getElementById('correctInputLabel').textContent = "Expected Output Kodingan";
          document.getElementById('correctOptionInput').outerHTML = `<input type="text" id="correctOptionInput" class="input-field" value="${item.correctOption}">`;
        }
        
        closeQuickSelectDrawer();
      });
      list.appendChild(el);
    });
  } catch (err) {
    list.innerHTML = "<p style='color: var(--error);'>Gagal memuat bank soal.</p>";
  }
};

const closeQuickSelectDrawer = () => {
  document.getElementById('bankDrawer').style.display = 'none';
};

const initHostLogic = async () => {
  isHost = true;
  let activeSlideIndex = 1;
  
  // Verify authentications with Fiber /api/auth/me
  try {
    const response = await fetch('/api/auth/me');
    if (!response.ok) {
      window.location.href = '/login.html';
      return;
    }
    const teacher = await response.json();
    currentTeacherID = teacher.id;
    document.getElementById('teacherNameDisplay').textContent = teacher.name;
    document.getElementById('teacherEmailDisplay').textContent = teacher.email;
    document.getElementById('avatarDisplay').textContent = teacher.name.charAt(0).toUpperCase();
    if (document.getElementById('welcomeTeacherName')) {
      document.getElementById('welcomeTeacherName').textContent = teacher.name;
    }
  } catch (err) {
    window.location.href = '/login.html';
    return;
  }
  
  // Logout action
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login.html';
  });
  
  // Auto-load subcomponents
  await loadCreatedClasses();
  
  // Read path on load, default to dashboard
  const path = window.location.pathname;
  let initialSection = "dashboard";
  if (path.endsWith("/classes")) {
    initialSection = "classes";
  } else if (path.endsWith("/bank")) {
    initialSection = "bank";
  }
  switchHostSection(initialSection, false);
  
  // Listen to popstate for back/forward browser navigation
  window.addEventListener('popstate', () => {
    const curPath = window.location.pathname;
    let curSection = "dashboard";
    if (curPath.endsWith("/classes")) {
      curSection = "classes";
    } else if (curPath.endsWith("/bank")) {
      curSection = "bank";
    }
    switchHostSection(curSection, false);
  });
  
  const createBtn = document.getElementById('createBtn');
  const rollCodeBtn = document.getElementById('rollCodeBtn');
  const nextBtn = document.getElementById('nextSlideBtn');
  const prevBtn = document.getElementById('prevSlideBtn');
  const launchQuizBtn = document.getElementById('launchQuizBtn');
  
  const startClassBtn = document.getElementById('startClassBtn');
  const endClassBtn = document.getElementById('endClassBtn');
  
  rollCodeBtn.addEventListener('click', () => {
    const num = Math.floor(100000 + Math.random() * 900000);
    document.getElementById('entryCodeInput').value = "LOPYTA" + num.toString().substring(0,4);
  });
  
  createBtn.addEventListener('click', async () => {
    const cName = document.getElementById('classNameInput').value.trim();
    const entryCode = document.getElementById('entryCodeInput').value.trim().toUpperCase();
    
    if (cName === "") {
      alert("Isi Nama Kelas!");
      return;
    }
    
    try {
      const response = await fetch('/api/teacher/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ className: cName, studentEntryCode: entryCode })
      });
      
      if (!response.ok) {
        const error = await response.json();
        alert("Gagal membuat kelas: " + error.error);
        return;
      }
      
      const session = await response.json();
      sessionCode = session.code;
      
      // Connect to WebSocket dynamically
      initSocket(() => {
        ws.send(encodePacket(MsgCreateClass, seqNum++, { code: session.code, className: cName, hostName: "", teacherId: currentTeacherID, studentEntryCode: session.studentEntryCode }));
        
        if (document.getElementById('overviewScreen')) document.getElementById('overviewScreen').style.display = 'none';
        document.getElementById('createScreen').style.display = 'none';
        document.getElementById('dashboardScreen').style.display = 'grid';
      });
    } catch (err) {
      alert("Koneksi gagal saat membuat sesi");
    }
  });
  
  startClassBtn.addEventListener('click', async () => {
    const response = await fetch('/api/class/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: sessionCode })
    });
    if (response.ok) {
      // Mulai kelas berhasil
      startClassBtn.style.display = 'none';
      endClassBtn.style.display = 'block';
    }
  });
  
  endClassBtn.addEventListener('click', async () => {
    if (!confirm("Apakah Anda yakin ingin mengakhiri sesi kelas? Semua siswa akan dikeluarkan secara otomatis.")) return;
    const response = await fetch('/api/class/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: sessionCode })
    });
    if (response.ok) {
      window.location.reload();
    }
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
    const duration = parseInt(document.getElementById('durationInput').value, 10);
    const multiplier = parseInt(document.getElementById('multiplierInput').value, 10);
    const correctSelect = document.getElementById('correctOptionInput');
    const correct = correctSelect.value.trim();
    
    const isQuiz = document.getElementById('hostQuestionOptionsPanel').style.display !== 'none';
    
    let options = [];
    if (isQuiz) {
      options = [
        document.getElementById('optA').value.trim(),
        document.getElementById('optB').value.trim(),
        document.getElementById('optC').value.trim(),
        document.getElementById('optD').value.trim()
      ];
      if (qText === "" || options[0] === "" || options[1] === "") {
        alert("Pertanyaan dan opsi A & B kuis wajib diisi!");
        return;
      }
    } else {
      // Code assignments
      if (qText === "" || correct === "") {
        alert("Pertanyaan tugas kodingan dan Expected Output wajib diisi!");
        return;
      }
    }
    
    ws.send(encodePacket(MsgSendQuestion, seqNum++, {
      code: sessionCode,
      questionText: qText,
      options: options,
      correctOption: correct,
      durationSeconds: duration,
      pointMultiplier: multiplier
    }));
  });
};

// --- Dynamic Student Dashboard bindings ---
const initStudentLogic = () => {
  isHost = false;
  
  const joinBtn = document.getElementById('joinBtn');
  
  joinBtn.addEventListener('click', () => {
    const code = document.getElementById('classCodeInput').value.trim().toUpperCase();
    const entryCode = document.getElementById('studentEntryCodeInput').value.trim();
    
    if (code === "" || entryCode === "") {
      alert("Kode Kelas dan Kode Khusus Siswa wajib diisi!");
      return;
    }
    
    let name = localStorage.getItem('student_name');
    if (!name) {
      name = "Siswa-" + Math.floor(1000 + Math.random() * 9000);
      localStorage.setItem('student_name', name);
    }
    
    studentName = name;
    studentEntryCode = entryCode; // Store globally
    document.getElementById('studentNameDisplay').textContent = name;
    
    initSocket(() => {
      ws.send(encodePacket(MsgJoinClass, seqNum++, { code: code, name: name, entryCode: entryCode }));
      
      document.getElementById('joinScreen').style.display = 'none';
      document.getElementById('classScreen').style.display = 'grid';
    });
  });
};

const switchHostSection = (section, pushState = true) => {
  const overview = document.getElementById('overviewScreen');
  const create = document.getElementById('createScreen');
  const dash = document.getElementById('dashboardScreen');
  
  if (overview) overview.style.display = section === 'dashboard' ? 'block' : 'none';
  if (create) create.style.display = (section === 'classes' || section === 'bank') ? 'grid' : 'none';
  if (dash) dash.style.display = section === 'live' ? 'grid' : 'none';
  
  // Update URL path using HTML5 History API (without hash #)
  if (pushState) {
    let url = "/host";
    if (section === "classes") url = "/host/classes";
    else if (section === "bank") url = "/host/bank";
    
    if (window.location.pathname !== url) {
      history.pushState(null, '', url);
    }
  }
  
  // Highlight active sidebar item
  const desktopBtns = {
    'dashboard': document.getElementById('nav-dashboard'),
    'classes': document.getElementById('nav-classes'),
    'bank': document.getElementById('nav-bank')
  };
  
  Object.keys(desktopBtns).forEach(k => {
    const btn = desktopBtns[k];
    if (btn) {
      if (k === section) {
        btn.className = "w-full flex items-center gap-3 px-sm py-2 rounded-lg font-body-md text-body-md text-primary bg-primary/5 font-semibold transition-colors duration-150";
        const icon = btn.querySelector('.material-symbols-outlined');
        if (icon) icon.classList.add('fill');
      } else {
        btn.className = "w-full flex items-center gap-3 px-sm py-2 rounded-lg font-body-md text-body-md text-on-surface-variant hover:bg-surface-container transition-colors duration-150";
        const icon = btn.querySelector('.material-symbols-outlined');
        if (icon) icon.classList.remove('fill');
      }
    }
  });

  // Highlight active mobile bottom navbar item
  const mobileBtns = {
    'dashboard': document.getElementById('mobile-nav-dashboard'),
    'classes': document.getElementById('mobile-nav-classes'),
    'bank': document.getElementById('mobile-nav-bank')
  };
  
  Object.keys(mobileBtns).forEach(k => {
    const btn = mobileBtns[k];
    if (btn) {
      if (k === section) {
        btn.className = "flex flex-col items-center justify-center text-[#059669] font-bold active:scale-95 duration-100 p-sm";
        const icon = btn.querySelector('.material-symbols-outlined');
        if (icon) icon.classList.add('fill');
      } else {
        btn.className = "flex flex-col items-center justify-center text-on-surface-variant active:scale-95 duration-100 p-sm";
        const icon = btn.querySelector('.material-symbols-outlined');
        if (icon) icon.classList.remove('fill');
      }
    }
  });
  
  if (section === 'classes') {
    switchMainTab('classes');
  } else if (section === 'bank') {
    switchMainTab('bank');
  }
};

window.switchHostSection = switchHostSection;
