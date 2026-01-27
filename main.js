import { auth, db } from './firebase.js';
import { collection, addDoc, getDocs, getDoc, query, where, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const storage = getStorage();

document.addEventListener('DOMContentLoaded', async () => {
    console.log("PAWI System: Cargando módulo central...");

    // ---------------------------------------------------------
    // 1. SEGURIDAD Y REDIRECCIÓN (Evita rebotes)
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
    const paginasProtegidas = ['dashboard', 'mis_mascotas', 'registro_mascota', 'foro', 'collar', 'personaliza'];
    const necesitaLogin = paginasProtegidas.some(p => path.includes(p));

    // Si no hay usuario y trata de entrar a página privada -> Login
    if (!user && necesitaLogin) {
        window.location.href = 'login.html';
        return;
    }

    // Si hay usuario, cargamos su interfaz
    if (user) {
        await inicializarInterfazUsuario(user);
    }

    // ---------------------------------------------------------
    // 2. LÓGICA DE REGISTRO DE USUARIO (SIGNUP)
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
                btnSubmit.disabled = true;
                btnSubmit.textContent = "Creando cuenta...";

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
                if (error.code === 'auth/email-already-in-use') alert("El correo ya está registrado.");
                else if (error.code === 'auth/weak-password') alert("La contraseña es muy débil (mínimo 6 caracteres).");
                else alert("Error: " + error.message);
                
                btnSubmit.disabled = false;
                btnSubmit.textContent = "Registrarse";
            }
        });
    }

    // ---------------------------------------------------------
    // 3. LÓGICA DE INICIO DE SESIÓN (LOGIN)
    // ---------------------------------------------------------
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            const btnSubmit = loginForm.querySelector('.btn-submit');

            try {
                btnSubmit.disabled = true;
                btnSubmit.textContent = "Ingresando...";
                
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                
                const q = query(collection(db, "users"), where("uid", "==", userCredential.user.uid));
                const snap = await getDocs(q);
                if (!snap.empty) {
                    localStorage.setItem('pawi_user_name', snap.docs[0].data().fullName);
                }

                window.location.href = 'dashboard.html';
            } catch (error) {
                alert("Correo o contraseña incorrectos.");
                btnSubmit.disabled = false;
                btnSubmit.textContent = "Iniciar Sesión";
            }
        });
    }

    // ---------------------------------------------------------
    // 4. GESTIÓN DE MASCOTAS (REGISTRO)
    // ---------------------------------------------------------
    const petForm = document.getElementById('petRegisterForm');
    if (petForm) {
        petForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = petForm.querySelector('.btn-submit');
            const previewImg = document.getElementById('previewImage');
            
            try {
                btn.disabled = true;
                btn.textContent = "Guardando...";
                
                const photoSrc = previewImg ? previewImg.src : "https://cdn-icons-png.flaticon.com/512/616/616408.png";

                await addDoc(collection(db, "pets"), {
                    ownerId: user.uid,
                    name: document.getElementById('petName').value,
                    age: document.getElementById('petAge').value,
                    description: document.getElementById('petDesc').value,
                    photo: photoSrc,
                    createdAt: new Date()
                });
                
                alert("¡Mascota registrada!");
                window.location.href = 'mis_mascotas.html';
            } catch (err) { 
                alert("Error al registrar: " + err.message); 
                btn.disabled = false; 
                btn.textContent = "Guardar Mascota";
            }
        });
    }

    // ---------------------------------------------------------
    // 5. CERRAR SESIÓN
    // ---------------------------------------------------------
    const logoutBtns = document.querySelectorAll('.logout-btn, a[href="login.html"]');
    logoutBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            localStorage.removeItem('pawi_user_name');
            await signOut(auth);
            window.location.href = 'login.html';
        });
    });

    // ---------------------------------------------------------
    // 6. FUNCIONES AUXILIARES (UI y CARGA DE DATOS)
    // ---------------------------------------------------------
    async function inicializarInterfazUsuario(user) {
        const welcomeName = document.getElementById('welcomeName');
        const navUserName = document.getElementById('navUserName');
        const displayUserName = document.getElementById('displayUserName');
        const forumAvatar = document.getElementById('forumUserInitials');
        const forumPlaceholder = document.getElementById('postInputPlaceholder');

        try {
            const q = query(collection(db, "users"), where("uid", "==", user.uid));
            const snap = await getDocs(q);
            
            if (!snap.empty) {
                const userData = snap.docs[0].data();
                const fullName = userData.fullName;
                const firstName = fullName.split(' ')[0];
                localStorage.setItem('pawi_user_name', fullName);

                if (welcomeName) welcomeName.textContent = firstName;
                if (navUserName) navUserName.textContent = fullName;
                if (displayUserName) displayUserName.textContent = fullName;
                
                if (forumAvatar) forumAvatar.textContent = fullName.charAt(0).toUpperCase();
                if (forumPlaceholder) forumPlaceholder.placeholder = `¿Qué estás pensando, ${firstName}?`;
            }
        } catch (e) { console.error("Error UI:", e); }

        if (document.getElementById('petsContainer')) loadUserPets(user.uid);
        if (document.getElementById('petSelect')) loadPetsForCollar(user.uid);
    }
});

// Función Global para Cargar Mascotas
async function loadUserPets(userId) {
    const grid = document.getElementById('petsContainer');
    if (!grid) return;

    try {
        const q = query(collection(db, "pets"), where("ownerId", "==", userId));
        const snap = await getDocs(q);
        let list = [];

        const name = localStorage.getItem('pawi_user_name') || "";
        if (name.toLowerCase().includes('stephanie')) {
            list.push(
                { id: 's1', name: 'Max', age: '9 Años', description: 'Husky siberiano, ojos celestes.', photo: 'Max01.png' },
                { id: 's2', name: 'Tommy', age: '8 Meses', description: 'Gato gris con blanco.', photo: 'Tommy01.jpeg' }
            );
        }

        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        grid.innerHTML = list.length ? "" : "<p style='grid-column: 1/-1; text-align: center;'>Aún no tienes mascotas registradas.</p>";

        list.forEach(p => {
            const currentUrl = window.location.href;
            const basePath = currentUrl.substring(0, currentUrl.lastIndexOf('/'));
            const fullLink = `${basePath}/encontrado.html?id=${p.id}`;
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(fullLink)}`;

            grid.innerHTML += `
                <div class="pet-card">
                    <div class="pet-photo-header"><img src="${p.photo}"></div>
                    <div class="pet-body">
                        <div class="pet-name">${p.name}</div>
                        <div class="pet-age">${p.age}</div>
                        <p class="pet-desc">${p.description}</p>
                    </div>
                    <div class="qr-wrapper"><img src="${qrUrl}" class="qr-code"></div>
                    <div class="card-actions">
                        <button class="btn-pet btn-edit" onclick="alert('Editar próximamente')">Editar</button>
                        <button class="btn-pet btn-delete" data-id="${p.id}">Eliminar</button>
                    </div>
                </div>`;
        });

        // Eventos de eliminación
        grid.querySelectorAll('.btn-delete').forEach(btn => {
            btn.onclick = async (e) => {
                if (confirm("¿Seguro que quieres eliminar esta mascota?")) {
                    await deleteDoc(doc(db, "pets", e.target.dataset.id));
                    location.reload();
                }
            };
        });

    } catch (e) { 
        console.error("Error cargando mascotas", e); 
        grid.innerHTML = "<p>Error al cargar las mascotas.</p>";
    }
}
