
const https = require('https');
const fs = require('fs');
const path = require('path');

// ===== CHARGEMENT DE LA CONFIGURATION DEPUIS .env =====
function loadEnv() {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const [key, ...vals] = trimmed.split('=');
                const value = vals.join('=').trim();
                // Enlever les guillemets si présents
                process.env[key.trim()] = value.replace(/^["']|["']$/g, '');
            }
        });
        console.log('✅ Configuration chargée depuis .env');
    } else {
        console.log('⚠️ Fichier .env non trouvé, utilisation des variables d\'environnement');
    }
}

loadEnv();

// ===== CONFIGURATION (via variables d'environnement) =====
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL) || 5 * 60 * 1000;

// Vérification que les clés sont présentes
if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('❌ ERREUR : TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID doivent être définis');
    console.error('   Crée un fichier .env à côté de ce script avec :');
    console.error('   TELEGRAM_BOT_TOKEN=ton_token');
    console.error('   TELEGRAM_CHAT_ID=ton_chat_id');
    process.exit(1);
}

const API_OPTIONS = {
    hostname: 'api.testslanguesub.com',
    path: '/api/v1/exam/schedule?lang=fr',
    method: 'GET',
    headers: { 'Accept': 'application/json', 'User-Agent': 'Node.js' },
    timeout: 15000
};

let alreadyAlerted = false;
let count = 0;

function apiRequest() {
    return new Promise((resolve, reject) => {
        const req = https.request(API_OPTIONS, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.end();
    });
}

function sendTelegram(text) {
    const t = encodeURIComponent(text);
    return new Promise((resolve) => {
        https.get(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=${t}&parse_mode=HTML`, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(data));
        });
    });
}

async function check() {
    count++;
    const now = new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Douala' });
    console.log(`[${now}] Vérif #${count}...`);
    
    try {
        const data = await apiRequest();
        const exams = data.data || [];
        console.log(`   ${exams.length} examens listés`);
        
        const tcf = exams.filter(e => (e.exam_type?.name || '').toLowerCase().includes('tcf'));
        
        if (tcf.length > 0 && !alreadyAlerted) {
            alreadyAlerted = true;
            let details = tcf.map((e, i) => 
                `\n📌 Session ${i+1}: ${e.exam_type?.name}\n   Date: ${e.exam_date}\n   Places: ${e.available_seat}/${e.max_capacity}\n   Lieu: ${e.venue || 'N/A'}\n   Limite: ${e.registration_deadline || 'N/A'}`
            ).join('');
            
            const msg = `🚨 <b>TCF-CANADA DISPONIBLE !</b>\n\nLes sessions TCF sont ouvertes sur la plateforme !${details}\n\n<a href="https://testslanguesub.com/fr/dashboard/exam-registration">🔗 S'inscrire maintenant</a>\n\nDétecté le ${now}`;
            
            console.log('   📨 Envoi alerte Telegram...');
            await sendTelegram(msg);
            console.log('   ✅ ALERTE ENVOYÉE !');
        } else if (tcf.length > 0) {
            console.log('   ✅ TCF présent (déjà alerté)');
        } else {
            console.log('   ❌ Pas de TCF trouvé');
        }
    } catch(e) {
        console.log('   ❌ Erreur:', e.message);
    }
}

// ===== AFFICHAGE DU STATUT =====
console.log('');
console.log('╔══════════════════════════════════════╗');
console.log('║   🔍 ALERTEUR TCF-CANADA BUEA       ║');
console.log('║   Université de Buea                 ║');
console.log('║                                      ║');
console.log(`║   Intervalle : ${CHECK_INTERVAL/60000} minutes              ║`);
console.log('║   Alerte : Telegram                  ║');
console.log('╚══════════════════════════════════════╝');
console.log('');

// Sécurité : ne pas afficher le token complet
const maskedToken = TELEGRAM_TOKEN ? TELEGRAM_TOKEN.substring(0, 6) + '...' + TELEGRAM_TOKEN.slice(-4) : 'NON DÉFINI';
console.log(`📧 Bot Telegram: ${maskedToken}`);
console.log(`👤 Chat ID: ${TELEGRAM_CHAT_ID}`);
console.log(`⏱ Vérification toutes les ${CHECK_INTERVAL/1000} secondes`);
console.log('');

// Lancement
check();
setInterval(check, CHECK_INTERVAL);