// FINAL CODE @ 8:20 PM

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

const controlsContainer = document.getElementById('controlsContainer');
const muteBtn = document.getElementById('muteBtn');
const videoBtn = document.getElementById('videoBtn');
const switchCameraBtn = document.getElementById('switchCameraBtn');
const screenShareBtn = document.getElementById('screenShareBtn');
const hangupBtn = document.getElementById('hangupBtn');

const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const shareBtn = document.getElementById('shareBtn');

const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');

const shareModal = document.getElementById('shareModal');
const shareUrl = document.getElementById('shareUrl');
const copyUrlBtn = document.getElementById('copyUrlBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const qrcodeDiv = document.getElementById('qrcode');

const tooltip = document.getElementById('tooltip');
const peerStatus = document.getElementById('peerStatus');
const peerVideoStatus = document.getElementById('peerVideoStatus');
const peerAudioStatus = document.getElementById('peerAudioStatus');

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
    
    // Simple button listeners
    muteBtn.onclick = toggleAudio;
    videoBtn.onclick = toggleVideo;
    switchCameraBtn.onclick = switchCamera;
    screenShareBtn.onclick = toggleScreenShare;
    hangupBtn.onclick = hangUp;

    sendChatBtn.onclick = sendChatMessage;
    chatInput.onkeydown = (e) => {
        if (e.key === 'Enter') sendChatMessage();
    };

    shareBtn.onclick = showShareModal;
    closeModalBtn.onclick = () => shareModal.classList.add('hidden');
    copyUrlBtn.onclick = copyShareUrl;
}

function checkUrlForRoom() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');
    if (roomFromUrl) {
        // Agar URL mein poora Room ID hai, toh usey join karne ki koshish karo
        // (PIN logic ko bypass karke)
        // Note: PIN logic ke liye, hum ise simple rakhte hain aur user ko PIN enter karne dete hain
        // joinRoomInput.value = roomFromUrl;
        console.log('Room ID in URL found, but PIN system is active. Please enter PIN.');
    }
}

// --- Tooltip Function ---
function showTooltip(message, type = 'success') {
    const tooltip = document.getElementById('tooltip');
    if (!tooltip) return;
    
    tooltip.innerText = message;
    
    // Purana timer (agar ho) toh clear karo
    if (tooltipTimer) {
        clearTimeout(tooltipTimer);
    }

    // Color set karo
    if (type === 'error') {
        tooltip.classList.add('bg-red-500');
        tooltip.classList.remove('bg-green-500');
    } else {
        tooltip.classList.add('bg-green-500');
        tooltip.classList.remove('bg-red-500');
    }

    // Show karo
    tooltip.classList.add('tooltip-visible');

    // 3 second baad hide karo
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
    } catch (e) {
        console.error('Error accessing media devices.', e);
        alert('Could not access camera or mic. Please allow permissions.');
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

    // --- NEW PIN LOGIC ---
    shortPin = generatePin();
    const pinRef = db.collection('activePins').doc(shortPin);

    const roomRef = await db.collection('rooms').add({});
    roomId = roomRef.id;
    
    await pinRef.set({
        roomId: roomId,
        createdAt: firebase.firestore.FieldValue.serverTimestamp() 
    });
    
    roomCodeDisplay.value = shortPin; // UI mein PIN dikhao
    updateShareModal(roomId); // Share Modal abhi bhi poora URL dega

    const offerCandidates = roomRef.collection('offerCandidates');
    const answerCandidates = roomRef.collection('answerCandidates');

    peerConnection = new RTCPeerConnection(servers);

    // Connection State Listener
    peerConnection.onconnectionstatechange = (event) => {
        console.log('Connection state changed:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'disconnected' ||
            peerConnection.connectionState === 'failed' ||
            peerConnection.connectionState === 'closed') {
            
            // showTooltip(`${remoteUserName} disconnected.`, 'error'); // Handled by data channel 'onclose'
            
            setTimeout(() => {
                hangUp();
            }, 2000);
        }
    };

    currentStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, currentStream);
    });

    dataChannel = peerConnection.createDataChannel('chat');
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
            console.log('Got answer');
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
        // Step 1: PIN se asli Room ID dhoondho
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

    // Step 2: Asli Room ID milne ke baad puraana logic run karo
    roomId = actualRoomId;
    await startMedia();
    setupRoomUI();
    isRoomCreator = false; 
    
    const roomCodeSection = document.getElementById('roomCodeSection');
    if (roomCodeSection) {
        roomCodeSection.style.display = 'none';
    }
    
    console.log('Joining room:', roomId);

    const roomRef = db.collection('rooms').doc(roomId);
    const roomDoc = await roomRef.get();

    if (!roomDoc.exists) {
        alert('Room does not exist.');
        hangUp();
        return;
    }

    peerConnection = new RTCPeerConnection(servers);

    // Connection State Listener
    peerConnection.onconnectionstatechange = (event) => {
        console.log('Connection state changed:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'disconnected' ||
            peerConnection.connectionState === 'failed' ||
            peerConnection.connectionState === 'closed') {
            
            // showTooltip(`${remoteUserName} disconnected.`, 'error'); // Handled by data channel 'onclose'
            
            setTimeout(() => {
                hangUp();
            }, 2000);
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


// --- Data Channel (Chat & Events) Functions ---

function setupDataChannelEvents(channel) {
    channel.onopen = () => {
        console.log('Data channel open');
        chatInput.disabled = false;
        sendChatBtn.disabled = false;
        
        // Timer aur Network Monitor start karo
        startCallTimer(); 
        startNetworkMonitoring();
        
        // Peer ko apna naam bhejo
        sendEventMessage('hello', {});
    };
    
    channel.onclose = () => {
        console.log('Data channel closed');
        chatInput.disabled = true;
        sendChatBtn.disabled = true;
        
        showTooltip(`${remoteUserName} disconnected.`, 'error');
        stopNetworkMonitoring(); // Monitor band karo
        
        // Status overlay reset karo
        peerStatus.classList.add('hidden');
        peerVideoStatus.classList.add('hidden');
        peerAudioStatus.classList.add('hidden');
    };
    
    channel.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'hello') {
                // Peer ka naam store karo aur popup dikhao
                remoteUserName = data.sender;
                showTooltip(`${remoteUserName} connected!`, 'success');
            
            } else if (data.type === 'chat') {
                // Chat message
                displayChatMessage(data.text, data.sender);
            
            } else if (data.type === 'status') {
                // Mute/Video status
                handlePeerStatus(data.payload.media, data.payload.enabled);
                // Remote popup dikhao
                if (data.payload.media === 'audio') {
                    showTooltip(`${remoteUserName} ${data.payload.enabled ? 'is unmuted' : 'is muted'}`, 'success');
                } else if (data.payload.media === 'video') {
                    showTooltip(`${remoteUserName} ${data.payload.enabled ? 'turned camera on' : 'turned camera off'}`, 'success');
                }
            
            } else if (data.type === 'event') {
                // Doosre events
                if (data.payload.type === 'camera_switch') {
                    showTooltip(`${remoteUserName} switched camera`, 'success');
                } else if (data.payload.type === 'screen_share_on') {
                    showTooltip(`${remoteUserName} started sharing screen`, 'success');
                } else if (data.payload.type === 'screen_share_off') {
                    showTooltip(`${remoteUserName} stopped sharing screen`, 'success');
                }
            }

        } catch (error) {
            console.error('Error parsing message:', error);
        }
    };
}

