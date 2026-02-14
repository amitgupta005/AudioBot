// DOM Elements
const chatMessages = document.getElementById("chat-messages");
const historyList = document.getElementById("history-list");
const textInput = document.getElementById("textInput");
const sendTextBtn = document.getElementById("sendText");
const voiceBtn = document.getElementById("voiceControl");
const voiceStatus = voiceBtn.querySelector(".voice-status");
const conversationIdDisplay = document.getElementById("conversationIdDisplay");
const tabBtns = document.querySelectorAll(".tab-btn");
const tabPanes = document.querySelectorAll(".tab-pane");
const clearHistoryBtn = document.getElementById("clearHistory");
const scrollToBottomBtn = document.getElementById("scrollToBottom");

// State
const INITIAL_GREETING = "Hello! I'm your interviewer for this meeting. Let's begin!";
const conversationId = "user-session-" + Math.floor(Math.random() * 1000);
conversationIdDisplay.textContent = conversationId;

let recorder;
let chunks = [];
let isRecording = false;

// WebSocket Setup
const ws = new WebSocket("ws://127.0.0.1:8000/ws");
ws.binaryType = "arraybuffer";

ws.onopen = () => console.log("✅ WebSocket connected");
ws.onerror = (err) => console.error("❌ WebSocket error", err);
ws.onclose = () => console.log("⚠️ WebSocket closed");

ws.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
        const blob = new Blob([event.data], { type: "audio/wav" });
        const audio = new Audio(URL.createObjectURL(blob));
        audio.play();
    } else {
        try {
            const data = JSON.parse(event.data);
            if (data.sender && data.text) {
                addMessage(data.sender, data.text);
            }
        } catch (e) {
            addMessage("AI", event.data);
        }
    }
};

// UI Functions
function scrollToBottom(force = false) {
    const isAtBottom = chatMessages.scrollHeight - chatMessages.scrollTop <= chatMessages.clientHeight + 150;
    if (force || isAtBottom) {
        chatMessages.scrollTo({
            top: chatMessages.scrollHeight,
            behavior: "smooth"
        });
    }
}

function addMessage(sender, text) {
    const isUser = sender === "You";
    const msgDiv = document.createElement("div");
    msgDiv.className = `message ${isUser ? 'user' : 'ai'}`;

    msgDiv.innerHTML = `
        <div class="bubble">${text}</div>
    `;

    chatMessages.appendChild(msgDiv);

    // Auto-scroll logic: Force scroll if AI is responding
    setTimeout(() => scrollToBottom(!isUser), 50);

    // Save to history
    saveToHistory(sender, text);
}

// Scroll Button Visibility
chatMessages.onscroll = () => {
    const isAtBottom = chatMessages.scrollHeight - chatMessages.scrollTop <= chatMessages.clientHeight + 150;
    if (isAtBottom) {
        scrollToBottomBtn.classList.remove("visible");
    } else {
        scrollToBottomBtn.classList.add("visible");
    }
};

scrollToBottomBtn.onclick = () => scrollToBottom(true);

function saveToHistory(sender, text) {
    const history = JSON.parse(localStorage.getItem("audiobot_history") || "[]");
    const item = {
        id: Date.now(),
        sender,
        text,
        date: new Date().toLocaleString()
    };
    history.unshift(item); // Newest first
    localStorage.setItem("audiobot_history", JSON.stringify(history.slice(0, 50))); // Keep last 50
    renderHistory();
}

function renderHistory() {
    const history = JSON.parse(localStorage.getItem("audiobot_history") || "[]");
    if (history.length === 0) {
        historyList.innerHTML = '<div class="empty-state">No history yet.</div>';
        return;
    }

    historyList.innerHTML = history.map(item => `
        <div class="history-item">
            <span class="history-date">${item.date} (${item.sender})</span>
            <p class="history-text">${item.text}</p>
        </div>
    `).join("");
}

// Tab Logic
tabBtns.forEach(btn => {
    btn.onclick = () => {
        const target = btn.dataset.tab;

        tabBtns.forEach(b => b.classList.remove("active"));
        tabPanes.forEach(p => p.classList.remove("active"));

        btn.classList.add("active");
        document.getElementById(`${target}-view`).classList.add("active");

        if (target === "history") renderHistory();
    };
});

clearHistoryBtn.onclick = () => {
    localStorage.setItem("audiobot_history", "[]");
    renderHistory();
};

// Controls
function sendMessage() {
    const text = textInput.value.trim();
    if (!text) return;

    addMessage("You", text);

    ws.send(JSON.stringify({
        type: "text",
        conversation_id: conversationId,
        message: text
    }));

    textInput.value = "";
}

sendTextBtn.onclick = sendMessage;

textInput.onkeydown = (e) => {
    if (e.key === "Enter") sendMessage();
};

// Voice Recording
async function toggleRecording() {
    if (!isRecording) {
        // Start
        chunks = [];
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            recorder = new MediaRecorder(stream);
            recorder.ondataavailable = e => chunks.push(e.data);
            recorder.onstop = sendAudio;

            recorder.start();
            isRecording = true;
            voiceBtn.classList.add("recording");
            voiceStatus.textContent = "Recording... Click to Stop";
        } catch (err) {
            console.error("Mic access denied", err);
            alert("Please allow microphone access");
        }
    } else {
        // Stop
        recorder.stop();
        isRecording = false;
        voiceBtn.classList.remove("recording");
        voiceStatus.textContent = "Processing...";
        setTimeout(() => {
            if (!isRecording) voiceStatus.textContent = "Press to Record";
        }, 2000);
    }
}

async function sendAudio() {
    if (chunks.length === 0) return;
    const blob = new Blob(chunks, { type: "audio/wav" });
    const buffer = await blob.arrayBuffer();

    ws.send(JSON.stringify({
        type: "audio",
        conversation_id: conversationId
    }));

    ws.send(buffer);
}

voiceBtn.onclick = toggleRecording;

// Initial Render
renderHistory();
addMessage("AI", INITIAL_GREETING);
