// FINAL CODE (ACKNOWLEDGMENT FILE TRANSFER + LOGIC FIX + UI FIX + DUPLICATE DECLARATION FIX)

// --- DOM Elements ---
const welcomeScreen = document.getElementById('welcomeScreen');
const nameInput = document.getElementById('nameInput');
const continueBtn = document.getElementById('continueBtn');
const loadingConfig = document.getElementById('loadingConfig');

const homeScreen = document.getElementById('homeScreen');
const welcomeMessage = document.getElementById('welcomeMessage');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomInput = document.getElementById('joinRoomInput');
const joinRoomBtn = document.getElementById('joinRoomBtn');

const roomScreen = document.getElementById('roomScreen');
const videoContainer = document.getElementById('videoContainer');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const remoteVideoPlaceholder = document.getElementById('remoteVideoPlaceholder');
const animationContainer = document.getElementById('animationContainer'); 
const localVideoContainer = document.getElementById('localVideoContainer');

const controlsContainer = document.getElementById('controlsContainer');
const muteBtn = document.getElementById('muteBtn');
const videoBtn = document.getElementById('videoBtn');
const switchCameraBtn = document.getElementById('switchCameraBtn');
const screenShareBtn = document.getElementById('screenShareBtn');
const recordBtn = document.getElementById('recordBtn');
const hangupBtn = document.getElementById('hangupBtn');

const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const shareBtn = document.getElementById('shareBtn');

const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');
const fileInput = document.getElementById('fileInput');
const attachFileBtn = document.getElementById('attachFileBtn');

const shareModal = document.getElementById('shareModal');
const shareUrl = document.getElementById('shareUrl');
const copyUrlBtn = document.getElementById('copyUrlBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const qrcodeDiv = document.getElementById('qrcode');

const tooltip = document.getElementById('tooltip');
const peerStatus = document.getElementById('peerStatus');
const peerVideoStatus = document.getElementById('peerVideoStatus');
const peerAudioStatus = document.getElementById('peerAudioStatus');

const callInfoContainer = document.getElementById('callInfoContainer');

// --- Global Variables ---
let currentStream;
let remoteStream;
let peerConnection;
let dataChannel;
let roomId;
let userName = 'Guest';
let facingMode = 'user';
let db;
let isRoomCreator = false;
let isScreenSharing = false;
let screenStream;
let callTimerInterval;
let callStartTime;
let remoteUserName = 'Peer';
let networkStatsInterval;
let tooltipTimer;
let shortPin;

// Recording Variables
let mediaRecorder;
let recordedChunks = [];
let isRecording = false;

// Speaking Indicator
let audioContext, analyser, source, dataArray, speakingTimer;

// Listeners
let unsubscribeRoom;
let unsubscribeOfferCandidates;
let unsubscribeAnswerCandidates;

// Markers - DECLARED ONCE (GLOBALLY)
const M_JSON = 1; // For Chat, Events, Reactions, File Meta
const M_CHUNK = 2; // For File Chunks

// File Transfer Globals
const CHUNK_SIZE = 16384; // 16KB
const MAX_BUFFER_SIZE = 262144; // 256KB
let receiveBuffer = [];
let receivedFileSize = 0;
let fileInProgress = null;
let isSendingFile = false;
let currentSendChunkListener = null; 
let pendingChunks = [];

// Acknowledgment state (Sender-side)
let waitingForAck = false;
let currentFileBuffer = null;
let currentFileMetadata = null;

// Google ke free STUN servers
const servers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', fetchConfigAndInitialize);

async function fetchConfigAndInitialize() {
    try {
        const response = await fetch('/.netlify/functions/config');
        if (!response.ok) {
            throw new Error('Failed to fetch config. Make sure Netlify env vars are set.');
        }
        const firebaseConfig = await response.json();
        
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();

        loadingConfig.innerText = 'Config loaded. Please enter your name.';
        continueBtn.disabled = false;
        continueBtn.onclick = setupWelcomeScreen;

    } catch (error) {
        console.error(error);
        loadingConfig.innerText = error.message;
        loadingConfig.classList.add('text-red-500');
    }
}

function setupWelcomeScreen() {
    userName = nameInput.value.trim() || 'Guest';
    welcomeMessage.innerText = `Welcome, ${userName}!`;
    
    welcomeScreen.classList.add('hidden');
    homeScreen.classList.remove('hidden');

    initHome();
    checkUrlForRoom();
}

function initHome() {
    createRoomBtn.onclick = createRoom;
    joinRoomBtn.onclick = () => joinRoom(joinRoomInput.value);
    
    muteBtn.onclick = toggleAudio;
    videoBtn.onclick = toggleVideo;
    switchCameraBtn.onclick = switchCamera;
    screenShareBtn.onclick = toggleScreenShare;
    recordBtn.onclick = toggleRecording;
    hangupBtn.onclick = hangUp;

    sendChatBtn.onclick = sendChatMessage;
    chatInput.onkeydown = (e) => {
        if (e.key === 'Enter') sendChatMessage();
    };

    attachFileBtn.onclick = () => fileInput.click();
    fileInput.onchange = onFileSelected;

    shareBtn.onclick = showShareModal;
    closeModalBtn.onclick = () => shareModal.classList.add('hidden');
    copyUrlBtn.onclick = copyShareUrl;

    document.getElementById('react-thumbsup').onclick = () => sendReaction('👍');
    document.getElementById('react-heart').onclick = () => sendReaction('❤️');
    document.getElementById('react-laugh').onclick = () => sendReaction('😂');
    document.getElementById('react-clap').onclick = () => sendReaction('👏');
}

function checkUrlForRoom() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');
    if (roomFromUrl) {
        console.log('Room ID in URL found, but PIN system is active. Please enter PIN.');
    }
}