// Send Event/Status/Chat Message
function sendEventMessage(type, payload) {
    if (dataChannel && dataChannel.readyState === 'open') {
        const data = {
            type: type, // 'status', 'event', 'hello'
            sender: userName,
            payload: payload
        };
        dataChannel.send(JSON.stringify(data));
    }
}

// Handle Peer Status UI
function handlePeerStatus(media, enabled) {
    if (media === 'video') {
        peerVideoStatus.classList.toggle('hidden', enabled);
    } else if (media === 'audio') {
        peerAudioStatus.classList.toggle('hidden', enabled);
    }
    
    const isVideoOff = !peerVideoStatus.classList.contains('hidden');
    const isAudioOff = !peerAudioStatus.classList.contains('hidden');
    peerStatus.classList.toggle('hidden', !isVideoOff && !isAudioOff);
}

function sendChatMessage() {
    const message = chatInput.value;
    if (message.trim() === '') return;

    const data = {
        type: 'chat',
        sender: userName,
        text: message
    };

    if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(data));
        displayChatMessage(message, 'You');
        chatInput.value = '';
    }
}

function displayChatMessage(message, sender) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('p-2', 'rounded-lg', 'max-w-xs');
    
    if (sender === 'You') {
        msgDiv.classList.add('bg-blue-600', 'text-white', 'self-end', 'ml-auto');
        msgDiv.innerHTML = `<span class="font-bold">You:</span> ${message}`;
    } else {
        msgDiv.classList.add('bg-gray-600', 'text-white', 'self-start', 'mr-auto');
        msgDiv.innerHTML = `<span class="font-bold">${sender}:</span> ${message}`;
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
    remoteVideoPlaceholder.classList.remove('hidden');
}

function updateShareModal(id) {
    const url = `${window.location.origin}${window.location.pathname}?room=${id}`;
    shareUrl.value = url;

    qrcodeDiv.innerHTML = '';
    new QRCode(qrcodeDiv, {
        text: url,
        width: 192,
        height: 192
    });
}

function toggleAudio() {
    const audioTrack = currentStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    
    const enabled = audioTrack.enabled;
    muteBtn.innerHTML = enabled ? '🔇' : '🎤';
    muteBtn.classList.toggle('bg-blue-600', enabled);
    muteBtn.classList.toggle('bg-gray-600', !enabled);

    // Show local popup
    showTooltip(enabled ? 'Unmuted' : 'You are muted', 'success');

    // Send status to peer
    sendEventMessage('status', { media: 'audio', enabled: enabled });
}

