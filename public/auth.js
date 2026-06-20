/**
 * auth.js — Utilitaires de session partagés pour BeninLocation
 * À inclure dans chaque page HTML : <script src="auth.js"></script>
 */

const Auth = {
    KEY: 'beninlocation_session',

    // Récupérer la session courante
    getSession() {
        try {
            const data = localStorage.getItem(this.KEY);
            return data ? JSON.parse(data) : null;
        } catch { return null; }
    },

    // Sauvegarder la session
    setSession(data) {
        localStorage.setItem(this.KEY, JSON.stringify(data));
    },

    // Effacer la session (déconnexion)
    clearSession() {
        localStorage.removeItem(this.KEY);
    },

    // Vérifier si connecté
    isLoggedIn() {
        return this.getSession() !== null;
    },

    // Vérifier le rôle
    isRole(role) {
        const s = this.getSession();
        return s && s.role === role;
    },

    // Obtenir les headers Authorization pour les appels API
    getHeaders() {
        const s = this.getSession();
        return s ? { 'Authorization': `Bearer ${s.token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
    },

    // Obtenir les headers pour FormData (sans Content-Type — laissé au navigateur)
    getHeadersFormData() {
        const s = this.getSession();
        return s ? { 'Authorization': `Bearer ${s.token}` } : {};
    },

    // Rediriger vers connexion si non connecté (avec paramètre de retour)
    requireLogin(role, redirectAfter) {
        const s = this.getSession();
        if (!s) {
            const dest = redirectAfter || window.location.href;
            window.location.href = `connexion.html?redirect=${encodeURIComponent(dest)}&role=${role || ''}`;
            return false;
        }
        if (role && s.role !== role) {
            alert(`Accès refusé. Cette page est réservée aux ${role === 'proprio' ? 'propriétaires' : 'clients'}.`);
            window.location.href = 'index.html';
            return false;
        }
        return true;
    },

    // Déconnecter et rediriger
    logout(redirect) {
        this.clearSession();
        window.location.href = redirect || 'index.html';
    },

    // Mettre à jour le header de navigation selon la session
    updateNav() {
        const s = this.getSession();
        const navArea = document.getElementById('nav-user-area');
        if (!navArea) return;

        if (s) {
            const initiale = s.nom ? s.nom.charAt(0).toUpperCase() : '?';
            const dashboardLink = s.role === 'proprio' ? 'espace-proprietaire.html' : 'espace-client.html';
            navArea.innerHTML = `
                <a href="${dashboardLink}" class="nav-avatar" title="Mon espace">
                    <div class="avatar-circle">${initiale}</div>
                    <span class="avatar-name">${s.nom.split(' ')[0]}</span>
                </a>
                <button class="btn-logout" onclick="Auth.logout()">Déconnexion</button>
            `;
        } else {
            navArea.innerHTML = `
                <a href="connexion.html" class="btn-nav-outline">Se connecter</a>
                <a href="inscription-client.html" class="btn-nav-solid">S'inscrire</a>
            `;
        }
    }
};