// --- Tooltip Function ---
function showTooltip(message, type = 'success') {
    const tooltip = document.getElementById('tooltip'); 
    if (!tooltip) {
        console.error("Tooltip element not found!");
        return;
    }
    
    tooltip.innerText = message;
    
    if (tooltipTimer) clearTimeout(tooltipTimer);

    if (type === 'error') {
        tooltip.style.backgroundColor = '#ef4444';
    } else {
        tooltip.style.backgroundColor = '#22c55e';
    }

    tooltip.classList.add('tooltip-visible');

    tooltipTimer = setTimeout(() => {
        tooltip.classList.remove('tooltip-visible');
    }, 3000);
}

// --- Helper Function ---
function generatePin() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// --- Core Functions ---
async function startMedia() {
    if (currentStream) { 
        currentStream.getTracks().forEach(track => track.stop());
    }

    try {
        currentStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: facingMode },
            audio: true 
        });
        localVideo.srcObject = currentStream;
        checkCameraDevices();
        setupAudioAnalysis();
    } catch (e) {
        console.error('Error accessing media devices.', e);
        alert('Could not access camera or mic.');
    }
}

async function checkCameraDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        if (videoDevices.length > 1) {
            switchCameraBtn.classList.remove('hidden');
        }
    } catch (e) {
        console.error('Error enumerating devices:', e);
    }
}

async function switchCamera() {
    facingMode = (facingMode === 'user') ? 'environment' : 'user';
    await startMedia();

    if (peerConnection) {
        const videoTrack = currentStream.getVideoTracks()[0];
        const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
        if (sender) {
            await sender.replaceTrack(videoTrack);
            showTooltip('Camera switched', 'success');
            sendEventMessage('event', { type: 'camera_switch' });
        }
    }
}

async function createRoom() {
    await startMedia(); 
    setupRoomUI();
    isRoomCreator = true; 
    
    shortPin = generatePin();
    const pinRef = db.collection('activePins').doc(shortPin);

    const roomRef = await db.collection('rooms').add({});
    roomId = roomRef.id;
    
    await pinRef.set({
        roomId: roomId,
        createdAt: firebase.firestore.FieldValue.serverTimestamp() 
    });
    
    roomCodeDisplay.value = shortPin;
    updateShareModal(roomId);

    const offerCandidates = roomRef.collection('offerCandidates');
    const answerCandidates = roomRef.collection('answerCandidates');

    peerConnection = new RTCPeerConnection(servers);

    peerConnection.onconnectionstatechange = (event) => {
        if (peerConnection.connectionState === 'disconnected' ||
            peerConnection.connectionState === 'failed' ||
            peerConnection.connectionState === 'closed') {
            setTimeout(() => hangUp(), 2000);
        }
    };

    currentStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, currentStream);
    });

    dataChannel = peerConnection.createDataChannel('chat');
    dataChannel.binaryType = 'arraybuffer';
    setupDataChannelEvents(dataChannel);

    peerConnection.ontrack = (event) => {
        remoteStream = event.streams[0];
        remoteVideo.srcObject = remoteStream;
        remoteVideoPlaceholder.classList.add('hidden');
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            offerCandidates.add(event.candidate.toJSON());
        }
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    
    await roomRef.set({ offer: { sdp: offer.sdp, type: offer.type } });
    console.log('Room created with PIN:', shortPin, 'Actual ID:', roomId);

    unsubscribeRoom = roomRef.onSnapshot(async (snapshot) => {
        const data = snapshot.data();
        if (peerConnection && !peerConnection.currentRemoteDescription && data?.answer) {
            const answerDescription = new RTCSessionDescription(data.answer);
            await peerConnection.setRemoteDescription(answerDescription);
        }
    });

    unsubscribeAnswerCandidates = answerCandidates.onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                const candidate = new RTCIceCandidate(change.doc.data());
                peerConnection.addIceCandidate(candidate);
            }
        });
    });
}

