
-- Create tables for Supabase (PostgreSQL)

CREATE TABLE IF NOT EXISTS proprietaires (
  id SERIAL PRIMARY KEY,
  nom VARCHAR(255) NOT NULL,
  prenom VARCHAR(255) NOT NULL,
  sexe VARCHAR(10) NOT NULL,
  telephone VARCHAR(20) NOT NULL UNIQUE,
  whatsapp VARCHAR(20) NOT NULL,
  zone VARCHAR(100) NOT NULL,
  mot_de_passe VARCHAR(255) NOT NULL,
  date_inscription TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  nom VARCHAR(255) NOT NULL,
  prenom VARCHAR(255) NOT NULL,
  telephone VARCHAR(20) NOT NULL UNIQUE,
  mot_de_passe VARCHAR(255) NOT NULL,
  date_inscription TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chambres (
  id SERIAL PRIMARY KEY,
  titre VARCHAR(255) NOT NULL,
  description TEXT,
  prix NUMERIC(10,2),
  localite VARCHAR(100),
  type_chambre VARCHAR(50) DEFAULT 'ventile',
  proprietaire_id INTEGER REFERENCES proprietaires(id) ON DELETE CASCADE,
  image_url VARCHAR(500) DEFAULT 'uploads/default.jpg',
  images_galerie TEXT,
  date_ajout TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY,
  nom VARCHAR(255) NOT NULL,
  telephone VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  proprioId VARCHAR(255) NOT NULL,
  chambre_id INTEGER,
  client_id INTEGER,
  reponse TEXT,
  date_envoi TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Optional: Insert test data
INSERT INTO proprietaires (nom, prenom, sexe, telephone, whatsapp, zone, mot_de_passe) 
VALUES ('Dossou', 'Jean', 'M', '97000000', '97000000', 'Calavi', '$2b$10$z5q13/H9XLX/IMahCTlCduCBYRXYisjjiW22J5NOy75KS72Wpjwmi')
ON CONFLICT (telephone) DO NOTHING;
