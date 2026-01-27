import { auth, db } from './firebase.js';
import { collection, addDoc, getDocs, getDoc, query, where, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const storage = getStorage();

// Variables Globales para GPS
let coordenadasReporte = { lat: -2.14, lng: -79.96 }; 
let coordenadasAlertaDueño = null;

document.addEventListener('DOMContentLoaded', async () => {
    console.log("PAWI System: Cargando módulo central...");

    // =========================================================
    // 0. LÓGICA DE PÁGINAS PÚBLICAS (QR y REPORTES)
    // =========================================================
    
    // A) Página de Mascota Encontrada (QR Scanned)
    if (window.location.pathname.includes('encontrado.html')) {
        await handleFoundPage();
        return; 
    }

    // B) Lógica para Reporte Público (Avistamiento anónimo)
    const publicForm = document.getElementById('publicReportForm');
    if (publicForm) {
        handlePublicReport(publicForm);
    }

    // ---------------------------------------------------------
    // 1. SEGURIDAD Y REDIRECCIÓN
    // ---------------------------------------------------------
    const checkAuth = () => {
        return new Promise((resolve) => {
            const unsubscribe = onAuthStateChanged(auth, (user) => {
                unsubscribe();
                resolve(user);
            });
        });
    };

    const user = await checkAuth();
    const path = window.location.pathname;
    // Agregamos 'admin_reportes' si es necesaria protección
    const paginasProtegidas = ['dashboard', 'mis_mascotas', 'registro_mascota', 'foro', 'collar', 'personaliza', 'generar_alerta'];
    const necesitaLogin = paginasProtegidas.some(p => path.includes(p));

    if (!user && necesitaLogin) {
        window.location.href = 'login.html';
        return;
    }

    if (user) {
        await inicializarInterfazUsuario(user);
    }

    // ---------------------------------------------------------
    // 2. LOGICA DE REGISTRO, LOGIN Y LOGOUT
    // ---------------------------------------------------------
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nombre = document.getElementById('signupName').value;
            const email = document.getElementById('signupEmail').value;
            const password = document.getElementById('signupPassword').value;
            const tipo = document.getElementById('signupType').value;
            const btnSubmit = signupForm.querySelector('.btn-submit');

            if (!tipo) return alert("Selecciona un tipo de usuario");

            try {
                btnSubmit.disabled = true; btnSubmit.textContent = "Creando cuenta...";
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const fullNameCap = nombre.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                
                await addDoc(collection(db, "users"), {
                    uid: userCredential.user.uid,
                    fullName: fullNameCap,
                    email: email,
                    userType: tipo,
                    createdAt: new Date()
                });

                localStorage.setItem('pawi_user_name', fullNameCap);
                alert("¡Cuenta creada! Bienvenido.");
                window.location.href = 'dashboard.html';
            } catch (error) {
                console.error(error);
                alert("Error: " + error.message);
                btnSubmit.disabled = false;
            }
        });
    }

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            const btnSubmit = loginForm.querySelector('.btn-submit');

            try {
                btnSubmit.disabled = true; btnSubmit.textContent = "Ingresando...";
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                const q = query(collection(db, "users"), where("uid", "==", userCredential.user.uid));
                const snap = await getDocs(q);
                if (!snap.empty) localStorage.setItem('pawi_user_name', snap.docs[0].data().fullName);
                window.location.href = 'dashboard.html';
            } catch (error) {
                alert("Credenciales incorrectas.");
                btnSubmit.disabled = false; btnSubmit.textContent = "Iniciar Sesión";
            }
        });
    }

    const logoutBtns = document.querySelectorAll('.logout-btn, a[href="login.html"]');
    logoutBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            localStorage.removeItem('pawi_user_name');
            localStorage.removeItem('pawi_cached_pets'); 
            await signOut(auth);
            window.location.href = 'login.html';
        });
    });

    // ---------------------------------------------------------
    // 3. REGISTRO DE MASCOTAS
    // ---------------------------------------------------------
    const petForm = document.getElementById('petRegisterForm');
    if (petForm) {
        petForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = petForm.querySelector('.btn-submit');
            const previewImg = document.getElementById('previewImage');
            try {
                btn.disabled = true; btn.textContent = "Guardando...";
                const photoSrc = previewImg ? previewImg.src : "https://cdn-icons-png.flaticon.com/512/616/616408.png";
                
                await addDoc(collection(db, "pets"), {
                    ownerId: user.uid,
                    name: document.getElementById('petName').value,
                    age: document.getElementById('petAge').value,
                    description: document.getElementById('petDesc').value,
                    photo: photoSrc,
                    createdAt: new Date()
                });
                
                localStorage.removeItem('pawi_cached_pets');
                alert("¡Mascota registrada!");
                window.location.href = 'mis_mascotas.html';
            } catch (err) { alert("Error: " + err.message); btn.disabled = false; }
        });
    }

    // ---------------------------------------------------------
    // 4. FUNCIONES AUXILIARES E INTERFAZ
    // ---------------------------------------------------------
    async function inicializarInterfazUsuario(user) {
        const welcomeName = document.getElementById('welcomeName');
        const navUserName = document.getElementById('navUserName');
        const displayUserName = document.getElementById('displayUserName');
        const forumAvatar = document.getElementById('forumUserInitials');

        let fullName = localStorage.getItem('pawi_user_name');

        if (!fullName) {
            try {
                const q = query(collection(db, "users"), where("uid", "==", user.uid));
                const snap = await getDocs(q);
                if (!snap.empty) {
                    fullName = snap.docs[0].data().fullName;
                    localStorage.setItem('pawi_user_name', fullName);
                }
            } catch (e) { console.error("Error UI:", e); }
        }

        if (fullName) {
            const firstName = fullName.split(' ')[0];
            if (welcomeName) welcomeName.textContent = firstName;
            if (navUserName) navUserName.textContent = fullName;
            if (displayUserName) displayUserName.textContent = fullName;
            if (forumAvatar) forumAvatar.textContent = fullName.charAt(0).toUpperCase();
        }

        // CARGAS ESPECÍFICAS
        if (document.getElementById('petsContainer')) loadUserPets(user.uid);
        if (document.getElementById('petSelect')) loadPetsForCollar(user.uid);
        if (document.getElementById('alertPetSelector')) loadPetsForAlert(user.uid);
    }

    // ==========================================
    // 5. CARGAR MASCOTAS (ESTILO TARJETA PROFESIONAL)
    // ==========================================
    async function loadUserPets(userId) {
        const grid = document.getElementById('petsContainer');
        if (!grid) return;

        const cachedData = localStorage.getItem('pawi_cached_pets');
        if (cachedData) {
            renderPetsToGrid(JSON.parse(cachedData), grid);
        } else {
            grid.innerHTML = "<p style='grid-column: 1/-1; text-align: center;'>Cargando mascotas...</p>";
        }

        try {
            const q = query(collection(db, "pets"), where("ownerId", "==", userId));
            const snap = await getDocs(q);
            let list = [];

            const name = localStorage.getItem('pawi_user_name') || "";
            if (name.toLowerCase().includes('stephanie')) {
                list.push({ id: 's1', name: 'Max', age: '9 Años', description: 'Husky...', photo: 'Max01.png' }, { id: 's2', name: 'Tommy', age: '8 Meses', description: 'Gato...', photo: 'Tommy01.jpeg' });
            }

            snap.forEach(d => list.push({ id: d.id, ...d.data() }));

            localStorage.setItem('pawi_cached_pets', JSON.stringify(list));
            renderPetsToGrid(list, grid);

        } catch (e) { console.error(e); }
    }

    function renderPetsToGrid(list, grid) {
        if (list.length === 0) {
            grid.innerHTML = "<p style='grid-column: 1/-1; text-align: center; color: #666;'>Aún no tienes mascotas registradas.</p>";
            return;
        }

        grid.innerHTML = ""; 
        list.forEach(p => {
            const currentUrl = window.location.href;
            const basePath = currentUrl.substring(0, currentUrl.lastIndexOf('/'));
            const fullLink = `${basePath}/encontrado.html?id=${p.id}`;
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(fullLink)}`;

            // DISEÑO CORREGIDO: Tarjeta Blanca, Nombre Naranja, Botones Estilizados
            grid.innerHTML += `
                <div class="pet-card" style="background: white; border-radius: 20px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); text-align: center; border: 1px solid #f0f0f0;">
                    <div style="width: 100%; height: 160px; overflow: hidden; border-radius: 12px; margin-bottom: 12px;">
                        <img src="${p.photo}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='https://cdn-icons-png.flaticon.com/512/616/616408.png'">
                    </div>
                    
                    <div style="margin-bottom: 15px;">
                        <div style="color: #ff9800; font-weight: 800; font-size: 1.2rem; margin-bottom: 4px;">${p.name}</div>
                        <div style="color: #666; font-size: 0.9rem; margin-bottom: 6px;">${p.age || 'Edad no definida'}</div>
                        <p style="color: #888; font-size: 0.85rem; line-height: 1.4; margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                            ${p.description || ''}
                        </p>
                    </div>

                    <div style="border-top: 1px dashed #eee; padding-top: 15px; margin-top: 10px;">
                        <div style="margin-bottom: 15px; display: flex; justify-content: center;">
                            <img src="${qrUrl}" style="width: 90px; height: 90px; border: 4px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
                        </div>

                        <div style="display: flex; gap: 10px; justify-content: center;">
                            <button type="button" 
                                    onclick="event.preventDefault(); alert('Se está trabajando en esta funcionalidad para la siguiente versión');" 
                                    style="flex: 1; background: #f8f9fa; border: 1px solid #ddd; padding: 8px; border-radius: 10px; cursor: pointer; font-size: 0.85rem; font-weight: 600; color: #333;">
                                Editar
                            </button>
                            <button class="btn-delete" data-id="${p.id}" data-name="${p.name}" 
                                    style="flex: 1; background: #fff5f5; border: 1px solid #fee2e2; color: #e53e3e; padding: 8px; border-radius: 10px; cursor: pointer; font-size: 0.85rem; font-weight: 600;">
                                Eliminar
                            </button>
                        </div>
                    </div>
                </div>`;
        });

        // Eventos Eliminar
        grid.querySelectorAll('.btn-delete').forEach(btn => {
            btn.onclick = async function() {
                const petName = this.getAttribute('data-name');
                if (confirm("¿Estás seguro de que deseas eliminar a " + petName + "?")) { 
                    try {
                        await deleteDoc(doc(db, "pets", this.getAttribute('data-id'))); 
                        localStorage.removeItem('pawi_cached_pets');
                        location.reload(); 
                    } catch (e) { alert("Error al eliminar."); }
                }
            };
        });
    }

    // ==========================================
    // 6. CARGA PARA ALERTA (MODO ADMIN COMPATIBLE)
    // ==========================================
    async function loadPetsForAlert(userId) {
        const selector = document.getElementById('alertPetSelector');
        selector.innerHTML = "<p>Buscando...</p>";

        try {
            const q = query(collection(db, "pets"), where("ownerId", "==", userId));
            const snap = await getDocs(q);
            let list = [];
            const name = localStorage.getItem('pawi_user_name') || "";
            if (name.toLowerCase().includes('stephanie')) {
                list.push({ id: 's1', name: 'Max', photo: 'Max01.png', breed: 'Husky' }, { id: 's2', name: 'Tommy', photo: 'Tommy01.jpeg', breed: 'Gato' });
            }
            snap.forEach(d => list.push({ id: d.id, ...d.data() }));

            selector.innerHTML = "";
            if (list.length === 0) {
                selector.innerHTML = "<p>Sin mascotas. <a href='registro_mascota.html'>Registrar</a></p>";
                return;
            }

            // Crear selector visual
            list.forEach(pet => {
                const div = document.createElement('div');
                div.className = 'pet-option';
                div.dataset.id = pet.id;
                div.dataset.name = pet.name;
                div.innerHTML = `<img src="${pet.photo}" class="pet-thumb" onerror="this.src='https://cdn-icons-png.flaticon.com/512/616/616408.png'"><span>${pet.name}</span>`;
                div.addEventListener('click', () => {
                    document.querySelectorAll('.pet-option').forEach(opt => opt.classList.remove('selected'));
                    div.classList.add('selected');
                });
                selector.appendChild(div);
            });

            // Lógica GPS Botón (Lanzar Alerta)
            const btnGps = document.getElementById('btnGetGps');
            if (btnGps) {
                btnGps.addEventListener('click', () => {
                    if (navigator.geolocation) {
                        btnGps.innerHTML = "⏳ Obteniendo...";
                        navigator.geolocation.getCurrentPosition(
                            (position) => {
                                coordenadasAlertaDueño = {
                                    lat: position.coords.latitude,
                                    lng: position.coords.longitude
                                };
                                document.getElementById('gpsStatus').style.display = 'block';
                                btnGps.innerHTML = "✅ Ubicación Actualizada";
                                btnGps.style.backgroundColor = "#dcfce7";
                                btnGps.style.color = "#16a34a";
                            }, 
                            (error) => {
                                alert("No se pudo obtener la ubicación.");
                                btnGps.innerHTML = "❌ Error GPS";
                            }
                        );
                    }
                });
            }

            // Lógica Botón FINAL (Guardar en Firebase)
            const btnAlert = document.getElementById('btnLanzarAlerta');
            if(btnAlert) {
                btnAlert.addEventListener('click', async () => {
                    const selected = document.querySelector('.pet-option.selected');
                    const lastSeen = document.getElementById('lastSeen').value;
                    const extraInfo = document.getElementById('extraInfo').value;

                    if(!selected) return alert("Por favor, selecciona qué mascota se perdió.");
                    if(!lastSeen) return alert("Indica dónde fue vista por última vez.");

                    // Simulamos color de placa para el Admin Panel
                    const colores = ['Verde', 'Rosado', 'Azul', 'Rojo'];
                    const colorPlaca = colores[Math.floor(Math.random() * colores.length)]; 

                    try {
                        btnAlert.disabled = true; btnAlert.textContent = "PUBLICANDO...";
                        
                        await addDoc(collection(db, "alerts"), {
                            // Para el Foro
                            authorName: localStorage.getItem('pawi_user_name') || "Usuario PAWI",
                            ownerEmail: auth.currentUser.email,
                            petName: selected.dataset.name,
                            petPhoto: selected.querySelector('img').src,
                            content: extraInfo || `¡Ayuda! ${selected.dataset.name} se ha perdido.`,
                            lastSeenLocation: lastSeen,
                            
                            // Para el Admin Panel
                            placaColor: colorPlaca,
                            gps: coordenadasAlertaDueño || { lat: -2.14, lng: -79.96 }, // Default si no hay GPS
                            
                            status: 'active',
                            ownerId: userId,
                            timestamp: new Date().toISOString()
                        });
                        
                        alert("¡Alerta enviada a la comunidad!");
                        window.location.href = 'foro.html';
                    } catch(err) { 
                        console.error(err); alert("Error."); 
                        btnAlert.disabled = false; btnAlert.textContent = "¡LANZAR ALERTA AHORA!";
                    }
                });
            }
        } catch (e) { console.error(e); }
    }
});

// =========================================================
// FUNCIONES EXTERNAS (Scope Global)
// =========================================================

// Lógica de Reporte Público (reporte.html)
function handlePublicReport(form) {
    // 1. Botón GPS
    const btnLocation = document.getElementById('btnGetLocation');
    if (btnLocation) {
        btnLocation.addEventListener('click', () => {
            if (navigator.geolocation) {
                btnLocation.innerHTML = "<span>⏳ Buscando...</span>";
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        coordenadasReporte = { lat: position.coords.latitude, lng: position.coords.longitude };
                        btnLocation.innerHTML = "<span>📍 Ubicación Adjunta</span> <span class='location-check' style='display:inline'>✓</span>";
                        btnLocation.classList.add('active');
                        btnLocation.style.borderColor = "#10B981";
                        btnLocation.style.color = "#10B981";
                        btnLocation.style.background = "#ECFDF5";
                    },
                    (error) => { alert("Error GPS."); btnLocation.innerHTML = "📍 Adjuntar ubicación"; }
                );
            }
        });
    }

    // 2. Enviar Formulario
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const colorInput = document.querySelector('input[name="tagColor"]:checked');
        const speciesInput = document.querySelector('input[name="species"]:checked');
        const descripcion = document.getElementById('reportDesc').value;

        if (!descripcion) return alert("Añade una descripción.");

        const btnSubmit = form.querySelector('.btn-submit');
        btnSubmit.disabled = true; btnSubmit.textContent = "ENVIANDO...";

        try {
            await addDoc(collection(db, "alerts"), {
                authorName: "Ciudadano Anónimo",
                petName: `Avistamiento: ${speciesInput ? speciesInput.value : "Mascota"}`,
                petPhoto: 'https://cdn-icons-png.flaticon.com/512/616/616408.png',
                content: descripcion,
                lastSeenLocation: "Reportado vía GPS Público",
                
                // Datos Admin
                placaColor: colorInput ? colorInput.value : "Desconocido",
                gps: coordenadasReporte,
                
                status: 'active',
                timestamp: new Date().toISOString()
            });

            alert("Reporte enviado exitosamente.");
            window.location.href = 'index.html';
        } catch (err) { console.error(err); alert("Error al enviar."); btnSubmit.disabled = false; }
    });
}

// Lógica de QR Escaneado (Encontrado)
async function handleFoundPage() {
    const params = new URLSearchParams(window.location.search);
    const petId = params.get('id');
    const card = document.getElementById('alertCard');
    const loader = document.getElementById('loadingMsg');

    if (!petId) return;

    try {
        const docRef = doc(db, "pets", petId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const pet = docSnap.data();
            const imgEl = document.getElementById('foundPetImg');
            if(imgEl) imgEl.src = pet.photo || "https://cdn-icons-png.flaticon.com/512/616/616408.png";
            const nameEl = document.getElementById('foundPetName');
            if(nameEl) nameEl.textContent = pet.name;
            const descEl = document.getElementById('foundPetDesc');
            if(descEl) descEl.textContent = "Descripción: " + (pet.description || "Sin detalles");

            if(loader) loader.style.display = 'none';
            if(card) card.style.display = 'block';

            const btnLocation = document.getElementById('btnSendLocation');
            if(btnLocation) {
                btnLocation.addEventListener('click', () => {
                    if (!navigator.geolocation) return alert("Tu navegador no soporta GPS.");
                    btnLocation.textContent = "Enviando alerta...";
                    btnLocation.disabled = true;

                    navigator.geolocation.getCurrentPosition(async (position) => {
                        const lat = position.coords.latitude;
                        const lng = position.coords.longitude;
                        try {
                            // Enviamos alerta tipo FOUND_SCAN
                            await addDoc(collection(db, "alerts"), {
                                type: 'FOUND_SCAN',
                                petId, ownerId: pet.ownerId, petName: pet.name,
                                location: { lat, lng },
                                content: "¡Alguien escaneó el código QR!",
                                timestamp: new Date().toISOString(), status: 'unread'
                            });
                            alert("¡Ubicación enviada al dueño!");
                            btnLocation.style.display = 'none';
                            const statusEl = document.getElementById('locationStatus');
                            if(statusEl) statusEl.style.display = 'block';
                        } catch (err) { alert("Error."); }
                    });
                });
            }
        }
    } catch (error) { console.error(error); }
}