async function joinRoom(pin) {
    if (!pin || pin.length !== 6) {
        alert('Please enter a valid 6-digit PIN.');
        return;
    }

    let actualRoomId;
    try {
        const pinRef = db.collection('activePins').doc(pin);
        const pinDoc = await pinRef.get();
        if (!pinDoc.exists) {
            alert('PIN does not exist or has expired.');
            return;
        }
        actualRoomId = pinDoc.data().roomId;
    } catch (error) {
        console.error('Error looking up PIN:', error);
        alert('Could not find room.');
        return;
    }

    roomId = actualRoomId;
    await startMedia();
    setupRoomUI();
    isRoomCreator = false; 
    
    document.getElementById('roomCodeSection').style.display = 'none';
    console.log('Joining room:', roomId);

    const roomRef = db.collection('rooms').doc(roomId);
    const roomDoc = await roomRef.get();

    if (!roomDoc.exists) {
        alert('Room does not exist.');
        hangUp();
        return;
    }

    peerConnection = new RTCPeerConnection(servers);

    peerConnection.onconnectionstatechange = (event) => {
        if (peerConnection.connectionState === 'disconnected' ||
            peerConnection.connectionState === 'failed' ||
            peerConnection.connectionState === 'closed') {
            setTimeout(() => hangUp(), 2000);
        }
    };

    currentStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, currentStream);
    });

    peerConnection.ontrack = (event) => {
        remoteStream = event.streams[0];
        remoteVideo.srcObject = remoteStream;
        remoteVideoPlaceholder.classList.add('hidden');
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            roomRef.collection('answerCandidates').add(event.candidate.toJSON());
        }
    };

    peerConnection.ondatachannel = (event) => {
        dataChannel = event.channel;
        dataChannel.binaryType = 'arraybuffer';
        setupDataChannelEvents(dataChannel);
    };

    const offer = roomDoc.data().offer;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    await roomRef.update({ answer: { sdp: answer.sdp, type: answer.type } });
    console.log('Joined room and sent answer');

    unsubscribeOfferCandidates = roomRef.collection('offerCandidates').onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                const candidate = new RTCIceCandidate(change.doc.data());
                peerConnection.addIceCandidate(candidate);
            }
        });
    });
}


// --- Data Channel (Chat, Events, Files) Functions ---

function setupDataChannelEvents(channel) {
    channel.onopen = () => {
        console.log('Data channel open');
        chatInput.disabled = false;
        sendChatBtn.disabled = false;
        fileInput.disabled = false;
        attachFileBtn.disabled = false;
        
        startCallTimer(); 
        startNetworkMonitoring();
        sendEventMessage('hello', {});
    };
    
    channel.onclose = () => {
        console.log('Data channel closed');
        chatInput.disabled = true;
        sendChatBtn.disabled = true;
        fileInput.disabled = true;
        attachFileBtn.disabled = true;
        
        showTooltip(`${remoteUserName} disconnected.`, 'error');
        stopNetworkMonitoring();
        if (audioContext && audioContext.state !== 'closed') {
            audioContext.close();
        }
        
        peerStatus.classList.add('hidden');
        peerVideoStatus.classList.add('hidden');
        peerAudioStatus.classList.add('hidden');
    };
    
    channel.onmessage = (event) => {
        if (!(event.data instanceof ArrayBuffer)) {
            console.warn('Received non-ArrayBuffer message. Ignoring.');
            return;
        }

        try {
            const data = event.data;
            const marker = new Uint8Array(data, 0, 1)[0];
            const buffer = data.slice(1);

            if (marker === M_JSON) {
                const string = new TextDecoder().decode(buffer);
                const json = JSON.parse(string);
                
                if (json.type === 'hello') {
                    remoteUserName = json.sender;
                    showTooltip(`${remoteUserName} connected!`, 'success');
                } else if (json.type === 'chat') {
                    displayChatMessage(json.payload.text, json.sender);
                } else if (json.type === 'status') {
                    handlePeerStatus(json.payload.media, json.payload.enabled);
                } else if (json.type === 'event') {
                    handleEvent(json.payload);
                } else if (json.type === 'reaction') { 
                    showFloatingEmoji(json.payload.emoji);
                } else if (json.type === 'file') {
                    handleFileEvent(json.payload, json.sender);
                } else if (json.type === 'file_ack') {
                    handleFileAcknowledgment(json.payload);
                }
                
            } else if (marker === M_CHUNK) {
                handleFileChunk(buffer);
            } else {
                console.warn('Received message with unknown marker:', marker);
            }

        } catch (error) {
            console.error('Error parsing message:', error);
        }
    };
}

