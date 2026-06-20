const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./location.db');

const motDePasseClair = "123456"; 
const salt = bcrypt.genSaltSync(10);
const hash = bcrypt.hashSync(motDePasseClair, salt);

db.serialize(() => {
    // 1. On crée la table proprement (avec la colonne mot_de_passe !)
    db.run(`CREATE TABLE IF NOT EXISTS proprietaires (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nom TEXT NOT NULL,
        prenom TEXT NOT NULL,
        sexe TEXT NOT NULL,
        telephone TEXT NOT NULL,
        whatsapp TEXT NOT NULL,
        zone TEXT NOT NULL,
        mot_de_passe TEXT NOT NULL
    )`);

    // 2. On insère l'utilisateur
    const stmt = db.prepare(`INSERT INTO proprietaires (nom, prenom, sexe, telephone, whatsapp, zone, mot_de_passe) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    stmt.run("Dossou", "Jean", "M", "97000000", "97000000", "Calavi", hash);
    stmt.finalize();
    console.log("Base de données recréée et utilisateur inséré !");
});

db.close();