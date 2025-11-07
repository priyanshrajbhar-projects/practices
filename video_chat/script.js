// FINAL CODE (Scroll Fix + Emoji Fix + All Features)

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

// File Sharing
const CHUNK_SIZE = 64000; // 64KB chunks
let receiveBuffer = [];
let receivedFileSize = 0;
let fileInProgress = null;

// Speaking Indicator
let audioContext, analyser, source, dataArray, speakingTimer;

// Listeners
let unsubscribeRoom;
let unsubscribeOfferCandidates;
let unsubscribeAnswerCandidates;

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
        const response = await fetch('/api/config');
        if (!response.ok) {
            throw new Error('Failed to fetch config. Make sure Vercel env vars are set.');
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

    // REACTION FIX: 'true' parameter hata diya
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

// --- Tooltip Function (POPUP FIX) ---
function showTooltip(message, type = 'success') {
    // console.log('Tooltip Check:', message); // DEBUG
    const tooltip = document.getElementById('tooltip'); 
    if (!tooltip) {
        console.error("Tooltip element not found!");
        return;
    }
    
    tooltip.innerText = message;
    
    if (tooltipTimer) clearTimeout(tooltipTimer);

    if (type === 'error') {
        tooltip.style.backgroundColor = '#ef4444'; // red-500
    } else {
        tooltip.style.backgroundColor = '#22c55e'; // green-500
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
    if (currentStream) { // Yeh hai line 135
        currentStream.getTracks().forEach(track => track.stop());
    }

    try {
        currentStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: facingMode },
            audio: true 
        });
        localVideo.srcObject = currentStream;
        checkCameraDevices();
        setupAudioAnalysis(); // Speaking indicator setup
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
    await startMedia(); // Re-calls setupAudioAnalysis()

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
    await startMedia(); // Yeh hai line 180
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
    dataChannel.binaryType = 'arraybuffer'; // For file sharing
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
        dataChannel.binaryType = 'arraybuffer'; // For file sharing
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
        if (audioContext) audioContext.close();
        
        peerStatus.classList.add('hidden');
        peerVideoStatus.classList.add('hidden');
        peerAudioStatus.classList.add('hidden');
    };
    
    channel.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
            handleFileChunk(event.data);
            return;
        }

        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'hello') {
                remoteUserName = data.sender;
                showTooltip(`${remoteUserName} connected!`, 'success');
            
            } else if (data.type === 'chat') {
                displayChatMessage(data.text, data.sender);
            
            } else if (data.type === 'status') {
                handlePeerStatus(data.payload.media, data.payload.enabled);
                if (data.payload.media === 'audio') {
                    showTooltip(`${remoteUserName} ${data.payload.enabled ? 'is unmuted' : 'is muted'}`, 'success');
                } else if (data.payload.media === 'video') {
                    showTooltip(`${remoteUserName} ${data.payload.enabled ? 'turned camera on' : 'turned camera off'}`, 'success');
                }
            
            } else if (data.type === 'event') {
                if (data.payload.type === 'camera_switch') {
                    showTooltip(`${remoteUserName} switched camera`, 'success');
                } else if (data.payload.type === 'screen_share_on') {
                    showTooltip(`${remoteUserName} started sharing screen`, 'success');
                } else if (data.payload.type === 'screen_share_off') {
                    showTooltip(`${remoteUserName} stopped sharing screen`, 'success');
                } else if (data.payload.type === 'speaking') {
                    remoteVideo.classList.add('speaking');
                } else if (data.payload.type === 'stopped_speaking') {
                    remoteVideo.classList.remove('speaking');
                }

            } else if (data.type === 'reaction') { // Emoji Fix: Sirf receive hone par show hoga
                showFloatingEmoji(data.payload.emoji);
            
            } else if (data.type === 'file') {
                handleFileEvent(data.payload, data.sender);
            }

        } catch (error) {
            console.error('Error parsing message:', error);
        }
    };
}

