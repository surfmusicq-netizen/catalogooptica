// Supabase Configuration
const SB_URL = "https://dwjeejsutmkfsdmldoxq.supabase.co"; // URL corregida
const SB_KEY = "sb_publishable_iRRcY7--9c49Tj45fK8RAg_v0sAoMNo";
const supabase = supabase.createClient(SB_URL, SB_KEY);

let stream = null;
let camera = null;
let faceMesh = null;
let scene, threeCamera, renderer, glassesModel;
const VTO_VIDEO = document.getElementById('vto-video');
const VTO_CANVAS = document.getElementById('vto-canvas');

async function toggleVirtualTryOn() {
    const overlay = document.getElementById('vto-overlay');
    const loader = document.getElementById('vto-loader');

    overlay.classList.toggle('active');

    if (overlay.classList.contains('active')) {
        loader.style.display = 'flex';
        initThreeJS();
        initMediaPipe();
    } else {
        stopVTO();
    }
}

function initThreeJS() {
    scene = new THREE.Scene();
    threeCamera = new THREE.PerspectiveCamera(45, VTO_CANVAS.clientWidth / VTO_CANVAS.clientHeight, 0.1, 1000);

    renderer = new THREE.WebGLRenderer({
        canvas: VTO_CANVAS,
        alpha: true,
        antialias: true
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(VTO_CANVAS.clientWidth, VTO_CANVAS.clientHeight);

    // Luces para el modelo 3D
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2);
    dirLight.position.set(0, 10, 10);
    scene.add(dirLight);

    // Creamos una montura 3D básica con geometrías de Three.js
    // Esto asegura que funcione sin descargar archivos externos
    glassesModel = new THREE.Group();

    const frameMaterial = new THREE.MeshStandardMaterial({
        color: 0x111111,
        metalness: 0.8,
        roughness: 0.2
    });

    const lensMaterial = new THREE.MeshStandardMaterial({
        color: 0x88ccff,
        transparent: true,
        opacity: 0.4,
        metalness: 1,
        roughness: 0
    });

    // Aros
    const ringGeom = new THREE.TorusGeometry(0.5, 0.05, 16, 100);
    const leftLens = new THREE.Mesh(ringGeom, frameMaterial);
    leftLens.position.x = -0.65;

    const rightLens = new THREE.Mesh(ringGeom, frameMaterial);
    rightLens.position.x = 0.65;

    // Lunas
    const insideGeom = new THREE.CircleGeometry(0.5, 32);
    const leftGlass = new THREE.Mesh(insideGeom, lensMaterial);
    leftGlass.position.x = -0.65;

    const rightGlass = new THREE.Mesh(insideGeom, lensMaterial);
    rightGlass.position.x = 0.65;

    // Puente
    const bridgeGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.3);
    const bridge = new THREE.Mesh(bridgeGeom, frameMaterial);
    bridge.rotation.z = Math.PI / 2;

    glassesModel.add(leftLens, rightLens, leftGlass, rightGlass, bridge);
    glassesModel.visible = false;
    scene.add(glassesModel);
}

function initMediaPipe() {
    faceMesh = new FaceMesh({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });

    faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
    });

    faceMesh.onResults(onResults);

    camera = new Camera(VTO_VIDEO, {
        onFrame: async () => {
            await faceMesh.send({ image: VTO_VIDEO });
        },
        width: 640,
        height: 480,
    });

    camera.start().then(() => {
        document.getElementById('vto-loader').style.display = 'none';
    });
}

function onResults(results) {
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        glassesModel.visible = true;

        // Puntos clave de la nariz para posicionar los lentes
        const noseBridge = landmarks[168]; // Entre los ojos
        const leftEyeTrack = landmarks[33];
        const rightEyeTrack = landmarks[263];

        // Transformar coordenadas de MediaPipe (0-1) a Three.js
        // Ajuste fino para evitar que se vean "inmensamente grandes"
        const x = (noseBridge.x - 0.5) * 3.5;
        const y = -(noseBridge.y - 0.5) * 4.5;
        const z = -noseBridge.z * 10;

        glassesModel.position.set(x, y, z);

        // Calcular rotación
        const eyeVector = new THREE.Vector3(
            rightEyeTrack.x - leftEyeTrack.x,
            -(rightEyeTrack.y - leftEyeTrack.y),
            rightEyeTrack.z - leftEyeTrack.z
        );

        const angleZ = Math.atan2(eyeVector.y, eyeVector.x);
        glassesModel.rotation.z = angleZ;

        // Escalar según la distancia entre ojos
        // Ajustado de 8 a 2.8 para un tamaño más realista
        const dist = Math.sqrt(
            Math.pow(rightEyeTrack.x - leftEyeTrack.x, 2) +
            Math.pow(rightEyeTrack.y - leftEyeTrack.y, 2)
        );
        const scale = dist * 2.8;
        glassesModel.scale.set(scale, scale, scale);

    } else {
        glassesModel.visible = false;
    }

    renderer.render(scene, threeCamera);
}

function stopVTO() {
    if (camera) camera.stop();
    if (faceMesh) faceMesh.close();
    glassesModel.visible = false;
}

async function loadCatalog() {
    const catalogGrid = document.getElementById('catalog');

    try {
        const { data: products, error } = await supabase
            .from('products')
            .select('*');

        if (error) throw error;

        catalogGrid.innerHTML = ''; // Limpiar spinner

        if (products.length === 0) {
            catalogGrid.innerHTML = '<p class="loader-container">No hay productos disponibles por ahora.</p>';
            return;
        }

        products.forEach(product => {
            const card = document.createElement('div');
            card.className = 'product-card';
            card.innerHTML = `
                <div class="product-image">
                    <img src="${product.image_url}" alt="${product.name}">
                    ${product.badge ? `<div class="badge">${product.badge}</div>` : ''}
                </div>
                <div class="product-info">
                    <h3>${product.name}</h3>
                    <p class="price">S/ ${parseFloat(product.price).toFixed(2)}</p>
                    <button class="btn-whatsapp" onclick="quoteWhatsApp('${product.name}')">Consultar WhatsApp</button>
                </div>
            `;
            catalogGrid.appendChild(card);
        });
    } catch (err) {
        console.error("Error cargando el catálogo:", err);
        catalogGrid.innerHTML = `<p class="loader-container" style="color: #ff4444">Error al conectar con la base de datos.</p>`;
    }
}

function quoteWhatsApp(productName) {
    const phone = "51900000000"; // Cambiar por el número real de la óptica
    const message = encodeURIComponent(`Hola, me interesa la montura: ${productName}. ¿Está disponible?`);
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
}

// Cargar catálogo al iniciar
window.addEventListener('DOMContentLoaded', loadCatalog);

// Interacción de UI
document.querySelector('.btn-primary').addEventListener('click', () => {
    document.getElementById('catalog').scrollIntoView({ behavior: 'smooth' });
});
