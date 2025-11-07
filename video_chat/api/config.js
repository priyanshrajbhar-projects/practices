// Yeh Vercel Serverless Function hai
// Yeh server par chalta hai aur aapke Environment Variables ko padhta hai

export default function handler(request, response) {
  
  // Vercel par deploy karte time aapko yeh saare variables add karne honge
  // (e.g., FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, etc.)
  const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
  };

  // Check karo ki saare variables set hain ya nahi
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    return response.status(500).json({
      error: 'Firebase config environment variables are not set on Vercel.',
    });
  }

  // Config object ko JSON ki tarah frontend ko bhej do
  response.status(200).json(firebaseConfig);
}