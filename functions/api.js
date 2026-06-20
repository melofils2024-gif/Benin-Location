require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

// ==========================================
// --- CONFIGURATION DE LA BASE DE DONNÉES ---
// ==========================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

const initDb = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS proprietaires (
                id SERIAL PRIMARY KEY,
                nom TEXT NOT NULL,
                prenom TEXT NOT NULL,
                sexe TEXT NOT NULL,
                telephone TEXT NOT NULL UNIQUE,
                whatsapp TEXT NOT NULL,
                zone TEXT NOT NULL,
                mot_de_passe TEXT NOT NULL,
                date_inscription TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS clients (
                id SERIAL PRIMARY KEY,
                nom TEXT NOT NULL,
                prenom TEXT NOT NULL,
                telephone TEXT NOT NULL UNIQUE,
                mot_de_passe TEXT NOT NULL,
                date_inscription TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS chambres (
                id SERIAL PRIMARY KEY,
                titre TEXT NOT NULL,
                description TEXT,
                prix REAL,
                localite TEXT,
                type_chambre TEXT DEFAULT 'ventile',
                proprietaire_id INTEGER REFERENCES proprietaires(id) ON DELETE CASCADE,
                image_url TEXT DEFAULT 'uploads/default.jpg',
                images_galerie TEXT,
                date_ajout TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS contacts (
                id SERIAL PRIMARY KEY,
                nom TEXT NOT NULL,
                telephone TEXT NOT NULL,
                message TEXT NOT NULL,
                proprioId TEXT NOT NULL,
                chambre_id INTEGER,
                client_id INTEGER,
                reponse TEXT,
                date_envoi TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Base de données PostgreSQL initialisée.');
    } catch (err) {
        console.error('❌ Erreur initialisation BD:', err);
    }
};

if (process.env.DATABASE_URL) {
    initDb();
} else {
    console.log('⚠️ ATTENTION: DATABASE_URL non définie. La base de données ne fonctionnera pas.');
}

// ==========================================
// --- CONFIGURATION CLOUDINARY & MULTER ---
// ==========================================
// Cloudinary se configure automatiquement s'il trouve CLOUDINARY_URL dans .env

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'beninlocation',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ width: 1000, height: 1000, crop: 'limit' }]
    }
});

// En cas d'absence de CLOUDINARY_URL, on utilise un stockage temporaire en mémoire pour éviter le crash (mode test)
const upload = process.env.CLOUDINARY_URL ? multer({ storage }) : multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// --- MIDDLEWARE JWT ---
// ==========================================
const verifierToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Token requis. Veuillez vous connecter.' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.status(403).json({ success: false, message: 'Session expirée. Veuillez vous reconnecter.' });
    }
};

// ==========================================
// --- ROUTES : INSCRIPTIONS ---
// ==========================================

// Inscription Propriétaire
app.post('/api/inscription-proprio', async (req, res) => {
    const { nom, prenom, sexe, telephone, whatsapp, zone, mot_de_passe } = req.body;
    if (!nom || !prenom || !telephone || !mot_de_passe || !zone) {
        return res.status(400).json({ success: false, message: 'Tous les champs sont requis.' });
    }
    try {
        const hashedPassword = await bcrypt.hash(mot_de_passe, 10);
        const sql = `INSERT INTO proprietaires (nom, prenom, sexe, telephone, whatsapp, zone, mot_de_passe) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`;
        const result = await pool.query(sql, [nom, prenom, sexe || 'M', telephone, whatsapp || telephone, zone, hashedPassword]);
        const newId = result.rows[0].id;
        
        const token = jwt.sign({ id: newId, role: 'proprio', zone, nom: nom + ' ' + prenom }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, message: 'Inscription réussie !', token, role: 'proprio', id: newId, zone, nom: nom + ' ' + prenom });
    } catch (err) {
        if (err.code === '23505') { // Code d'erreur unique PostgreSQL
            return res.status(400).json({ success: false, message: 'Ce numéro de téléphone est déjà utilisé.' });
        }
        console.error(err);
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
});

