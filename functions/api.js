require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { Pool } = require('pg');
const serverless = require('serverless-http');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-prod';

// --- CONFIGURATION BASE DE DONNÉES ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const db = {
    async query(sql, params = []) {
        const result = await pool.query(sql, params);
        return { rows: result.rows, rowCount: result.rowCount };
    }
};

// Initialisation des tables au démarrage
(async () => {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS proprietaires (id SERIAL PRIMARY KEY, nom TEXT, prenom TEXT, sexe TEXT, telephone TEXT UNIQUE, whatsapp TEXT, zone TEXT, mot_de_passe TEXT, date_inscription TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS clients (id SERIAL PRIMARY KEY, nom TEXT, prenom TEXT, telephone TEXT UNIQUE, mot_de_passe TEXT, date_inscription TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS chambres (id SERIAL PRIMARY KEY, titre TEXT, description TEXT, prix REAL, localite TEXT, type_chambre TEXT, proprietaire_id INTEGER, image_url TEXT, images_galerie TEXT, date_ajout TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS contacts (id SERIAL PRIMARY KEY, nom TEXT, telephone TEXT, message TEXT, proprioId TEXT, chambre_id INTEGER, client_id INTEGER, reponse TEXT, date_envoi TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
        `);
    } catch (err) { console.error("Erreur init DB", err); }
})();

// --- CONFIGURATION MULTER/CLOUDINARY ---
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: { folder: 'beninlocation', allowed_formats: ['jpg', 'jpeg', 'png', 'webp'] }
});
const upload = process.env.CLOUDINARY_URL ? multer({ storage }) : multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- MIDDLEWARE ---
const verifierToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Token requis.' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.status(403).json({ success: false, message: 'Session expirée.' });
    }
};

// --- ROUTES ---

// Inscription / Connexion
app.post('/api/inscription-proprio', async (req, res) => {
    const { nom, prenom, sexe, telephone, whatsapp, zone, mot_de_passe } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(mot_de_passe, 10);
        await db.query(`INSERT INTO proprietaires (nom, prenom, sexe, telephone, whatsapp, zone, mot_de_passe) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [nom, prenom, sexe, telephone, whatsapp, zone, hashedPassword]);
        res.json({ success: true, message: 'Inscription réussie.' });
    } catch (err) { res.status(500).json({ success: false, message: 'Erreur serveur.' }); }
});

app.post('/api/login', async (req, res) => {
    const { telephone, mot_de_passe } = req.body;
    let result = await db.query(`SELECT * FROM proprietaires WHERE telephone = $1`, [telephone]);
    let user = result.rows[0];
    if (user && await bcrypt.compare(mot_de_passe, user.mot_de_passe)) {
        const token = jwt.sign({ id: user.id, role: 'proprio', zone: user.zone, nom: user.nom + ' ' + user.prenom }, JWT_SECRET, { expiresIn: '7d' });
        return res.json({ success: true, role: 'proprio', token, id: user.id, nom: user.nom + ' ' + user.prenom });
    }
    res.status(401).json({ success: false, message: 'Identifiants incorrects.' });
});

// Chambres
app.get('/api/chambres', async (req, res) => {
    const result = await db.query(`SELECT * FROM chambres ORDER BY date_ajout DESC`);
    res.json(result.rows);
});

app.post('/api/ajouter-chambre', verifierToken, upload.array('photos', 10), async (req, res) => {
    const { titre, localite, prix, description, type_chambre } = req.body;
    const image_url = req.files && req.files.length > 0 ? req.files[0].path : 'uploads/default.jpg';
    await db.query(`INSERT INTO chambres (titre, description, prix, localite, type_chambre, proprietaire_id, image_url) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [titre, description, prix, localite, type_chambre, req.user.id, image_url]);
    res.json({ success: true, message: 'Annonce publiée !' });
});

app.delete('/api/chambres/:id', verifierToken, async (req, res) => {
    const result = await db.query(`DELETE FROM chambres WHERE id = $1 AND proprietaire_id = $2`, [req.params.id, req.user.id]);
    res.json({ success: true, message: 'Supprimée.' });
});

// Stats
app.get('/api/stats-proprio', verifierToken, async (req, res) => {
    const r1 = await db.query(`SELECT COUNT(*) as nb FROM chambres WHERE proprietaire_id = $1`, [req.user.id]);
    res.json({ chambres: parseInt(r1.rows[0].nb) });
});

// --- EXPORTATION ---
module.exports.handler = serverless(app);