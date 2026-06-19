// ===== ALERTEUR TCF-CANADA - BUEA =====
// Université de Buea - Tests de langue française
// Nécessite un fichier .env à côté avec les clés Telegram

const https = require('https');
const fs = require('fs');
const path = require('path');

// ===== CHARGEMENT DU FICHIER .env =====
function chargerEnv() {
    const cheminEnv = path.join(__dirname, '.env');
    
    if (!fs.existsSync(cheminEnv)) {
        console.error('❌ Fichier .env introuvable !');
        console.error('   Crée un fichier .env à côté de alerteur.js avec :');
        console.error('   TELEGRAM_BOT_TOKEN=ton_token');
        console.error('   TELEGRAM_CHAT_ID=ton_chat_id');
        console.error('   CHECK_INTERVAL=60000');
        process.exit(1);
    }
    
    const contenu = fs.readFileSync(cheminEnv, 'utf8');
    const lignes = contenu.split('\n');
    
    lignes.forEach(ligne => {
        const l = ligne.trim();
        if (l && !l.startsWith('#')) {
            const index = l.indexOf('=');
            if (index > 0) {
                const cle = l.substring(0, index).trim();
                const valeur = l.substring(index + 1).trim().replace(/^["']|["']$/g, '');
                process.env[cle] = valeur;
            }
        }
    });
    
    console.log('✅ Configuration chargée depuis .env');
}

chargerEnv();

// ===== CONFIGURATION =====
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL) || 60000;

// Vérification des clés
if (!TELEGRAM_TOKEN || TELEGRAM_TOKEN === 'TON_TOKEN_ICI') {
    console.error('❌ TELEGRAM_BOT_TOKEN non défini dans .env');
    process.exit(1);
}

if (!TELEGRAM_CHAT_ID || TELEGRAM_CHAT_ID === 'TON_CHAT_ID_ICI') {
    console.error('❌ TELEGRAM_CHAT_ID non défini dans .env');
    process.exit(1);
}

// Masquage du token pour l'affichage
const tokenMasque = TELEGRAM_TOKEN.substring(0, 8) + '...' + TELEGRAM_TOKEN.slice(-4);

// ===== CONFIGURATION API =====
const API_OPTIONS = {
    hostname: 'api.testslanguesub.com',
    path: '/api/v1/exam/schedule?lang=fr',
    method: 'GET',
    headers: {
        'Accept': 'application/json',
        'User-Agent': 'AlerteurTCF/1.0'
    },
    timeout: 15000
};

// ===== ÉTAT =====
let dejaAlerte = false;
let compteur = 0;

// ===== FONCTIONS =====
function requeteAPI() {
    return new Promise((resolve, reject) => {
        const req = https.request(API_OPTIONS, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch(e) {
                    reject(new Error('Réponse API invalide'));
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout API'));
        });
        req.end();
    });
}

function envoyerTelegram(texte) {
    return new Promise((resolve, reject) => {
        const message = encodeURIComponent(texte);
        const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=${message}&parse_mode=HTML`;
        
        https.get(url, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(d));
                } catch(e) {
                    resolve({ ok: false, description: 'Parse error' });
                }
            });
        }).on('error', reject);
    });
}

function formaterMessage(examens) {
    let details = '';
    examens.forEach((e, i) => {
        details += `\n📌 <b>Session ${i+1}</b>\n`;
        details += `   • Type : ${e.exam_type?.name || 'TCF'}\n`;
        details += `   • Date : ${e.exam_date || 'N/A'}\n`;
        details += `   • Places : ${e.available_seat || '?'} / ${e.max_capacity || '?'}\n`;
        details += `   • Lieu : ${e.venue || 'N/A'}\n`;
        details += `   • Limite inscription : ${e.registration_deadline || 'N/A'}\n`;
    });
    
    return `🚨 <b>🔴 TCF-CANADA DISPONIBLE ! 🔴</b>\n\n` +
        `Les examens TCF sont maintenant ouverts à l'inscription sur la plateforme de l'Université de Buea !\n${details}\n` +
        `<a href="https://testslanguesub.com/fr/dashboard/exam-registration">🔗 Clique ici pour t'inscrire</a>\n\n` +
        `⚠️ <b>Agis vite ! Les places sont limitées !</b>\n` +
        `📅 Détecté le : ${new Date().toLocaleString('fr-FR')}`;
}

async function verifier() {
    compteur++;
    const maintenant = new Date().toLocaleString('fr-FR');
    console.log(`[${maintenant}] 🔍 Vérification #${compteur}...`);
    
    try {
        const data = await requeteAPI();
        const examens = data.data || [];
        
        console.log(`   ${examens.length} examen(s) trouvé(s)`);
        
        // Filtrer les TCF
        const tcfTrouves = examens.filter(e => {
            const nom = (e.exam_type?.name || '').toLowerCase();
            return nom.includes('tcf');
        });
        
        if (tcfTrouves.length > 0) {
            console.log(`   🎯 ${tcfTrouves.length} examen(s) TCF trouvé(s) !`);
            
            if (!dejaAlerte) {
                dejaAlerte = true;
                const message = formaterMessage(tcfTrouves);
                
                console.log('   📨 Envoi de l alerte Telegram...');
                const resultat = await envoyerTelegram(message);
                
                if (resultat.ok) {
                    console.log('   ✅ ALERTE ENVOYÉE AVEC SUCCÈS !');
                } else {
                    console.log(`   ⚠️ Erreur envoi: ${resultat.description}`);
                }
            } else {
                console.log('   ⏳ Déjà alerté, pas de nouvel envoi');
            }
        } else {
            console.log('   ❌ Aucun TCF trouvé');
            // Afficher les premiers examens disponibles
            if (examens.length > 0) {
                console.log('   Examens disponibles :');
                examens.slice(0, 5).forEach(e => {
                    const nom = e.exam_type?.name || 'Inconnu';
                    const date = e.exam_date || 'N/A';
                    console.log(`      → ${nom} - ${date}`);
                });
            }
        }
        
    } catch (err) {
        console.log(`   ❌ Erreur : ${err.message}`);
    }
}

// ===== LANCEMENT =====
console.log('');
console.log('╔══════════════════════════════════════╗');
console.log('║   🔍 ALERTEUR TCF-CANADA BUEA       ║');
console.log('║   Université de Buea                 ║');
console.log('║                                      ║');
console.log('║   ✅ Bot connecté                    ║');
console.log(`║   🤖 Token : ${tokenMasque}       ║`);
console.log(`║   👤 Chat ID : ${TELEGRAM_CHAT_ID}               ║`);
console.log(`║   ⏱ Intervalle : ${CHECK_INTERVAL/60000} minute(s)              ║`);
console.log('║                                      ║');
console.log('║   📁 .env protégé                    ║');
console.log('╚══════════════════════════════════════╝');
console.log('');
console.log('📡 Surveillance en cours...');
console.log('');

// Première vérification immédiate
verifier();

// Puis périodiquement
setInterval(verifier, CHECK_INTERVAL);