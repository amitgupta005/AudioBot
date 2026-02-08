const chat = document.getElementById("chat");
const textInput = document.getElementById("textInput");

// const ws = new WebSocket("ws://localhost:8000/ws");
const ws = new WebSocket("ws://127.0.0.1:8000/ws");
ws.binaryType = "arraybuffer";

const conversationId = "user-session-1"; // later auto-generated

ws.onopen = () => {
    console.log("✅ WebSocket connected");
};

ws.onerror = (err) => {
    console.error("❌ WebSocket error", err);
};

ws.onclose = () => {
    console.log("⚠️ WebSocket closed");
};


ws.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
        const blob = new Blob([event.data], { type: "audio/wav" });
        const audio = new Audio(URL.createObjectURL(blob));
        audio.play();
    } else {
        addMessage("AI", event.data);
    }
};

function addMessage(sender, text) {
    const div = document.createElement("div");
    div.className = "message";
    div.innerHTML = `<span class="${sender === "You" ? "user" : "ai"}">${sender}:</span> ${text}`;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

document.getElementById("sendText").onclick = () => {
    const text = textInput.value;
    if (!text) return;

    addMessage("You", text);

    ws.send(JSON.stringify({
        type: "text",
        conversation_id: conversationId,
        message: text
    }));

    textInput.value = "";
};

let recorder;
let chunks = [];

document.getElementById("startVoice").onclick = async () => {
    chunks = [];
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recorder = new MediaRecorder(stream);
    recorder.start();
    recorder.ondataavailable = e => chunks.push(e.data);
};

document.getElementById("stopVoice").onclick = async () => {
    recorder.stop();

    recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/wav" });
        const buffer = await blob.arrayBuffer();

        ws.send(JSON.stringify({
            type: "audio",
            conversation_id: conversationId
        }));

        ws.send(buffer);
    };
};
