/**
 * dashboard.js
 * Handles: CSV upload UI, drag & drop, form submit → redirect to results.html
 *
 * ─── FOR JAMAL ────────────────────────────────────────────────────────────────
 * TODO: form submit → POST to ../backend/api/upload.php
 *       on success  → redirect to results.html?upload_id=X
 * ─────────────────────────────────────────────────────────────────────────────
 */

const uploadZone       = document.getElementById('uploadZone');
const csvFileInput     = document.getElementById('csvFile');
const uploadFilename   = document.getElementById('uploadFilename');
const btnUpload        = document.getElementById('btnUpload');
const uploadForm       = document.getElementById('uploadForm');
const uploadStatus     = document.getElementById('uploadStatus');
const uploadStatusText = document.getElementById('uploadStatusText');

// ─── FILE PICKER ──────────────────────────────────────────────────────────────
csvFileInput.addEventListener('change', () => {
    const file = csvFileInput.files[0];
    if (file) {
        uploadFilename.textContent = file.name;
        btnUpload.disabled = false;
        uploadZone.classList.add('upload-zone--ready');
    }
});

// ─── DRAG & DROP ──────────────────────────────────────────────────────────────
uploadZone.addEventListener('dragover', e => {
    e.preventDefault();
    uploadZone.classList.add('upload-zone--drag');
});
uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('upload-zone--drag');
});
uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('upload-zone--drag');
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
        csvFileInput.files = e.dataTransfer.files;
        uploadFilename.textContent = file.name;
        btnUpload.disabled = false;
        uploadZone.classList.add('upload-zone--ready');
    } else {
        alert('Please upload a .csv file only.');
    }
});

// ─── FORM SUBMIT ──────────────────────────────────────────────────────────────
uploadForm.addEventListener('submit', e => {
    e.preventDefault();
    uploadStatus.hidden = false;
    uploadStatusText.textContent = 'Processing your data...';
    btnUpload.disabled = true;

    // ── TODO (Jamal): replace the setTimeout block below ─────────────────────
    //
    // const formData = new FormData(uploadForm);
    // fetch('../backend/api/upload.php', { method: 'POST', body: formData })
    //     .then(res => res.json())
    //     .then(data => {
    //         if (data.success) {
    //             window.location.href = `results.html?upload_id=${data.upload_id}`;
    //         } else {
    //             uploadStatusText.textContent = 'Error: ' + (data.error || 'Upload failed');
    //             btnUpload.disabled = false;
    //         }
    //     })
    //     .catch(() => {
    //         uploadStatusText.textContent = 'Upload failed. Please try again.';
    //         btnUpload.disabled = false;
    //     });
    //
    // ─────────────────────────────────────────────────────────────────────────
    // TEMP while backend is being built:
    setTimeout(() => {
        uploadStatusText.textContent = 'Redirecting to results...';
        setTimeout(() => { window.location.href = 'results.html'; }, 800);
    }, 1500);
});