function handleEvent(payload) {
    if (payload.type === 'camera_switch') {
        showTooltip(`${remoteUserName} switched camera`, 'success');
    } else if (payload.type === 'screen_share_on') {
        showTooltip(`${remoteUserName} started sharing screen`, 'success');
    } else if (payload.type === 'screen_share_off') {
        showTooltip(`${remoteUserName} stopped sharing screen`, 'success');
    } else if (payload.type === 'speaking') {
        remoteVideo.classList.add('speaking');
    } else if (payload.type === 'stopped_speaking') {
        remoteVideo.classList.remove('speaking');
    }
}

function sendEventMessage(type, payload) {
    if (dataChannel && dataChannel.readyState === 'open') {
        const data = {
            type: type,
            sender: userName,
            payload: payload
        };
        
        try {
            const string = JSON.stringify(data);
            const buffer = new TextEncoder().encode(string);
            
            const finalBuffer = new Uint8Array(1 + buffer.length);
            finalBuffer[0] = M_JSON;
            finalBuffer.set(buffer, 1);
            
            dataChannel.send(finalBuffer);
        } catch (error) {
            console.error('Error encoding event message:', error);
        }
    }
}

function handlePeerStatus(media, enabled) {
    if (media === 'video') peerVideoStatus.classList.toggle('hidden', enabled);
    else if (media === 'audio') peerAudioStatus.classList.toggle('hidden', enabled);
    const isVideoOff = !peerVideoStatus.classList.contains('hidden');
    const isAudioOff = !peerAudioStatus.classList.contains('hidden');
    peerStatus.classList.toggle('hidden', !isVideoOff && !isAudioOff);
}

function sendChatMessage() {
    const message = chatInput.value;
    if (message.trim() === '') return;
    
    sendEventMessage('chat', { text: message }); 
    
    displayChatMessage(message, 'You');
    chatInput.value = '';
}

function displayChatMessage(message, sender) {
    if (typeof message === 'undefined') {
        console.error('displayChatMessage received undefined message');
        return;
    }
    
    let progressId = null;
    if (message.startsWith('file-progress-')) {
         const parts = message.split(' ');
         if (parts.length > 0) {
            progressId = parts[0];
         }
    }

    const msgDiv = document.createElement('div');
    msgDiv.classList.add('p-2', 'rounded-lg', 'max-w-xs');
    
    if (sender === 'You') {
        msgDiv.classList.add('bg-blue-600', 'text-white', 'self-end', 'ml-auto');
    } else {
        msgDiv.classList.add('bg-gray-600', 'text-white', 'self-start', 'mr-auto');
    }

    if (sender === 'System') {
         msgDiv.classList.add('bg-purple-600', 'self-center', 'text-center');
    }

    if (progressId) {
        msgDiv.id = progressId;
        const readableMessage = message.substring(progressId.length + 1);
        if (sender === 'You') {
            msgDiv.innerHTML = `You: ${readableMessage}`;
        } else if (sender === 'System') {
            msgDiv.innerHTML = `${readableMessage}`;
        } else {
            msgDiv.innerHTML = `<span class="font-bold">${sender}:</span> ${readableMessage}`;
        }
    } else {
        if (sender === 'You') {
            msgDiv.innerHTML = `<span class="font-bold">You:</span> ${message}`;
        } else if (sender === 'System') {
             msgDiv.innerHTML = `<span class="font-bold">${message}</span>`;
        } else {
            msgDiv.innerHTML = `<span class="font-bold">${sender}:</span> ${message}`;
        }
    }

    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// --- UI & Control Functions ---
function setupRoomUI() {
    homeScreen.classList.add('hidden');
    roomScreen.classList.remove('hidden');
    
    chatInput.disabled = true;
    sendChatBtn.disabled = true;
    fileInput.disabled = true;
    attachFileBtn.disabled = true; 
    
    remoteVideoPlaceholder.classList.remove('hidden');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        console.log('Screen sharing not supported on this device.');
        screenShareBtn.style.display = 'none';
    }
}

function updateShareModal(id) {
    const url = `${window.location.origin}${window.location.pathname}?room=${id}`;
    shareUrl.value = url;
    qrcodeDiv.innerHTML = '';
    new QRCode(qrcodeDiv, { text: url, width: 192, height: 192 });
}

