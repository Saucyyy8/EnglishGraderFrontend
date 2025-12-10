const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const previewContainer = document.getElementById('preview-container');
const gradeBtn = document.getElementById('grade-btn');
const resultsSection = document.getElementById('results-section');
const feedbackText = document.getElementById('feedback-text');
const errorsList = document.getElementById('errors-list');

let selectedFiles = [];

// Questions Text Mapping
const questions = {
    'question1': "You were recently returning from a three-day science camp when suddenly your bus driver took one wrong route after another. Narrate your experience – what exactly happened, what you saw, what you did, what you felt and what you learnt from the experience.",
    'question2': "Write an original short story entitled: “Man often spoils what is good given to him, as he is often ruined by his pride.”",
    'question3': "Children should take care of their ageing parents. Express your views either for or against the statement."
};

// --- File Handling ---

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
});

// Camera button
const cameraBtn = document.getElementById('camera-btn');
cameraBtn.addEventListener('click', () => {
    fileInput.click();
});

// Crop modal elements
const cropModal = document.getElementById('crop-modal');
const cropImage = document.getElementById('crop-image');
const cropDone = document.getElementById('crop-done');
const cropCancel = document.getElementById('crop-cancel');
let cropper = null;
let currentFile = null;

function handleFiles(files) {
    if (!files.length) return;

    // Process first file for cropping
    const file = files[0];
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        cropImage.src = e.target.result;
        cropModal.classList.remove('hidden');

        // Initialize cropper
        if (cropper) cropper.destroy();
        cropper = new Cropper(cropImage, {
            aspectRatio: NaN, // Free crop
            viewMode: 1,
            autoCropArea: 1,
        });

        currentFile = file;
    };
    reader.readAsDataURL(file);
}

cropDone.addEventListener('click', () => {
    if (!cropper) return;

    // Get cropped canvas with max width constraint and compression
    const canvas = cropper.getCroppedCanvas({
        maxWidth: 1200, // Limit width to reduce file size
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high'
    });

    canvas.toBlob((blob) => {
        const croppedFile = new File([blob], currentFile.name, { type: 'image/jpeg' });
        addImageToPreview(croppedFile);
        closeCropModal();
    }, 'image/jpeg', 0.85); // Convert to JPEG with 85% quality
});

cropCancel.addEventListener('click', closeCropModal);

function closeCropModal() {
    cropModal.classList.add('hidden');
    if (cropper) {
        cropper.destroy();
        cropper = null;
    }
    fileInput.value = ''; // Reset input
}

function addImageToPreview(file) {
    selectedFiles.push(file);

    const reader = new FileReader();
    reader.onload = (e) => {
        const div = document.createElement('div');
        div.className = 'preview-item';
        div.innerHTML = `
            <img src="${e.target.result}" alt="Preview">
            <button class="remove-btn" onclick="removeFile('${file.name}')">×</button>
        `;
        previewContainer.appendChild(div);
    };
    reader.readAsDataURL(file);

    updateButtonState();
}

window.removeFile = function (fileName) {
    selectedFiles = selectedFiles.filter(f => f.name !== fileName);
    // Re-render preview (simplest approach for now to keep sync)
    previewContainer.innerHTML = '';
    selectedFiles.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const div = document.createElement('div');
            div.className = 'preview-item';
            div.innerHTML = `
                <img src="${e.target.result}" alt="Preview">
                <button class="remove-btn" onclick="removeFile('${file.name}')">×</button>
            `;
            previewContainer.appendChild(div);
        };
        reader.readAsDataURL(file);
    });
    updateButtonState();
};

// --- Grade Button State ---
function updateButtonState() {
    const questionSelected = document.querySelector('input[name="question"]:checked');
    const hasFiles = selectedFiles.length > 0;
    gradeBtn.disabled = !(questionSelected && hasFiles);
}

document.querySelectorAll('input[name="question"]').forEach(radio => {
    radio.addEventListener('change', updateButtonState);
});

// --- Image Compression Helper ---
async function compressImage(file, maxWidth = 1200, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Resize if needed
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Convert to compressed base64
                const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
                resolve(compressedBase64);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// --- API Integration ---

gradeBtn.addEventListener('click', async () => {
    const questionKey = document.querySelector('input[name="question"]:checked').value;
    const questionText = questions[questionKey];

    if (!questionText || selectedFiles.length === 0) return;

    // UI Loading State
    gradeBtn.disabled = true;
    document.querySelector('.btn-text').textContent = "Grading...";
    document.querySelector('.loader').classList.remove('hidden');
    resultsSection.classList.add('hidden');

    try {
        // Compress and convert images to Base64
        console.log('Compressing images...');
        const base64Images = await Promise.all(
            selectedFiles.map(file => compressImage(file))
        );
        console.log(`Compressed ${base64Images.length} images`);

        // Call Backend
        const response = await fetch('https://englishgrader-production-2c9c.up.railway.app/grade', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                question: questionText,
                images: base64Images
            })
        });

        if (!response.ok) {
            throw new Error(`Server Error: ${response.statusText}`);
        }

        const data = await response.json();
        displayResults(data);

    } catch (error) {
        alert("Failed to grade submission: " + error.message);
        console.error(error);
    } finally {
        gradeBtn.disabled = false;
        document.querySelector('.btn-text').textContent = "Grade My Composition";
        document.querySelector('.loader').classList.add('hidden');
    }
});

function displayResults(data) {
    resultsSection.classList.remove('hidden');

    // Update Score Circle
    const score = data.score || 0;
    const percentage = score * 10;
    const circle = document.querySelector('.circle');
    const scoreText = document.querySelector('.percentage');

    // Reset animation
    circle.style.strokeDasharray = `0, 100`;
    setTimeout(() => {
        circle.style.strokeDasharray = `${percentage}, 100`;
        // Color based on score
        if (score >= 8) circle.style.stroke = "#22c55e"; // Green
        else if (score >= 5) circle.style.stroke = "#eab308"; // Yellow
        else circle.style.stroke = "#ef4444"; // Red
    }, 100);

    scoreText.textContent = `${score}/10`;

    // Errors
    errorsList.innerHTML = '';
    if (data.errors && data.errors.length > 0) {
        data.errors.forEach(err => {
            const div = document.createElement('div');
            div.className = 'error-item';
            div.innerHTML = `
                <div class="error-line"><strong>Page ${err.page || '?'}</strong> | Line ${err.line || '?'}: "${err.text || '...'}"</div>
                <div class="error-issue">🔴 Issue: ${err.issue}</div>
                <div class="error-fix">✨ Fix: ${err.fix}</div>
            `;
            errorsList.appendChild(div);
        });
    } else {
        errorsList.innerHTML = '<p style="color: var(--text-muted); font-style: italic;">No specific errors found. Good job!</p>';
    }

    // Scroll to results
    resultsSection.scrollIntoView({ behavior: 'smooth' });
}