function sendEventMessage(type, payload) {
    if (dataChannel && dataChannel.readyState === 'open') {
        const data = {
            type: type,
            sender: userName,
            payload: payload
        };
        dataChannel.send(JSON.stringify(data));
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
    
    // Chat ko bhi event ki tarah bhejo
    sendEventMessage('chat', { text: message }); 
    
    displayChatMessage(message, 'You');
    chatInput.value = '';
}

function displayChatMessage(message, sender) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('p-2', 'rounded-lg', 'max-w-xs');
    
    if (sender === 'You') {
        msgDiv.classList.add('bg-blue-600', 'text-white', 'self-end', 'ml-auto');
        msgDiv.innerHTML = `<span class="font-bold">You:</span> ${message}`;
    } else {
        msgDiv.classList.add('bg-gray-600', 'text-white', 'self-start', 'mr-auto');
        if (sender === 'System') {
            msgDiv.classList.add('bg-purple-600', 'self-center', 'text-center');
            msgDiv.innerHTML = `<span class="font-bold">${message}</span>`;
        } else {
            msgDiv.innerHTML = `<span class="font-bold">${sender}:</span> ${message}`;
        }
    }
    
    if (message.includes('file-progress-')) {
        msgDiv.id = message.split(' ')[0];
    }

    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// --- UI & Control Functions ---
function setupRoomUI() {
    homeScreen.classList.add('hidden');
    roomScreen.classList.remove('hidden');
    
    // Buttons disabled rahenge jab tak data channel open na ho
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

    // Speaking indicator ko update karo
    if (!enabled) {
        localVideoContainer.classList.remove('speaking');
        sendEventMessage('event', { type: 'stopped_speaking' });
    }
}

function toggleVideo() {
    const videoTrack = currentStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
    
    const enabled = videoTrack.enabled;
    videoBtn.innerHTML = enabled ? '📹' : '🚫';
    videoBtn.classList.toggle('bg-blue-600', enabled);
    videoBtn.classList.toggle('bg-gray-600', !enabled);

    showTooltip(enabled ? 'Camera On' : 'Camera Off', 'success');
    sendEventMessage('status', { media: 'video', enabled: enabled });
}

// --- Screen Share Functions ---
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

// --- Call Timer Functions ---
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

// --- Network & Quality Monitoring ---
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

// --- Recording Functions ---
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


// --- Reaction Functions (FIXED) ---
function sendReaction(emoji) {
    // Sirf remote peer ko send karo
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

// --- Speaking Indicator Functions ---
function setupAudioAnalysis() {
    if (audioContext) audioContext.close();
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
    
    // Check if mic is muted
    if (!currentStream.getAudioTracks()[0].enabled) {
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


// --- File Sharing Functions ---
function onFileSelected(e) {
    const file = e.target.files[0];
    if (!file) return;

    console.log("File selected:", file.name); // DEBUG

    if (file.size > 100 * 1024 * 1024) { // 100MB Limit
        showTooltip('File is too large (max 100MB)', 'error');
        return;
    }
    if (fileInProgress) {
        showTooltip('Another file transfer is already in progress.', 'error');
        return;
    }
    
    fileInProgress = { name: file.name, size: file.size, type: file.type };
    
    sendEventMessage('file', { type: 'start', ...fileInProgress });
    displayChatMessage(`file-progress-${file.name} Sending ${file.name} (0%)`, 'You');
    
    const fileReader = new FileReader();
    fileReader.onload = (event) => {
        const buffer = event.target.result;
        let offset = 0;

        function sendNextChunk() {
            if (offset >= buffer.byteLength) {
                // Done
                sendEventMessage('file', { type: 'end', name: file.name });
                fileInProgress = null;
                console.log('File sending finished.');
                return;
            }
            
            // Check buffer
            if (dataChannel.bufferedAmount > CHUNK_SIZE * 10) { // Buffer limit
                setTimeout(sendNextChunk, 100);
                return;
            }
            
            const chunk = buffer.slice(offset, offset + CHUNK_SIZE);
            dataChannel.send(chunk);
            offset += chunk.length;
            
            const percent = Math.floor((offset / buffer.byteLength) * 100);
            updateFileProgress(file.name, `Sending ${file.name} (${percent}%)`, 'You');

            // Send next chunk
            setTimeout(sendNextChunk, 0); 
        }
        sendNextChunk();
    };
    fileReader.readAsArrayBuffer(file);
    fileInput.value = null;
}

function handleFileChunk(chunk) {
    if (!fileInProgress) return;
    receiveBuffer.push(chunk);
    receivedFileSize += chunk.byteLength;
    const percent = Math.floor((receivedFileSize / fileInProgress.size) * 100);
    updateFileProgress(fileInProgress.name, `Receiving ${fileInProgress.name} (${percent}%)`, 'System');
}

function handleFileEvent(payload, sender) {
    if (payload.type === 'start') {
        if (fileInProgress) {
            console.warn('Another file transfer is in progress. Ignoring new file.');
            return;
        }
        fileInProgress = payload;
        receiveBuffer = [];
        receivedFileSize = 0;
        displayChatMessage(`file-progress-${payload.name} Receiving ${payload.name} (0%)`, 'System');
        console.log('File receiving started:', payload.name);
    
    } else if (payload.type === 'end') {
        if (!fileInProgress || fileInProgress.name !== payload.name) return;
        downloadReceivedFile();
        updateFileProgress(payload.name, `File received: ${payload.name}`, 'System');
        console.log('File receiving finished:', payload.name);
        fileInProgress = null;
    }
}

function downloadReceivedFile() {
    const blob = new Blob(receiveBuffer, { type: fileInProgress.type });
    receiveBuffer = [];
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileInProgress.name;
    document.body.appendChild(a);
    a.style = 'display: none';
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

function updateFileProgress(fileName, message, sender) {
    const progressId = `file-progress-${fileName}`;
    let msgDiv = document.getElementById(progressId);
    
    if (msgDiv) {
        if (sender === 'You') {
            msgDiv.innerHTML = `<span class="font-bold">You:</span> ${message}`;
        } else {
            msgDiv.innerHTML = `<span class="font-bold">${message}</span>`;
        }
    } else {
        displayChatMessage(`${progressId} ${message}`, sender);
    }
}


// --- Hangup Function ---
async function hangUp() {
    if (isRecording) stopRecording();
    stopCallTimer();
    stopNetworkMonitoring();
    if (audioContext) audioContext.close();
    clearTimeout(speakingTimer);

    if (unsubscribeRoom) unsubscribeRoom();
    if (unsubscribeOfferCandidates) unsubscribeOfferCandidates();
    if (unsubscribeAnswerCandidates) unsubscribeAnswerCandidates();

    if (dataChannel) dataChannel.close();
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

// --- Modal Functions ---
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
