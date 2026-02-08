const chatArea = document.getElementById('chatArea');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const connectionStatus = document.getElementById('connectionStatus');

let socket;
let isConnected = false;

// Connect to WebSocket
function connect() {
    socket = new WebSocket('ws://localhost:8000/ws');

    socket.onopen = () => {
        isConnected = true;
        updateStatus(true);
        sendButton.disabled = false;
        console.log("Connected to WebSocket");
    };

    socket.onmessage = (event) => {
        removeTypingIndicator();
        addMessage(event.data, 'bot');
    };

    socket.onclose = () => {
        isConnected = false;
        updateStatus(false);
        sendButton.disabled = true;
        console.log("Disconnected. Retrying in 3s...");
        setTimeout(connect, 3000);
    };

    socket.onerror = (error) => {
        console.error("WebSocket Error:", error);
    };
}

function updateStatus(connected) {
    if (connected) {
        connectionStatus.className = 'status-indicator connected';
        connectionStatus.querySelector('.text').textContent = 'Live';
    } else {
        connectionStatus.className = 'status-indicator disconnected';
        connectionStatus.querySelector('.text').textContent = 'Offline';
    }
}

function addMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', sender);

    const bubble = document.createElement('div');
    bubble.classList.add('bubble');
    bubble.textContent = text; // Text content prevents XSS

    const time = document.createElement('div');
    time.classList.add('timestamp');
    time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    messageDiv.appendChild(bubble);
    messageDiv.appendChild(time);
    chatArea.appendChild(messageDiv);

    // Remove welcome message if it exists
    const welcome = document.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    scrollToBottom();
}

function addTypingIndicator() {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'bot', 'typing-message');
    
    const bubble = document.createElement('div');
    bubble.classList.add('bubble', 'typing-indicator');
    bubble.innerHTML = '<span></span><span></span><span></span>';
    
    messageDiv.appendChild(bubble);
    chatArea.appendChild(messageDiv);
    scrollToBottom();
}

function removeTypingIndicator() {
    const typingMsg = document.querySelector('.typing-message');
    if (typingMsg) typingMsg.remove();
}

function scrollToBottom() {
    chatArea.scrollTop = chatArea.scrollHeight;
}

function sendMessage() {
    const text = messageInput.value.trim();
    if (text && isConnected) {
        addMessage(text, 'user');
        addTypingIndicator();
        socket.send(text);
        messageInput.value = '';
    }
}

// Event Listeners
sendButton.addEventListener('click', sendMessage);

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Initial Connection
connect();