function toggleAudio() {
    const audioTrack = currentStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    
    const enabled = audioTrack.enabled;
    muteBtn.innerHTML = enabled ? '🔇' : '🎤';
    muteBtn.classList.toggle('bg-blue-600', enabled);
    muteBtn.classList.toggle('bg-gray-600', !enabled);

    showTooltip(enabled ? 'Unmuted' : 'You are muted', 'success');
    sendEventMessage('status', { media: 'audio', enabled: enabled });

    if (!enabled) {
        localVideoContainer.classList.remove('speaking');
        sendEventMessage('event', { type: 'stopped_speaking' });
    }
}

function toggleVideo() {
    const videoTrack = currentStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
    
    const enabled = videoTrack.enabled;
    videoBtn.innerHTML = enabled ? '🔹' : '🚫';
    videoBtn.classList.toggle('bg-blue-600', enabled);
    videoBtn.classList.toggle('bg-gray-600', !enabled);

    showTooltip(enabled ? 'Camera On' : 'Camera Off', 'success');
    sendEventMessage('status', { media: 'video', enabled: enabled });
}

async function toggleScreenShare() {
    if (!isScreenSharing) {
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            const screenTrack = screenStream.getVideoTracks()[0];
            
            if (peerConnection) {
                const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
                if (sender) {
                    await sender.replaceTrack(screenTrack);
                }
            }

            isScreenSharing = true;
            screenShareBtn.classList.add('bg-blue-600');
            screenShareBtn.classList.remove('bg-gray-600');
            
            showTooltip('Started screen sharing', 'success');
            sendEventMessage('event', { type: 'screen_share_on' });
            
            screenTrack.onended = () => {
                stopScreenShare();
            };

        } catch (error) {
            console.error('Error starting screen share:', error);
            showTooltip('Could not start screen share', 'error');
        }
    } else {
        await stopScreenShare();
    }
}

async function stopScreenShare() {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
    }

    if (currentStream && peerConnection) {
        const videoTrack = currentStream.getVideoTracks()[0];
        const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
        if (sender) {
            await sender.replaceTrack(videoTrack);
        }
    }
    
    showTooltip('Stopped screen sharing', 'success');
    sendEventMessage('event', { type: 'screen_share_off' });
    
    isScreenSharing = false;
    screenShareBtn.classList.remove('bg-blue-600');
    screenShareBtn.classList.add('bg-gray-600');
}

function startCallTimer() {
    callInfoContainer.classList.remove('hidden');
    callStartTime = Date.now();

    callTimerInterval = setInterval(() => {
        const secondsElapsed = Math.floor((Date.now() - callStartTime) / 1000);
        document.getElementById('callTimer').innerText = formatTime(secondsElapsed);
    }, 1000);
}

function stopCallTimer() {
    callInfoContainer.classList.add('hidden');
    if (callTimerInterval) {
        clearInterval(callTimerInterval);
    }
}

function formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    totalSeconds %= 3600;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map(v => (v < 10 ? "0" + v : v)).join(":");
}

function startNetworkMonitoring() {
    networkStatsInterval = setInterval(async () => {
        if (!peerConnection) return;
        try {
            const stats = await peerConnection.getStats();
            let roundTripTime = 0, frameHeight = 0; 
            stats.forEach(report => {
                if (report.type === 'remote-inbound-rtp' && report.roundTripTime) {
                    roundTripTime = report.roundTripTime * 1000;
                }
                if (report.type === 'inbound-rtp' && report.kind === 'video' && report.frameHeight) {
                    frameHeight = report.frameHeight;
                }
            });

            const icon = document.getElementById('networkIcon');
            const speedText = document.getElementById('networkSpeed');
            speedText.innerText = `${roundTripTime.toFixed(0)} ms`;
            if (roundTripTime < 150) icon.className = 'net-good';
            else if (roundTripTime < 300) icon.className = 'net-medium';
            else icon.className = 'net-bad';

            const qualityLabel = document.getElementById('qualityLabel');
            if (frameHeight > 0) qualityLabel.innerText = `${frameHeight}p`;
            else qualityLabel.innerText = '--p';
        } catch (error) {
            console.warn('Could not get network stats:', error);
        }
    }, 3000);
}

function stopNetworkMonitoring() {
    if (networkStatsInterval) {
        clearInterval(networkStatsInterval);
    }
}