function toggleVideo() {
    const videoTrack = currentStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
    
    const enabled = videoTrack.enabled;
    videoBtn.innerHTML = enabled ? '📹' : '🚫';
    videoBtn.classList.toggle('bg-blue-600', enabled);
    videoBtn.classList.toggle('bg-gray-600', !enabled);

    // Show local popup
    showTooltip(enabled ? 'Camera On' : 'Camera Off', 'success');

    // Send status to peer
    sendEventMessage('status', { media: 'video', enabled: enabled });
}

// --- Screen Share Functions ---

async function toggleScreenShare() {
    if (!isScreenSharing) {
        // Start screen sharing
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            const screenTrack = screenStream.getVideoTracks()[0];
            
            // Replace camera track with screen track
            if (peerConnection) {
                const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
                if (sender) {
                    await sender.replaceTrack(screenTrack);
                }
            }

            // Update UI
            isScreenSharing = true;
            screenShareBtn.classList.add('bg-blue-600');
            screenShareBtn.classList.remove('bg-gray-600');
            
            showTooltip('Started screen sharing', 'success');
            sendEventMessage('event', { type: 'screen_share_on' });
            
            // Listen for when the user clicks "Stop Sharing" in the browser UI
            screenTrack.onended = () => {
                stopScreenShare();
            };

        } catch (error) {
            console.error('Error starting screen share:', error);
        }
    } else {
        // Stop screen sharing
        await stopScreenShare();
    }
}

async function stopScreenShare() {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
    }

    // Revert to camera
    if (currentStream && peerConnection) {
        const videoTrack = currentStream.getVideoTracks()[0];
        const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
        if (sender) {
            await sender.replaceTrack(videoTrack);
        }
    }
    
    showTooltip('Stopped screen sharing', 'success');
    sendEventMessage('event', { type: 'screen_share_off' });
    
    // Update UI
    isScreenSharing = false;
    screenShareBtn.classList.remove('bg-blue-600');
    screenShareBtn.classList.add('bg-gray-600');
}

// --- Call Timer Functions ---

function startCallTimer() {
    callStartTime = Date.now();
    document.getElementById('callTimer').classList.remove('hidden');

    callTimerInterval = setInterval(() => {
        const secondsElapsed = Math.floor((Date.now() - callStartTime) / 1000);
        document.getElementById('callTimer').innerText = formatTime(secondsElapsed);
    }, 1000);
}

function stopCallTimer() {
    if (callTimerInterval) {
        clearInterval(callTimerInterval);
    }
    document.getElementById('callTimer').classList.add('hidden');
    document.getElementById('callTimer').innerText = '00:00:00';
}

function formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    totalSeconds %= 3600;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return [hours, minutes, seconds]
        .map(v => (v < 10 ? "0" + v : v))
        .join(":");
}

// --- Network Monitoring Functions ---

function startNetworkMonitoring() {
    document.getElementById('networkStatus').classList.remove('hidden');

    networkStatsInterval = setInterval(async () => {
        if (!peerConnection) return;

        try {
            const stats = await peerConnection.getStats();
            let roundTripTime = 0;

            stats.forEach(report => {
                if (report.type === 'remote-inbound-rtp' && report.roundTripTime) {
                    roundTripTime = report.roundTripTime * 1000;
                }
            });

            // UI Update
            const icon = document.getElementById('networkIcon');
            const speedText = document.getElementById('networkSpeed');

            speedText.innerText = `${roundTripTime.toFixed(0)} ms`;

            if (roundTripTime < 150) {
                icon.className = 'net-good'; // Green
            } else if (roundTripTime < 300) {
                icon.className = 'net-medium'; // Yellow
            } else {
                icon.className = 'net-bad'; // Red
            }

        } catch (error) {
            console.warn('Could not get network stats:', error);
        }
    }, 3000); // Har 3 second mein check karo
}

function stopNetworkMonitoring() {
    if (networkStatsInterval) {
        clearInterval(networkStatsInterval);
    }
    document.getElementById('networkStatus').classList.add('hidden');
}


// --- Hangup Function ---

async function hangUp() {
    stopCallTimer();
    stopNetworkMonitoring();

    if (unsubscribeRoom) unsubscribeRoom();
    if (unsubscribeOfferCandidates) unsubscribeOfferCandidates();
    if (unsubscribeAnswerCandidates) unsubscribeAnswerCandidates();

    if (dataChannel) {
        dataChannel.close();
    }
    if (peerConnection) {
        peerConnection.onconnectionstatechange = null;
        peerConnection.close();
    }
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }

    if (roomId && db) {
        try {
            const roomRef = db.collection('rooms').doc(roomId);
            
            if (isRoomCreator) {
                console.log('Creator cleaning up room...');
                const offerCandidates = await roomRef.collection('offerCandidates').get();
                offerCandidates.forEach(async (doc) => await doc.ref.delete());
                
                const answerCandidates = await roomRef.collection('answerCandidates').get();
                answerCandidates.forEach(async (doc) => await doc.ref.delete());
                
                // PIN ko bhi delete karo
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

    // Home page par redirect karo
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
