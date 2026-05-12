(async function initApp() {
    console.log("SYSTEM: Initializing BTO Insight Hub");

    try {
        // ─── SUPABASE ──────────────────────────────────────────────────────────
        const supa = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

        // ─── ROLE SYSTEM ───────────────────────────────────────────────────────
        // Livello numerico per confronti rapidi
        const ORG_ROLE_LEVEL = {
            consulente: 0,
            team_leader: 1,
            engagement_manager: 2,
            lead: 3,
            practice_manager: 4,
            responsabile: 5,
            bu_manager: 6,
            marketing: 1,
            sales: 1,
            hr: 1,
            operations: 1,
            admin: 99
        };

        // Label leggibili per ogni ruolo
        const ROLE_LABELS = {
            consulente:          'Consulente',
            team_leader:         'Team Leader',
            engagement_manager:  'Engagement Manager',
            lead:                'Lead',
            practice_manager:    'Practice Manager',
            responsabile:        'Responsabile',
            bu_manager:          'BU Manager',
            marketing:           'Marketing',
            sales:               'Sales',
            hr:                  'HR',
            operations:          'Operations',
            admin:               'Admin'
        };

        // Colori badge per ogni ruolo (usati nel profilo e nelle card)
        const ROLE_COLORS = {
            consulente:          { bg: 'rgba(148,163,184,0.12)', color: '#94A3B8' },
            team_leader:         { bg: 'rgba(59,130,246,0.12)',  color: '#3B82F6' },
            engagement_manager:  { bg: 'rgba(99,102,241,0.12)',  color: '#6366F1' },
            lead:                { bg: 'rgba(139,92,246,0.12)',  color: '#8B5CF6' },
            practice_manager:    { bg: 'rgba(168,85,247,0.12)', color: '#A855F7' },
            responsabile:        { bg: 'rgba(236,72,153,0.12)', color: '#EC4899' },
            bu_manager:          { bg: 'rgba(234,179,8,0.12)',   color: '#EAB308' },
            marketing:           { bg: 'rgba(249,115,22,0.12)', color: '#F97316' },
            sales:               { bg: 'rgba(20,184,166,0.12)', color: '#14B8A6' },
            hr:                  { bg: 'rgba(16,185,129,0.12)', color: '#10B981' },
            operations:          { bg: 'rgba(239,68,68,0.12)',  color: '#EF4444' },
            admin:               { bg: 'rgba(234,179,8,0.15)',  color: '#EAB308' }
        };

        // ─── STATO GLOBALE ─────────────────────────────────────────────────────
        let currentUser       = null;   // email
        let currentUserId     = null;   // uuid
        let currentUserOrgRole = 'consulente';
        let currentUserName   = '';
        let allInsights       = [];
        let myUpvotedIds      = new Set();
        let points            = 0;
        let weeklyInsights    = 0;
        const weeklyGoal      = 5;
        let dbClients         = [];
        let userTeams         = [];
        let mockCategories    = ["Strategia", "Tecnologia", "Processi", "Competitor", "Cultura", "CyberSecurity"];
        let mockTeams         = ["Team AI Transformation", "Team Cloud Journey", "Team Agile Governance", "Team CyberSecurity"];

        // Helper ruolo
        function hasOrgRole(minRole) {
            return (ORG_ROLE_LEVEL[currentUserOrgRole] ?? 0) >= (ORG_ROLE_LEVEL[minRole] ?? 0);
        }
        function isStaffRole(fn) {
            return currentUserOrgRole === fn;
        }
        function canSeeAuthor() {
            return hasOrgRole('team_leader');
        }
        function canDeleteInsight(insight) {
            return (insight.author_email || insight.author) === currentUser || hasOrgRole('responsabile');
        }
        function canReadSecret(insight) {
            return (insight.author_email || insight.author) === currentUser || hasOrgRole('responsabile');
        }

        // ─── DOM REFS ──────────────────────────────────────────────────────────
        const authContainer    = document.getElementById('auth-container');
        const mainApp          = document.getElementById('main-app');
        const authForm         = document.getElementById('auth-form');
        const authEmail        = document.getElementById('auth-email');
        const authPassword     = document.getElementById('auth-password');
        const authTitle        = document.getElementById('auth-title');
        const authSubmitBtn    = document.getElementById('auth-submit-btn');
        const authSwitchLink   = document.getElementById('auth-switch-link');
        const authError        = document.getElementById('auth-error');
        const logoutBtn        = document.getElementById('logout-btn');
        const form             = document.getElementById('insight-form');
        const submitBtn        = document.getElementById('submit-btn');
        const toast            = document.getElementById('toast');
        const toastTitle       = document.getElementById('toast-title');
        const toastMessage     = document.getElementById('toast-message');
        const toastIconI       = document.getElementById('toast-icon-i');
        const totalPointsEls   = document.querySelectorAll('#total-points');
        const weeklyProgressEl = document.getElementById('weekly-progress');
        const goalTextEl       = document.getElementById('goal-text');
        const goalHintEl       = document.querySelector('.goal-hint');
        const navItems         = document.querySelectorAll('.nav-item[data-target], .user-profile[data-target]');
        const viewSections     = document.querySelectorAll('.view-section');
        const insightsGrid     = document.getElementById('insights-grid');
        const searchInput      = document.getElementById('search-input');
        const clientListDOM    = document.getElementById('client-list');
        const categoryListDOM  = document.getElementById('category-list');
        const teamListDOM      = document.getElementById('team-list');
        const profileTotalPoints   = document.getElementById('profile-total-points');
        const profileTotalInsights = document.getElementById('profile-total-insights');
        const profileTotalUpvotes  = document.getElementById('profile-total-upvotes');
        const profileInsightsGrid  = document.getElementById('profile-insights-grid');
        const leaderboardInd   = document.getElementById('leaderboard-individuals');
        const leaderboardTeams = document.getElementById('leaderboard-teams');
        const chatForm         = document.getElementById('chat-form');
        const chatInput        = document.getElementById('chat-input');
        const chatHistory      = document.getElementById('chat-history');

        // ─── AUTH ──────────────────────────────────────────────────────────────
        let isLoginMode = true;

        /**
         * Punto di ingresso post-login.
         * ATTENDE il fetch del profilo prima di aggiornare qualsiasi UI.
         */
        async function updateAuthState(session) {
            if (!session) {
                currentUser = null;
                currentUserId = null;
                currentUserOrgRole = 'consulente';
                currentUserName = '';
                allInsights = [];
                points = 0;
                weeklyInsights = 0;
                myUpvotedIds = new Set();
                if (authContainer) authContainer.style.display = 'flex';
                if (mainApp)       mainApp.style.display       = 'none';
                return;
            }

            // ── 1. Carica profilo dal DB (fonte di verità) ──────────────────
            let profileData = null;
            try {
                const { data, error } = await supa
                    .from('profiles')
                    .select('org_role, first_name, last_name, role, email')
                    .eq('id', session.user.id)
                    .single();
                if (!error) profileData = data;
            } catch (e) {
                console.warn('Profilo non caricabile:', e);
            }

            // ── 2. Imposta variabili globali ────────────────────────────────
            currentUser        = session.user.email;
            currentUserId      = session.user.id;
            currentUserOrgRole = profileData?.org_role
                ?? session.user.user_metadata?.org_role
                ?? 'consulente';

            const meta = session.user.user_metadata || {};
            const firstName = profileData?.first_name || meta.first_name || '';
            const lastName  = profileData?.last_name  || meta.last_name  || '';
            currentUserName = (firstName && lastName)
                ? `${firstName} ${lastName}`
                : firstName || currentUser.split('@')[0];

            // ── 3. Aggiorna UI sidebar / topbar ─────────────────────────────
            const roleLabel  = ROLE_LABELS[currentUserOrgRole] || currentUserOrgRole;
            const roleColors = ROLE_COLORS[currentUserOrgRole] || ROLE_COLORS.consulente;
            const avatarUrl  = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUserName)}&background=3B82F6&color=fff`;

            setEl('sidebar-name',         currentUserName);
            setEl('sidebar-role',         roleLabel);
            setEl('profile-name-large',   currentUserName);
            setEl('profile-role-large',   roleLabel);
            setImgSrc('sidebar-avatar',   avatarUrl);
            setImgSrc('profile-avatar-large', avatarUrl + '&size=120');

            const orgBadge = document.getElementById('org-role-badge');
            if (orgBadge) {
                orgBadge.textContent = roleLabel;
                orgBadge.style.background = roleColors.bg;
                orgBadge.style.color      = roleColors.color;
            }

            // Greeting dinamico
            const hour   = new Date().getHours();
            const saluto = hour < 12 ? 'Buongiorno' : hour < 18 ? 'Buon pomeriggio' : 'Buonasera';
            setEl('topbar-greeting', `${saluto}, ${firstName || currentUserName}`);

            // ── 4. Mostra app e aggiorna navigazione per ruolo ───────────────
            if (authContainer) authContainer.style.display = 'none';
            if (mainApp)       mainApp.style.display       = 'flex';

            updateNavByRole();

            // ── 5. Carica dati ───────────────────────────────────────────────
            try {
                await loadMyUpvotes();
                await loadInsights();
                await populateDatalists();
            } catch (e) {
                console.warn('Errore caricamento dati iniziali:', e);
            }
        }

        // Helper DOM
        function setEl(id, text) {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        }
        function setImgSrc(id, src) {
            const el = document.getElementById(id);
            if (el) el.src = src;
        }

        // ─── NAVIGAZIONE PER RUOLO ─────────────────────────────────────────────
        /**
         * Mostra/nasconde voci di nav e feature in base a org_role.
         * Regole:
         *  - Tutti: Nuovo Insight, Esplora, Brain, Classifiche, Profilo
         *  - team_leader+: vedono autori nelle card insight
         *  - lead+: pulsante Esporta CSV
         *  - practice_manager+: sezione Analytics (se presente)
         *  - responsabile+: possono eliminare insight altrui
         *  - bu_manager+: accesso a tutte le sezioni admin
         *  - marketing|admin: sezione Marketing AI (se presente)
         *  - admin: badge speciale, tutto visibile
         */
        function updateNavByRole() {
            // Esporta CSV — solo lead+
            const exportBtn = document.getElementById('export-btn');
            if (exportBtn) exportBtn.style.display = hasOrgRole('lead') ? 'flex' : 'none';

            // Analytics — solo practice_manager+
            const analyticsNav = document.querySelector('[data-target="view-analytics"]');
            if (analyticsNav) analyticsNav.style.display = hasOrgRole('practice_manager') ? 'flex' : 'none';

            // Marketing AI — solo marketing o admin
            const marketingNav = document.querySelector('[data-target="view-marketing"]');
            if (marketingNav) {
                marketingNav.style.display =
                    (isStaffRole('marketing') || currentUserOrgRole === 'admin') ? 'flex' : 'none';
            }

            // Pulsante "Crea Team" — tutti gli autenticati
            const createTeamBtnEl = document.getElementById('create-team-btn');
            if (createTeamBtnEl) createTeamBtnEl.style.display = 'flex';

            // Badge admin visibile nella sidebar
            const adminBadge = document.getElementById('admin-sidebar-badge');
            if (adminBadge) adminBadge.style.display = (currentUserOrgRole === 'admin') ? 'inline-flex' : 'none';

            // Sezione filtri avanzati in Esplora — solo engagement_manager+
            const advFilters = document.getElementById('advanced-filters');
            if (advFilters) advFilters.style.display = hasOrgRole('engagement_manager') ? 'block' : 'none';

            // Ricarica stats profilo se già visibile
            const profileView = document.getElementById('view-profilo');
            if (profileView && profileView.classList.contains('active')) renderProfile();
        }

        // ─── SESSION CHECK ────────────────────────────────────────────────────
        const { data: { session: initSession } } = await supa.auth.getSession();
        await updateAuthState(initSession);

        // ─── AUTH FORM ────────────────────────────────────────────────────────
        if (authSwitchLink) {
            authSwitchLink.addEventListener('click', (e) => {
                e.preventDefault();
                isLoginMode = !isLoginMode;
                authTitle.textContent       = isLoginMode ? 'Accedi al Cervello Aziendale' : 'Crea un nuovo Account';
                authSubmitBtn.textContent   = isLoginMode ? 'Accedi' : 'Registrati';
                authSwitchLink.textContent  = isLoginMode ? 'Registrati' : 'Accedi';
                authSwitchLink.parentElement.firstChild.textContent =
                    isLoginMode ? 'Non hai un account? ' : 'Hai già un account? ';
                authError.style.display = 'none';

                const showMode = isLoginMode ? 'none' : 'flex';
                ['auth-name-group', 'auth-surname-group', 'auth-role-group'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.style.display = showMode;
                });
            });
        }

        if (authForm) {
            authForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                authSubmitBtn.disabled = true;
                authSubmitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Attendere...';
                authError.style.display = 'none';

                try {
                    if (isLoginMode) {
                        const { data, error } = await supa.auth.signInWithPassword({
                            email:    authEmail.value,
                            password: authPassword.value
                        });
                        if (error) throw error;
                        await updateAuthState(data.session);
                    } else {
                        const nameVal    = document.getElementById('auth-name')?.value.trim()    || '';
                        const surnameVal = document.getElementById('auth-surname')?.value.trim() || '';
                        const orgRoleVal = document.getElementById('auth-role')?.value            || 'consulente';
                        const { data, error } = await supa.auth.signUp({
                            email:    authEmail.value,
                            password: authPassword.value,
                            options: {
                                data: {
                                    first_name: nameVal,
                                    last_name:  surnameVal,
                                    role:       orgRoleVal,
                                    org_role:   orgRoleVal
                                }
                            }
                        });
                        if (error) throw error;
                        if (data.session) {
                            await updateAuthState(data.session);
                        } else {
                            authError.textContent   = 'Controlla la tua email per confermare la registrazione!';
                            authError.style.color   = 'var(--success)';
                            authError.style.display = 'block';
                        }
                    }
                } catch (err) {
                    authError.textContent   = err.message || 'Errore di autenticazione';
                    authError.style.color   = 'var(--danger)';
                    authError.style.display = 'block';
                } finally {
                    authSubmitBtn.disabled  = false;
                    authSubmitBtn.textContent = isLoginMode ? 'Accedi' : 'Registrati';
                }
            });
        }

        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                await supa.auth.signOut();
                await updateAuthState(null);
            });
        }

        // ─── DATALISTS ────────────────────────────────────────────────────────
        async function populateDatalists() {
            if (categoryListDOM) {
                categoryListDOM.innerHTML = mockCategories
                    .map(c => `<option value="${c}"></option>`).join('');
            }

            // Clienti dal DB
            try {
                const { data, error } = await supa.from('clients').select('name').order('name');
                if (!error && data) {
                    dbClients = data.map(c => c.name);
                    if (clientListDOM) {
                        clientListDOM.innerHTML = dbClients
                            .map(c => `<option value="${c}"></option>`).join('');
                    }
                }
            } catch (e) { console.error('Clienti:', e); }

            // Team dal DB
            try {
                if (currentUser) {
                    const { data: memberships } = await supa
                        .from('team_members')
                        .select('team_id')
                        .eq('user_email', currentUser);

                    if (memberships && memberships.length > 0) {
                        const ids = memberships.map(m => m.team_id);
                        const { data: teams } = await supa
                            .from('teams').select('name').in('id', ids);
                        if (teams) userTeams = teams.map(t => t.name);
                    }
                }
                const teamsToShow = userTeams.length > 0 ? userTeams : mockTeams;
                if (teamListDOM) {
                    teamListDOM.innerHTML = teamsToShow
                        .map(t => `<option value="${t}"></option>`).join('');
                }
            } catch (e) {
                console.error('Team:', e);
                if (teamListDOM) {
                    teamListDOM.innerHTML = mockTeams
                        .map(t => `<option value="${t}"></option>`).join('');
                }
            }
        }

        // ─── UPVOTES ──────────────────────────────────────────────────────────
        async function loadMyUpvotes() {
            if (!currentUser) return;
            try {
                const { data } = await supa
                    .from('user_upvotes')
                    .select('insight_id')
                    .eq('user_email', currentUser);
                if (data) myUpvotedIds = new Set(data.map(u => u.insight_id));
            } catch (e) { console.error('Upvotes:', e); }
        }

        // ─── LOAD INSIGHTS ────────────────────────────────────────────────────
        async function loadInsights() {
            try {
                const { data, error } = await supa
                    .from('insights')
                    .select('*')
                    .order('created_at', { ascending: false });

                if (error) throw error;
                allInsights = data || [];

                // Calcolo stats utente corrente
                const now         = new Date();
                const startOfWeek = new Date(now);
                startOfWeek.setDate(now.getDate() - now.getDay());
                startOfWeek.setHours(0, 0, 0, 0);

                const myInsights = allInsights.filter(
                    i => (i.author_email || i.author) === currentUser
                );
                weeklyInsights = myInsights.filter(
                    i => new Date(i.created_at) >= startOfWeek
                ).length;

                const myUpvotesTotal = myInsights.reduce(
                    (sum, i) => sum + (i.upvotes || 0), 0
                );
                points = (myInsights.length * 50) + (myUpvotesTotal * 10);

                // Aggiorna UI
                totalPointsEls.forEach(el => { el.textContent = points; });
                if (profileTotalPoints)   profileTotalPoints.textContent   = points;
                if (profileTotalInsights) profileTotalInsights.textContent = myInsights.length;
                if (profileTotalUpvotes)  profileTotalUpvotes.textContent  = myUpvotesTotal;

                updateProgressBar();

                // Refresh viste aperte
                const esploraView    = document.getElementById('view-esplora-dati');
                const profileView    = document.getElementById('view-profilo');
                const leaderboardView= document.getElementById('view-classifica');

                if (esploraView    && esploraView.classList.contains('active'))
                    renderInsights(allInsights, insightsGrid, true);
                if (profileView    && profileView.classList.contains('active'))
                    renderProfile();
                if (leaderboardView && leaderboardView.classList.contains('active'))
                    renderLeaderboards();

            } catch (e) {
                console.error('loadInsights:', e);
                allInsights = [];
                points = 0;
                weeklyInsights = 0;
                totalPointsEls.forEach(el => { el.textContent = 0; });
            }
        }

        // ─── PROGRESS BAR ────────────────────────────────────────────────────
        function updateProgressBar() {
            const pct = Math.min((weeklyInsights / weeklyGoal) * 100, 100);
            if (weeklyProgressEl) weeklyProgressEl.style.width = `${pct}%`;
            if (goalTextEl)       goalTextEl.textContent = `${weeklyInsights}/${weeklyGoal} Insight`;
            if (goalHintEl) {
                if (weeklyInsights >= weeklyGoal) {
                    goalHintEl.innerHTML = `<i class="fa-solid fa-trophy" style="color:#F59E0B"></i> Hai raggiunto l'obiettivo settimanale! Ottimo lavoro.`;
                    goalHintEl.style.color = '#10B981';
                } else {
                    goalHintEl.textContent =
                        `Ancora ${weeklyGoal - weeklyInsights} insight per sbloccare il badge "Observer della Settimana"!`;
                    goalHintEl.style.color = '';
                }
            }
        }

        // ─── SPA NAVIGATION ───────────────────────────────────────────────────
        navItems.forEach(item => {
            item.addEventListener('click', async (e) => {
                if (item.tagName === 'A') e.preventDefault();

                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                if (item.classList.contains('nav-item')) item.classList.add('active');

                viewSections.forEach(section => {
                    section.classList.remove('active');
                    section.classList.add('hidden');
                    if (section.id === 'view-ai') section.style.display = 'none';
                });

                const targetId      = item.getAttribute('data-target');
                const targetSection = document.getElementById(targetId);

                if (targetSection) {
                    targetSection.classList.remove('hidden');
                    targetSection.classList.add('active');
                    if (targetId === 'view-ai') targetSection.style.display = 'flex';

                    if (targetId === 'view-esplora-dati') {
                        await loadInsights();
                        renderInsights(allInsights, insightsGrid, true);
                        if (searchInput) searchInput.value = '';
                    }
                    if (targetId === 'view-classifica') renderLeaderboards();
                    if (targetId === 'view-profilo')    renderProfile();
                }
            });
        });

        // ─── INSIGHT FORM ────────────────────────────────────────────────────
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const origHtml = submitBtn.innerHTML;
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvataggio...';

                const titleVal           = document.getElementById('title').value.trim();
                const clientVal          = document.getElementById('client').value.trim();
                const catVal             = document.getElementById('category').value.trim();
                const teamVal            = document.getElementById('team').value.trim();
                const detailsVal         = document.getElementById('details').value.trim();
                const confidentialityVal = document.getElementById('confidentiality')?.value || 'pubblico';

                try {
                    const { error } = await supa.from('insights').insert([{
                        title:           titleVal,
                        client:          clientVal,
                        category:        catVal,
                        team:            teamVal,
                        snippet:         detailsVal,
                        author_email:    currentUser,
                        author_id:       currentUserId,
                        upvotes:         0,
                        confidentiality: confidentialityVal
                    }]);
                    if (error) throw error;

                    showToast(
                        'Insight Inviato!',
                        `Hai guadagnato <strong class="highlight">+50 punti</strong> per il tuo contributo.`,
                        'fa-check-circle'
                    );
                    form.reset();

                    if (clientVal && !dbClients.includes(clientVal)) {
                        await supa.from('clients').insert([{ name: clientVal }]);
                        await populateDatalists();
                    }

                    await loadInsights();

                    const esploraLink = document.querySelector('[data-target="view-esplora-dati"]');
                    if (esploraLink) esploraLink.click();

                } catch (err) {
                    console.error('Salvataggio insight:', err);
                    showToast('Errore di Salvataggio', err.message || 'Controlla la console.', 'fa-xmark', false);
                } finally {
                    submitBtn.disabled  = false;
                    submitBtn.innerHTML = origHtml;
                }
            });
        }

        // ─── RENDER INSIGHTS ──────────────────────────────────────────────────
        /**
         * forceAnonymous = true  → vista Esplora (anonimato per consulenti base)
         * forceAnonymous = false → vista Profilo (l'utente vede i propri insight con dati completi)
         */
        function renderInsights(insights, container, forceAnonymous = false) {
            if (!container) return;
            container.innerHTML = '';

            if (insights.length === 0) {
                container.innerHTML =
                    '<p style="color:var(--text-muted);grid-column:1/-1;">Nessun insight trovato. Sii il primo a inserirne uno!</p>';
                return;
            }

            insights.forEach(insight => {
                const card    = document.createElement('div');
                card.className = 'insight-card';

                const dateStr = formatDate(insight.created_at);
                const conf    = insight.confidentiality || 'pubblico';

                // Autore: team_leader+ vedono sempre l'autore; gli altri vedono anonimo nella vista Esplora
                const showAuthor    = !forceAnonymous || canSeeAuthor();
                const rawAuthor     = insight.author_email || insight.author || 'Utente Sconosciuto';
                const displayAuthor = showAuthor ? rawAuthor : 'Consulente (Anonimo)';
                const avatarName    = showAuthor
                    ? rawAuthor.replace('@', ' ').replace('.', ' ')
                    : 'CA';
                const avatarUrl     = `https://ui-avatars.com/api/?name=${encodeURIComponent(avatarName)}&background=1E293B&color=fff`;

                // Cliente: riservato → anonimo per consulenti base; segreto → già filtrato dal DB
                const canSeeClient  = conf !== 'riservato' || hasOrgRole('team_leader');
                const displayClient = canSeeClient ? (insight.client || 'N/A') : 'Cliente Riservato';

                // Badge confidenzialità
                const confBadge = conf === 'segreto'
                    ? `<span class="badge" style="background:rgba(239,68,68,0.1);color:#EF4444;font-size:0.7rem;"><i class="fa-solid fa-lock"></i> Segreto</span>`
                    : conf === 'riservato'
                    ? `<span class="badge" style="background:rgba(245,158,11,0.1);color:#F59E0B;font-size:0.7rem;"><i class="fa-solid fa-eye-slash"></i> Riservato</span>`
                    : '';

                // Upvote
                const isMyInsight   = rawAuthor === currentUser;
                const alreadyVoted  = myUpvotedIds.has(insight.id);
                let upvoteHtml;
                if (isMyInsight) {
                    upvoteHtml = `<span style="font-size:0.8rem;color:var(--text-muted);">
                        <i class="fa-solid fa-check"></i> Utile (${insight.upvotes || 0})</span>`;
                } else if (alreadyVoted) {
                    upvoteHtml = `<button class="btn-upvote upvoted" data-id="${insight.id}" disabled>
                        <i class="fa-solid fa-check-double"></i> Utile
                        <span class="upvote-count">(${insight.upvotes || 0})</span></button>`;
                } else {
                    upvoteHtml = `<button class="btn-upvote" data-id="${insight.id}">
                        <i class="fa-solid fa-check"></i> Utile
                        <span class="upvote-count">(${insight.upvotes || 0})</span></button>`;
                }

                // Elimina: autore o responsabile+
                const deleteHtml = canDeleteInsight(insight)
                    ? `<button class="btn-delete-insight" data-id="${insight.id}"
                        style="background:transparent;border:1px solid rgba(239,68,68,0.3);color:var(--danger);
                               padding:0.35rem 0.75rem;border-radius:var(--radius-full);font-size:0.8rem;
                               display:flex;align-items:center;gap:0.4rem;" title="Elimina insight">
                        <i class="fa-solid fa-trash-can"></i></button>`
                    : '';

                // Badge ruolo autore (visibile solo a team_leader+)
                const authorRoleBadge = showAuthor && insight.author_org_role
                    ? (() => {
                        const rc = ROLE_COLORS[insight.author_org_role] || {};
                        const rl = ROLE_LABELS[insight.author_org_role] || '';
                        return rl ? `<span style="font-size:0.7rem;padding:0.1rem 0.5rem;
                            border-radius:var(--radius-full);background:${rc.bg};color:${rc.color};">${rl}</span>` : '';
                    })()
                    : '';

                card.innerHTML = `
                    <div class="card-header">
                        <div class="card-badges">
                            <span class="badge badge-client"><i class="fa-solid fa-building"></i> ${displayClient}</span>
                            <span class="badge badge-category"><i class="fa-solid fa-tag"></i> ${insight.category || 'N/A'}</span>
                            <span class="badge badge-team"><i class="fa-solid fa-users"></i> ${insight.team || 'N/A'}</span>
                            ${confBadge}
                        </div>
                    </div>
                    <h3 class="card-title">${insight.title || 'Senza Titolo'}</h3>
                    <p class="card-snippet">${insight.snippet || ''}</p>
                    <div class="card-footer">
                        <div class="card-author">
                            <img src="${avatarUrl}" alt="Author">
                            <div style="display:flex;flex-direction:column;gap:0.2rem;">
                                <span>${displayAuthor} • ${dateStr}</span>
                                ${authorRoleBadge}
                            </div>
                        </div>
                        <div style="display:flex;gap:0.5rem;align-items:center;">
                            ${upvoteHtml}
                            ${deleteHtml}
                        </div>
                    </div>
                `;
                container.appendChild(card);
            });

            // ── Upvote handler ────────────────────────────────────────────────
            container.querySelectorAll('.btn-upvote:not([disabled])').forEach(btn => {
                btn.addEventListener('click', async function () {
                    const id            = this.getAttribute('data-id');
                    const targetInsight = allInsights.find(i => i.id === id);
                    if (!targetInsight) return;

                    const newUpvotes = (targetInsight.upvotes || 0) + 1;
                    this.classList.add('upvoted');
                    this.disabled = true;
                    this.innerHTML = `<i class="fa-solid fa-check-double"></i> Utile <span class="upvote-count">(${newUpvotes})</span>`;
                    targetInsight.upvotes = newUpvotes;

                    try {
                        await supa.from('insights').update({ upvotes: newUpvotes }).eq('id', id);
                        await supa.from('user_upvotes').insert([{ user_email: currentUser, insight_id: id }]);
                        myUpvotedIds.add(id);
                        showToast(
                            'Feedback Registrato',
                            `Hai validato questa informazione. L'autore riceverà <strong class="highlight">+10 punti</strong>.`,
                            'fa-check-double'
                        );
                    } catch (err) {
                        console.error('Upvote error:', err);
                    }
                });
            });

            // ── Elimina handler ───────────────────────────────────────────────
            container.querySelectorAll('.btn-delete-insight').forEach(btn => {
                btn.addEventListener('click', async function () {
                    const id = this.getAttribute('data-id');
                    if (!confirm('Sei sicuro di voler eliminare questo insight?')) return;
                    try {
                        const { error } = await supa.from('insights').delete().eq('id', id);
                        if (error) throw error;
                        allInsights = allInsights.filter(i => i.id !== id);
                        showToast('Insight Eliminato', 'L\'insight è stato rimosso dal database.', 'fa-trash-can');
                        renderProfile();
                        const esploraView = document.getElementById('view-esplora-dati');
                        if (esploraView && esploraView.classList.contains('active'))
                            renderInsights(allInsights, insightsGrid, true);
                    } catch (err) {
                        showToast('Errore', 'Impossibile eliminare l\'insight.', 'fa-triangle-exclamation', false);
                    }
                });
            });
        }

        // ─── SEARCH ───────────────────────────────────────────────────────────
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const q = e.target.value.toLowerCase().trim();
                if (!q) { renderInsights(allInsights, insightsGrid, true); return; }
                const filtered = allInsights.filter(i =>
                    [i.title, i.client, i.category, i.team, i.snippet]
                        .some(f => (f || '').toLowerCase().includes(q))
                );
                renderInsights(filtered, insightsGrid, true);
            });
        }

        // ─── PROFILO ──────────────────────────────────────────────────────────
        function renderProfile() {
            // Stats
            const myInsights     = allInsights.filter(i => (i.author_email || i.author) === currentUser);
            const myUpvotesTotal = myInsights.reduce((s, i) => s + (i.upvotes || 0), 0);
            const realPoints     = (myInsights.length * 50) + (myUpvotesTotal * 10);
            points = realPoints;

            if (profileTotalPoints)   profileTotalPoints.textContent   = realPoints;
            if (profileTotalInsights) profileTotalInsights.textContent = myInsights.length;
            if (profileTotalUpvotes)  profileTotalUpvotes.textContent  = myUpvotesTotal;
            totalPointsEls.forEach(el => { el.textContent = realPoints; });

            // I miei insight (vista privata — mostra autore reale)
            if (profileInsightsGrid) renderInsights(myInsights, profileInsightsGrid, false);

            // Team
            loadUserTeams();
        }

        // ─── LEADERBOARD ─────────────────────────────────────────────────────
        function renderLeaderboards() {
            if (!leaderboardInd || !leaderboardTeams || allInsights.length === 0) {
                if (leaderboardInd)   leaderboardInd.innerHTML   = '<li style="color:var(--text-muted);padding:1rem;">Nessun dato disponibile.</li>';
                if (leaderboardTeams) leaderboardTeams.innerHTML = '<li style="color:var(--text-muted);padding:1rem;">Nessun dato disponibile.</li>';
                return;
            }

            // ── Individuale ───────────────────────────────────────────────────
            const userScores = {};
            allInsights.forEach(i => {
                const author = i.author_email || i.author || 'Anonimo';
                if (!userScores[author]) userScores[author] = { points: 0, insights: 0 };
                userScores[author].points  += 50 + ((i.upvotes || 0) * 10);
                userScores[author].insights += 1;
            });

            leaderboardInd.innerHTML = Object.entries(userScores)
                .map(([name, s]) => ({ name, ...s }))
                .sort((a, b) => b.points - a.points)
                .slice(0, 10)
                .map((u, idx) => {
                    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`;
                    const isMe  = u.name === currentUser;
                    return `
                    <li class="leaderboard-item rank-${idx + 1}" style="${isMe ? 'background:rgba(59,130,246,0.06);border-radius:var(--radius-md);' : ''}">
                        <div class="rank-info">
                            <div class="rank-number">${medal}</div>
                            <div class="player-details">
                                <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=1E293B&color=fff" alt="${u.name}">
                                <div>
                                    <span class="player-name">${isMe ? `<strong>${u.name}</strong> <span style="font-size:0.75rem;color:var(--accent-primary)">(tu)</span>` : u.name}</span>
                                    <span class="player-team">${u.insights} insight condivisi</span>
                                </div>
                            </div>
                        </div>
                        <div class="score-badge">${u.points} pt</div>
                    </li>`;
                }).join('');

            // ── Team ─────────────────────────────────────────────────────────
            const teamScores = {};
            allInsights.forEach(i => {
                const t = i.team || 'Senza Team';
                if (!teamScores[t]) teamScores[t] = { points: 0, count: 0 };
                teamScores[t].points += 50 + ((i.upvotes || 0) * 10);
                teamScores[t].count  += 1;
            });

            leaderboardTeams.innerHTML = Object.entries(teamScores)
                .map(([name, s]) => ({ name, ...s }))
                .sort((a, b) => b.points - a.points)
                .slice(0, 5)
                .map((t, idx) => `
                <li class="leaderboard-item rank-${idx + 1}">
                    <div class="rank-info">
                        <div class="rank-number">${idx + 1}</div>
                        <div class="player-details">
                            <div style="width:36px;height:36px;border-radius:8px;background:rgba(16,185,129,0.1);
                                        display:flex;align-items:center;justify-content:center;
                                        color:var(--success);font-size:1.2rem;">
                                <i class="fa-solid fa-users"></i>
                            </div>
                            <div>
                                <span class="player-name">${t.name}</span>
                                <span class="player-team">${t.count} insight condivisi</span>
                            </div>
                        </div>
                    </div>
                    <div class="score-badge" style="color:var(--success);background:rgba(16,185,129,0.1);">${t.points} pt</div>
                </li>`).join('');
        }

        // ─── TEAM MANAGEMENT ─────────────────────────────────────────────────
        async function loadUserTeams() {
            const teamsGrid  = document.getElementById('teams-grid');
            const noTeamsMsg = document.getElementById('no-teams-msg');
            if (!teamsGrid) return;

            try {
                const { data: memberships, error: memErr } = await supa
                    .from('team_members')
                    .select('team_id')
                    .eq('user_email', currentUser);
                if (memErr) throw memErr;

                if (!memberships || memberships.length === 0) {
                    teamsGrid.innerHTML = '';
                    if (noTeamsMsg) noTeamsMsg.style.display = 'block';
                    return;
                }
                if (noTeamsMsg) noTeamsMsg.style.display = 'none';

                const teamIds = memberships.map(m => m.team_id);
                const { data: teams, error: teamErr } = await supa
                    .from('teams').select('*').in('id', teamIds);
                if (teamErr) throw teamErr;

                const { data: allMembers } = await supa
                    .from('team_members').select('*').in('team_id', teamIds);

                teamsGrid.innerHTML = teams.map(team => {
                    const members = (allMembers || []).filter(m => m.team_id === team.id);
                    const membersHtml = members.map(m => {
                        const name = m.user_name || m.user_email.split('@')[0];
                        return `<div style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0;">
                            <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1E293B&color=fff&size=28"
                                 style="width:28px;height:28px;border-radius:50%;">
                            <span style="font-size:0.85rem;color:var(--text-secondary);">${name}</span>
                        </div>`;
                    }).join('');

                    return `<div style="background:var(--bg-surface);border:1px solid var(--border-color);
                                border-radius:var(--radius-lg);padding:1.5rem;transition:var(--transition);"
                                onmouseover="this.style.transform='translateY(-4px)';this.style.boxShadow='var(--shadow-lg)'"
                                onmouseout="this.style.transform='none';this.style.boxShadow='none'">
                        <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem;
                                    padding-bottom:0.75rem;border-bottom:1px solid var(--border-color);">
                            <div style="width:40px;height:40px;border-radius:10px;background:rgba(59,130,246,0.1);
                                        display:flex;align-items:center;justify-content:center;
                                        color:var(--accent-primary);font-size:1.1rem;">
                                <i class="fa-solid fa-users"></i>
                            </div>
                            <div>
                                <h4 style="color:var(--text-primary);font-size:1rem;">${team.name}</h4>
                                <span style="font-size:0.75rem;color:var(--text-muted);">
                                    ${members.length} membr${members.length === 1 ? 'o' : 'i'}
                                </span>
                            </div>
                        </div>
                        <div>${membersHtml}</div>
                    </div>`;
                }).join('');

            } catch (err) {
                console.error('loadUserTeams:', err);
                teamsGrid.innerHTML = '<p style="color:var(--danger);">Errore nel caricamento dei team.</p>';
            }
        }

        const createTeamBtn  = document.getElementById('create-team-btn');
        const createTeamForm = document.getElementById('create-team-form');
        const cancelTeamBtn  = document.getElementById('cancel-team-btn');
        const saveTeamBtn    = document.getElementById('save-team-btn');

        if (createTeamBtn && createTeamForm) {
            createTeamBtn.addEventListener('click', () => {
                createTeamForm.style.display = 'block';
                createTeamBtn.style.display  = 'none';
            });
        }
        if (cancelTeamBtn) {
            cancelTeamBtn.addEventListener('click', () => {
                createTeamForm.style.display = 'none';
                if (createTeamBtn) createTeamBtn.style.display = 'flex';
            });
        }
        if (saveTeamBtn) {
            saveTeamBtn.addEventListener('click', async () => {
                const teamName    = document.getElementById('new-team-name')?.value.trim();
                const membersText = document.getElementById('new-team-members')?.value.trim();
                if (!teamName) { alert('Inserisci un nome per il team'); return; }

                saveTeamBtn.disabled = true;
                saveTeamBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creazione...';

                try {
                    const { data: newTeam, error: teamErr } = await supa
                        .from('teams')
                        .insert([{ name: teamName, created_by: currentUser }])
                        .select().single();
                    if (teamErr) throw teamErr;

                    const { data: { session: s } } = await supa.auth.getSession();
                    const meta        = s?.user?.user_metadata || {};
                    const creatorName = (meta.first_name && meta.last_name)
                        ? `${meta.first_name} ${meta.last_name}`
                        : currentUser.split('@')[0];

                    const membersToInsert = [{ team_id: newTeam.id, user_email: currentUser, user_name: creatorName }];
                    if (membersText) {
                        membersText.split('\n')
                            .map(e => e.trim())
                            .filter(e => e && e.includes('@') && e !== currentUser)
                            .forEach(email => {
                                membersToInsert.push({
                                    team_id:    newTeam.id,
                                    user_email: email,
                                    user_name:  email.split('@')[0]
                                });
                            });
                    }

                    const { error: memErr } = await supa.from('team_members').insert(membersToInsert);
                    if (memErr) throw memErr;

                    document.getElementById('new-team-name').value    = '';
                    document.getElementById('new-team-members').value = '';
                    createTeamForm.style.display = 'none';
                    if (createTeamBtn) createTeamBtn.style.display = 'flex';

                    showToast(
                        'Team Creato!',
                        `"${teamName}" è stato creato con ${membersToInsert.length} membr${membersToInsert.length === 1 ? 'o' : 'i'}.`,
                        'fa-people-group'
                    );
                    await loadUserTeams();
                    await populateDatalists();

                } catch (err) {
                    showToast('Errore', 'Impossibile creare il team: ' + err.message, 'fa-triangle-exclamation', false);
                } finally {
                    saveTeamBtn.disabled  = false;
                    saveTeamBtn.innerHTML = '<i class="fa-solid fa-check"></i> Crea';
                }
            });
        }

        // ─── MAGIC INSERT AI ──────────────────────────────────────────────────
        const aiParseBtn = document.getElementById('ai-parse-btn');
        const aiRawText  = document.getElementById('ai-raw-text');

        if (aiParseBtn && aiRawText) {
            aiParseBtn.addEventListener('click', async () => {
                const text = aiRawText.value.trim();
                if (!text) return;

                const origHtml = aiParseBtn.innerHTML;
                aiParseBtn.innerHTML  = '<i class="fa-solid fa-spinner fa-spin"></i> Elaborazione...';
                aiParseBtn.disabled   = true;

                try {
                    const res = await fetch('/api/parse-insight', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text })
                    });
                    if (!res.ok) throw new Error('Errore API');
                    const data = await res.json();

                    document.getElementById('title').value    = data.title    || '';
                    document.getElementById('client').value   = data.client   || '';
                    document.getElementById('category').value = data.category || '';
                    document.getElementById('team').value     = data.team     || '';
                    document.getElementById('details').value  = data.snippet  || '';

                    showToast('Magia completata', 'Controlla i dati estratti e clicca Invia Insight', 'fa-wand-magic-sparkles');
                } catch (err) {
                    showToast('Errore', 'Impossibile analizzare il testo', 'fa-triangle-exclamation', false);
                } finally {
                    aiParseBtn.innerHTML = origHtml;
                    aiParseBtn.disabled  = false;
                }
            });
        }

        // ─── MICROPHONE ───────────────────────────────────────────────────────
        const micBtn = document.getElementById('ai-mic-btn');
        let mediaRecorder = null;
        let audioChunks   = [];
        let isRecording   = false;

        if (micBtn) {
            micBtn.addEventListener('click', async () => {
                if (!isRecording) {
                    try {
                        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        mediaRecorder = new MediaRecorder(stream);
                        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
                        mediaRecorder.onstop = async () => {
                            micBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                            const blob   = new Blob(audioChunks, { type: 'audio/webm' });
                            audioChunks  = [];
                            const reader = new FileReader();
                            reader.readAsDataURL(blob);
                            reader.onloadend = async () => {
                                try {
                                    const res = await fetch('/api/transcribe', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ audioBase64: reader.result })
                                    });
                                    if (!res.ok) throw new Error('Errore trascrizione');
                                    const data = await res.json();
                                    const cur  = aiRawText.value;
                                    aiRawText.value = cur ? cur + ' ' + data.text : data.text;
                                    showToast('Trascrizione pronta', 'Puoi modificare il testo o cliccare Analizza Appunti', 'fa-comment-dots');
                                } catch (err) {
                                    showToast('Errore API Audio', 'Assicurati di essere in cloud', 'fa-microphone-slash', false);
                                } finally {
                                    micBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
                                    micBtn.classList.remove('recording');
                                }
                            };
                        };
                        mediaRecorder.start();
                        isRecording = true;
                        micBtn.classList.add('recording');
                        showToast('In ascolto...', 'Parla ora. Clicca di nuovo per terminare.', 'fa-microphone');
                    } catch (err) {
                        alert('Devi autorizzare il microfono per usare questa funzione.');
                    }
                } else {
                    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                        mediaRecorder.stop();
                        mediaRecorder.stream.getTracks().forEach(t => t.stop());
                    }
                    isRecording = false;
                }
            });
        }

        // ─── AI CHAT ─────────────────────────────────────────────────────────
        if (chatForm) {
            chatForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const text = chatInput.value.trim();
                if (!text) return;

                appendChatMessage('user', text);
                chatInput.value = '';
                const typingId  = appendTypingIndicator();
                chatHistory.scrollTop = chatHistory.scrollHeight;

                try {
                    const response = await fetch('/api/ask-brain', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ prompt: text })
                    });
                    if (!response.ok) throw new Error('Errore API ' + response.status);
                    const data = await response.json();
                    document.getElementById(typingId)?.remove();
                    const formatted = data.answer
                        .replace(/\n/g, '<br>')
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                    appendChatMessage('ai', formatted);
                } catch (err) {
                    document.getElementById(typingId)?.remove();
                    appendChatMessage('ai',
                        'Si è verificato un errore di connessione. Assicurati che l\'app sia su Vercel affinché l\'API funzioni.');
                }
                chatHistory.scrollTop = chatHistory.scrollHeight;
            });
        }

        function appendChatMessage(sender, html) {
            const div   = document.createElement('div');
            div.className = `chat-message ${sender}`;
            div.innerHTML = `
                <div class="msg-avatar"><i class="fa-solid ${sender === 'ai' ? 'fa-robot' : 'fa-user'}"></i></div>
                <div class="msg-content">${html}</div>`;
            chatHistory.appendChild(div);
        }

        function appendTypingIndicator() {
            const id  = 'typing-' + Date.now();
            const div = document.createElement('div');
            div.className = 'chat-message ai';
            div.id        = id;
            div.innerHTML = `
                <div class="msg-avatar"><i class="fa-solid fa-robot"></i></div>
                <div class="msg-content">
                    <div class="typing-indicator"><span></span><span></span><span></span></div>
                </div>`;
            chatHistory.appendChild(div);
            return id;
        }

        // ─── TOAST ───────────────────────────────────────────────────────────
        function showToast(title, message, iconClass, success = true) {
            if (!toast) return;
            toastTitle.textContent  = title;
            toastMessage.innerHTML  = message;
            toastIconI.className    = `fa-solid ${iconClass}`;
            toast.style.borderLeftColor = success ? 'var(--success)' : 'var(--danger)';
            toastIconI.style.color      = success ? 'var(--success)' : 'var(--danger)';

            toast.classList.remove('hidden');
            void toast.offsetWidth;
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.classList.add('hidden'), 400);
            }, 4000);
        }

        // ─── UTILS ───────────────────────────────────────────────────────────
        function formatDate(iso) {
            const d = new Date(iso);
            return isNaN(d) ? 'Data sconosciuta'
                : d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
        }

    } catch (err) {
        document.body.innerHTML +=
            `<div style="position:fixed;top:0;left:0;right:0;background:red;color:white;padding:20px;z-index:99999;">
                JS ERROR: ${err.message}<br>${err.stack}
            </div>`;
        console.error(err);
    }
})();