function toggleRecording() {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

function startRecording() {
    if (!remoteStream) {
        showTooltip('Wait for the other user to join', 'error');
        return;
    }
    recordedChunks = [];
    const combinedStream = new MediaStream([ ...currentStream.getTracks(), ...remoteStream.getTracks() ]);
    try {
        mediaRecorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm; codecs=vp9,opus' });
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) recordedChunks.push(event.data);
        };
        mediaRecorder.onstop = downloadRecording;
        mediaRecorder.start();
        isRecording = true;
        recordBtn.classList.add('bg-red-600');
        recordBtn.classList.remove('bg-gray-600');
        showTooltip('Recording started', 'success');
    } catch (error) {
        console.error('Error starting recording:', error);
        showTooltip('Could not start recording', 'error');
    }
}

function stopRecording() {
    if (mediaRecorder) {
        mediaRecorder.stop();
        isRecording = false;
        recordBtn.classList.remove('bg-red-600');
        recordBtn.classList.add('bg-gray-600');
        showTooltip('Recording stopped', 'success');
    }
}

function downloadRecording() {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    document.body.appendChild(a);
    a.style = 'display: none';
    a.href = url;
    a.download = `call-recording-${new Date().getTime()}.webm`;
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    recordedChunks = [];
}

function sendReaction(emoji) {
    sendEventMessage('reaction', { emoji: emoji });
}

function showFloatingEmoji(emoji) {
    const emojiSpan = document.createElement('span');
    emojiSpan.innerText = emoji;
    emojiSpan.className = 'floating-emoji';
    emojiSpan.style.left = (Math.random() * 80 + 10) + '%';
    animationContainer.appendChild(emojiSpan);
    emojiSpan.onanimationend = () => {
        emojiSpan.remove();
    };
}

function setupAudioAnalysis() {
    if (audioContext && audioContext.state !== 'closed') audioContext.close();
    if (!currentStream || currentStream.getAudioTracks().length === 0) {
        console.warn('No audio track to analyze.');
        return;
    }
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    source = audioContext.createMediaStreamSource(currentStream);
    source.connect(analyser);
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
    checkMicVolume();
}

function checkMicVolume() {
    if (!analyser) return;
    
    if (!currentStream || !currentStream.getAudioTracks()[0] || !currentStream.getAudioTracks()[0].enabled) {
        localVideoContainer.classList.remove('speaking');
        if (speakingTimer) clearTimeout(speakingTimer);
        speakingTimer = null;
        requestAnimationFrame(checkMicVolume);
        return;
    }
    
    analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for(let i = 0; i < dataArray.length; i++) sum += dataArray[i];
    const avg = sum / dataArray.length;

    if (avg > 30) { 
        if (!localVideoContainer.classList.contains('speaking')) {
            localVideoContainer.classList.add('speaking');
            sendEventMessage('event', { type: 'speaking' });
        }
        clearTimeout(speakingTimer);
        speakingTimer = setTimeout(() => {
            localVideoContainer.classList.remove('speaking');
            sendEventMessage('event', { type: 'stopped_speaking' });
            speakingTimer = null;
        }, 1000);
    }
    requestAnimationFrame(checkMicVolume);
}

// ===== FILE SHARING FUNCTIONS =====

function getSanitizedId(fileName) {
    return `file-progress-${fileName.replace(/[^a-z0-9]/gi, '_')}`;
}

function sendFileMetadata(payload) {
    try {
        const metaString = JSON.stringify(payload);
        const metaBuffer = new TextEncoder().encode(metaString);
        
        const finalBuffer = new Uint8Array(1 + metaBuffer.byteLength);
        finalBuffer[0] = M_JSON;
        finalBuffer.set(metaBuffer, 1);
        
        dataChannel.send(finalBuffer);
    } catch (error) {
        console.error('Error sending metadata:', error);
    }
}

function onFileSelected(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    console.log("File selected:", file.name);
    
    if (file.size > 100 * 1024 * 1024) {
        showTooltip('File is too large (max 100MB)', 'error');
        return;
    }
    
    if (!dataChannel || dataChannel.readyState !== 'open') {
        showTooltip('Connection not ready. Wait for peer.', 'error');
        return;
    }
    
    if (fileInProgress || waitingForAck) {
        showTooltip('Another file transfer is in progress.', 'error');
        return;
    }
    
    currentFileMetadata = { 
        name: file.name, 
        size: file.size, 
        type: file.type 
    };
    
    const progressId = getSanitizedId(file.name);
    displayChatMessage(`${progressId} Preparing ${file.name}...`, 'You');
    
    const fileReader = new FileReader();
    fileReader.onload = (event) => {
        currentFileBuffer = event.target.result;
        console.log('File buffer ready. Sending metadata...');
        
        sendFileMetadata({ 
            type: 'start', 
            name: file.name,
            size: file.size,
            fileType: file.type
        });
        
        waitingForAck = true;
        fileInProgress = currentFileMetadata;
        
        setTimeout(() => {
            if (waitingForAck) {
                console.error('No ACK received from receiver. Aborting transfer.');
                showTooltip('Receiver did not respond. Transfer cancelled.', 'error');
                resetFileSendState();
            }
        }, 5000);
    };
    
    fileReader.onerror = (error) => {
        console.error('File read error:', error);
        showTooltip('Failed to read file', 'error');
        resetFileSendState();
    };
    
    fileReader.readAsArrayBuffer(file);
    fileInput.value = null;
}

