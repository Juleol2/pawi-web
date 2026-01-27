import { auth, db } from './firebase.js';
import { collection, addDoc, getDocs, getDoc, query, where, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const storage = getStorage();

document.addEventListener('DOMContentLoaded', async () => {
    console.log("PAWI System: Cargando módulo central...");

    // ==========================================
    // 0. LÓGICA DE PÁGINA PÚBLICA (ENCONTRADO.HTML)
    // ==========================================
    if (window.location.pathname.includes('encontrado.html')) {
        await handleFoundPage();
        return; 
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
            localStorage.removeItem('pawi_cached_pets'); // Limpiamos caché de mascotas al salir
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
                
                // Guardar en Firebase
                const newDoc = await addDoc(collection(db, "pets"), {
                    ownerId: user.uid,
                    name: document.getElementById('petName').value,
                    age: document.getElementById('petAge').value,
                    description: document.getElementById('petDesc').value,
                    photo: photoSrc,
                    createdAt: new Date()
                });
                
                // Limpiar caché local para forzar recarga fresca
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
        const forumPlaceholder = document.getElementById('postInputPlaceholder');

        // Intentar usar nombre guardado para velocidad
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
            if (forumPlaceholder) forumPlaceholder.placeholder = `¿Qué estás pensando, ${firstName}?`;
        }

        // CARGAS ESPECÍFICAS
        if (document.getElementById('petsContainer')) loadUserPets(user.uid);
        if (document.getElementById('petSelect')) loadPetsForCollar(user.uid);
        if (document.getElementById('alertPetSelector')) loadPetsForAlert(user.uid);
    }

    // ==========================================
    // 5. CARGAR MASCOTAS CON CACHÉ (VELOCIDAD)
    // ==========================================
    async function loadUserPets(userId) {
        const grid = document.getElementById('petsContainer');
        if (!grid) return;

        // A) CARGA INMEDIATA DESDE CACHÉ (Si existe)
        const cachedData = localStorage.getItem('pawi_cached_pets');
        if (cachedData) {
            console.log("Cargando mascotas desde caché (rápido)...");
            renderPetsToGrid(JSON.parse(cachedData), grid);
        } else {
            grid.innerHTML = "<p style='grid-column: 1/-1; text-align: center;'>Cargando mascotas...</p>";
        }

        // B) CARGA REAL DESDE FIREBASE (Segundo plano)
        try {
            const q = query(collection(db, "pets"), where("ownerId", "==", userId));
            const snap = await getDocs(q);
            let list = [];

            const name = localStorage.getItem('pawi_user_name') || "";
            // Lógica Stephanie
            if (name.toLowerCase().includes('stephanie')) {
                list.push({ id: 's1', name: 'Max', age: '9 Años', description: 'Husky...', photo: 'Max01.png' }, { id: 's2', name: 'Tommy', age: '8 Meses', description: 'Gato...', photo: 'Tommy01.jpeg' });
            }

            snap.forEach(d => list.push({ id: d.id, ...d.data() }));

            // Guardar en caché y renderizar de nuevo
            localStorage.setItem('pawi_cached_pets', JSON.stringify(list));
            renderPetsToGrid(list, grid);

        } catch (e) { console.error(e); }
    }

    // FUNCIÓN DE DIBUJADO (Reutilizable para evitar duplicados)
    function renderPetsToGrid(list, grid) {
        if (list.length === 0) {
            grid.innerHTML = "<p style='grid-column: 1/-1; text-align: center;'>Aún no tienes mascotas.</p>";
            return;
        }

        grid.innerHTML = ""; // Limpiar antes de dibujar
        list.forEach(p => {
            // Corrección del QR para subcarpetas
            const currentUrl = window.location.href;
            const basePath = currentUrl.substring(0, currentUrl.lastIndexOf('/'));
            const fullLink = `${basePath}/encontrado.html?id=${p.id}`;
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(fullLink)}`;

            grid.innerHTML += `
                <div class="pet-card">
                    <div class="pet-photo-header"><img src="${p.photo}" onerror="this.src='https://cdn-icons-png.flaticon.com/512/616/616408.png'"></div>
                    <div class="pet-body">
                        <div class="pet-name">${p.name}</div>
                        <div class="pet-age">${p.age}</div>
                        <p class="pet-desc">${p.description}</p>
                    </div>
                    <div class="qr-wrapper"><img src="${qrUrl}" class="qr-code"></div>
                    <div class="card-actions"><button class="btn-pet btn-delete" data-id="${p.id}">Eliminar</button></div>
                </div>`;
        });

        // Reactivar eventos de eliminar
        grid.querySelectorAll('.btn-delete').forEach(btn => {
            btn.onclick = async (e) => {
                if (confirm("¿Borrar?")) { 
                    await deleteDoc(doc(db, "pets", e.target.dataset.id)); 
                    // Borrar caché para que se actualice al recargar
                    localStorage.removeItem('pawi_cached_pets');
                    location.reload(); 
                }
            };
        });
    }

    // ==========================================
    // 6. CARGA PARA ALERTA
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
                list.push({ id: 's1', name: 'Max', photo: 'Max01.png' }, { id: 's2', name: 'Tommy', photo: 'Tommy01.jpeg' });
            }
            snap.forEach(d => list.push({ id: d.id, ...d.data() }));

            selector.innerHTML = "";
            if (list.length === 0) {
                selector.innerHTML = "<p>Sin mascotas. <a href='registro_mascota.html'>Registrar</a></p>";
                return;
            }

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

            const btnGps = document.getElementById('btnGetGps');
            const gpsStatus = document.getElementById('gpsStatus');
            let currentLocation = null;

            if (btnGps) {
                btnGps.addEventListener('click', () => {
                    if (!navigator.geolocation) return alert("GPS no disponible");
                    btnGps.innerHTML = "⏳ Obteniendo...";
                    navigator.geolocation.getCurrentPosition((pos) => {
                        currentLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                        btnGps.innerHTML = "📍 Ubicación Actualizada";
                        btnGps.style.color = "#16a34a";
                        if(gpsStatus) gpsStatus.style.display = 'block';
                        const inputUbi = document.getElementById('lastSeen');
                        if(inputUbi && !inputUbi.value) inputUbi.value = "Ubicación GPS detectada";
                    }, (err) => {
                        alert("Error GPS: Permite el acceso.");
                        btnGps.innerHTML = "Usar mi ubicación actual";
                    });
                });
            }

            const btnAlert = document.getElementById('btnLanzarAlerta');
            if(btnAlert) {
                btnAlert.addEventListener('click', async () => {
                    const selected = document.querySelector('.pet-option.selected');
                    const lastSeen = document.getElementById('lastSeen').value;
                    const extraInfo = document.getElementById('extraInfo').value;

                    if(!selected) return alert("Selecciona una mascota.");
                    if(!lastSeen && !currentLocation) return alert("Indica una ubicación.");

                    if(confirm(`¿Lanzar ALERTA para ${selected.dataset.name}?`)) {
                        try {
                            btnAlert.disabled = true; btnAlert.textContent = "ENVIANDO...";
                            await addDoc(collection(db, "alerts"), {
                                type: 'LOST',
                                petId: selected.dataset.id,
                                petName: selected.dataset.name,
                                ownerId: userId,
                                location: currentLocation,
                                lastSeenLocation: lastSeen,
                                extraInfo: extraInfo,
                                timestamp: new Date(),
                                status: 'active'
                            });
                            alert("¡ALERTA ENVIADA!");
                            window.location.href = 'dashboard.html';
                        } catch(err) { console.error(err); alert("Error."); btnAlert.disabled = false; }
                    }
                });
            }
        } catch (e) { console.error(e); }
    }
});

// Función Página Pública (Found Page) - Sin cambios, necesaria
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
            if(descEl) descEl.textContent = "Mi descripción es: " + (pet.description || "Sin detalles");

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
                        const mapLink = `https://www.google.com/maps?q=${lat},${lng}`;
                        try {
                            await addDoc(collection(db, "alerts"), {
                                type: 'FOUND_SCAN',
                                petId, ownerId: pet.ownerId, petName: pet.name,
                                location: { lat, lng }, mapsLink: mapLink,
                                timestamp: new Date(), status: 'unread'
                            });
                            alert("¡Ubicación enviada!");
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