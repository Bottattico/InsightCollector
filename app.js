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

            // Social AI — marketing, sales o admin
            const socialNav = document.querySelector('[data-target="view-marketing"]');
            if (socialNav) socialNav.style.display =
                (isStaffRole('marketing') || isStaffRole('sales') || currentUserOrgRole === 'admin') ? 'flex' : 'none';

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
                    if(targetId === 'view-valida')     renderDraftInsights();
                    if(targetId === 'view-classifica') renderLeaderboards();
                    if(targetId === 'view-profilo') renderProfile();
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
                const canDelete  = !isStaff() && (isMyInsight || hasOrgRole('responsabile'));
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

            const canDelete = !isStaff() && (isMyInsight || hasOrgRole('responsabile'));
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
            const userScores = {};
            allInsights.forEach(i => {
                const author = i.author_email || i.author || 'Anonimo';
                if(!userScores[author]) userScores[author] = { points: 0, insights: 0 };
                userScores[author].points += 50 + ((i.upvotes || 0) * 10);
                userScores[author].insights += 1;
            });

            // Aggiungi l'utente corrente se non c'è
            if(!userScores[currentUser]) userScores[currentUser] = { points: points, insights: weeklyInsights };

            leaderboardInd.innerHTML = Object.keys(userScores)
                .map(u => ({ name: u, ...userScores[u] }))
                .sort((a, b) => b.points - a.points).slice(0, 10)
                .map((u, idx) => `
                <li class="leaderboard-item rank-${idx+1}">
                    <div class="rank-info">
                        <div class="rank-number">${idx+1}</div>
                        <div class="player-details">
                            <img src="https://ui-avatars.com/api/?name=${u.name.replace(' ', '+')}&background=1E293B&color=fff" alt="${u.name}">
                            <div><span class="player-name">${u.name}</span><span class="player-team">${u.insights} Insight condivisi</span></div>
                        </div>
                    </div>
                    <div class="score-badge">${u.points} pt</div>
                </li>`).join('');

            const teamScores = {};
            allInsights.forEach(i => {
                const t = i.team || 'Senza Team';
                if(!teamScores[t]) teamScores[t] = { points: 0, insightCount: 0 };
                teamScores[t].points += 50 + ((i.upvotes || 0) * 10);
                teamScores[t].insightCount += 1;
            });

            leaderboardTeams.innerHTML = Object.keys(teamScores)
                .map(t => ({ name: t, ...teamScores[t] }))
                .sort((a, b) => b.points - a.points).slice(0, 5)
                .map((t, idx) => `
                <li class="leaderboard-item rank-${idx+1}">
                    <div class="rank-info">
                        <div class="rank-number">${idx+1}</div>
                        <div class="player-details">
                            <div style="width: 36px; height: 36px; border-radius: 8px; background: rgba(16, 185, 129, 0.1); display:flex; align-items:center; justify-content:center; color: var(--success); font-size: 1.2rem;"><i class="fa-solid fa-users"></i></div>
                            <div><span class="player-name">${t.name}</span><span class="player-team">${t.insightCount} Insight validati</span></div>
                        </div>
                    </div>
                    <div class="score-badge" style="color: var(--success); background: rgba(16, 185, 129, 0.1);">${t.points} pt</div>
                </li>`).join('');
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
                    
                    // Converte Markdown a HTML basico se necessario, oppure Groq risponde già formattato bene
                    const formattedAnswer = data.answer.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                    appendChatMessage('ai', formattedAnswer);
                    
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

            // team_leader: solo bozze del proprio team; responsabile+: tutte
            if (!hasOrgRole('responsabile') && toShow.length > 0) {
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
                    const relevantDrafts = hasOrgRole('responsabile')
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