function handleFileAcknowledgment(payload) {
    if (!waitingForAck || !currentFileBuffer || !currentFileMetadata) {
        console.warn('Received unexpected ACK');
        return;
    }
    
    if (payload.fileName !== currentFileMetadata.name) {
        console.warn('ACK filename mismatch');
        return;
    }
    
    console.log('ACK received. Starting chunk send...');
    waitingForAck = false;
    
    startFileSend(currentFileBuffer, currentFileMetadata);
}

function resetFileSendState() {
    waitingForAck = false;
    currentFileBuffer = null;
    currentFileMetadata = null;
    fileInProgress = null;
    isSendingFile = false;
}

function startFileSend(buffer, file) {
    if (!dataChannel || dataChannel.readyState !== 'open') {
        showTooltip('Connection lost', 'error');
        resetFileSendState();
        return;
    }
    
    dataChannel.bufferedAmountLowThreshold = CHUNK_SIZE * 5;
    
    let offset = 0;
    let lastProgressUpdate = 0;
    
    currentSendChunkListener = () => {
        
        while (offset < buffer.byteLength && dataChannel.bufferedAmount < MAX_BUFFER_SIZE) {
            const chunk = buffer.slice(offset, offset + CHUNK_SIZE);
            
            const finalBuffer = new Uint8Array(1 + chunk.byteLength);
            finalBuffer[0] = M_CHUNK;
            finalBuffer.set(new Uint8Array(chunk), 1);

            try {
                dataChannel.send(finalBuffer);
                offset += chunk.byteLength;
                
                const percent = Math.floor((offset / buffer.byteLength) * 100);
                if (percent >= lastProgressUpdate + 5 || percent === 100) {
                    updateFileProgress(file.name, `Sending ${file.name} (${percent}%)`, 'You');
                    lastProgressUpdate = percent;
                }
                
            } catch (error) {
                console.error('Send error:', error);
                showTooltip('File send failed', 'error');
                resetFileSendState();
                if (dataChannel) dataChannel.removeEventListener('bufferedamountlow', currentSendChunkListener);
                currentSendChunkListener = null; 
                return;
            }
        }
        
        if (offset >= buffer.byteLength) {
            console.log('File transfer complete');
            sendFileMetadata({ type: 'end', name: file.name });
            
            updateFileProgress(file.name, `Sent: ${file.name}`, 'You');
            resetFileSendState();
            
            if (dataChannel) dataChannel.removeEventListener('bufferedamountlow', currentSendChunkListener);
            currentSendChunkListener = null; 
            return;
        }
    };
    
    dataChannel.addEventListener('bufferedamountlow', currentSendChunkListener);
    
    isSendingFile = true;
    
    currentSendChunkListener();
}

function handleFileChunk(chunk) {
    if (!fileInProgress) {
        console.warn('Received chunk before metadata. Buffering...');
        pendingChunks.push(chunk);
        return;
    }
    
    receiveBuffer.push(chunk);
    receivedFileSize += chunk.byteLength;
    
    const percent = fileInProgress.size > 0 ? Math.floor((receivedFileSize / fileInProgress.size) * 100) : 0;
    const lastPercent = fileInProgress.size > 0 ? Math.floor(((receivedFileSize - chunk.byteLength) / fileInProgress.size) * 100) : 0;
    
    if (percent >= lastPercent + 5 || percent === 100 || percent === 0) {
        updateFileProgress(fileInProgress.name, `Receiving ${fileInProgress.name} (${percent}%)`, 'System');
    }
}

