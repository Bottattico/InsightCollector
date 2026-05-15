(async function initApp() {
    console.log("SYSTEM: Initializing with Supabase & Groq");

    try {
        // --- INIZIALIZZA SUPABASE ---
        const supa = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

        // --- AUTHENTICATION LOGIC ---
        let isLoginMode = true;
        const authContainer = document.getElementById('auth-container');
        const mainApp = document.getElementById('main-app');
        const authForm = document.getElementById('auth-form');
        const authEmail = document.getElementById('auth-email');
        const authPassword = document.getElementById('auth-password');
        const authTitle = document.getElementById('auth-title');
        const authSubmitBtn = document.getElementById('auth-submit-btn');
        const authSwitchLink = document.getElementById('auth-switch-link');
        const authError = document.getElementById('auth-error');
        const logoutBtn = document.getElementById('logout-btn');

        let currentUser = null;

        // ─── ROLE SYSTEM ─────────────────────────────────────────────────────
        let currentUserOrgRole = 'consulente';
        const ORG_ROLE_LEVEL = {
            consulente: 0, team_leader: 1, engagement_manager: 2,
            lead: 3, practice_manager: 4, responsabile: 5, bu_manager: 6,
            marketing: 1, sales: 1, hr: 1, operations: 1, admin: 99
        };
        const ROLE_LABELS = {
            consulente: 'Consulente', team_leader: 'Team Leader',
            engagement_manager: 'Engagement Manager', lead: 'Lead',
            practice_manager: 'Practice Manager', responsabile: 'Responsabile',
            bu_manager: 'BU Manager', marketing: 'Marketing', sales: 'Sales',
            hr: 'HR', operations: 'Operations', admin: 'Admin'
        };
        function hasOrgRole(minRole) {
            return (ORG_ROLE_LEVEL[currentUserOrgRole] ?? 0) >= (ORG_ROLE_LEVEL[minRole] ?? 0);
        }
        function isStaffRole(fn) { return currentUserOrgRole === fn; }
        const STAFF_ROLES = ['marketing', 'sales', 'hr', 'operations'];
        function isStaff() { return STAFF_ROLES.includes(currentUserOrgRole); }
        function formatDate(iso) {
            const d = new Date(iso);
            return isNaN(d) ? 'Data sconosciuta'
                : d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
        }


        async function updateAuthState(session) {
            if (session) {
                currentUser = session.user.email;
                if(authContainer) authContainer.style.display = 'none';
                if(mainApp) mainApp.style.display = 'flex';
                
                // Update UI Profile names (usa nome e cognome se disponibili)
                const meta = session.user.user_metadata || {};
                const userNameDisplay = (meta.first_name && meta.last_name) 
                    ? `${meta.first_name} ${meta.last_name}` 
                    : currentUser.split('@')[0];
                const sidebarName = document.getElementById('sidebar-name');
                const profileName = document.getElementById('profile-name-large');
                if(sidebarName) sidebarName.textContent = userNameDisplay;
                if(profileName) profileName.textContent = userNameDisplay;

                // Update Role
                const userRole = session.user.user_metadata?.role || "Consulente";
                const sidebarRole = document.getElementById('sidebar-role');
                const profileRole = document.getElementById('profile-role-large');
                if(sidebarRole) sidebarRole.textContent = userRole;
                if(profileRole) profileRole.textContent = userRole;
                
                const avatarUrl = `https://ui-avatars.com/api/?name=${userNameDisplay}&background=3B82F6&color=fff`;
                const sidebarAv = document.getElementById('sidebar-avatar');
                const profileAv = document.getElementById('profile-avatar-large');
                if(sidebarAv) sidebarAv.src = avatarUrl;
                if(profileAv) profileAv.src = avatarUrl + "&size=120";

                // Load Data — carica profilo, poi dati
                try {
                    const { data: profile } = await supa
                        .from('profiles')
                        .select('org_role, first_name, last_name')
                        .eq('id', session.user.id)
                        .single();

                    if (profile?.org_role) currentUserOrgRole = profile.org_role;

                    // Nome reale dal profilo DB
                    const realFirst = profile?.first_name || meta.first_name || '';
                    const realLast  = profile?.last_name  || meta.last_name  || '';
                    const realName  = (realFirst && realLast) ? realFirst + ' ' + realLast
                                    : realFirst || currentUser.split('@')[0];
                    if (sidebarName) sidebarName.textContent = realName;
                    if (profileName) profileName.textContent = realName;
                    const sidebarAv2 = document.getElementById('sidebar-avatar');
                    const profileAv2 = document.getElementById('profile-avatar-large');
                    const av2 = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(realName) + '&background=3B82F6&color=fff';
                    if (sidebarAv2) sidebarAv2.src = av2;
                    if (profileAv2) profileAv2.src = av2 + '&size=120';

                    // Greeting dinamico
                    const hour = new Date().getHours();
                    const saluto = hour < 12 ? 'Buongiorno' : hour < 18 ? 'Buon pomeriggio' : 'Buonasera';
                    const greetingEl = document.getElementById('topbar-greeting');
                    if (greetingEl) greetingEl.textContent = saluto + ', ' + (realFirst || realName);

                    // Badge ruolo
                    const orgBadge = document.getElementById('org-role-badge');
                    if (orgBadge) orgBadge.textContent = ROLE_LABELS[currentUserOrgRole] || currentUserOrgRole;
                    const sidebarRoleEl = document.getElementById('sidebar-role');
                    if (sidebarRoleEl) sidebarRoleEl.textContent = ROLE_LABELS[currentUserOrgRole] || currentUserOrgRole;

                    updateNavByRole();
                    await loadMyUpvotes();
                    await loadInsights();
                    populateDatalists();
                } catch(e) {
                    console.warn("Errore caricamento profilo:", e);
                    updateNavByRole();
                    await loadMyUpvotes();
                    await loadInsights();
                    populateDatalists();
                }
            } else {
                currentUser = null;
                if(authContainer) authContainer.style.display = 'flex';
                if(mainApp) mainApp.style.display = 'none';

                // ── Reset UI per il prossimo login ──────────────────────────
                // 1. Riporta alla view di default
                document.querySelectorAll('.view-section').forEach(s => {
                    s.classList.remove('active');
                    s.classList.add('hidden');
                    if (s.id === 'view-ai') s.style.display = 'none';
                });
                const dvDefault = document.getElementById('view-nuovo-insight');
                if (dvDefault) { dvDefault.classList.remove('hidden'); dvDefault.classList.add('active'); }

                // 2. Nav active state
                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                const navDefault = document.querySelector('[data-target="view-nuovo-insight"]');
                if (navDefault) navDefault.classList.add('active');

                // 3. Chat history — ripristina solo il messaggio di benvenuto
                const chatHistEl = document.getElementById('chat-history');
                if (chatHistEl) chatHistEl.innerHTML = `
                    <div class="chat-message ai">
                        <div class="msg-avatar"><i class="fa-solid fa-robot"></i></div>
                        <div class="msg-content">Ciao. Sono l'AI Senior Consultant di BTO.
                            Posso aiutarti a trovare casi studio simili, analizzare le problematiche di un cliente o estrarre insight dal nostro database reale. Come posso esserti utile oggi?
                        </div>
                    </div>`;

                // 4. Filtri ed input di ricerca
                const si = document.getElementById('search-input');
                if (si) si.value = '';
                ['filter-client','filter-sector','filter-category'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });

                // 5. Chiudi modale se aperta
                const modal = document.getElementById('insight-modal');
                if (modal) { modal.classList.add('hidden'); document.body.style.overflow = ''; }

                // 6. Content Studio — forza re-init al prossimo accesso
                try { _studioInit = false; } catch(e) {}

                // 7. Distruggi chart analytics
                try { Object.values(_charts).forEach(c => c?.destroy()); _charts = {}; } catch(e) {}
            }
        }

        // Check session on load
        const { data: { session } } = await supa.auth.getSession();
        updateAuthState(session);

        if(authSwitchLink) {
            authSwitchLink.addEventListener('click', (e) => {
                e.preventDefault();
                isLoginMode = !isLoginMode;
                authTitle.textContent = isLoginMode ? "Accedi al Cervello Aziendale" : "Crea un nuovo Account";
                authSubmitBtn.textContent = isLoginMode ? "Accedi" : "Registrati";
                authSwitchLink.textContent = isLoginMode ? "Registrati" : "Accedi";
                authSwitchLink.parentElement.firstChild.textContent = isLoginMode ? "Non hai un account? " : "Hai già un account? ";
                authError.style.display = 'none';
                
                const nameGroup = document.getElementById('auth-name-group');
                const surnameGroup = document.getElementById('auth-surname-group');
                const roleGroup = document.getElementById('auth-role-group');
                const showMode = isLoginMode ? 'none' : 'flex';
                if(nameGroup) nameGroup.style.display = showMode;
                if(surnameGroup) surnameGroup.style.display = showMode;
                if(roleGroup) roleGroup.style.display = showMode;
            });
        }

        if(authForm) {
            authForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                authSubmitBtn.disabled = true;
                authSubmitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Attendere...';
                authError.style.display = 'none';

                try {
                    if (isLoginMode) {
                        const { data, error } = await supa.auth.signInWithPassword({
                            email: authEmail.value,
                            password: authPassword.value,
                        });
                        if (error) throw error;
                        updateAuthState(data.session);
                    } else {
                        const nameVal = document.getElementById('auth-name')?.value.trim() || '';
                        const surnameVal = document.getElementById('auth-surname')?.value.trim() || '';
                        const roleVal = document.getElementById('auth-role')?.value || "Consulente";
                        const { data, error } = await supa.auth.signUp({
                            email: authEmail.value,
                            password: authPassword.value,
                            options: {
                                data: {
                                    first_name: nameVal,
                                    last_name: surnameVal,
                                    role: roleVal
                                }
                            }
                        });
                        if (error) throw error;
                        if(data.session) {
                            updateAuthState(data.session);
                        } else {
                            authError.textContent = "Controlla la tua email per confermare la registrazione!";
                            authError.style.display = 'block';
                        }
                    }
                } catch (err) {
                    authError.textContent = err.message || "Errore di autenticazione";
                    authError.style.display = 'block';
                } finally {
                    authSubmitBtn.disabled = false;
                    authSubmitBtn.textContent = isLoginMode ? "Accedi" : "Registrati";
                }
            });
        }

        if(logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                await supa.auth.signOut();
                updateAuthState(null);
            });
        }

        // --- ELEMENTI DOM ---
        const form = document.getElementById('insight-form');
        const submitBtn = document.getElementById('submit-btn');
        const toast = document.getElementById('toast');
        const toastTitle = document.getElementById('toast-title');
        const toastMessage = document.getElementById('toast-message');
        const toastIconI = document.getElementById('toast-icon-i');
        
        const totalPointsEl = document.getElementById('total-points');
        const weeklyProgressEl = document.getElementById('weekly-progress');
        const goalTextEl = document.getElementById('goal-text');
        const goalHintEl = document.querySelector('.goal-hint');

        const navItems = document.querySelectorAll('.nav-item[data-target], .user-profile[data-target]');
        const viewSections = document.querySelectorAll('.view-section');

        const insightsGrid = document.getElementById('insights-grid');
        const searchInput = document.getElementById('search-input');
        
        const clientListDOM = document.getElementById('client-list');
        const categoryListDOM = document.getElementById('category-list');
        const teamListDOM = document.getElementById('team-list');

        const profileTotalPoints = document.getElementById('profile-total-points');
        const profileTotalInsights = document.getElementById('profile-total-insights');
        const profileTotalUpvotes = document.getElementById('profile-total-upvotes');
        const profileInsightsGrid = document.getElementById('profile-insights-grid');

        const leaderboardInd = document.getElementById('leaderboard-individuals');
        const leaderboardTeams = document.getElementById('leaderboard-teams');

        // AI Chat DOM
        const chatForm = document.getElementById('chat-form');
        const chatInput = document.getElementById('chat-input');
        const chatHistory = document.getElementById('chat-history');

        // --- UTENTE CORRENTE ---
        // (currentUser è ora gestito da Supabase Auth)
        let points = 0;
        let weeklyInsights = 0;
        const weeklyGoal = 5;

        // --- STATO ---
        let allInsights = [];
        let draftInsights = [];

        // Categorie e team base (in produzione verrebbero anche questi dal DB)
        let mockCategories = ["Strategia", "Tecnologia", "Processi", "Competitor", "Cultura", "CyberSecurity"];
        let mockTeams = ["Team AI Transformation", "Team Cloud Journey", "Team Agile Governance", "Team CyberSecurity"];
        let dbClients = [];
        let userTeams = [];
        let myTeamNames = []; // team di cui l'utente è effettivamente membro (usato per filtrare il badge)

        // ─── NAVIGAZIONE PER RUOLO ───────────────────────────────────────────
        function updateNavByRole() {
            // Da Validare — team_leader+
            const validaNav = document.querySelector('[data-target="view-valida"]');
            if (validaNav) validaNav.style.display = (hasOrgRole('team_leader') && !isStaff()) ? 'flex' : 'none';

            // Crea Team — team_leader+
            const createTeamBtnEl = document.getElementById('create-team-btn');
            if (createTeamBtnEl) createTeamBtnEl.style.display = hasOrgRole('team_leader') ? 'flex' : 'none';

            // Esporta — lead+
            const exportBtn = document.getElementById('export-btn');
            if (exportBtn) exportBtn.style.display = hasOrgRole('lead') ? 'flex' : 'none';

            // Analytics — engagement_manager+
            const analyticsNav = document.querySelector('[data-target="view-analytics"]');
            if (analyticsNav) analyticsNav.style.display = hasOrgRole('engagement_manager') ? 'flex' : 'none';

            // Content Studio — staff o admin
            const contentStudioNav = document.querySelector('[data-target="view-content-studio"]');
            if (contentStudioNav) contentStudioNav.style.display =
                (isStaff() || currentUserOrgRole === 'admin') ? 'flex' : 'none';

            // Analytics — team_leader+ (non staff)
            const analyticsNavEl = document.querySelector('[data-target="view-analytics"]');
            if (analyticsNavEl) analyticsNavEl.style.display =
                (hasOrgRole('team_leader') && !isStaff()) ? 'flex' : 'none';

            // Export CSV — engagement_manager+
            const exportBtnEl = document.getElementById('export-btn');
            if (exportBtnEl) exportBtnEl.style.display =
                hasOrgRole('engagement_manager') ? 'flex' : 'none';

            // Contatore bozze nel badge nav
            const validaBadge = document.getElementById('valida-count-badge');
            if (validaBadge && hasOrgRole('team_leader') && !isStaff()) {
                const relevantDrafts = hasOrgRole('responsabile')
                    ? draftInsights
                    : draftInsights.filter(i => !i.team || myTeamNames.includes(i.team));
                validaBadge.textContent = relevantDrafts.length;
                validaBadge.style.display = relevantDrafts.length > 0 ? 'inline-flex' : 'none';
            }
        }

        async function populateDatalists() {
            if(categoryListDOM) categoryListDOM.innerHTML = mockCategories.map(c => `<option value="${c}"></option>`).join('');
            
            // Carica clienti dal database
            try {
                const { data, error } = await supa.from('clients').select('name').order('name');
                if (!error && data) {
                    dbClients = data.map(c => c.name);
                    if(clientListDOM) clientListDOM.innerHTML = dbClients.map(c => `<option value="${c}"></option>`).join('');
                }
            } catch(e) {
                console.error('Errore caricamento clienti:', e);
            }

            // Carica team: tutti se team_leader+, altrimenti solo i propri
            try {
                // Carica sempre i team reali dell'utente (per badge validazione)
                if (currentUser) {
                    const { data: memberships } = await supa
                        .from('team_members').select('team_id').eq('user_email', currentUser);
                    if (memberships && memberships.length > 0) {
                        const { data: ownTeams } = await supa
                            .from('teams').select('name').in('id', memberships.map(m => m.team_id));
                        myTeamNames = (ownTeams || []).map(t => t.name);
                    }
                }

                let teamsToShow = [];
                if (hasOrgRole('team_leader')) {
                    // Ruoli elevati: tutti i team nella datalist
                    const { data: allDbTeams, error } = await supa.from('teams').select('name').order('name');
                    if (!error && allDbTeams) teamsToShow = allDbTeams.map(t => t.name);
                } else {
                    // Consulente: solo i propri team nella datalist
                    teamsToShow = myTeamNames;
                }
                userTeams = teamsToShow;
                if(teamListDOM) teamListDOM.innerHTML = (teamsToShow.length > 0 ? teamsToShow : mockTeams)
                    .map(t => `<option value="${t}"></option>`).join('');
            } catch(e) {
                console.error('Errore caricamento team:', e);
                if(teamListDOM) teamListDOM.innerHTML = mockTeams.map(t => `<option value="${t}"></option>`).join('');
            }
        }
        populateDatalists();

        // --- UPVOTES PERSISTENTI ---
        let myUpvotedIds = new Set();

        async function loadMyUpvotes() {
            if (!currentUser) return;
            try {
                const { data, error } = await supa
                    .from('user_upvotes')
                    .select('insight_id')
                    .eq('user_email', currentUser);
                if (!error && data) {
                    myUpvotedIds = new Set(data.map(u => u.insight_id));
                }
            } catch(e) {
                console.error('Errore caricamento upvotes:', e);
            }
        }

        // --- ANNULLA FORM ---
        document.addEventListener('click', (e) => {
            if (e.target.closest('#annulla-btn')) {
                form?.reset();
                const aiText = document.getElementById('ai-raw-text');
                if (aiText) aiText.value = '';
            }
        });

        // --- MAGIC INSERT AI LOGIC ---
        const aiParseBtn = document.getElementById('ai-parse-btn');
        const aiRawText = document.getElementById('ai-raw-text');
        
        if (aiParseBtn && aiRawText) {
            aiParseBtn.addEventListener('click', async () => {
                const text = aiRawText.value.trim();
                if (!text) return;
                
                const origHtml = aiParseBtn.innerHTML;
                aiParseBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Elaborazione...';
                aiParseBtn.disabled = true;
                
                try {
                    const res = await fetch('/api/parse-insight', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text })
                    });
                    
                    if (!res.ok) throw new Error("Errore API");
                    const data = await res.json();
                    
                    document.getElementById('title').value = data.title || '';
                    document.getElementById('client').value = data.client || '';
                    document.getElementById('category').value = data.category || '';
                    document.getElementById('team').value = data.team || '';
                    document.getElementById('details').value = data.snippet || '';
                    
                    showToast("Magia completata", "Controlla i dati estratti e clicca Invia Insight", "fa-wand-magic-sparkles");
                } catch (err) {
                    showToast("Errore", "Impossibile analizzare il testo", "fa-triangle-exclamation", false);
                } finally {
                    aiParseBtn.innerHTML = origHtml;
                    aiParseBtn.disabled = false;
                }
            });
        }

        // --- MICROPHONE LOGIC ---
        const micBtn = document.getElementById('ai-mic-btn');
        let mediaRecorder = null;
        let audioChunks = [];
        let isRecording = false;

        if (micBtn) {
            micBtn.addEventListener('click', async () => {
                if (!isRecording) {
                    try {
                        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        mediaRecorder = new MediaRecorder(stream);
                        
                        mediaRecorder.ondataavailable = event => {
                            audioChunks.push(event.data);
                        };

                        mediaRecorder.onstop = async () => {
                            micBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                            
                            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                            audioChunks = [];
                            
                            const reader = new FileReader();
                            reader.readAsDataURL(audioBlob);
                            reader.onloadend = async () => {
                                const base64data = reader.result;
                                
                                try {
                                    const res = await fetch('/api/transcribe', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ audioBase64: base64data })
                                    });
                                    if(!res.ok) throw new Error("Errore trascrizione");
                                    const data = await res.json();
                                    
                                    const currentVal = aiRawText.value;
                                    aiRawText.value = currentVal ? currentVal + " " + data.text : data.text;
                                    
                                    showToast("Trascrizione pronta", "Puoi modificare il testo o cliccare Analizza Appunti", "fa-comment-dots");
                                } catch (err) {
                                    showToast("Errore API Audio", "Assicurati di essere in cloud", "fa-microphone-slash", false);
                                } finally {
                                    micBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
                                    micBtn.classList.remove('recording');
                                }
                            };
                        };

                        mediaRecorder.start();
                        isRecording = true;
                        micBtn.classList.add('recording');
                        showToast("In ascolto...", "Parla ora. Clicca di nuovo per terminare.", "fa-microphone");

                    } catch (err) {
                        alert("Devi autorizzare il microfono per usare questa funzione.");
                    }
                } else {
                    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                        mediaRecorder.stop();
                        mediaRecorder.stream.getTracks().forEach(track => track.stop());
                    }
                    isRecording = false;
                }
            });
        }

        // --- SPA NAVIGATION ---
        navItems.forEach(item => {
            item.addEventListener('click', async (e) => {
                if(item.tagName === 'A') e.preventDefault();
                
                document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
                if(item.classList.contains('nav-item')) item.classList.add('active');

                viewSections.forEach(section => {
                    section.classList.remove('active');
                    section.classList.add('hidden');
                    if(section.id === 'view-ai') section.style.display = 'none';
                });

                const targetId = item.getAttribute('data-target');
                const targetSection = document.getElementById(targetId);
                
                if(targetSection) {
                    targetSection.classList.remove('hidden');
                    targetSection.classList.add('active');
                    if(targetId === 'view-ai') targetSection.style.display = 'flex';
                    
                    if(targetId === 'view-esplora-dati') {
                        await loadInsights();
                        applyFilters();
                        if(searchInput) searchInput.value = '';
                    }
                    if(targetId === 'view-valida')          renderDraftInsights();
                    if(targetId === 'view-classifica')      renderLeaderboards();
                    if(targetId === 'view-profilo')         renderProfile();
                    if(targetId === 'view-analytics')       renderAnalytics();
                    if(targetId === 'view-content-studio')  initContentStudio();
                }
            });
        });

        // --- FORM LOGIC (Insert in Supabase) ---
        if(form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const originalBtnText = submitBtn.innerHTML;
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvataggio...';

                const titleVal   = document.getElementById('title').value.trim();
                const clientVal  = document.getElementById('client').value.trim();
                const catVal     = document.getElementById('category').value.trim();
                const teamVal    = document.getElementById('team').value.trim();
                const detailsVal = document.getElementById('details').value.trim();
                const sectorVal  = document.getElementById('sector')?.value.trim() || '';

                try {
                    const { data: authData } = await supa.auth.getSession();
                    const { data, error } = await supa
                        .from('insights')
                        .insert([{
                            title:        titleVal,
                            client:       clientVal,
                            category:     catVal,
                            team:         teamVal,
                            sector:       sectorVal,
                            snippet:      detailsVal,
                            author_email: currentUser,
                            author_id:    authData?.session?.user?.id || null,
                            upvotes:      0,
                            status:       'bozza'
                        }]);

                    if (error) throw error;

                    showToast(
                        "Insight Inserito!",
                        "Il tuo insight è in bozza. Sarà visibile a tutti dopo la validazione del tuo Team Leader.",
                        "fa-hourglass-half"
                    );

                    form.reset();

                    if (clientVal && !dbClients.includes(clientVal)) {
                        await supa.from('clients').insert([{ name: clientVal }]);
                        populateDatalists();
                    }

                    await loadInsights();

                    const esploraLink = document.querySelector('[data-target="view-esplora-dati"]');
                    if (esploraLink) esploraLink.click();

                } catch (err) {
                    console.error("Errore salvataggio:", err);
                    alert("ERRORE DATABASE: " + (err.message || JSON.stringify(err)) + "\n\nSe dice 'relation insights does not exist' significa che non hai creato la tabella su Supabase! Se dice 'new row violates row-level security' devi disabilitare RLS sulla tabella.");
                    showToast("Errore di Salvataggio", "C'è stato un problema nel salvare l'insight nel database. Riprova.", "fa-xmark", false);
                } finally {
                    submitBtn.disabled = false; 
                    submitBtn.innerHTML = originalBtnText;
                }
            });
        }

        // --- CARD RENDERER (Con Anonimato) ---
        function renderInsights(insights, container, forceAnonymous = false) {
            if(!container) return;
            container.innerHTML = '';
            
            if(insights.length === 0) {
                container.innerHTML = '<p style="color: var(--text-muted); grid-column: 1/-1;">Nessun insight trovato. Sii il primo a inserirne uno!</p>';
                return;
            }

            insights.forEach(insight => {
                const card = document.createElement('div');
                card.className = 'insight-card';
                
                // Formatta Data
                const dateObj = new Date(insight.created_at);
                const dateStr = isNaN(dateObj) ? "Data sconosciuta" : dateObj.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

                // Autore e avatar
                const rawAuthor     = insight.author_email || insight.author || 'Utente Sconosciuto';
                const displayAuthor = rawAuthor;
                const avatarUrl     = `https://ui-avatars.com/api/?name=${encodeURIComponent(rawAuthor)}&background=1E293B&color=fff`;
                const displayClient = insight.client || 'N/A';

                // Badge bozza
                const isBozza    = insight.status === 'bozza';
                const bozzaBadge = isBozza
                    ? `<span class="badge" style="background:rgba(245,158,11,0.1);color:#F59E0B;font-size:0.7rem;"><i class="fa-solid fa-clock"></i> Bozza</span>`
                    : '';

                const isMyInsight = (insight.author_email || insight.author) === currentUser;
                const alreadyUpvoted = myUpvotedIds.has(insight.id);
                let upvoteHtml;
                if (isMyInsight) {
                    upvoteHtml = `<span style="font-size: 0.8rem; color: var(--text-muted);"><i class="fa-solid fa-check"></i> Utile (${insight.upvotes || 0})</span>`;
                } else if (alreadyUpvoted) {
                    upvoteHtml = `<button class="btn-upvote upvoted" data-id="${insight.id}" disabled><i class="fa-solid fa-check-double"></i> Utile <span class="upvote-count">(${insight.upvotes || 0})</span></button>`;
                } else {
                    upvoteHtml = `<button class="btn-upvote" data-id="${insight.id}"><i class="fa-solid fa-check"></i> Utile <span class="upvote-count">(${insight.upvotes || 0})</span></button>`;
                }

                // Elimina: autore o responsabile+
                const canDelete  = isMyInsight ||
                    (!isStaff() && hasOrgRole('team_leader') && myTeamNames.includes(insight.team || '')) ||
                    hasOrgRole('engagement_manager');
                const deleteHtml = canDelete
                    ? `<button class="btn-delete-insight" data-id="${insight.id}"
                        style="background:transparent;border:1px solid rgba(239,68,68,0.3);color:var(--danger);
                               padding:0.35rem 0.75rem;border-radius:var(--radius-full);font-size:0.8rem;
                               display:flex;align-items:center;gap:0.4rem;" title="Elimina insight">
                        <i class="fa-solid fa-trash-can"></i></button>`
                    : '';

                card.style.cursor = 'pointer';
                card.addEventListener('click', e => {
                    if (!e.target.closest('button')) openInsightModal(insight);
                });

                card.innerHTML = `
                    <div class="card-header">
                        <div class="card-badges">
                            <span class="badge badge-client"><i class="fa-solid fa-building"></i> ${displayClient}</span>
                            <span class="badge badge-category"><i class="fa-solid fa-tag"></i> ${insight.category || 'N/A'}</span>
                            <span class="badge badge-team"><i class="fa-solid fa-users"></i> ${insight.team || 'N/A'}</span>
                        </div>
                    </div>
                    <h3 class="card-title">${insight.title || 'Senza Titolo'}</h3>
                    <p class="card-snippet">${insight.snippet || ''}</p>
                    <div class="card-footer">
                        <div class="card-author">
                            <img src="${avatarUrl}" alt="Author">
                            <span>${displayAuthor} • ${dateStr}</span>
                        </div>
                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                            ${upvoteHtml}
                            ${deleteHtml}
                        </div>
                    </div>
                `;
                container.appendChild(card);
            });

            // Gestione UPVOTE (Update in Supabase)
            container.querySelectorAll('.btn-upvote').forEach(btn => {
                btn.addEventListener('click', async function() {
                    if(this.classList.contains('upvoted')) return;
                    
                    const id = this.getAttribute('data-id');
                    const targetInsight = allInsights.find(i => i.id == id);
                    if(!targetInsight) return;

                    const newUpvotes = (targetInsight.upvotes || 0) + 1;
                    
                    // Ottimistica
                    this.classList.add('upvoted');
                    const countSpan = this.querySelector('.upvote-count');
                    countSpan.textContent = `(${newUpvotes})`;
                    this.innerHTML = `<i class="fa-solid fa-check-double"></i> Utile <span class="upvote-count">(${newUpvotes})</span>`;
                    
                    targetInsight.upvotes = newUpvotes;

                    // Update Supabase
                    try {
                        await supa.from('insights').update({ upvotes: newUpvotes }).eq('id', id);
                        // Salva l'upvote in modo persistente
                        await supa.from('user_upvotes').insert([{ user_email: currentUser, insight_id: id }]);
                        myUpvotedIds.add(id);
                        showToast("Feedback Registrato", `Hai validato questa informazione. L'autore riceverà <strong class="highlight">+10 punti</strong>.`, "fa-check-double", true);
                    } catch (err) {
                        console.error("Errore upvote", err);
                    }
                });
            });

            // Gestione ELIMINA INSIGHT
            container.querySelectorAll('.btn-delete-insight').forEach(btn => {
                btn.addEventListener('click', async function() {
                    const id = this.getAttribute('data-id');
                    if (!confirm('Sei sicuro di voler eliminare questo insight?')) return;
                    
                    try {
                        const { error } = await supa.from('insights').delete().eq('id', id);
                        if (error) throw error;
                        
                        allInsights = allInsights.filter(i => i.id !== id);
                        showToast("Insight Eliminato", "L'insight è stato rimosso dal database.", "fa-trash-can");
                        
                        // Ricarica la vista profilo
                        renderProfile();
                    } catch (err) {
                        console.error('Errore eliminazione:', err);
                        showToast("Errore", "Impossibile eliminare l'insight.", "fa-triangle-exclamation", false);
                    }
                });
            });
        }

        // --- INSIGHT DETAIL MODAL ---
        const insightModal    = document.getElementById('insight-modal');
        const modalCloseBtn   = document.getElementById('modal-close-btn');
        const modalBadgesEl   = document.getElementById('modal-badges');
        const modalTitleEl    = document.getElementById('modal-title');
        const modalMetaEl     = document.getElementById('modal-meta');
        const modalBodyEl     = document.getElementById('modal-body');
        const modalFooterEl   = document.getElementById('modal-footer');

        function openInsightModal(insight) {
            if (!insightModal) return;
            const author      = insight.author_email || insight.author || 'Sconosciuto';
            const dateStr     = formatDate(insight.created_at);
            const isMyInsight = author === currentUser;
            const alreadyUp   = myUpvotedIds.has(insight.id);
            const isBozza     = insight.status === 'bozza';

            modalBadgesEl.innerHTML = `
                <span class="badge badge-client"><i class="fa-solid fa-building"></i> ${insight.client || 'N/A'}</span>
                <span class="badge badge-category"><i class="fa-solid fa-tag"></i> ${insight.category || 'N/A'}</span>
                <span class="badge badge-team"><i class="fa-solid fa-users"></i> ${insight.team || 'N/A'}</span>
                ${insight.sector ? `<span class="badge" style="background:rgba(245,158,11,0.1);color:#F59E0B;">${insight.sector}</span>` : ''}
                ${isBozza ? `<span class="badge" style="background:rgba(245,158,11,0.1);color:#F59E0B;"><i class="fa-solid fa-clock"></i> Bozza</span>` : ''}
            `;

            modalTitleEl.textContent = insight.title || 'Senza Titolo';

            modalMetaEl.innerHTML = `
                <div class="modal-meta-item">
                    <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(author)}&background=1E293B&color=fff" alt="">
                    <span>${author}</span>
                </div>
                <div class="modal-meta-item"><i class="fa-solid fa-calendar-days"></i> ${dateStr}</div>
                <div class="modal-meta-item"><i class="fa-solid fa-check-double"></i> ${insight.upvotes || 0} utile</div>
                ${insight.validated_by ? `<div class="modal-meta-item"><i class="fa-solid fa-circle-check" style="color:var(--success)"></i> Validato da ${insight.validated_by}</div>` : ''}
            `;

            modalBodyEl.textContent = insight.snippet || '';

            // Footer: upvote + elimina
            let upvoteBtn = '';
            if (isMyInsight) {
                upvoteBtn = `<span style="font-size:0.85rem;color:var(--text-muted);display:flex;align-items:center;gap:0.4rem;"><i class="fa-solid fa-check"></i> Utile (${insight.upvotes || 0})</span>`;
            } else if (alreadyUp) {
                upvoteBtn = `<button class="btn-upvote upvoted" disabled><i class="fa-solid fa-check-double"></i> Già votato (${insight.upvotes || 0})</button>`;
            } else {
                upvoteBtn = `<button class="btn-upvote" id="modal-upvote-btn"><i class="fa-solid fa-check"></i> Utile (${insight.upvotes || 0})</button>`;
            }

            const canDelete = isMyInsight ||
                (!isStaff() && hasOrgRole('team_leader') && myTeamNames.includes(insight.team || '')) ||
                hasOrgRole('engagement_manager');
            const deleteBtn = canDelete
                ? `<button id="modal-delete-btn" style="background:transparent;border:1px solid rgba(239,68,68,0.3);color:var(--danger);padding:0.45rem 1rem;border-radius:var(--radius-full);font-size:0.85rem;display:flex;align-items:center;gap:0.4rem;"><i class="fa-solid fa-trash-can"></i> Elimina</button>`
                : '';

            modalFooterEl.innerHTML = `<div style="margin-right:auto;">${upvoteBtn}</div>${deleteBtn}`;

            insightModal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';

            // Upvote dalla modale
            const modalUpvote = document.getElementById('modal-upvote-btn');
            if (modalUpvote) {
                modalUpvote.addEventListener('click', async () => {
                    const newUp = (insight.upvotes || 0) + 1;
                    modalUpvote.disabled = true;
                    modalUpvote.innerHTML = `<i class="fa-solid fa-check-double"></i> Già votato (${newUp})`;
                    modalUpvote.classList.add('upvoted');
                    insight.upvotes = newUp;
                    // Aggiorna anche il meta nella modale
                    modalMetaEl.querySelectorAll('.modal-meta-item')[2].innerHTML = `<i class="fa-solid fa-check-double"></i> ${newUp} utile`;
                    try {
                        await supa.from('insights').update({ upvotes: newUp }).eq('id', insight.id);
                        await supa.from('user_upvotes').insert([{ user_email: currentUser, insight_id: insight.id }]);
                        myUpvotedIds.add(insight.id);
                        showToast("Feedback Registrato", `Hai validato questa informazione.`, "fa-check-double");
                    } catch(e) { console.error(e); }
                });
            }

            // Elimina dalla modale
            const modalDelete = document.getElementById('modal-delete-btn');
            if (modalDelete) {
                modalDelete.addEventListener('click', async () => {
                    if (!confirm('Sei sicuro di voler eliminare questo insight?')) return;
                    try {
                        const { error } = await supa.from('insights').delete().eq('id', insight.id);
                        if (error) throw error;
                        allInsights = allInsights.filter(i => i.id !== insight.id);
                        closeInsightModal();
                        showToast("Insight Eliminato", "L'insight è stato rimosso.", "fa-trash-can");
                        applyFilters();
                        if (document.getElementById('view-profilo')?.classList.contains('active')) renderProfile();
                    } catch(e) {
                        showToast("Errore", "Impossibile eliminare.", "fa-triangle-exclamation", false);
                    }
                });
            }
        }

        function closeInsightModal() {
            if (!insightModal) return;
            insightModal.classList.add('hidden');
            document.body.style.overflow = '';
        }

        if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeInsightModal);
        if (insightModal) insightModal.addEventListener('click', e => { if (e.target === insightModal) closeInsightModal(); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeInsightModal(); });

        if (searchInput) searchInput.addEventListener('input', applyFilters);

        ['filter-client', 'filter-sector', 'filter-category'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', applyFilters);
        });

        const filterResetBtn = document.getElementById('filter-reset');
        if (filterResetBtn) {
            filterResetBtn.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                ['filter-client','filter-sector','filter-category'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });
                const countEl = document.getElementById('filter-count');
                if (countEl) countEl.textContent = '';
                renderInsights(allInsights, insightsGrid, true);
            });
        }

        // --- LEADERBOARD & PROFILE ---
        function renderLeaderboards() {
            if(!leaderboardInd || !leaderboardTeams) return;

            // Solo insight pubblicati contano per le classifiche
            const published = allInsights.filter(i => i.status === 'pubblicato');

            // ── INDIVIDUI: top 3 podio ──────────────────────────────────────
            const userScores = {};
            published.forEach(i => {
                const author = i.author_email || i.author || 'Anonimo';
                if(!userScores[author]) userScores[author] = { insights: 0, upvotes: 0 };
                userScores[author].insights += 1;
                userScores[author].upvotes  += (i.upvotes || 0);
            });

            const top3 = Object.entries(userScores)
                .map(([name, s]) => ({ name, ...s, points: s.insights * 50 + s.upvotes * 10 }))
                .sort((a, b) => b.points - a.points)
                .slice(0, 3);

            if (top3.length === 0) {
                leaderboardInd.innerHTML = '<p style="color:var(--text-muted);padding:1.5rem 0;text-align:center;">Nessun insight pubblicato ancora.</p>';
            } else {
                // Ordine visivo podio: 2°, 1°, 3°
                const MEDAL  = ['🥇','🥈','🥉'];
                const CLASS  = ['podium-gold','podium-silver','podium-bronze'];
                const visual = top3.length >= 3
                    ? [top3[1], top3[0], top3[2]]
                    : top3.length === 2 ? [top3[1], top3[0]] : [top3[0]];

                leaderboardInd.innerHTML = `<div class="podium">
                    ${visual.map(u => {
                        const rank = top3.indexOf(u);
                        const cls  = CLASS[rank] || 'podium-bronze';
                        const displayName = u.name.includes('@') ? u.name.split('@')[0] : u.name;
                        return `<div class="podium-slot ${cls}">
                            <div class="podium-avatar-wrap">
                                <img class="podium-avatar" src="https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=1E293B&color=fff&size=80" alt="${displayName}">
                                <span class="podium-medal">${MEDAL[rank]}</span>
                            </div>
                            <span class="podium-name">${displayName}</span>
                            <span class="podium-pts">${u.points} pt</span>
                            <span class="podium-detail">${u.insights} insight · ${u.upvotes} upvote</span>
                            <div class="podium-base"></div>
                        </div>`;
                    }).join('')}
                </div>`;
            }

            // ── TEAM: score con breakdown dettagliato ───────────────────────
            const teamScores = {};
            published.forEach(i => {
                const t = i.team || 'Senza Team';
                if(!teamScores[t]) teamScores[t] = { insights: 0, upvotes: 0 };
                teamScores[t].insights += 1;
                teamScores[t].upvotes  += (i.upvotes || 0);
            });

            const sortedTeams = Object.entries(teamScores)
                .map(([name, s]) => ({ name, ...s, points: s.insights * 50 + s.upvotes * 10 }))
                .sort((a, b) => b.points - a.points);

            if (sortedTeams.length === 0) {
                leaderboardTeams.innerHTML = '<p style="color:var(--text-muted);padding:1.5rem 0;text-align:center;">Nessun dato disponibile.</p>';
            } else {
                const maxPts = sortedTeams[0].points;
                leaderboardTeams.innerHTML = `<div class="team-score-list">
                    ${sortedTeams.map((t, idx) => {
                        const base  = t.insights * 50;
                        const bonus = t.upvotes  * 10;
                        const trackPct = Math.round((t.points / maxPts) * 100);
                        const basePct  = t.points > 0 ? Math.round((base / t.points) * 100) : 0;
                        return `<div class="team-score-item">
                            <div class="team-score-header">
                                <div style="display:flex;align-items:center;gap:0.6rem;">
                                    <div class="team-rank-bubble">${idx + 1}</div>
                                    <span class="team-name-txt">${t.name}</span>
                                </div>
                                <span class="team-total-pts">${t.points} pt</span>
                            </div>
                            <div class="team-bar-wrap">
                                <div class="team-bar-track" style="width:${trackPct}%">
                                    <div class="team-bar-base" style="width:${basePct}%"></div>
                                </div>
                            </div>
                            <div class="team-breakdown">
                                <span><i class="fa-solid fa-file-circle-check"></i>${t.insights} insight × 50 pt = <strong>${base} pt base</strong></span>
                                <span><i class="fa-solid fa-check-double"></i>${t.upvotes} upvote × 10 pt = <strong>${bonus} pt bonus</strong></span>
                            </div>
                        </div>`;
                    }).join('')}
                </div>`;
            }
        }

        function renderProfileStats() {
            const myInsights = allInsights.filter(i => (i.author_email || i.author) === currentUser);
            const myUpvotes = myInsights.reduce((sum, i) => sum + (i.upvotes || 0), 0);
            const realTotalPoints = points + (myUpvotes * 10); 
            animateValue(profileTotalPoints, 0, realTotalPoints, 800);
            animateValue(profileTotalInsights, 0, myInsights.length, 800);
            animateValue(profileTotalUpvotes, 0, myUpvotes, 800);
        }
        
        function renderProfile() {
            renderProfileStats();
            renderInsights(allInsights.filter(i => (i.author_email || i.author) === currentUser), profileInsightsGrid, false);
            loadUserTeams();
            updateNavByRole(); // gestisce anche il bottone "Crea Team" in base a currentUserOrgRole
        }

        // --- TEAM MANAGEMENT ---
        async function loadUserTeams() {
            const teamsGrid = document.getElementById('teams-grid');
            const noTeamsMsg = document.getElementById('no-teams-msg');
            if (!teamsGrid) return;

            try {
                // 1. Trova tutti i team_id di cui l'utente è membro
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

                // 2. Carica i dettagli dei team
                const { data: teams, error: teamErr } = await supa
                    .from('teams')
                    .select('*')
                    .in('id', teamIds);

                if (teamErr) throw teamErr;

                // 3. Carica tutti i membri dei team trovati
                const { data: allMembers, error: allMemErr } = await supa
                    .from('team_members')
                    .select('*')
                    .in('team_id', teamIds);

                if (allMemErr) throw allMemErr;

                // 4. Renderizza le card
                teamsGrid.innerHTML = teams.map(team => {
                    const members = allMembers.filter(m => m.team_id === team.id);
                    const membersHtml = members.map(m => {
                        const name = m.user_name || m.user_email.split('@')[0];
                        return `<div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0;">
                            <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1E293B&color=fff&size=28" style="width: 28px; height: 28px; border-radius: 50%;">
                            <span style="font-size: 0.85rem; color: var(--text-secondary);">${name}</span>
                        </div>`;
                    }).join('');

                    return `<div style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 1.5rem; transition: var(--transition);"
                        onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='var(--shadow-lg)'"
                        onmouseout="this.style.transform='none'; this.style.boxShadow='none'">
                        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border-color);">
                            <div style="width: 40px; height: 40px; border-radius: 10px; background: rgba(59, 130, 246, 0.1); display: flex; align-items: center; justify-content: center; color: var(--accent-primary); font-size: 1.1rem;">
                                <i class="fa-solid fa-users"></i>
                            </div>
                            <div>
                                <h4 style="color: var(--text-primary); font-size: 1rem;">${team.name}</h4>
                                <span style="font-size: 0.75rem; color: var(--text-muted);">${members.length} membr${members.length === 1 ? 'o' : 'i'}</span>
                            </div>
                        </div>
                        <div>${membersHtml}</div>
                    </div>`;
                }).join('');

            } catch (err) {
                console.error('Errore caricamento team:', err);
                teamsGrid.innerHTML = '<p style="color: var(--danger);">Errore nel caricamento dei team.</p>';
            }
        }

        // Gestione creazione team
        const createTeamBtn = document.getElementById('create-team-btn');
        const createTeamForm = document.getElementById('create-team-form');
        const cancelTeamBtn = document.getElementById('cancel-team-btn');
        const saveTeamBtn = document.getElementById('save-team-btn');

        if (createTeamBtn && createTeamForm) {
            createTeamBtn.addEventListener('click', () => {
                createTeamForm.style.display = 'block';
                createTeamBtn.style.display = 'none';
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
                const teamName = document.getElementById('new-team-name')?.value.trim();
                const membersText = document.getElementById('new-team-members')?.value.trim();

                if (!teamName) { alert('Inserisci un nome per il team'); return; }

                saveTeamBtn.disabled = true;
                saveTeamBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creazione...';

                try {
                    // 1. Crea il team
                    const { data: newTeam, error: teamErr } = await supa
                        .from('teams')
                        .insert([{ name: teamName, created_by: currentUser }])
                        .select()
                        .single();

                    if (teamErr) throw teamErr;

                    // 2. Prepara la lista membri (il creatore + quelli inseriti)
                    const { data: { session: s } } = await supa.auth.getSession();
                    const creatorMeta = s?.user?.user_metadata || {};
                    const creatorName = (creatorMeta.first_name && creatorMeta.last_name)
                        ? `${creatorMeta.first_name} ${creatorMeta.last_name}`
                        : currentUser.split('@')[0];

                    const membersToInsert = [{ team_id: newTeam.id, user_email: currentUser, user_name: creatorName }];

                    if (membersText) {
                        const emails = membersText.split('\n').map(e => e.trim()).filter(e => e && e.includes('@'));
                        emails.forEach(email => {
                            if (email !== currentUser) {
                                membersToInsert.push({ team_id: newTeam.id, user_email: email, user_name: email.split('@')[0] });
                            }
                        });
                    }

                    const { error: memErr } = await supa.from('team_members').insert(membersToInsert);
                    if (memErr) throw memErr;

                    // 3. Reset form e ricarica
                    document.getElementById('new-team-name').value = '';
                    document.getElementById('new-team-members').value = '';
                    createTeamForm.style.display = 'none';
                    if (createTeamBtn) createTeamBtn.style.display = 'flex';

                    showToast("Team Creato!", `"${teamName}" è stato creato con ${membersToInsert.length} membr${membersToInsert.length === 1 ? 'o' : 'i'}.`, "fa-people-group");
                    loadUserTeams();

                } catch (err) {
                    console.error('Errore creazione team:', err);
                    showToast("Errore", "Impossibile creare il team: " + err.message, "fa-triangle-exclamation", false);
                } finally {
                    saveTeamBtn.disabled = false;
                    saveTeamBtn.innerHTML = '<i class="fa-solid fa-check"></i> Crea';
                }
            });
        }

        // --- AI ASSISTANT LOGIC (Call Vercel API with Groq) ---
        if(chatForm) {
            chatForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const text = chatInput.value.trim();
                if(!text) return;

                // Messaggio Utente
                appendChatMessage('user', text);
                chatInput.value = '';

                // Typing Indicator
                const typingId = appendTypingIndicator();
                chatHistory.scrollTop = chatHistory.scrollHeight;

                try {
                    // Chiamata alla Serverless Function (se su Vercel)
                    // NOTA: Se si è in locale senza Vercel CLI, questa API potrebbe dare 404,
                    // in produzione funzionerà perfettamente.
                    const response = await fetch('/api/ask-brain', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ prompt: text })
                    });
                    
                    if (!response.ok) {
                        throw new Error("Errore API Network: " + response.status);
                    }

                    const data = await response.json();
                    document.getElementById(typingId).remove();

                    const citations = data.citations || [];
                    // Mappa indice → citation
                    const citationMap = {};
                    citations.forEach(c => { citationMap[c.index] = c; });

                    // Formatta risposta: markdown base + [#N] → chip cliccabili
                    let formattedAnswer = (data.answer || '')
                        .replace(/\n/g, '<br>')
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        .replace(/\[#(\d+)\]/g, (match, n) => {
                            const c = citationMap[parseInt(n)];
                            return c
                                ? `<button class="chat-insight-chip" data-insight-id="${c.id}">[#${n}]</button>`
                                : match;
                        });

                    // Blocco citazioni in fondo al messaggio
                    if (citations.length > 0) {
                        formattedAnswer += `<div class="chat-citations">
                            <span class="chat-citations-label"><i class="fa-solid fa-link"></i> Insight citati</span>
                            ${citations.map(c => `
                                <button class="chat-cite-card" data-insight-id="${c.id}">
                                    <span class="cite-num">#${c.index}</span>
                                    <span class="cite-title">${c.title || 'Insight'}</span>
                                    <span class="cite-meta">${[c.client, c.category].filter(Boolean).join(' · ')}</span>
                                </button>`).join('')}
                        </div>`;
                    }

                    const msgEl = appendChatMessage('ai', formattedAnswer);

                    // Click su chip/card → apre la modale dell'insight
                    msgEl.querySelectorAll('[data-insight-id]').forEach(btn => {
                        btn.addEventListener('click', () => {
                            const id = btn.getAttribute('data-insight-id');
                            const insight = allInsights.find(i => i.id === id);
                            if (insight) openInsightModal(insight);
                        });
                    });
                    
                } catch (error) {
                    console.error("AI Error:", error);
                    document.getElementById(typingId).remove();
                    appendChatMessage('ai', "Si è verificato un errore di connessione al cervello aziendale. Assicurati che l'app sia deploiata su Vercel affinché l'API Groq funzioni.");
                }

                chatHistory.scrollTop = chatHistory.scrollHeight;
            });
        }

        function appendChatMessage(sender, htmlContent) {
            const div = document.createElement('div');
            div.className = `chat-message ${sender}`;
            const avatarIcon = sender === 'ai' ? 'fa-robot' : 'fa-user';
            div.innerHTML = `
                <div class="msg-avatar"><i class="fa-solid ${avatarIcon}"></i></div>
                <div class="msg-content">${htmlContent}</div>
            `;
            chatHistory.appendChild(div);
            return div;
        }

        function appendTypingIndicator() {
            const id = 'typing-' + Date.now();
            const div = document.createElement('div');
            div.className = `chat-message ai`;
            div.id = id;
            div.innerHTML = `
                <div class="msg-avatar"><i class="fa-solid fa-robot"></i></div>
                <div class="msg-content">
                    <div class="typing-indicator"><span></span><span></span><span></span></div>
                </div>
            `;
            chatHistory.appendChild(div);
            return id;
        }

        function computeUserStats() {
            if (!currentUser) return;
            const myInsights = allInsights.filter(i => (i.author_email || i.author) === currentUser);
            const totalUpvotes = myInsights.reduce((s, i) => s + (i.upvotes || 0), 0);
            points = myInsights.length * 50 + totalUpvotes * 10;

            // Insight inseriti nella settimana corrente (lunedì → domenica)
            const now = new Date();
            const daysFromMon = now.getDay() === 0 ? 6 : now.getDay() - 1;
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - daysFromMon);
            startOfWeek.setHours(0, 0, 0, 0);
            weeklyInsights = myInsights.filter(i => new Date(i.created_at) >= startOfWeek).length;

            // Aggiorna entrambi gli span punti (topbar globale + view nuovo insight)
            const ptTopbar = document.getElementById('total-points');
            if (ptTopbar) ptTopbar.textContent = points;
            const ptNew = document.getElementById('total-points-new');
            if (ptNew) ptNew.textContent = points;

            updateProgressBar();
        }

        function updateProgressBar() {
            const percentage = Math.min((weeklyInsights / weeklyGoal) * 100, 100);
            weeklyProgressEl.style.width = `${percentage}%`;
            goalTextEl.textContent = `${weeklyInsights}/${weeklyGoal} Insight`;

            if (weeklyInsights >= weeklyGoal) {
                goalHintEl.innerHTML = `<i class="fa-solid fa-trophy" style="color: #F59E0B"></i> Hai raggiunto l'obiettivo settimanale! Ottimo lavoro.`;
                goalHintEl.style.color = '#10B981';
            } else {
                const remaining = weeklyGoal - weeklyInsights;
                goalHintEl.textContent = `Ancora ${remaining} insight per sbloccare il badge "Observer della Settimana"!`;
            }
        }

        function showToast(title, message, iconClass, success = true) {
            toastTitle.textContent = title;
            toastMessage.innerHTML = message;
            toastIconI.className = `fa-solid ${iconClass}`;
            
            if(!success) {
                toast.style.borderLeftColor = "var(--accent-primary)";
                toastIconI.style.color = "var(--accent-primary)";
            } else {
                toast.style.borderLeftColor = "var(--success)";
                toastIconI.style.color = "var(--success)";
            }

            toast.classList.remove('hidden');
            void toast.offsetWidth; 
            toast.classList.add('show');

            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => {
                    toast.classList.add('hidden');
                }, 400);
            }, 4000);
        }

        function animateValue(obj, start, end, duration) {
            if(!obj) return;
            let startTimestamp = null;
            const step = (timestamp) => {
                if (!startTimestamp) startTimestamp = timestamp;
                const progress = Math.min((timestamp - startTimestamp) / duration, 1);
                obj.innerHTML = Math.floor(progress * (end - start) + start);
                if (progress < 1) {
                    window.requestAnimationFrame(step);
                }
            };
            window.requestAnimationFrame(step);
        }
        
        // ─── FILTRI ESPLORA ───────────────────────────────────────────────────
        function applyFilters() {
            const q      = (searchInput?.value || '').toLowerCase().trim();
            const client = document.getElementById('filter-client')?.value  || '';
            const sector = document.getElementById('filter-sector')?.value  || '';
            const cat    = document.getElementById('filter-category')?.value || '';

            const filtered = allInsights.filter(i => {
                const matchQ = !q || [i.title, i.client, i.category, i.team, i.snippet, i.sector]
                    .some(f => (f || '').toLowerCase().includes(q));
                const matchClient = !client || (i.client || '') === client;
                const matchSector = !sector || (i.sector || '') === sector;
                const matchCat    = !cat    || (i.category || '') === cat;
                return matchQ && matchClient && matchSector && matchCat;
            });

            const countEl = document.getElementById('filter-count');
            if (countEl) countEl.textContent = filtered.length < allInsights.length
                ? filtered.length + ' di ' + allInsights.length + ' insight' : '';

            renderInsights(filtered, insightsGrid, true);
        }

        function populateClientFilter() {
            const sel = document.getElementById('filter-client');
            if (!sel) return;
            const clients = [...new Set(allInsights.map(i => i.client).filter(Boolean))].sort();
            sel.innerHTML = '<option value="">🏢 Tutti i clienti</option>' +
                clients.map(c => `<option value="${c}">${c}</option>`).join('');
        }

        // ─── RENDER BOZZE DA VALIDARE ────────────────────────────────────────
        async function renderDraftInsights() {
            const container = document.getElementById('draft-insights-grid');
            if (!container) return;
            container.innerHTML = '<p style="color:var(--text-muted);padding:1rem 0;">Caricamento...</p>';

            const { data, error } = await supa
                .from('insights')
                .select('*')
                .eq('status', 'bozza')
                .neq('author_email', currentUser)
                .order('created_at', { ascending: false });

            if (error) { container.innerHTML = '<p style="color:var(--danger);">Errore caricamento bozze.</p>'; return; }

            let toShow = data || [];

            // team_leader: solo bozze del proprio team; lead+: tutte
            if (!hasOrgRole('lead') && toShow.length > 0) {
                const { data: mem } = await supa.from('team_members').select('team_id').eq('user_email', currentUser);
                const { data: myT } = await supa.from('teams').select('name').in('id', (mem || []).map(m => m.team_id));
                const myTeamNames   = (myT || []).map(t => t.name);
                toShow = toShow.filter(i => !i.team || myTeamNames.includes(i.team));
            }

            container.innerHTML = '';
            if (toShow.length === 0) {
                container.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;padding:2rem 0;">Nessun insight in attesa di validazione. Il tuo team è in pari!</p>';
                return;
            }

            toShow.forEach(insight => {
                const card = document.createElement('div');
                card.className = 'insight-card';
                card.style.borderColor = 'rgba(245,158,11,0.4)';
                const author = insight.author_email || 'Utente Sconosciuto';
                card.innerHTML = `
                    <div class="card-header"><div class="card-badges">
                        <span class="badge badge-client"><i class="fa-solid fa-building"></i> ${insight.client || 'N/A'}</span>
                        <span class="badge badge-category"><i class="fa-solid fa-tag"></i> ${insight.category || 'N/A'}</span>
                        <span class="badge badge-team"><i class="fa-solid fa-users"></i> ${insight.team || 'N/A'}</span>
                        <span class="badge" style="background:rgba(245,158,11,0.1);color:#F59E0B;font-size:0.7rem;"><i class="fa-solid fa-clock"></i> In attesa</span>
                    </div></div>
                    <h3 class="card-title">${insight.title || 'Senza Titolo'}</h3>
                    <p class="card-snippet">${insight.snippet || ''}</p>
                    <div class="card-footer">
                        <div class="card-author">
                            <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(author)}&background=1E293B&color=fff" alt="">
                            <span>${author} • ${formatDate(insight.created_at)}</span>
                        </div>
                        <button class="btn-valida" data-id="${insight.id}"
                            style="padding:0.4rem 1rem;font-size:0.85rem;background:rgba(16,185,129,0.12);
                                   color:#10B981;border:1px solid rgba(16,185,129,0.3);border-radius:var(--radius-full);
                                   cursor:pointer;display:flex;align-items:center;gap:0.4rem;">
                            <i class="fa-solid fa-check-circle"></i> Valida
                        </button>
                    </div>`;
                container.appendChild(card);
            });

            container.querySelectorAll('.btn-valida').forEach(btn => {
                btn.addEventListener('click', async function () {
                    const id = this.getAttribute('data-id');
                    this.disabled = true;
                    this.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                    try {
                        const { error } = await supa.from('insights').update({
                            status:       'pubblicato',
                            validated_by: currentUser,
                            validated_at: new Date().toISOString()
                        }).eq('id', id);
                        if (error) throw error;
                        showToast('Insight Validato!', "L'insight è ora visibile a tutta l'organizzazione.", 'fa-check-circle');
                        await loadInsights();
                        await renderDraftInsights();
                    } catch (err) {
                        showToast('Errore', 'Impossibile validare: ' + err.message, 'fa-triangle-exclamation', false);
                        this.disabled = false;
                        this.innerHTML = '<i class="fa-solid fa-check-circle"></i> Valida';
                    }
                });
            });
        }

        // ── ANALYTICS ────────────────────────────────────────────────────────
        let _charts = {};

        function renderAnalytics() {
            const period      = parseInt(document.getElementById('analytics-period')?.value ?? '30');
            const fullAccess  = hasOrgRole('engagement_manager');

            // Dataset: full o solo team
            let data = allInsights.filter(i => i.status === 'pubblicato');
            if (!fullAccess) data = data.filter(i => myTeamNames.includes(i.team || ''));
            if (period > 0) {
                const cutoff = new Date();
                cutoff.setDate(cutoff.getDate() - period);
                data = data.filter(i => new Date(i.created_at) >= cutoff);
            }

            // Subtitle
            const sub = document.getElementById('analytics-subtitle');
            if (sub) sub.textContent = fullAccess
                ? 'Panoramica completa degli insight aziendali.'
                : 'Panoramica degli insight del tuo team.';

            // KPI
            const totalUp     = data.reduce((s, i) => s + (i.upvotes || 0), 0);
            const activeAuth  = new Set(data.map(i => i.author_email || i.author).filter(Boolean)).size;
            const weekAgo     = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
            const thisWeek    = data.filter(i => new Date(i.created_at) >= weekAgo).length;
            const kpiRow      = document.getElementById('analytics-kpi-row');
            if (kpiRow) kpiRow.innerHTML = [
                { icon:'fa-file-circle-check', value: data.length,  label:'Insight pubblicati', color:'var(--accent-primary)' },
                { icon:'fa-calendar-week',     value: thisWeek,     label:'Questa settimana',   color:'var(--warning)' },
                { icon:'fa-check-double',      value: totalUp,      label:'Upvote totali',       color:'var(--success)' },
                { icon:'fa-users',             value: activeAuth,   label:'Autori attivi',       color:'var(--accent-secondary)' },
            ].map(k => `<div class="analytics-kpi-card">
                <div class="kpi-icon" style="color:${k.color};background:${k.color}22;"><i class="fa-solid ${k.icon}"></i></div>
                <div class="kpi-content"><span class="kpi-value">${k.value}</span><span class="kpi-label">${k.label}</span></div>
            </div>`).join('');

            // Distruggi chart precedenti
            Object.values(_charts).forEach(c => c?.destroy());
            _charts = {};

            if (typeof Chart === 'undefined') return;

            const COLORS = ['#3B82F6','#8B5CF6','#10B981','#F59E0B','#EF4444','#06B6D4','#F97316'];
            const gridColor  = 'rgba(255,255,255,0.06)';
            const tickColor  = '#64748B';
            const legendCfg  = { labels: { color:'#94A3B8', font:{ family:'Inter', size:12 }, padding:12 } };
            const axisDefaults = { ticks:{ color: tickColor }, grid:{ color: gridColor } };

            // 1. Doughnut per categoria
            const catMap = {};
            data.forEach(i => { const c = i.category || 'N/A'; catMap[c] = (catMap[c] || 0) + 1; });
            const catCtx = document.getElementById('chart-category')?.getContext('2d');
            if (catCtx) _charts.cat = new Chart(catCtx, {
                type: 'doughnut',
                data: { labels: Object.keys(catMap), datasets: [{ data: Object.values(catMap), backgroundColor: COLORS, borderWidth: 0 }] },
                options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ ...legendCfg, position:'right' } } }
            });

            // 2. Line chart velocity (settimanale)
            function mondayKey(d) {
                const dt = new Date(d);
                dt.setDate(dt.getDate() - (dt.getDay() === 0 ? 6 : dt.getDay() - 1));
                return dt.toISOString().split('T')[0];
            }
            const wMap = {};
            data.forEach(i => { const k = mondayKey(i.created_at); wMap[k] = (wMap[k] || 0) + 1; });
            const wSorted = Object.entries(wMap).sort(([a],[b]) => a.localeCompare(b));
            const velCtx  = document.getElementById('chart-velocity')?.getContext('2d');
            if (velCtx) _charts.vel = new Chart(velCtx, {
                type: 'line',
                data: {
                    labels: wSorted.map(([k]) => new Date(k).toLocaleDateString('it-IT',{day:'2-digit',month:'short'})),
                    datasets: [{ label:'Insight', data: wSorted.map(([,v]) => v), borderColor:'#3B82F6', backgroundColor:'rgba(59,130,246,0.1)', tension:0.4, fill:true, pointRadius:4, pointBackgroundColor:'#3B82F6' }]
                },
                options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ x: axisDefaults, y:{ ...axisDefaults, beginAtZero:true, ticks:{ ...axisDefaults.ticks, stepSize:1 } } } }
            });

            // 3. Bar orizzontale top clienti
            const cliMap = {};
            data.forEach(i => { if(i.client) cliMap[i.client] = (cliMap[i.client]||0)+1; });
            const cliSorted = Object.entries(cliMap).sort(([,a],[,b])=>b-a).slice(0,7);
            const cliCtx = document.getElementById('chart-clients')?.getContext('2d');
            if (cliCtx) _charts.cli = new Chart(cliCtx, {
                type: 'bar',
                data: { labels: cliSorted.map(([k])=>k), datasets:[{ data: cliSorted.map(([,v])=>v), backgroundColor:'rgba(139,92,246,0.6)', borderColor:'#8B5CF6', borderWidth:1, borderRadius:6 }] },
                options: { indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ x: axisDefaults, y: axisDefaults } }
            });

            // 4. Bar team
            const teamMap = {};
            data.forEach(i => { if(i.team) teamMap[i.team] = (teamMap[i.team]||0)+1; });
            const teamCtx = document.getElementById('chart-teams')?.getContext('2d');
            if (teamCtx) _charts.teams = new Chart(teamCtx, {
                type: 'bar',
                data: { labels: Object.keys(teamMap), datasets:[{ data: Object.values(teamMap), backgroundColor:'rgba(16,185,129,0.6)', borderColor:'#10B981', borderWidth:1, borderRadius:6 }] },
                options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ x: axisDefaults, y:{ ...axisDefaults, beginAtZero:true, ticks:{ ...axisDefaults.ticks, stepSize:1 } } } }
            });
        }

        // Period filter listener
        document.getElementById('analytics-period')?.addEventListener('change', () => {
            if (document.getElementById('view-analytics')?.classList.contains('active')) renderAnalytics();
        });

        // Export CSV
        document.getElementById('export-btn')?.addEventListener('click', () => {
            const period = parseInt(document.getElementById('analytics-period')?.value ?? '0');
            let data = allInsights.filter(i => i.status === 'pubblicato');
            if (!hasOrgRole('engagement_manager')) data = data.filter(i => myTeamNames.includes(i.team || ''));
            if (period > 0) {
                const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - period);
                data = data.filter(i => new Date(i.created_at) >= cutoff);
            }
            const esc = v => `"${(v||'').toString().replace(/"/g,'""')}"`;
            const headers = ['Titolo','Cliente','Settore','Categoria','Team','Autore','Upvote','Data','Stato'];
            const rows    = data.map(i => [
                esc(i.title), esc(i.client), esc(i.sector), esc(i.category),
                esc(i.team), esc(i.author_email), i.upvotes||0,
                new Date(i.created_at).toLocaleDateString('it-IT'), esc(i.status)
            ]);
            const csv  = [headers, ...rows].map(r => r.join(',')).join('\n');
            const blob = new Blob(['﻿' + csv], { type:'text/csv;charset=utf-8' });
            const url  = URL.createObjectURL(blob);
            const a    = Object.assign(document.createElement('a'), { href: url, download: `bto-insights-${new Date().toISOString().split('T')[0]}.csv` });
            a.click(); URL.revokeObjectURL(url);
        });

        // ── CONTENT STUDIO ───────────────────────────────────────────────────
        let _studioInit = false;

        function initContentStudio() {
            const listEl = document.getElementById('studio-insight-list');
            if (!listEl) return;

            // Ricarica sempre la lista (potrebbero esserci nuovi insight)
            const published = allInsights.filter(i => i.status === 'pubblicato');
            listEl.innerHTML = published.length === 0
                ? '<p style="color:var(--text-muted);font-size:0.85rem;padding:0.5rem 0;">Nessun insight pubblicato disponibile.</p>'
                : published.map(i => `
                    <label class="studio-insight-item" data-id="${i.id}">
                        <input type="checkbox" value="${i.id}">
                        <div>
                            <span class="studio-insight-title">${i.title || 'Senza titolo'}</span>
                            <span class="studio-insight-meta">${[i.client, i.category].filter(Boolean).join(' · ') || 'N/A'}</span>
                        </div>
                    </label>`).join('');

            // Aggiorna contatore selezione
            const updateCount = () => {
                const n = listEl.querySelectorAll('input:checked').length;
                const el = document.getElementById('studio-selected-count');
                if (el) el.textContent = `${n} selezionat${n===1?'o':'i'}`;
                listEl.querySelectorAll('.studio-insight-item').forEach(item => {
                    item.classList.toggle('selected', item.querySelector('input')?.checked);
                });
            };
            listEl.addEventListener('change', updateCount);

            if (_studioInit) return; // event listeners già registrati
            _studioInit = true;

            // Toggle sorgente: Da Insight ↔ Da Testo
            document.getElementById('studio-source-selector')?.addEventListener('click', e => {
                const btn = e.target.closest('.studio-toggle');
                if (!btn) return;
                document.querySelectorAll('#studio-source-selector .studio-toggle').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const isText = btn.dataset.source === 'text';
                document.getElementById('studio-source-insights').style.display = isText ? 'none' : 'block';
                document.getElementById('studio-source-text').style.display     = isText ? 'block' : 'none';
                // In modalità testo le note sono ridondanti
                const notesRow = document.getElementById('studio-notes-row');
                if (notesRow) notesRow.style.display = isText ? 'none' : 'block';
            });

            // Filtro ricerca insight
            document.getElementById('studio-search')?.addEventListener('input', e => {
                const q = e.target.value.toLowerCase();
                document.querySelectorAll('.studio-insight-item').forEach(el => {
                    el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none';
                });
            });

            // Toggle tipo contenuto
            document.getElementById('studio-type-selector')?.addEventListener('click', e => {
                const btn = e.target.closest('.studio-toggle');
                if (!btn) return;
                document.querySelectorAll('#studio-type-selector .studio-toggle').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const platRow = document.getElementById('studio-platform-row');
                if (platRow) platRow.style.display = btn.dataset.type === 'post' ? 'block' : 'none';
            });

            // Toggle piattaforma
            document.getElementById('studio-platform-selector')?.addEventListener('click', e => {
                const btn = e.target.closest('.studio-toggle');
                if (!btn) return;
                document.querySelectorAll('#studio-platform-selector .studio-toggle').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });

            // Genera
            document.getElementById('studio-generate-btn')?.addEventListener('click', async () => {
                const sourceMode = document.querySelector('#studio-source-selector .studio-toggle.active')?.dataset.source || 'insights';
                const type       = document.querySelector('#studio-type-selector .studio-toggle.active')?.dataset.type || 'post';
                const platform   = document.querySelector('#studio-platform-selector .studio-toggle.active')?.dataset.platform || 'linkedin';
                const notes      = document.getElementById('studio-notes')?.value.trim() || '';
                const genBtn     = document.getElementById('studio-generate-btn');

                let payload;
                if (sourceMode === 'text') {
                    const freeText = document.getElementById('studio-free-text')?.value.trim() || '';
                    if (!freeText) { showToast('Testo mancante','Inserisci un testo di partenza.','fa-triangle-exclamation',false); return; }
                    payload = { type, platform, freeText, notes };
                } else {
                    const ids = [...document.querySelectorAll('#studio-insight-list input:checked')].map(el => el.value);
                    if (!ids.length) { showToast('Selezione vuota','Seleziona almeno un insight.','fa-triangle-exclamation',false); return; }
                    payload = { type, platform, insightIds: ids, notes };
                }

                genBtn.disabled = true;
                genBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generazione...';

                try {
                    const res = await fetch('/api/content-studio', {
                        method:'POST', headers:{'Content-Type':'application/json'},
                        body: JSON.stringify(payload)
                    });
                    if (!res.ok) throw new Error('API Error ' + res.status);
                    const { content } = await res.json();

                    const outEl    = document.getElementById('studio-output');
                    const outPanel = document.getElementById('studio-output-panel');
                    const charEl   = document.getElementById('studio-char-count');
                    if (outEl)    outEl.textContent  = content;
                    if (outPanel) outPanel.style.display = 'block';
                    if (charEl)   charEl.textContent = `${content.length} caratteri`;
                    outPanel?.scrollIntoView({ behavior:'smooth', block:'nearest' });
                } catch(e) {
                    showToast('Errore','Impossibile generare il contenuto. Verifica che l\'app sia su Vercel.','fa-triangle-exclamation',false);
                } finally {
                    genBtn.disabled = false;
                    genBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Genera Contenuto';
                }
            });

            // Copia
            document.getElementById('studio-copy-btn')?.addEventListener('click', () => {
                const text = document.getElementById('studio-output')?.textContent;
                if (text) navigator.clipboard.writeText(text).then(() => showToast('Copiato!','Contenuto copiato negli appunti.','fa-check'));
            });

            // Download .txt
            document.getElementById('studio-download-btn')?.addEventListener('click', () => {
                const text = document.getElementById('studio-output')?.textContent;
                if (!text) return;
                const blob = new Blob([text], { type:'text/plain;charset=utf-8' });
                const url  = URL.createObjectURL(blob);
                Object.assign(document.createElement('a'), { href:url, download:'bto-content.txt' }).click();
                URL.revokeObjectURL(url);
            });
        }

        // --- FUNZIONI SUPABASE DATA FETCH ---
        async function loadInsights() {
            try {
                const { data, error } = await supa
                    .from('insights')
                    .select('*')
                    .order('created_at', { ascending: false });

                if (error) { console.error("Errore fetch Supabase:", error); return; }

                const all = data || [];

                // Esplora: pubblicati + proprie bozze
                allInsights = all.filter(i =>
                    i.status === 'pubblicato' ||
                    (i.author_email || i.author) === currentUser
                );

                // Bozze altrui per validazione
                draftInsights = all.filter(i =>
                    i.status === 'bozza' &&
                    (i.author_email || i.author) !== currentUser
                );

                // Badge nav contatore
                const validaBadge = document.getElementById('valida-count-badge');
                if (validaBadge && hasOrgRole('team_leader') && !isStaff()) {
                    const relevantDrafts = hasOrgRole('lead')
                        ? draftInsights
                        : draftInsights.filter(i => !i.team || myTeamNames.includes(i.team));
                    validaBadge.textContent = relevantDrafts.length;
                    validaBadge.style.display = relevantDrafts.length > 0 ? 'inline-flex' : 'none';
                }

                populateClientFilter();
                computeUserStats();

                if (document.getElementById('view-esplora-dati')?.classList.contains('active'))
                    applyFilters();
                if (document.getElementById('view-valida')?.classList.contains('active'))
                    renderDraftInsights();
                if (document.getElementById('view-profilo')?.classList.contains('active'))
                    renderProfile();

            } catch (e) { console.error("Errore caricamento DB:", e); }
        }

    } catch(err) {
        document.body.innerHTML += `<div style="position:fixed;top:0;left:0;right:0;background:red;color:white;padding:20px;z-index:99999;">JS ERROR: ${err.message} <br> ${err.stack}</div>`;
        console.error(err);
    }
})();