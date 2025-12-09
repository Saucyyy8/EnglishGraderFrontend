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

function handleFiles(files) {
    if (!files.length) return;

    Array.from(files).forEach(file => {
        if (!file.type.startsWith('image/')) return;

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
    });

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
        // Convert images to Base64
        const imagePromises = selectedFiles.map(file => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        });

        const base64Images = await Promise.all(imagePromises);

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

    // Feedback
    feedbackText.textContent = data.feedback || "No feedback provided.";

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
