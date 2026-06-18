

const https = require('https');
const http = require('http');

     // 5 minutes (en millisecondes)

// URL de l'API
const API_URL = '/api/v1/exam/schedule?lang=fr';
const API_HOST = 'api.testslanguesub.com';

// ===== CODE - NE PAS MODIFIER =====
let detectionCount = 0;
let alreadyAlerted = false;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function apiRequest(path, host) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: host,
            path: path,
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 15000
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch(e) {
                    reject(new Error(`JSON parse error: ${data.substring(0,200)}`));
                }
            });
        });
        
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.end();
    });
}

function sendTelegramMessage(message) {
    return new Promise((resolve, reject) => {
        const text = encodeURIComponent(message);
        const path = `/bot${TELEGRAM_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=${text}&parse_mode=HTML`;
        
        const options = {
            hostname: 'api.telegram.org',
            path: path,
            method: 'GET',
            timeout: 10000
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch(e) {
                    resolve({ ok: false });
                }
            });
        });
        
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout Telegram')); });
        req.end();
    });
}

async function checkTCF() {
    detectionCount++;
    const now = new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Douala' });
    
    console.log(`\n[${now}] 🔍 Vérification #${detectionCount}...`);
    
    try {
        const data = await apiRequest(API_URL, API_HOST);
        const exams = data.data || data.exams || data || [];
        
        if (!Array.isArray(exams)) {
            console.log(`   ⚠️ Format inattendu, recherche dans l'objet...`);
            // Chercher dans toutes les clés
            for (const key of Object.keys(data)) {
                if (Array.isArray(data[key])) {
                    console.log(`   → Tableau trouvé dans '${key}' (${data[key].length} éléments)`);
                }
            }
            return;
        }
        
        console.log(`   📊 ${exams.length} examen(s) listé(s)`);
        
        // Chercher TCF (peu importe le format du nom)
        const tcfExams = exams.filter(e => {
            const name = (e.exam_type?.name || e.name || e.exam_type || '').toString().toLowerCase();
            return name.includes('tcf') || name.includes('test de connaissance');
        });
        
        if (tcfExams.length > 0) {
            console.log(`   🎉 TCF TROUVÉ ! ${tcfExams.length} session(s)`);
            
            if (!alreadyAlerted) {
                alreadyAlerted = true;
                
                let details = '';
                tcfExams.forEach((exam, i) => {
                    const type = exam.exam_type?.name || exam.name || 'TCF';
                    const date = exam.exam_date || exam.date || 'N/A';
                    const places = `${exam.available_seat || '?'}/${exam.max_capacity || '?'}`;
                    const venue = exam.venue || exam.location || 'N/A';
                    const deadline = exam.registration_deadline || 'N/A';
                    details += `\n📌 <b>Session ${i+1}</b>`;
                    details += `\n   Type: ${type}`;
                    details += `\n   Date examen: ${date}`;
                    details += `\n   Limite inscription: ${deadline}`;
                    details += `\n   Places: ${places}`;
                    details += `\n   Lieu: ${venue}\n`;
                });
                
                const message = `
🚨 <b>🔴🔴 TCF-CANADA DISPONIBLE ! 🔴🔴</b>

Les examens TCF sont maintenant ouverts à l'inscription sur la plateforme de l'Université de Buea !

${details}

<a href="https://testslanguesub.com/fr/dashboard/exam-registration">🔗 Clique ici pour t'inscrire</a>

⚠️ <b>Agis vite !</b> Les places sont limitées !
Détecté le : ${now}
                `.trim();
                
                console.log(`   📧 Envoi de l'alerte Telegram...`);
                const result = await sendTelegramMessage(message);
                
                if (result.ok) {
                    console.log(`   ✅ ALERTE ENVOYÉE avec succès !`);
                } else {
                    console.log(`   ⚠️ Erreur envoi Telegram:`, result);
                }
            } else {
                console.log(`   ⏳ Déjà alerté, pas de nouvel envoi`);
            }
        } else {
            console.log(`   ❌ Aucun TCF trouvé`);
            // Lister les examens disponibles
            exams.slice(0, 5).forEach(e => {
                const name = e.exam_type?.name || e.name || 'Inconnu';
                console.log(`   → ${name}`);
            });
        }
        
    } catch (error) {
        console.log(`   ❌ Erreur: ${error.message}`);
    }
}

// ===== LANCEMENT =====
console.log(`
╔══════════════════════════════════════╗
║   🔍 ALERTEUR TCF-CANADA BUEA       ║
║   Université de Buea                 ║
║                                      ║
║   Surveillance toutes les ${CHECK_INTERVAL/60000} minutes     ║
║   Alerte via Telegram                ║
╚══════════════════════════════════════╝

Configuration :
• Token Telegram : ${TELEGRAM_TOKEN.substring(0,10)}...
• Chat ID : ${TELEGRAM_CHAT_ID}
• API : ${API_HOST}${API_URL}

Démarrage de la surveillance...
`);

// Vérification immédiate
checkTCF();

// Puis périodiquement
setInterval(checkTCF, CHECK_INTERVAL);
