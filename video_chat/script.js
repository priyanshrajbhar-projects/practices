// updating code @ 10.16am
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
let isRoomCreator = false; // Track if user created the room

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
        joinRoomInput.value = roomFromUrl;
    }
}

// --- Tooltip Function ---
function showTooltip(message, type = 'success') {
    tooltip.innerText = message;
    
    if (type === 'error') {
        tooltip.classList.add('bg-red-500');
        tooltip.classList.remove('bg-green-500');
    } else {
        tooltip.classList.add('bg-green-500');
        tooltip.classList.remove('bg-red-500');
    }

    tooltip.classList.add('tooltip-visible');
    setTimeout(() => {
        tooltip.classList.remove('tooltip-visible');
    }, 3000);
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
            sender.replaceTrack(videoTrack);
            sendPeerStatus('video', videoTrack.enabled);
        }
    }
}

async function createRoom() {
    await startMedia();
    setupRoomUI();
    isRoomCreator = true; // Mark as room creator

    const roomRef = await db.collection('rooms').add({});
    roomId = roomRef.id;
    roomCodeDisplay.value = roomId;
    updateShareModal(roomId);

    const offerCandidates = roomRef.collection('offerCandidates');
    const answerCandidates = roomRef.collection('answerCandidates');

    peerConnection = new RTCPeerConnection(servers);

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
    console.log('Room created with ID:', roomId);

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

async function joinRoom(id) {
    if (!id) {
        alert('Please enter a room code.');
        return;
    }
    
    roomId = id;
    await startMedia();
    setupRoomUI();
    isRoomCreator = false; // Mark as joiner
    
    // Hide room code section for joiner
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


// --- Data Channel (Chat) Functions ---

function setupDataChannelEvents(channel) {
    channel.onopen = () => {
        console.log('Data channel open');
        chatInput.disabled = false;
        sendChatBtn.disabled = false;
        showTooltip('User connected!', 'success'); 
        
        sendPeerStatus('audio', currentStream.getAudioTracks()[0].enabled);
        sendPeerStatus('video', currentStream.getVideoTracks()[0].enabled);
    };
    channel.onclose = () => {
        console.log('Data channel closed');
        chatInput.disabled = true;
        sendChatBtn.disabled = true;
        showTooltip('User disconnected.', 'error');
        
        peerStatus.classList.add('hidden');
        peerVideoStatus.classList.add('hidden');
        peerAudioStatus.classList.add('hidden');
    };
    
    channel.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'chat') {
                // Display message with proper sender name
                displayChatMessage(data.text, data.sender);
            } else if (data.type === 'status') {
                handlePeerStatus(data.media, data.enabled);
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    };
}

// Send Peer Status Function
function sendPeerStatus(media, enabled) {
    if (dataChannel && dataChannel.readyState === 'open') {
        const data = {
            type: 'status',
            media: media,
            enabled: enabled
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
        text: message  // Changed from 'message' to 'text'
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
    
    muteBtn.innerHTML = audioTrack.enabled ? '🔈' : '🔇';
    muteBtn.classList.toggle('bg-blue-600', audioTrack.enabled);
    muteBtn.classList.toggle('bg-gray-600', !audioTrack.enabled);

    sendPeerStatus('audio', audioTrack.enabled);
}

function toggleVideo() {
    const videoTrack = currentStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
    
    videoBtn.innerHTML = videoTrack.enabled ? '📹' : '🚫';
    videoBtn.classList.toggle('bg-blue-600', videoTrack.enabled);
    videoBtn.classList.toggle('bg-gray-600', !videoTrack.enabled);

    sendPeerStatus('video', videoTrack.enabled);
}

async function hangUp() {
    if (unsubscribeRoom) unsubscribeRoom();
    if (unsubscribeOfferCandidates) unsubscribeOfferCandidates();
    if (unsubscribeAnswerCandidates) unsubscribeAnswerCandidates();

    if (peerConnection) {
        peerConnection.close();
    }
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }

    if (roomId) {
        try {
            const roomRef = db.collection('rooms').doc(roomId);
            const offerCandidates = await roomRef.collection('offerCandidates').get();
            offerCandidates.forEach(async (doc) => await doc.ref.delete());
            const answerCandidates = await roomRef.collection('answerCandidates').get();
            answerCandidates.forEach(async (doc) => await doc.ref.delete());
            await roomRef.delete();
        } catch (error) {
            console.error("Error cleaning up firestore:", error);
        }
    }

    window.location.href = 'index.html';
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