function handleFileEvent(payload, sender) {
    if (payload.type === 'start') {
        if (fileInProgress) {
            console.warn('Another file transfer in progress');
            return;
        }
        
        fileInProgress = {
            name: payload.name,
            size: payload.size,
            type: payload.fileType
        };
        receiveBuffer = [];
        receivedFileSize = 0;
        
        const progressId = getSanitizedId(payload.name);
        displayChatMessage(`${progressId} Receiving ${payload.name} (0%)`, 'System');
        console.log('File receiving started:', payload.name);
        
        sendEventMessage('file_ack', { fileName: payload.name });
        console.log('Sent ACK to sender');
        
        if (pendingChunks.length > 0) {
            console.log(`Processing ${pendingChunks.length} buffered chunks...`);
            for (const chunk of pendingChunks) {
                handleFileChunk(chunk); 
            }
            pendingChunks = []; 
        }
        
    } else if (payload.type === 'end') {
        if (!fileInProgress || fileInProgress.name !== payload.name) {
            console.warn('File end mismatch');
            return;
        }
        
        if (receivedFileSize !== fileInProgress.size) {
            console.error('File size mismatch!', receivedFileSize, 'vs', fileInProgress.size);
            showTooltip('File transfer incomplete', 'error');
            updateFileProgress(payload.name, `File incomplete`, 'System');
        } else {
            downloadReceivedFile();
            updateFileProgress(payload.name, `Received: ${payload.name}`, 'System');
            showTooltip(`File received: ${payload.name}`, 'success');
        }
        
        console.log('File receiving finished:', payload.name);
        fileInProgress = null;
        receiveBuffer = [];
        receivedFileSize = 0;
        pendingChunks = []; 
    }
}

function downloadReceivedFile() {
    if (!fileInProgress || receiveBuffer.length === 0) {
        console.error('No file to download');
        return;
    }
    
    try {
        const blob = new Blob(receiveBuffer, { type: fileInProgress.type || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileInProgress.name;
        document.body.appendChild(a);
        a.style.display = 'none';
        a.click();
        
        setTimeout(() => {
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }, 100);
        
    } catch (error) {
        console.error('Download error:', error);
        showTooltip('Failed to save file', 'error');
    }
}

function updateFileProgress(fileName, message, sender) {
    const progressId = getSanitizedId(fileName);
    let msgDiv = document.getElementById(progressId);
    
    if (msgDiv) {
        if (sender === 'You') {
            msgDiv.innerHTML = `You: ${message}`;
        } else {
            msgDiv.innerHTML = `${message}`;
        }
    } else {
        displayChatMessage(`${progressId} ${message}`, sender);
    }
}

async function hangUp() {
    if (isRecording) stopRecording();
    stopCallTimer();
    stopNetworkMonitoring();
    if (audioContext && audioContext.state !== 'closed') audioContext.close(); 
    clearTimeout(speakingTimer);

    if (unsubscribeRoom) unsubscribeRoom();
    if (unsubscribeOfferCandidates) unsubscribeOfferCandidates();
    if (unsubscribeAnswerCandidates) unsubscribeAnswerCandidates();

    if (dataChannel) {
        if (currentSendChunkListener) {
            dataChannel.removeEventListener('bufferedamountlow', currentSendChunkListener);
            currentSendChunkListener = null;
            console.log('Cleaned up file transfer listener.');
        }
        dataChannel.close();
    }
    
    resetFileSendState();
    receiveBuffer = [];
    pendingChunks = [];
    
    if (peerConnection) {
        peerConnection.onconnectionstatechange = null;
        peerConnection.close();
    }
    if (currentStream) currentStream.getTracks().forEach(track => track.stop());
    if (screenStream) screenStream.getTracks().forEach(track => track.stop());

    if (roomId && db) {
        try {
            const roomRef = db.collection('rooms').doc(roomId);
            if (isRoomCreator) {
                console.log('Creator cleaning up room...');
                const offerCandidates = await roomRef.collection('offerCandidates').get();
                offerCandidates.forEach(async (doc) => await doc.ref.delete());
                const answerCandidates = await roomRef.collection('answerCandidates').get();
                answerCandidates.forEach(async (doc) => await doc.ref.delete());
                if (shortPin) {
                    await db.collection('activePins').doc(shortPin).delete();
                }
                await roomRef.delete();
            } else {
                console.log('Joiner cleaning up candidates...');
                const answerCandidates = await roomRef.collection('answerCandidates').get();
                answerCandidates.forEach(async (doc) => await doc.ref.delete());
            }
        } catch (error) {
            console.warn("Harmless error cleaning up firestore:", error.message);
        }
    }
    window.location.href = window.location.pathname;
}

function showShareModal() {
    shareModal.classList.remove('hidden');
}

function copyShareUrl() {
    shareUrl.select();
    navigator.clipboard.writeText(shareUrl.value);
    copyUrlBtn.innerText = 'Copied!';
    setTimeout(() => {
        copyUrlBtn.innerText = 'Copy URL';
    }, 2000);
}