// Inscription Client
app.post('/api/inscription-client', async (req, res) => {
    const { nom, prenom, telephone, mot_de_passe } = req.body;
    if (!nom || !prenom || !telephone || !mot_de_passe) {
        return res.status(400).json({ success: false, message: 'Tous les champs sont requis.' });
    }
    try {
        const hashedPassword = await bcrypt.hash(mot_de_passe, 10);
        const sql = `INSERT INTO clients (nom, prenom, telephone, mot_de_passe) VALUES ($1, $2, $3, $4) RETURNING id`;
        const result = await pool.query(sql, [nom, prenom, telephone, hashedPassword]);
        const newId = result.rows[0].id;
        
        const token = jwt.sign({ id: newId, role: 'client', nom: nom + ' ' + prenom }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, message: 'Inscription réussie !', token, role: 'client', id: newId, nom: nom + ' ' + prenom });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ success: false, message: 'Ce numéro de téléphone est déjà utilisé.' });
        }
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
});

// ==========================================
// --- ROUTES : CONNEXION ---
// ==========================================
app.post('/api/login', async (req, res) => {
    const { telephone, mot_de_passe } = req.body;
    if (!telephone || !mot_de_passe) {
        return res.status(400).json({ success: false, message: 'Numéro et mot de passe requis.' });
    }

    try {
        // Chercher dans proprietaires
        let result = await pool.query(`SELECT * FROM proprietaires WHERE telephone = $1`, [telephone]);
        let user = result.rows[0];
        
        if (user) {
            const match = await bcrypt.compare(mot_de_passe, user.mot_de_passe);
            if (match) {
                const token = jwt.sign({ id: user.id, role: 'proprio', zone: user.zone, nom: user.nom + ' ' + user.prenom }, JWT_SECRET, { expiresIn: '7d' });
                return res.json({ success: true, role: 'proprio', id: user.id, zone: user.zone, nom: user.nom + ' ' + user.prenom, whatsapp: user.whatsapp, token });
            } else {
                return res.status(401).json({ success: false, message: 'Mot de passe incorrect.' });
            }
        }

        // Sinon chercher dans clients
        result = await pool.query(`SELECT * FROM clients WHERE telephone = $1`, [telephone]);
        user = result.rows[0];

        if (user) {
            const match = await bcrypt.compare(mot_de_passe, user.mot_de_passe);
            if (match) {
                const token = jwt.sign({ id: user.id, role: 'client', nom: user.nom + ' ' + user.prenom }, JWT_SECRET, { expiresIn: '7d' });
                return res.json({ success: true, role: 'client', id: user.id, nom: user.nom + ' ' + user.prenom, token });
            } else {
                return res.status(401).json({ success: false, message: 'Mot de passe incorrect.' });
            }
        }

        res.status(401).json({ success: false, message: 'Aucun compte trouvé avec ce numéro.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
});

app.post('/api/recuperation', async (req, res) => {
    const { telephone } = req.body;
    const nouveauMotDePasse = "123456";
    const hashedPassword = await bcrypt.hash(nouveauMotDePasse, 10);

    try {
        let result = await pool.query(`UPDATE proprietaires SET mot_de_passe = $1 WHERE telephone = $2`, [hashedPassword, telephone]);
        if (result.rowCount > 0) return res.json({ success: true, message: "Mot de passe réinitialisé à '123456'." });

        result = await pool.query(`UPDATE clients SET mot_de_passe = $1 WHERE telephone = $2`, [hashedPassword, telephone]);
        if (result.rowCount > 0) return res.json({ success: true, message: "Mot de passe réinitialisé à '123456'." });
        
        res.status(404).json({ success: false, message: 'Aucun compte trouvé avec ce numéro.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
});

// ==========================================
// --- ROUTES : MESSAGES ---
// ==========================================
app.get('/api/messages/:proprioId', verifierToken, async (req, res) => {
    if (req.user.role !== 'proprio') return res.status(403).json({ error: 'Accès refusé.' });
    try {
        const result = await pool.query(`
            SELECT c.*, ch.titre as chambre_titre FROM contacts c 
            LEFT JOIN chambres ch ON c.chambre_id = ch.id
            WHERE c.proprioId = $1 ORDER BY c.date_envoi DESC
        `, [req.params.proprioId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/mes-messages', verifierToken, async (req, res) => {
    if (req.user.role !== 'proprio') return res.status(403).json({ error: 'Accès refusé.' });
    try {
        const result = await pool.query(`
            SELECT c.*, ch.titre as chambre_titre FROM contacts c
            LEFT JOIN chambres ch ON c.chambre_id = ch.id
            WHERE c.proprioId = $1 ORDER BY c.date_envoi DESC
        `, [req.user.zone]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/envoyer-message', verifierToken, async (req, res) => {
    if (req.user.role !== 'client') return res.status(403).json({ success: false, message: 'Seuls les clients peuvent envoyer.' });
    const { nom, telephone, message, proprioId, chambre_id } = req.body;
    try {
        await pool.query(
            `INSERT INTO contacts (nom, telephone, message, proprioId, client_id, chambre_id) VALUES ($1, $2, $3, $4, $5, $6)`,
            [nom || req.user.nom, telephone || '', message, proprioId, req.user.id, chambre_id || null]
        );
        res.json({ success: true, message: 'Message envoyé.' });
    } catch (err) {
        res.status(500).json({ success: false, message: "Erreur d'envoi." });
    }
});

app.put('/api/messages/:id/reponse', verifierToken, async (req, res) => {
    if (req.user.role !== 'proprio') return res.status(403).json({ error: 'Accès refusé.' });
    try {
        await pool.query(`UPDATE contacts SET reponse = $1 WHERE id = $2`, [req.body.reponse, req.params.id]);
        res.json({ success: true, message: 'Réponse enregistrée.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
});

// ==========================================
// --- ROUTES : CHAMBRES ---
// ==========================================
app.get('/api/chambres', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT c.*, p.whatsapp as proprio_whatsapp, p.telephone as proprio_tel 
            FROM chambres c LEFT JOIN proprietaires p ON c.proprietaire_id = p.id 
            ORDER BY c.date_ajout DESC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});

app.get('/api/recherche-chambres', async (req, res) => {
    const { localite, type, prix_max } = req.query;
    let sql = `SELECT c.*, p.whatsapp as proprio_whatsapp FROM chambres c LEFT JOIN proprietaires p ON c.proprietaire_id = p.id WHERE 1=1`;
    let params = [];
    let idx = 1;

    if (localite) { sql += ` AND c.localite ILIKE $${idx++}`; params.push(`%${localite}%`); }
    if (prix_max) { sql += ` AND c.prix <= $${idx++}`; params.push(prix_max); }
    if (type && type !== 'tout') { sql += ` AND c.type_chambre = $${idx++}`; params.push(type); }
    sql += ` ORDER BY c.date_ajout DESC`;

    try {
        const result = await pool.query(sql, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Erreur recherche.' });
    }
});

app.get('/api/chambre/:id', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT c.*, p.nom as proprio_nom, p.prenom as proprio_prenom, 
            p.telephone as proprio_tel, p.whatsapp as proprio_whatsapp, p.zone as proprio_zone
            FROM chambres c LEFT JOIN proprietaires p ON c.proprietaire_id = p.id
            WHERE c.id = $1
        `, [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Non trouvée' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/mes-chambres', verifierToken, async (req, res) => {
    if (req.user.role !== 'proprio') return res.status(403).json({ error: 'Accès refusé.' });
    try {
        const result = await pool.query(`SELECT * FROM chambres WHERE proprietaire_id = $1 ORDER BY date_ajout DESC`, [req.user.id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});

app.post('/api/ajouter-chambre', verifierToken, upload.array('photos', 10), async (req, res) => {
    if (req.user.role !== 'proprio') return res.status(403).json({ success: false, message: 'Réservé aux propriétaires.' });
    const { titre, localite, prix, description, type_chambre } = req.body;
    const zone = localite || req.user.zone;

    try {
        const countRes = await pool.query(`SELECT COUNT(*) as nb FROM chambres WHERE proprietaire_id = $1 AND localite ILIKE $2`, [req.user.id, `%${zone}%`]);
        if (parseInt(countRes.rows[0].nb) >= 30) {
            return res.status(400).json({ success: false, message: `Limite de 30 chambres atteinte pour "${zone}".` });
        }

        let image_url = 'uploads/default.jpg';
        let images_galerie = null;

        if (req.files && req.files.length > 0) {
            image_url = req.files[0].path || req.files[0].filename; // .path c'est l'URL Cloudinary !
            if (req.files.length > 1) {
                images_galerie = JSON.stringify(req.files.slice(1).map(f => f.path || f.filename));
            }
        }

        const sql = `INSERT INTO chambres (titre, description, prix, localite, type_chambre, proprietaire_id, image_url, images_galerie) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`;
        const result = await pool.query(sql, [titre, description || '', parseFloat(prix), zone, type_chambre || 'ventile', req.user.id, image_url, images_galerie]);
        res.json({ success: true, message: 'Annonce publiée !', id: result.rows[0].id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Erreur d'ajout." });
    }
});

app.put('/api/chambres/:id', verifierToken, upload.array('photos', 10), async (req, res) => {
    if (req.user.role !== 'proprio') return res.status(403).json({ error: 'Accès refusé.' });
    try {
        const check = await pool.query(`SELECT * FROM chambres WHERE id = $1 AND proprietaire_id = $2`, [req.params.id, req.user.id]);
        if (check.rows.length === 0) return res.status(404).json({ success: false, message: 'Non trouvée.' });

        let image_url = check.rows[0].image_url;
        let images_galerie = check.rows[0].images_galerie;

        if (req.files && req.files.length > 0) {
            image_url = req.files[0].path || req.files[0].filename;
            if (req.files.length > 1) {
                images_galerie = JSON.stringify(req.files.slice(1).map(f => f.path || f.filename));
            } else {
                images_galerie = null;
            }
        }

        const { titre, localite, prix, description, type_chambre } = req.body;
        await pool.query(`UPDATE chambres SET titre=$1, localite=$2, prix=$3, description=$4, type_chambre=$5, image_url=$6, images_galerie=$7 WHERE id=$8`,
            [titre, localite, parseFloat(prix), description, type_chambre || 'ventile', image_url, images_galerie, req.params.id]);
        res.json({ success: true, message: 'Annonce modifiée.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erreur.' });
    }
});

app.delete('/api/chambres/:id', verifierToken, async (req, res) => {
    if (req.user.role !== 'proprio') return res.status(403).json({ error: 'Accès refusé.' });
    try {
        const result = await pool.query(`DELETE FROM chambres WHERE id = $1 AND proprietaire_id = $2`, [req.params.id, req.user.id]);
        if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Non trouvée.' });
        res.json({ success: true, message: 'Supprimée.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erreur.' });
    }
});

app.get('/api/stats-proprio', verifierToken, async (req, res) => {
    if (req.user.role !== 'proprio') return res.status(403).json({ error: 'Accès refusé.' });
    try {
        const r1 = await pool.query(`SELECT COUNT(*) as nb FROM chambres WHERE proprietaire_id = $1`, [req.user.id]);
        const r2 = await pool.query(`SELECT COUNT(*) as nb FROM contacts WHERE proprioId = $1`, [req.user.zone]);
        const r3 = await pool.query(`SELECT COUNT(*) as nb FROM contacts WHERE proprioId = $1 AND reponse IS NULL`, [req.user.zone]);
        res.json({ chambres: parseInt(r1.rows[0].nb), messages: parseInt(r2.rows[0].nb), nonLus: parseInt(r3.rows[0].nb) });
    } catch (err) {
        res.status(500).json({ error: 'Erreur' });
    }
});

const serverless = require('serverless-http');
module.exports.handler = serverless(app);